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

import { Accordion, AccordionItem } from '@carbon/react';
import clsx from 'clsx';

import { MarkdownContent } from '#components/MarkdownContent/MarkdownContent.tsx';
import { useAutoScroll } from '#hooks/useAutoScroll.ts';
import { AgentRunLogItem } from '#modules/run/components/AgentRunLogItem.tsx';

import type { ComposeStep } from '../contexts/compose-context';
import classes from './StepResult.module.scss';

interface Props {
  step: ComposeStep;
}

export function StepResult({ step }: Props) {
  const { isPending, logs, stats, result } = step;

  const isFinished = Boolean(!isPending && result);

  if (!(isPending || stats || result)) return null;

  return (
    <div className={clsx(classes.root, { [classes.finished]: isFinished, [classes.pending]: isPending })}>
      <Accordion>
        {logs?.length ? (
          <AccordionItem title="Logs" open={!isFinished ? isPending : undefined} className={classes.logsGroup}>
            <Logs logs={logs} />
          </AccordionItem>
        ) : null}

        {isFinished && (
          <AccordionItem
            className={clsx(classes.resultGroup, { [classes.empty]: !result })}
            title={
              <div className={classes.result}>
                <div>{isFinished ? 'Output' : null}</div>
              </div>
            }
          >
            <MarkdownContent>{result}</MarkdownContent>
          </AccordionItem>
        )}
      </Accordion>
    </div>
  );
}

function Logs({ logs }: { logs: string[] }) {
  const { ref: autoScrollRef } = useAutoScroll([logs.length]);

  return (
    <div className={classes.logs}>
      {logs?.map((message, order) => <AgentRunLogItem key={order}>{message}</AgentRunLogItem>)}
      <div ref={autoScrollRef} />
    </div>
  );
}
