/**
 * Copyright 2025 © BeeAI a Series of LF Projects, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { FilePart, FileWithUri, Message, Part, TextPart } from '@a2a-js/sdk';
import { v4 as uuid } from 'uuid';

import { getFileContentUrl } from '#modules/files/utils.ts';
import type {
  UIMessagePart,
  UISourcePart,
  UITextPart,
  UITrajectoryPart,
  UIUserMessage,
} from '#modules/messages/types.ts';
import { UIMessagePartKind } from '#modules/messages/types.ts';
import type { ContextId, TaskId } from '#modules/tasks/api/types.ts';
import { isNotNull } from '#utils/helpers.ts';

import type { Citation } from './extensions/citation';
import { citationExtension } from './extensions/citation';
import type { TrajectoryMetadata } from './extensions/trajectory';
import { trajectoryExtension } from './extensions/trajectory';
import { getExtensionData } from './extensions/utils';

export const extractCitation = getExtensionData(citationExtension);

export const extractTrajectory = getExtensionData(trajectoryExtension);

export function extractTextFromMessage(message: Message | undefined) {
  const text = message?.parts
    .filter((part) => part.kind === 'text')
    .map((part) => part.text)
    .join('\n');

  return text;
}

export function convertMessageParts(uiParts: UIMessagePart[]): Part[] {
  const parts: Part[] = uiParts
    .map((part) => {
      switch (part.kind) {
        case UIMessagePartKind.Text:
          const { text } = part;

          return {
            kind: 'text',
            text,
          } as TextPart;
        case UIMessagePartKind.File:
          const { id, filename, type } = part;

          return {
            kind: 'file',
            file: {
              uri: getFileContentUrl({ id, addBase: true }),
              name: filename,
              mimeType: type,
            },
          } as FilePart;
      }
    })
    .filter(isNotNull);

  return parts;
}

export function createUserMessage({
  message,
  contextId,
  taskId,
}: {
  message: UIUserMessage;
  contextId: ContextId;
  taskId?: TaskId;
}): Message {
  return {
    kind: 'message',
    role: 'user',
    messageId: message.id,
    contextId,
    taskId,
    parts: convertMessageParts(message.parts),
  };
}

export function isFileWithUri(file: FilePart['file']): file is FileWithUri {
  return 'uri' in file;
}

export function getFileUri(file: FilePart['file']): string {
  const isUriFile = isFileWithUri(file);

  if (isUriFile) {
    return file.uri;
  }

  const { mimeType = 'text/plain', bytes } = file;

  return `data:${mimeType};base64,${bytes}`;
}

export function createSourcePart(citation: Citation, messageId: string | undefined): UISourcePart | null {
  const { url, start_index, end_index, title, description } = citation;

  if (!url || !messageId) {
    return null;
  }

  const sourcePart: UISourcePart = {
    kind: UIMessagePartKind.Source,
    id: uuid(),
    url,
    messageId,
    startIndex: start_index ?? undefined,
    endIndex: end_index ?? undefined,
    title: title ?? undefined,
    description: description ?? undefined,
  };

  return sourcePart;
}

export function createTrajectoryPart(metadata: TrajectoryMetadata): UITrajectoryPart {
  const { title, content } = metadata;

  const trajectoryPart: UITrajectoryPart = {
    kind: UIMessagePartKind.Trajectory,
    id: uuid(),
    title,
    content,
  };

  return trajectoryPart;
}

export function createTextPart(text: string): UITextPart {
  const textPart: UITextPart = {
    kind: UIMessagePartKind.Text,
    id: uuid(),
    text,
  };

  return textPart;
}
