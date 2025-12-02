#!/bin/bash
# Enable corepack for pnpm support
if command -v corepack > /dev/null 2>&1; then
  corepack enable
fi
