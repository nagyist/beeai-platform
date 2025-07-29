# Copyright 2025 © BeeAI a Series of LF Projects, LLC
# SPDX-License-Identifier: Apache-2.0


from __future__ import annotations

import types
import typing

import pydantic
import pydantic.config

from beeai_sdk.a2a_extensions.base_extension import BaseExtension


class AgentDetailTool(pydantic.BaseModel):
    name: str
    description: str


class AgentDetailContributor(pydantic.BaseModel):
    name: str
    email: str | None = None
    url: str | None = None


class AgentDetail(pydantic.BaseModel):
    ui_type: str | None = pydantic.Field(examples=["chat", "hands-off"])
    user_greeting: str | None = None
    tools: list[AgentDetailTool] | None = None
    framework: str | None = None
    license: str | None = None
    programming_language: str | None = None
    homepage_url: str | None = None
    source_code_url: str | None = None
    container_image_url: str | None = None
    author: AgentDetailContributor | None = None
    contributors: list[AgentDetailContributor] | None = None

    model_config: typing.ClassVar[pydantic.config.ConfigDict] = {"extra": "ignore"}


class AgentDetailExtension(BaseExtension[AgentDetail, types.NoneType]):
    URI: str = "https://a2a-extensions.beeai.dev/ui/agent-detail/v1"
    Params: type[AgentDetail] = AgentDetail
    Metadata: type[types.NoneType] = types.NoneType
