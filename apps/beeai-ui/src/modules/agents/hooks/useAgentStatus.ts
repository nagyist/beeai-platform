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

import { useProvider } from '#modules/providers/api/queries/useProvider.ts';
import { type Provider, ProviderStatus } from '#modules/providers/api/types.ts';

interface Props {
  provider: string | null | undefined;
}

function getStatusHelpers(data?: Provider) {
  const status = data?.status;
  const isNotInstalled = status === ProviderStatus.NotInstalled;
  const isInstalling = status === ProviderStatus.Installing;
  const isInstallError = status === ProviderStatus.InstallError;
  const isReady = status === ProviderStatus.Ready;

  return {
    status,
    isNotInstalled,
    isInstalling,
    isInstallError,
    isReady,
  };
}

export function useAgentStatus({ provider }: Props) {
  const query = useProvider({ id: provider });

  return {
    refetch: async () => {
      const { data } = await query.refetch();

      return getStatusHelpers(data);
    },
    ...getStatusHelpers(query.data),
  };
}
