# Copyright 2025 © BeeAI a Series of LF Projects, LLC
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncIterator, Callable
from uuid import UUID

from a2a.types import AgentCard
from fastapi import HTTPException
from kink import inject
from starlette.status import HTTP_400_BAD_REQUEST, HTTP_404_NOT_FOUND

from beeai_server.domain.models.provider import (
    Provider,
    ProviderDeploymentState,
    ProviderLocation,
    ProviderWithState,
)
from beeai_server.domain.models.registry import RegistryLocation
from beeai_server.exceptions import ManifestLoadError
from beeai_server.service_layer.deployment_manager import (
    IProviderDeploymentManager,
)
from beeai_server.service_layer.unit_of_work import IUnitOfWorkFactory
from beeai_server.utils.logs_container import LogsContainer
from beeai_server.utils.utils import cancel_task, utc_now

logger = logging.getLogger(__name__)


@inject
class ProviderService:
    def __init__(
        self,
        deployment_manager: IProviderDeploymentManager,
        uow: IUnitOfWorkFactory,
    ):
        self._uow = uow
        self._deployment_manager = deployment_manager

    async def create_provider(
        self,
        *,
        location: ProviderLocation,
        registry: RegistryLocation | None = None,
        auto_remove: bool = False,
        agent_card: AgentCard | None = None,
    ) -> ProviderWithState:
        try:
            if not agent_card:
                agent_card = await location.load_agent_card()
            provider = Provider(
                source=location,
                registry=registry,
                auto_remove=auto_remove,
                agent_card=agent_card,
            )
        except ValueError as ex:
            raise ManifestLoadError(location=location, message=str(ex), status_code=HTTP_400_BAD_REQUEST) from ex
        except Exception as ex:
            raise ManifestLoadError(location=location, message=str(ex)) from ex

        async with self._uow() as uow:
            await uow.providers.create(provider=provider)
            await uow.commit()
        [provider_response] = await self._get_providers_with_state(providers=[provider])
        return provider_response

    async def preview_provider(
        self, location: ProviderLocation, agent_card: AgentCard | None = None
    ) -> ProviderWithState:
        try:
            if not agent_card:
                agent_card = await location.load_agent_card()
            provider = Provider(source=location, agent_card=agent_card)
            [provider_response] = await self._get_providers_with_state(providers=[provider])
            return provider_response
        except ValueError as ex:
            raise ManifestLoadError(location=location, message=str(ex), status_code=HTTP_400_BAD_REQUEST) from ex
        except Exception as ex:
            raise ManifestLoadError(location=location, message=str(ex)) from ex

    async def _get_providers_with_state(self, providers: list[Provider]) -> list[ProviderWithState]:
        result_providers = []

        async with self._uow() as uow:
            env = await uow.env.get_all()

        provider_states = await self._deployment_manager.state(provider_ids=[provider.id for provider in providers])

        for provider, state in zip(providers, provider_states, strict=False):
            result_providers.append(
                ProviderWithState(
                    **provider.model_dump(),
                    # We blatantly report a ready state for unmanaged providers
                    # (calling each provider over HTTP is too expensive for a simple list_providers request)
                    # TODO: In-memory state caching for unmanaged providers
                    state=state if provider.managed else ProviderDeploymentState.ready,
                    missing_configuration=[var for var in provider.check_env(env, raise_error=False) if var.required],
                )
            )
        return result_providers

    async def delete_provider(self, *, provider_id: UUID):
        async with self._uow() as uow:
            provider = await uow.providers.get(provider_id=provider_id)
            await uow.providers.delete(provider_id=provider_id)
            if provider.managed:
                await self._deployment_manager.delete(provider_id=provider_id)
            await uow.commit()

    async def scale_down_providers(self):
        active_providers = [
            provider
            for provider in await self.list_providers()
            if provider.managed and provider.state == ProviderDeploymentState.running
        ]
        errors = []
        for provider in active_providers:
            try:
                if provider.last_active_at and (provider.last_active_at + provider.auto_stop_timeout) < utc_now():
                    logger.info(f"Scaling down provider: {provider.id}")
                    await self._deployment_manager.scale_down(provider_id=provider.id)
            except Exception as ex:
                errors.append(ex)
        if errors:
            raise ExceptionGroup("Exceptions occurred when scaling down providers", errors)

    async def list_providers(self) -> list[ProviderWithState]:
        async with self._uow() as uow:
            return await self._get_providers_with_state(providers=[p async for p in uow.providers.list()])

    async def get_provider(self, provider_id: UUID) -> ProviderWithState:
        providers = [provider for provider in await self.list_providers() if provider.id == provider_id]
        if not providers:
            raise HTTPException(status_code=HTTP_404_NOT_FOUND, detail=f"Provider with ID: {provider_id!s} not found")
        return providers[0]

    async def stream_logs(self, provider_id: UUID) -> Callable[..., AsyncIterator[str]]:
        logs_container = LogsContainer()

        logs_task = asyncio.create_task(
            self._deployment_manager.stream_logs(provider_id=provider_id, logs_container=logs_container)
        )

        async def logs_iterator() -> AsyncIterator[str]:
            try:
                async with logs_container.stream() as stream:
                    async for message in stream:
                        if message.model_dump().get("error"):
                            raise RuntimeError(f"Error capturing logs: {message.message}")
                        yield json.dumps(message.model_dump(mode="json"))
            finally:
                await cancel_task(logs_task)

        return logs_iterator
