# AGENTS.md - arcgis-exp-aim-manager

This repo contains ArcGIS Experience Builder work for the AiM Manager workflow.

## Operating Rules

- Keep `main` deployable and use short feature branches for changes.
- Do not commit `node_modules`, build output, local Experience Builder product zips, or generated packages.
- Prefer small commits with clear messages, such as `feat: add package form validation`.
- Before opening or merging a PR, summarize what changed, how it was tested, and any deployment notes.

## ArcGIS Experience Builder Conventions

- Target local Developer Edition install: `/Users/gisdev/arcgis-experience-builder`.
- Current local Experience Builder version: `1.20.0`.
- Widget folders should live under `client/your-extensions/widgets/<widget-name>` when developed inside the Experience Builder install.
- If this repo stores only custom extension source, mirror that folder structure here so files can be copied or synced into Developer Edition predictably.
- Keep widget folder names lowercase/kebab-case and make `manifest.json` `name` match the folder.
- Use TypeScript, React, `jimu-core`, `jimu-ui`, immutable config updates, and settings/runtime separation.
- For map-connected widgets, use `MapWidgetSelector` in settings and `JimuMapViewComponent` at runtime.

## Verification Checklist

- `manifest.json` files are valid JSON.
- Widget runtime handles missing config, missing map widget, slow services, and signed-out users.
- Settings code does not perform runtime-only side effects.
- Any `jimu-arcgis` or ArcGIS Maps SDK imports are declared in `manifest.json` dependencies.
- CI passes before merge.
