FROM python:3.13-alpine3.23
# renovate: datasource=github-releases depName=astral-sh/uv
ARG UV_VERSION=0.10.4
ENV UV_COMPILE_BYTECODE=1 \
    HOME="/tmp" \
    AGENT_REGISTRY__LOCATIONS__FILE="file:///app/registry.yaml"
RUN --mount=type=cache,target=/tmp/.cache/uv \
    --mount=type=bind,source=dist/requirements.txt,target=/requirements.txt \
    --mount=type=bind,from=ghcr.io/astral-sh/uv:${UV_VERSION},source=/uv,target=/bin/uv \
    uv pip install --system -r /requirements.txt
RUN --mount=type=cache,target=/tmp/.cache/uv \
    --mount=type=bind,source=dist,target=/dist \
    --mount=type=bind,from=ghcr.io/astral-sh/uv:${UV_VERSION},source=/uv,target=/bin/uv \
    uv pip install --system /dist/*.tar.gz
CMD ["agentstack-server"]
