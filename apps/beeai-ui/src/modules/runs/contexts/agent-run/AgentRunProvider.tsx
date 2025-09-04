/**
 * Copyright 2025 © BeeAI a Series of LF Projects, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';
import { type PropsWithChildren, useCallback, useMemo, useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';

import { type AgentA2AClient, type ChatRun, RunResultType } from '#api/a2a/types.ts';
import { createTextPart } from '#api/a2a/utils.ts';
import { getErrorCode } from '#api/utils.ts';
import { useHandleError } from '#hooks/useHandleError.ts';
import { useImmerWithGetter } from '#hooks/useImmerWithGetter.ts';
import type { Agent } from '#modules/agents/api/types.ts';
import { FileUploadProvider } from '#modules/files/contexts/FileUploadProvider.tsx';
import { useFileUpload } from '#modules/files/contexts/index.ts';
import { convertFilesToUIFileParts } from '#modules/files/utils.ts';
import { Role } from '#modules/messages/api/types.ts';
import type { UIAgentMessage, UIMessage, UIMessageForm, UIUserMessage } from '#modules/messages/types.ts';
import { UIMessagePartKind, UIMessageStatus } from '#modules/messages/types.ts';
import { addTranformedMessagePart, isAgentMessage } from '#modules/messages/utils.ts';
import { usePlatformContext } from '#modules/platform-context/contexts/index.ts';
import { PlatformContextProvider } from '#modules/platform-context/contexts/PlatformContextProvider.tsx';
import { useBuildA2AClient } from '#modules/runs/api/queries/useBuildA2AClient.ts';
import type { RunStats } from '#modules/runs/types.ts';
import { SourcesProvider } from '#modules/sources/contexts/SourcesProvider.tsx';
import { getMessagesSourcesMap } from '#modules/sources/utils.ts';
import type { TaskId } from '#modules/tasks/api/types.ts';
import { isNotNull } from '#utils/helpers.ts';

import { MessagesProvider } from '../../../messages/contexts/Messages/MessagesProvider';
import { AgentStatusProvider } from '../agent-status/AgentStatusProvider';
import { AgentRunContext, AgentRunStatus } from './agent-run-context';

interface Props {
  agent: Agent;
}

export function AgentRunProviders({ agent, children }: PropsWithChildren<Props>) {
  const { agentClient } = useBuildA2AClient({
    providerId: agent.provider.id,
    extensions: agent.capabilities.extensions ?? [],
  });

  return (
    <PlatformContextProvider agentClient={agentClient}>
      <FileUploadProvider allowedContentTypes={agent.defaultInputModes}>
        <AgentRunProvider agent={agent} agentClient={agentClient}>
          {children}
        </AgentRunProvider>
      </FileUploadProvider>
    </PlatformContextProvider>
  );
}

interface AgentRunProviderProps extends Props {
  agentClient?: AgentA2AClient;
}

function AgentRunProvider({ agent, agentClient, children }: PropsWithChildren<AgentRunProviderProps>) {
  const { contextId, getContextId, resetContext, getFullfilments } = usePlatformContext();
  const [messages, getMessages, setMessages] = useImmerWithGetter<UIMessage[]>([]);
  const [input, setInput] = useState<string>();
  const [isPending, setIsPending] = useState(false);
  const [stats, setStats] = useState<RunStats>();

  const pendingSubscription = useRef<() => void>(undefined);
  const pendingRun = useRef<ChatRun>(undefined);

  const errorHandler = useHandleError();

  const { files, clearFiles } = useFileUpload();

  const updateCurrentAgentMessage = useCallback(
    (updater: (message: UIAgentMessage) => void) => {
      setMessages((messages) => {
        const lastMessage = messages.at(-1);

        if (lastMessage && isAgentMessage(lastMessage)) {
          updater(lastMessage);
        } else {
          throw new Error('There is no last agent message.');
        }
      });
    },
    [setMessages],
  );

  const handleError = useCallback(
    (error: unknown) => {
      const errorCode = getErrorCode(error);

      errorHandler(error, {
        errorToast: { title: errorCode?.toString() ?? 'Failed to run agent.', includeErrorMessage: true },
      });

      if (error instanceof Error) {
        updateCurrentAgentMessage((message) => {
          message.error = error;
          message.status = UIMessageStatus.Failed;
        });
      }
    },
    [errorHandler, updateCurrentAgentMessage],
  );

  const cancel = useCallback(async () => {
    if (pendingRun.current && pendingSubscription.current) {
      updateCurrentAgentMessage((message) => {
        message.status = UIMessageStatus.Aborted;
      });

      pendingSubscription.current();
      await pendingRun.current.cancel();
    } else {
      throw new Error('No run in progress');
    }
  }, [updateCurrentAgentMessage]);

  const clear = useCallback(() => {
    setMessages([]);
    setStats(undefined);
    clearFiles();
    resetContext();
    setIsPending(false);
    setInput(undefined);
    pendingRun.current = undefined;
  }, [setMessages, clearFiles, resetContext]);

  const checkPendingRun = useCallback(() => {
    if (pendingRun.current || pendingSubscription.current) {
      throw new Error('A run is already in progress');
    }
  }, []);

  const run = useCallback(
    async (message: UIUserMessage, taskId?: TaskId) => {
      if (!agentClient) {
        throw new Error('Agent client is not initialized');
      }

      checkPendingRun();
      setIsPending(true);
      setStats({ startTime: Date.now() });

      const contextId = getContextId();

      const fulfillments = await getFullfilments();

      const agentMessage: UIAgentMessage = {
        id: uuid(),
        role: Role.Agent,
        parts: [],
        status: UIMessageStatus.InProgress,
      };

      setMessages((messages) => {
        messages.push(message, agentMessage);
      });

      try {
        const run = agentClient.chat({
          message,
          contextId,
          fulfillments,
          taskId,
        });
        pendingRun.current = run;

        pendingSubscription.current = run.subscribe(({ parts, taskId: responseTaskId }) => {
          updateCurrentAgentMessage((message) => {
            message.taskId = responseTaskId;
          });

          parts.forEach((part) => {
            updateCurrentAgentMessage((message) => {
              const updatedParts = addTranformedMessagePart(part, message);
              message.parts = updatedParts;
            });
          });
        });

        const result = await run.done;
        if (result && result.type === RunResultType.FormRequired) {
          updateCurrentAgentMessage((message) => {
            message.status = UIMessageStatus.InputRequired;
            message.parts.push({ kind: UIMessagePartKind.Form, ...result.form });
          });
        } else {
          updateCurrentAgentMessage((message) => {
            message.status = UIMessageStatus.Completed;
          });
        }
      } catch (error) {
        handleError(error);
      } finally {
        setIsPending(false);
        setStats((stats) => ({ ...stats, endTime: Date.now() }));
        pendingRun.current = undefined;
        pendingSubscription.current = undefined;
      }
    },
    [checkPendingRun, getContextId, getFullfilments, setMessages, agentClient, updateCurrentAgentMessage, handleError],
  );

  const chat = useCallback(
    (input: string) => {
      checkPendingRun();

      setInput(input);

      const message: UIUserMessage = {
        id: uuid(),
        role: Role.User,
        parts: [createTextPart(input), ...convertFilesToUIFileParts(files)].filter(isNotNull),
      };

      clearFiles();

      return run(message);
    },
    [checkPendingRun, clearFiles, files, run],
  );

  const submitForm = useCallback(
    (form: UIMessageForm, taskId?: TaskId) => {
      checkPendingRun();

      const message: UIUserMessage = {
        id: uuid(),
        role: Role.User,
        parts: [],
        form,
      };

      return run(message, taskId);
    },
    [checkPendingRun, run],
  );

  const sources = useMemo(() => getMessagesSourcesMap(messages), [messages]);

  const lastAgentMessage = getMessages().findLast(isAgentMessage);
  const status = useMemo(() => {
    if (!contextId || !agentClient) {
      return AgentRunStatus.Initializing;
    }
    if (isPending) {
      return AgentRunStatus.Pending;
    }
    if (lastAgentMessage?.status === UIMessageStatus.InputRequired) {
      return AgentRunStatus.ActionRequired;
    }
    return AgentRunStatus.Ready;
  }, [agentClient, contextId, isPending, lastAgentMessage?.status]);

  const contextValue = useMemo(() => {
    return {
      agent,
      status,
      isInitializing: status === AgentRunStatus.Initializing,
      isReady: status === AgentRunStatus.Ready,
      isPending: status === AgentRunStatus.Pending,
      isActionRequired: status === AgentRunStatus.ActionRequired,
      input,
      stats,
      chat,
      submitForm,
      cancel,
      clear,
    };
  }, [agent, status, input, stats, chat, submitForm, cancel, clear]);

  return (
    <AgentStatusProvider agent={agent} isMonitorStatusEnabled>
      <SourcesProvider sources={sources}>
        <MessagesProvider messages={getMessages()}>
          <AgentRunContext.Provider value={contextValue}>{children}</AgentRunContext.Provider>
        </MessagesProvider>
      </SourcesProvider>
    </AgentStatusProvider>
  );
}
