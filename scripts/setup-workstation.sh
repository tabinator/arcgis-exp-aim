#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/setup-workstation.sh [--force]

Links repo widgets into Experience Builder and imports the default saved app.

Defaults:
  APP_NAME=aim-manager-demo
  APP_ID=0

Environment:
  EXB_HOME  Experience Builder install path.
            Default: /Users/gisdev/arcgis-experience-builder
  APP_NAME  Saved app folder under apps/. Default: aim-manager-demo
  APP_ID    Target Experience Builder app id. Default: 0
EOF
}

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="${APP_NAME:-aim-manager-demo}"
APP_ID="${APP_ID:-0}"
FORCE_ARG=""

if [[ $# -gt 1 ]]; then
  usage
  exit 1
fi

if [[ $# -eq 1 ]]; then
  if [[ "$1" == "--help" || "$1" == "-h" ]]; then
    usage
    exit 0
  fi

  if [[ "$1" != "--force" ]]; then
    usage
    exit 1
  fi

  FORCE_ARG="--force"
fi

"$REPO_ROOT/scripts/link-widgets.sh"
"$REPO_ROOT/scripts/import-app.sh" "$APP_NAME" "$APP_ID" $FORCE_ARG

echo "Workstation setup complete."
