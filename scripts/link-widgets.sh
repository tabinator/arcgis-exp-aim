#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE_WIDGETS_DIR="$REPO_ROOT/widgets"
TARGET_WIDGETS_DIR="/Users/gisdev/arcgis-experience-builder/client/your-extensions/widgets"

if [[ ! -d "$SOURCE_WIDGETS_DIR" ]]; then
  echo "Source widgets directory missing: $SOURCE_WIDGETS_DIR"
  exit 1
fi

mkdir -p "$TARGET_WIDGETS_DIR"

for widget_path in "$SOURCE_WIDGETS_DIR"/*; do
  [[ -d "$widget_path" ]] || continue

  widget_name="$(basename "$widget_path")"
  target_path="$TARGET_WIDGETS_DIR/$widget_name"

  if [[ -L "$target_path" ]]; then
    current_target="$(readlink "$target_path")"
    if [[ "$current_target" == "$widget_path" ]]; then
      echo "OK   $widget_name already linked"
      continue
    fi
    echo "SKIP $widget_name symlink exists with different target: $current_target"
    continue
  fi

  if [[ -e "$target_path" ]]; then
    echo "SKIP $widget_name target exists and is not a symlink: $target_path"
    continue
  fi

  ln -s "$widget_path" "$target_path"
  echo "LINK $widget_name -> $widget_path"
done
