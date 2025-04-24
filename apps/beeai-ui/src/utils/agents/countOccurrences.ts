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

import type { Agent } from '#modules/agents/api/types.ts';
import { BEE_AI_FRAMEWORK_TAG } from '#utils/constants.ts';
import { compareStrings } from '#utils/helpers.ts';

type AgentsCounts = Record<string, number>;
export type AgentsCountedOccurrence = { label: string; count: number }[];
type AgentsCountedOccurrences = {
  frameworks: AgentsCountedOccurrence;
  programming_languages: AgentsCountedOccurrence;
  licenses: AgentsCountedOccurrence;
};

export function countOccurrences(agents: Agent[]): AgentsCountedOccurrences {
  function updateCount(acc: AgentsCounts, value: string) {
    acc[value] = (acc[value] || 0) + 1;
  }

  const counts = agents.reduce(
    (acc, agent) => {
      const { framework, license, programming_language } = agent.metadata;

      if (framework) {
        updateCount(acc.frameworks, framework);
      }

      if (license) {
        updateCount(acc.licenses, license);
      }

      if (programming_language) {
        for (const language of programming_language) {
          updateCount(acc.programming_languages, language);
        }
      }

      return acc;
    },
    {
      frameworks: {} as AgentsCounts,
      programming_languages: {} as AgentsCounts,
      licenses: {} as AgentsCounts,
    },
  );

  return {
    frameworks: sort(counts.frameworks, BEE_AI_FRAMEWORK_TAG),
    programming_languages: sort(counts.programming_languages),
    licenses: sort(counts.licenses),
  };
}

// Sorts counts in descending order, with the option to prioritize (place first) a specific entry
function sort(counts: AgentsCounts, prioritize?: string): AgentsCountedOccurrence {
  return Object.entries(counts)
    .sort(([keyA, countA], [keyB, countB]) => {
      if (keyA === prioritize && keyB !== prioritize) {
        return -1; // A should come before B if A is the prioritized one
      }

      if (keyB === prioritize && keyA !== prioritize) {
        return 1; // B should come before A if B is the prioritized one
      }

      // If no prioritization is applied, and counts are not the same, sort by the count in descending order
      if (countA !== countB) {
        return countB - countA;
      }

      // If counts are the same, sort the keys alphabetically
      return compareStrings(keyA, keyB);
    })
    .map(([key, count]) => ({ label: key, count }));
}
