#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/export-all-apps.sh [--force]

Exports every local Experience Builder app from:
  $EXB_HOME/server/public/apps/

into this repo's apps/ folder. App names are derived from each app's info.json
title/name when available.

Environment:
  EXB_HOME  Experience Builder install path.
            Default: /Users/gisdev/arcgis-experience-builder
EOF
}

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXB_HOME="${EXB_HOME:-/Users/gisdev/arcgis-experience-builder}"
SOURCE_APPS_DIR="$EXB_HOME/server/public/apps"
FORCE_ARG=""

if [[ $# -gt 1 ]]; then
  usage
  exit 1
fi

if [[ $# -eq 1 ]]; then
  if [[ "$1" != "--force" ]]; then
    usage
    exit 1
  fi
  FORCE_ARG="--force"
fi

if [[ ! -d "$SOURCE_APPS_DIR" ]]; then
  echo "Missing Experience Builder apps directory: $SOURCE_APPS_DIR"
  exit 1
fi

FOUND="false"

for app_dir in "$SOURCE_APPS_DIR"/*; do
  [[ -d "$app_dir" ]] || continue

  FOUND="true"
  app_id="$(basename "$app_dir")"
  "$REPO_ROOT/scripts/export-app.sh" "$app_id" $FORCE_ARG
done

if [[ "$FOUND" != "true" ]]; then
  echo "No apps found in: $SOURCE_APPS_DIR"
fi
