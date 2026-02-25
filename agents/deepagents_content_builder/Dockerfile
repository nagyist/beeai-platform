FROM python:3.13-alpine3.23
# renovate: datasource=github-releases depName=astral-sh/uv
ARG UV_VERSION=0.10.4
ARG RELEASE_VERSION="main"
COPY ./agents/deepagents_content_builder/ /app/agents/deepagents_content_builder
COPY ./apps/agentstack-sdk-py/ /app/apps/agentstack-sdk-py/
WORKDIR /app/agents/deepagents_content_builder
RUN --mount=type=cache,target=/tmp/.cache/uv \
    --mount=type=bind,from=ghcr.io/astral-sh/uv:${UV_VERSION},source=/uv,target=/bin/uv \
    UV_COMPILE_BYTECODE=1 HOME=/tmp uv sync --no-dev
ENV PRODUCTION_MODE=True \
    RELEASE_VERSION=${RELEASE_VERSION}
CMD ["/app/agents/deepagents_content_builder/.venv/bin/server"]
