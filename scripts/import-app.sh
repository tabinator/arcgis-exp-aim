#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/import-app.sh <app-name> <target-app-id> [--force]

Copies one saved Experience Builder app snapshot from:
  apps/<app-name>/

into the local Experience Builder workspace at:
  $EXB_HOME/server/public/apps/<target-app-id>/

The script refuses to overwrite an existing target app unless --force is passed.
When --force is used, the existing target folder is moved to a timestamped
backup first.

Environment:
  EXB_HOME  Experience Builder install path.
            Default: /Users/gisdev/arcgis-experience-builder
EOF
}

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXB_HOME="${EXB_HOME:-/Users/gisdev/arcgis-experience-builder}"
SOURCE_APPS_DIR="$REPO_ROOT/apps"
TARGET_APPS_DIR="$EXB_HOME/server/public/apps"
FORCE="false"

if [[ $# -lt 2 || $# -gt 3 ]]; then
  usage
  exit 1
fi

APP_NAME="$1"
TARGET_APP_ID="$2"
shift 2

if [[ $# -eq 1 ]]; then
  if [[ "$1" != "--force" ]]; then
    usage
    exit 1
  fi
  FORCE="true"
fi

SOURCE_APP_DIR="$SOURCE_APPS_DIR/$APP_NAME"
TARGET_APP_DIR="$TARGET_APPS_DIR/$TARGET_APP_ID"

if [[ ! -d "$SOURCE_APP_DIR" ]]; then
  echo "Missing app snapshot: $SOURCE_APP_DIR"
  exit 1
fi

if [[ ! -d "$TARGET_APPS_DIR" ]]; then
  echo "Missing Experience Builder apps directory: $TARGET_APPS_DIR"
  exit 1
fi

if [[ -e "$TARGET_APP_DIR" ]]; then
  if [[ "$FORCE" != "true" ]]; then
    echo "Refusing to overwrite existing Experience Builder app: $TARGET_APP_DIR"
    echo "Re-run with --force to replace it after creating a backup."
    exit 1
  fi

  BACKUP_DIR="$TARGET_APP_DIR.backup.$(date +%Y%m%d%H%M%S)"
  mv "$TARGET_APP_DIR" "$BACKUP_DIR"
  echo "BACKUP $TARGET_APP_DIR -> $BACKUP_DIR"
fi

mkdir -p "$TARGET_APPS_DIR"
cp -R "$SOURCE_APP_DIR" "$TARGET_APP_DIR"

echo "IMPORT apps/$APP_NAME -> app $TARGET_APP_ID"
echo "Source: $SOURCE_APP_DIR"
echo "Target: $TARGET_APP_DIR"
echo "Builder URL: http://localhost:3001/builder/?id=$TARGET_APP_ID"
