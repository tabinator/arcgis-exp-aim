# arcgis-exp-aim-create-package

ArcGIS Experience Builder custom widget work for creating AiM packages.

## Repo Status

This repository is initialized for managed development. Widget source can be added under an Experience Builder-compatible extension structure.

Recommended layout:

```text
client/
  your-extensions/
    widgets/
      aim-create-package/
        manifest.json
        src/
          runtime/
          setting/
          config.ts
```

## Local Development

Sean's local ArcGIS Experience Builder Developer Edition install is expected at:

```bash
/Users/gisdev/arcgis-experience-builder
```

For active widget development, place or sync the widget folder into:

```bash
/Users/gisdev/arcgis-experience-builder/client/your-extensions/widgets
```

Then run the Experience Builder client watcher from the Developer Edition install.

## Workflow

- Create a feature branch from `main`.
- Keep changes scoped to the widget, docs, or workflow being updated.
- Run available validation before pushing.
- Open a PR with a short test summary and deployment notes.

## Managed By Tabs

This repo includes agent instructions in `AGENTS.md` so Tabs can help manage issues, branches, commits, pull requests, CI, and ArcGIS Experience Builder development tasks consistently.

