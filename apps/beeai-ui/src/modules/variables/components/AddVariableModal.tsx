/**
 * Copyright 2025 © BeeAI a Series of LF Projects, LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Button,
  InlineLoading,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
  SelectSkeleton,
  TextInput,
} from '@carbon/react';
import { useCallback, useId } from 'react';
import { useForm } from 'react-hook-form';

import { Modal } from '#components/Modal/Modal.tsx';
import type { ModalProps } from '#contexts/Modal/modal-context.ts';
import { useListProviders } from '#modules/providers/api/queries/useListProviders.ts';

import { useUpdateVariable } from '../api/mutations/useUpdateVariable';
import classes from './AddVariableModal.module.scss';

export function AddVariableModal({ onRequestClose, ...modalProps }: ModalProps) {
  const id = useId();

  const { data, isPending: isProvidersPending } = useListProviders();

  const { mutate: updateVariable, isPending } = useUpdateVariable({
    onSuccess: onRequestClose,
  });

  const {
    register,
    handleSubmit,
    formState: { isValid },
  } = useForm<FormValues>({
    mode: 'onChange',
  });

  const onSubmit = useCallback(
    ({ name, providerId, value }: FormValues) => {
      updateVariable({ providerId, body: { [name]: value } });
    },
    [updateVariable],
  );

  return (
    <Modal {...modalProps}>
      <ModalHeader buttonOnClick={() => onRequestClose()}>
        <h2>Add variable</h2>
      </ModalHeader>

      <ModalBody>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className={classes.stack}>
            {!isProvidersPending ? (
              <Select id={`${id}:provider`} labelText="Agent" {...register('providerId', { required: true })}>
                {data?.items.map(({ id, agent_card: { name } }) => <SelectItem key={id} value={id} text={name} />)}
              </Select>
            ) : (
              <SelectSkeleton />
            )}

            <TextInput id={`${id}:name`} labelText="Name" {...register('name', { required: true })} />

            <TextInput id={`${id}:value`} labelText="Value" {...register('value', { required: true })} />
          </div>
        </form>
      </ModalBody>

      <ModalFooter>
        <Button kind="ghost" onClick={() => onRequestClose()}>
          Cancel
        </Button>

        <Button onClick={() => handleSubmit(onSubmit)()} disabled={isPending || !isValid}>
          {isPending ? <InlineLoading description="Saving&hellip;" /> : 'Save'}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

type FormValues = {
  name: string;
  value: string;
  providerId: string;
};
