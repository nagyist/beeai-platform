# Copyright 2025 © BeeAI a Series of LF Projects, LLC
# SPDX-License-Identifier: Apache-2.0

import logging
import socket
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager, closing
from typing import Any

import httpx
import pytest
from a2a.client import Client, ClientConfig, ClientEvent, ClientFactory
from a2a.types import AgentCard, Message, Task
from beeai_sdk.platform import ModelProvider, SystemConfiguration, use_platform_client

logger = logging.getLogger(__name__)


@pytest.fixture
def get_final_task_from_stream() -> Callable[[AsyncIterator[ClientEvent | Message]], Awaitable[Task]]:
    async def fn(stream: AsyncIterator[ClientEvent | Message]) -> Task:
        """Helper to extract the final task from a client.send_message stream."""
        final_task = None
        async for event in stream:
            match event:
                case (task, None):
                    final_task = task
                case (task, _):
                    final_task = task
        return final_task

    return fn


@pytest.fixture()
async def a2a_client_factory() -> Callable[[AgentCard | dict[str, Any]], AsyncIterator[Client]]:
    @asynccontextmanager
    async def a2a_client_factory(agent_card: AgentCard | dict) -> AsyncIterator[Client]:
        async with httpx.AsyncClient(timeout=None, auth=("admin", "test-password")) as client:
            yield ClientFactory(ClientConfig(httpx_client=client)).create(card=agent_card)

    return a2a_client_factory


@pytest.fixture()
async def setup_platform_client(test_configuration) -> AsyncIterator[None]:
    async with use_platform_client(
        base_url=test_configuration.server_url, timeout=None, auth=("admin", "test-password")
    ):
        yield None


@pytest.fixture()
def free_port() -> int:
    with closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as sock:
        sock.bind(("", 0))  # Bind to any available port
        return int(sock.getsockname()[1])


@pytest.fixture()
async def setup_real_llm(test_configuration, setup_platform_client):
    await ModelProvider.create(
        name="test_config",
        type=test_configuration.llm_provider_type,
        base_url=test_configuration.llm_api_base,
        api_key=test_configuration.llm_api_key.get_secret_value(),
    )
    await SystemConfiguration.update(default_llm_model=test_configuration.llm_model)
