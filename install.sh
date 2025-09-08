#!/bin/sh
set -eu
echo "Starting the BeeAI Platform installation..."

# Install uv
if command -v uv >/dev/null 2>&1; then
    echo "uv is already installed."
else
    echo "Installing uv..."
    curl -LsSf https://astral.sh/uv/install.sh | UV_PRINT_QUIET=1 sh
fi

# Install beeai-cli
echo "Installing beeai-cli..."
PATH="${XDG_BIN_HOME:+${XDG_BIN_HOME}:}${XDG_DATA_HOME:+$(realpath -m ${XDG_DATA_HOME}/../bin):}${HOME:+${HOME}/.local/bin:}$PATH" uv tool install --quiet --force beeai-cli

# Install QEMU (Linux only)
if test "$(uname)" = "Darwin"; then
    echo "macOS detected, QEMU is not needed."
elif command -v qemu-system-$(uname -m) >/dev/null 2>&1; then
    echo "QEMU is already installed."
else
    echo "Installing QEMU..."
    echo "‼️ You may be prompted for your password to install QEMU using your package manager."
    QEMU_INSTALL_RV=""
    for cmd in \
        "apt install -y -qq qemu-system" \
        "dnf install -y -q @virtualization" \
        "pacman -S --noconfirm --noprogressbar qemu" \
        "zypper install -y -qq qemu" \
        "yum install -y -q qemu-kvm" \
        "emerge --quiet app-emulation/qemu"
    do
        if command -v "${cmd%% *}" >/dev/null 2>&1; then
            sudo $cmd
            QEMU_INSTALL_RV=$?
            break
        fi
    done
    if test -z "$QEMU_INSTALL_RV" || test "$QEMU_INSTALL_RV" -ne 0; then
        echo "⚠️ Failed to install QEMU automatically. Please install QEMU manually before using BeeAI. Refer to https://www.qemu.org/download/ for instructions."
    fi
fi

echo "🚀 Installation complete!"
if command -v beeai; then
    echo "💡 You can now use the \`beeai\` command."
else
    echo "💡 Open a new terminal window in order to use the \`beeai\` command."
fi
