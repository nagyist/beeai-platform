/**
 * Copyright 2025 © BeeAI a Series of LF Projects, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';

import type { A2AExtension } from './types';

const URI = 'https://a2a-extensions.beeai.dev/ui/citation/v1';

const citationSchema = z
  .object({
    url: z.string(),
    start_index: z.number(),
    end_index: z.number(),
    title: z.string(),
    description: z.string(),
  })
  .partial();

const schema = z.object({
  citations: z.array(citationSchema),
});

export type CitationMetadata = z.infer<typeof schema>;

export type Citation = z.infer<typeof citationSchema>;

export const citationExtension: A2AExtension<typeof URI, CitationMetadata> = {
  getSchema: () => z.object({ [URI]: schema }).partial(),
  getUri: () => URI,
};
