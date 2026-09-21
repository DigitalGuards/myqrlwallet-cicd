#!/bin/bash
# PRODUCTION_NODE_BIN pins production builds and the backend interpreter.
use_prod_toolchain() {
  if [ -n "${PRODUCTION_NODE_BIN:-}" ]; then
    if [[ "$PRODUCTION_NODE_BIN" != /* ]] || [ ! -x "$PRODUCTION_NODE_BIN/node" ] || [ ! -x "$PRODUCTION_NODE_BIN/npm" ]; then
      echo "Invalid PRODUCTION_NODE_BIN: an absolute directory with executable node and npm is required" >&2
      return 1
    fi
    export PATH="$PRODUCTION_NODE_BIN:$PATH"
  else
    source "$NVM_PATH"
    nvm use 22
  fi
  node --version
  npm --version
}
