#!/bin/sh
set -e

# Install Rust toolchain
curl https://sh.rustup.rs -sSf | sh -s -- -y

# Update PATH for current session
export PATH="$HOME/.cargo/bin:/root/.cargo/bin:$PATH"

# Install wasm-pack using the official installer
curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh 