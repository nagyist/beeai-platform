/**
 * Copyright 2025 © BeeAI a Series of LF Projects, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from 'react';

import { formExtension } from '#api/a2a/extensions/ui/form.ts';
import { extractServiceExtensionDemands } from '#api/a2a/extensions/utils.ts';
import { MainContent } from '#components/layouts/MainContent.tsx';
import type { Agent } from '#modules/agents/api/types.ts';
import { SourcesPanel } from '#modules/sources/components/SourcesPanel.tsx';

import { useMessages } from '../../messages/contexts/Messages';
import { FormRenderView } from '../components/FormRenderView';
import { RunLandingView } from '../components/RunLandingView';
import { useAgentRun } from '../contexts/agent-run';
import { AgentRunProviders } from '../contexts/agent-run/AgentRunProvider';
import { ChatMessagesView } from './ChatMessagesView';

const formExtensionExtractor = extractServiceExtensionDemands(formExtension);
interface Props {
  agent: Agent;
}

export function ChatView({ agent }: Props) {
  return (
    <AgentRunProviders agent={agent}>
      <Chat />
    </AgentRunProviders>
  );
}

function Chat() {
  const { isPending, agent } = useAgentRun();
  const { messages } = useMessages();

  // TODO: move extraction into the agent run context (or a2a client)
  const formRender = useMemo(() => {
    const { extensions } = agent.capabilities;
    const formRender = extensions && formExtensionExtractor(extensions);

    return formRender ?? undefined;
  }, [agent.capabilities]);

  const isLanding = !isPending && !messages.length;

  return (
    <>
      <MainContent spacing="md" scrollable={isLanding}>
        {isLanding ? (
          formRender ? (
            <FormRenderView formRender={formRender} />
          ) : (
            <RunLandingView />
          )
        ) : (
          <ChatMessagesView />
        )}
      </MainContent>

      <SourcesPanel />
    </>
  );
}
