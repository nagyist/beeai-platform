#!/bin/sh
set -eu
echo "Starting the BeeAI installer..."

new_path="${XDG_BIN_HOME:+${XDG_BIN_HOME}:}${XDG_DATA_HOME:+$(realpath -m ${XDG_DATA_HOME}/../bin):}${HOME:+${HOME}/.local/bin:}$PATH"

if ! command -v uv >/dev/null 2>&1; then
    echo "Installing uv..."
    curl -LsSf https://astral.sh/uv/install.sh | UV_PRINT_QUIET=1 sh
fi

echo "Installing beeai-cli..."
PATH="$new_path" uv tool install --quiet --force beeai-cli
PATH="$new_path" beeai self install
