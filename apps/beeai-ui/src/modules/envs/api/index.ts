/**
 * Copyright 2025 © BeeAI a Series of LF Projects, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { api } from '#api/index.ts';
import { ensureData } from '#api/utils.ts';

import type { CreateEnvBody } from './types';

export async function createEnv({ body }: { body: CreateEnvBody['env'] }) {
  const response = await api.PUT('/api/v1/env', {
    body: { env: body },
  });

  return ensureData({ response, errorMessage: 'Failed to create env variable.' });
}

export async function deleteEnv({ name }: { name: string }) {
  const response = await api.PUT('/api/v1/env', {
    body: {
      env: { [name]: null },
    },
  });

  return ensureData({ response, errorMessage: 'Failed to delete env variable.' });
}

export async function getEnvs() {
  const response = await api.GET('/api/v1/env');

  return ensureData({ response, errorMessage: 'Failed to get env variables.' });
}
