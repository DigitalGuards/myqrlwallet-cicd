#!/bin/bash
# Select an optional dev-only Node installation without changing NVM defaults
# or the production deploy scripts. DEV_NODE_BIN is an absolute bin directory.
use_dev_toolchain() {
  if [ -n "${DEV_NODE_BIN:-}" ]; then
    if [[ "$DEV_NODE_BIN" != /* ]] || [ ! -x "$DEV_NODE_BIN/node" ] || [ ! -x "$DEV_NODE_BIN/npm" ]; then
      echo "Invalid DEV_NODE_BIN: an absolute directory with executable node and npm is required" >&2
      return 1
    fi
    export PATH="$DEV_NODE_BIN:$PATH"
  else
    source "$NVM_PATH"
    nvm use 22
  fi
  node --version
  npm --version
}
