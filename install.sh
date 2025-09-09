#!/bin/sh
set -eu
echo "Starting the BeeAI Platform installation..."

new_path="${XDG_BIN_HOME:+${XDG_BIN_HOME}:}${XDG_DATA_HOME:+$(realpath -m ${XDG_DATA_HOME}/../bin):}${HOME:+${HOME}/.local/bin:}$PATH"

# Install uv
if command -v uv >/dev/null 2>&1; then
    echo "uv is already installed."
else
    echo "Installing uv..."
    curl -LsSf https://astral.sh/uv/install.sh | UV_PRINT_QUIET=1 sh
fi

# Install beeai-cli
echo "Installing beeai-cli..."
PATH="$new_path" uv tool install --quiet --force beeai-cli

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
            if ! sudo $cmd; then
                echo "⚠️ Failed to install QEMU automatically. Please install QEMU manually before using BeeAI. Refer to https://www.qemu.org/download/ for instructions."
            fi
            break
        fi
    done
fi

echo ""
printf "Do you want to start the BeeAI platform now? Will run: \033[0;32mbeeai platform start\033[0m (Y/n) "
read -r answer </dev/tty
if [ "$answer" != "${answer#[Yy]}" ] || [ -z "$answer" ]; then
    PATH="$new_path" beeai platform start
    echo ""
    printf "Do you want to configure your LLM provider now? Will run: \033[0;32mbeeai model setup\033[0m (Y/n) "
    read -r answer </dev/tty
    if [ "$answer" != "${answer#[Yy]}" ] || [ -z "$answer" ]; then
        PATH="$new_path" beeai model setup
    fi
fi

echo ""
echo "🚀 Installation complete!"
command -v beeai >/dev/null 2>&1 || printf "💡 Open a new terminal window to use the \033[0;32mbeeai\033[0m command."
printf "💡 Use \033[0;32mbeeai ui\033[0m to open the web GUI, or \033[0;32mbeeai run chat\033[0m to talk to an agent on the command line.\n"
printf "💡 Run \033[0;32mbeeai --help\033[0m to learn about available commands, or check the documentation at https://docs.beeai.dev/\n"
