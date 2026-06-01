#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

find "$REPO_ROOT/widgets" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | sort
