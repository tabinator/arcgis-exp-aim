#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/export-app.sh <source-app-id> [app-name] [--force]

Copies one Experience Builder app from:
  $EXB_HOME/server/public/apps/<source-app-id>/

into this repo at:
  apps/<app-name>/

If app-name is omitted, the script tries to derive it from info.json.

Environment:
  EXB_HOME  Experience Builder install path.
            Default: /Users/gisdev/arcgis-experience-builder
EOF
}

slugify() {
  printf '%s' "$1" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//'
}

json_field() {
  local file="$1"
  local field="$2"

  node -e "
    const fs = require('fs');
    const data = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
    const value = data[process.argv[2]];
    if (typeof value === 'string' && value.trim()) process.stdout.write(value.trim());
  " "$file" "$field"
}

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXB_HOME="${EXB_HOME:-/Users/gisdev/arcgis-experience-builder}"
SOURCE_APPS_DIR="$EXB_HOME/server/public/apps"
FORCE="false"

if [[ $# -lt 1 ]]; then
  usage
  exit 1
fi

SOURCE_APP_ID="$1"
shift

APP_NAME=""
if [[ $# -gt 0 && "$1" != "--force" ]]; then
  APP_NAME="$1"
  shift
fi

if [[ $# -gt 0 && "$1" == "--force" ]]; then
  FORCE="true"
  shift
fi

if [[ $# -gt 0 ]]; then
  usage
  exit 1
fi

SOURCE_APP_DIR="$SOURCE_APPS_DIR/$SOURCE_APP_ID"

if [[ ! -d "$SOURCE_APP_DIR" ]]; then
  echo "Missing source app: $SOURCE_APP_DIR"
  exit 1
fi

if [[ -z "$APP_NAME" ]]; then
  INFO_FILE="$SOURCE_APP_DIR/info.json"
  if [[ -f "$INFO_FILE" ]]; then
    APP_TITLE="$(json_field "$INFO_FILE" "title" || true)"
    [[ -n "$APP_TITLE" ]] || APP_TITLE="$(json_field "$INFO_FILE" "name" || true)"
    APP_NAME="$(slugify "$APP_TITLE")"
  fi
fi

if [[ -z "$APP_NAME" ]]; then
  APP_NAME="app-$SOURCE_APP_ID"
fi

DEST_APP_DIR="$REPO_ROOT/apps/$APP_NAME"

if [[ -e "$DEST_APP_DIR" ]]; then
  if [[ "$FORCE" != "true" ]]; then
    echo "Refusing to overwrite existing app snapshot: $DEST_APP_DIR"
    echo "Re-run with --force to replace it after creating a backup."
    exit 1
  fi

  BACKUP_DIR="$DEST_APP_DIR.backup.$(date +%Y%m%d%H%M%S)"
  mv "$DEST_APP_DIR" "$BACKUP_DIR"
  echo "BACKUP $DEST_APP_DIR -> $BACKUP_DIR"
fi

mkdir -p "$(dirname "$DEST_APP_DIR")"
cp -R "$SOURCE_APP_DIR" "$DEST_APP_DIR"

echo "EXPORT app $SOURCE_APP_ID -> apps/$APP_NAME"
echo "Source: $SOURCE_APP_DIR"
echo "Saved:  $DEST_APP_DIR"
