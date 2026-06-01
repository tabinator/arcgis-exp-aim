#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WIDGETS_DIR="$REPO_ROOT/widgets"
TEMPLATE_DIR_DEFAULT="$REPO_ROOT/templates/basic-test"
EXB_TEMPLATE_DIR="/Users/gisdev/arcgis-experience-builder/client/your-extensions/widgets/basic-test"

usage() {
  echo "Usage: $(basename "$0") <widget-name> [Widget Label]"
  echo "Example: $(basename "$0") aim-work-orders \"AiM Work Orders\""
}

if [[ $# -lt 1 ]]; then
  usage
  exit 1
fi

WIDGET_NAME="$1"
shift || true
WIDGET_LABEL="${1:-$WIDGET_NAME}"

if [[ ! "$WIDGET_NAME" =~ ^[a-z0-9-]+$ ]]; then
  echo "Widget name must be lowercase letters, numbers, and dashes only."
  exit 1
fi

if [[ -d "$WIDGETS_DIR/$WIDGET_NAME" ]]; then
  echo "Widget already exists: $WIDGETS_DIR/$WIDGET_NAME"
  exit 1
fi

TEMPLATE_DIR="$TEMPLATE_DIR_DEFAULT"
if [[ -d "$EXB_TEMPLATE_DIR" ]]; then
  TEMPLATE_DIR="$EXB_TEMPLATE_DIR"
fi

if [[ ! -d "$TEMPLATE_DIR" ]]; then
  echo "Template not found. Expected: $TEMPLATE_DIR"
  exit 1
fi

mkdir -p "$WIDGETS_DIR"
cp -R "$TEMPLATE_DIR" "$WIDGETS_DIR/$WIDGET_NAME"

# Rename test file if scaffold includes one.
if [[ -f "$WIDGETS_DIR/$WIDGET_NAME/tests/basic-test-widget.test.tsx" ]]; then
  mv "$WIDGETS_DIR/$WIDGET_NAME/tests/basic-test-widget.test.tsx" "$WIDGETS_DIR/$WIDGET_NAME/tests/$WIDGET_NAME-widget.test.tsx"
fi

# Replace scaffold identifiers in text files.
while IFS= read -r -d '' file; do
  sed -i '' -e "s/basic-test/$WIDGET_NAME/g" "$file"
  sed -i '' -e "s/Basic Test/$WIDGET_LABEL/g" "$file"
  sed -i '' -e "s/Basic custom widget is ready\./$WIDGET_LABEL widget is ready./g" "$file"
done < <(find "$WIDGETS_DIR/$WIDGET_NAME" -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.json' -o -name '*.md' -o -name '*.svg' \) -print0)

# Keep manifest/version aligned to local ExB install used by this workspace.
MANIFEST_PATH="$WIDGETS_DIR/$WIDGET_NAME/manifest.json"
if [[ -f "$MANIFEST_PATH" ]]; then
  tmp_file="$(mktemp)"
  jq --arg name "$WIDGET_NAME" --arg label "$WIDGET_LABEL" '.name = $name | .label = $label | .version = "1.20.0" | .exbVersion = "1.20.0"' "$MANIFEST_PATH" > "$tmp_file"
  mv "$tmp_file" "$MANIFEST_PATH"
fi

echo "Created widget scaffold: $WIDGETS_DIR/$WIDGET_NAME"
echo "Next: ./scripts/link-widgets.sh"
