# Copyright 2025 © BeeAI a Series of LF Projects, LLC
# SPDX-License-Identifier: Apache-2.0

import asyncio
import os
import re
from contextlib import contextmanager
from pathlib import Path
from pprint import pprint
from typing import Any

import kr8s
import pytest
from beeai_sdk.platform import ModelProviderType
from kink import di
from pydantic import Secret, computed_field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from beeai_server.infrastructure.persistence.repositories.db_metadata import metadata


class TestConfiguration(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore")
    kubeconfig: Path = Path.home() / ".beeai/lima/beeai-local-test/copied-from-guest/kubeconfig.yaml"
    llm_api_base: str = "http://localhost:11434/v1"
    llm_model: str = "other:llama3.1:8b"
    llm_api_key: Secret[str] = Secret("dummy")
    test_agent_image: str = "ghcr.io/i-am-bee/beeai-platform/official/beeai-framework/chat:0.3.2"
    server_url: str = "http://beeai-platform-svc:8333"
    db_url: str = "postgresql+asyncpg://beeai-user:password@postgresql:5432/beeai"

    @computed_field
    @property
    def llm_provider_type(self) -> ModelProviderType:
        return ModelProviderType(self.llm_model.split(":", maxsplit=1)[0])

    @model_validator(mode="after")
    def set_kubeconfig_env(self):
        os.environ.setdefault("KUBECONFIG", str(self.kubeconfig))
        return self


@pytest.fixture(scope="session")
def test_configuration() -> TestConfiguration:
    return TestConfiguration()


def pytest_configure(config):
    expr = config.getoption("markexpr")

    config = TestConfiguration()  # validate config and set KUBECONFIG env

    if "e2e" in expr or "integration" in expr:
        print("\n\nRunning with configuration:")
        pprint(config.model_dump())
        print()


async def _get_kr8s_client():
    api = await kr8s.asyncio.api()
    kubeconfig = api.auth.kubeconfig
    kubeconfig_regex = r".*/.beeai/(lima|docker)/.*test.*/copied-from-guest/kubeconfig.yaml$"
    if not re.match(kubeconfig_regex, str(kubeconfig.path)):
        raise ValueError(
            f"Preventing e2e tests run with invalid kubeconfig path.\n"
            f"actual: {kubeconfig.path}\n"
            f"expected: {kubeconfig_regex}"
        )
    return api


def pytest_sessionstart(session):
    """Validate that tests are running against the test VM"""
    asyncio.run(_get_kr8s_client())


@pytest.fixture()
async def kr8s_client():
    return await _get_kr8s_client()


@pytest.fixture()
async def db_transaction(test_configuration):
    """Auto-rollback connection"""
    engine = create_async_engine(test_configuration.db_url)
    async with engine.connect() as connection, connection.begin() as transaction:
        try:
            yield connection
        finally:
            await transaction.rollback()


@pytest.fixture(scope="session")
def clean_up_fn(test_configuration):
    async def _fn():
        kr8s_client = await _get_kr8s_client()
        engine = create_async_engine(test_configuration.db_url)
        # Clean all tables
        async with engine.connect() as connection:
            # TODO: drop all users except dummy ones
            for table in metadata.tables.keys() - {"users"}:
                await connection.execute(text(f'TRUNCATE TABLE public."{table}" RESTART IDENTITY CASCADE'))

            # Drop all vector_db tables
            vecdb = await connection.execute(text("SELECT tablename from pg_tables where schemaname = 'vector_db'"))
            for row in vecdb.fetchall():
                await connection.execute(text(f"DROP TABLE vector_db.{row.tablename} CASCADE"))

            await connection.commit()
        # Clean all deployments
        async for deployment in kr8s_client.get(kind="deploy"):
            if "app" in deployment.labels and deployment.labels.app.startswith("beeai-provider-"):
                await deployment.delete()
        print("Cleaned up")

    return _fn


@pytest.fixture()
async def clean_up(clean_up_fn):
    """Truncate all tables after each test."""
    try:
        yield
    finally:
        await clean_up_fn()


@pytest.fixture()
def override_global_dependency():
    @contextmanager
    def override_global_dependency[T](cls: type[T], value: T | Any):
        orig_value = di[cls] if cls in di else None  # noqa: SIM401
        di[cls] = value
        try:
            yield
        finally:
            di[cls] = orig_value

    return override_global_dependency
