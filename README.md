# arcgis-exp-aim

ArcGIS Experience Builder custom widgets for AiM integration.

## Repository Layout

- `widgets/` source of truth for all custom widgets tracked in GitHub
- `templates/basic-test/` scaffold baseline used to create new widgets
- `scripts/new-widget.sh` generate a new widget from scaffold
- `scripts/link-widgets.sh` symlink repo widgets into Experience Builder

## Widget Workflow

1. Create a new widget from scaffold:

```bash
./scripts/new-widget.sh aim-work-orders "AiM Work Orders"
```

2. Link repo widgets into Experience Builder:

```bash
./scripts/link-widgets.sh
```

3. Develop in Experience Builder using linked folder:

`/Users/gisdev/arcgis-experience-builder/client/your-extensions/widgets/<widget-name>`

4. Commit changes from this repo:

```bash
git checkout -b feature/aim-work-orders-initial
git add .
git commit -m "Add aim-work-orders widget scaffold"
git push -u origin feature/aim-work-orders-initial
```

## Current Widgets

- `widgets/aim-integration`

### Local Development (Experience Builder Developer Edition 1.20)

1. Copy or sync this widget into Experience Builder:
   - Source: `widgets/aim-integration`
   - Target: `/Users/gisdev/arcgis-experience-builder/client/your-extensions/widgets/aim-integration`
2. In Experience Builder, start the developer server from:
   - `/Users/gisdev/arcgis-experience-builder`
3. Open the builder UI and add the `AiM Integration` widget.
4. Configure `AiM endpoint URL` in widget settings.

## Notes

- Widget folder name and `manifest.json` `name` are both `aim-integration`.
- This starter is intentionally minimal and ready for incremental AiM API integration.
- `basic-test` remains your canonical scaffold template.

## Managed By Tabs

This repo includes agent instructions in `AGENTS.md` so Tabs can help with issue triage, branch workflows, PR prep, and ArcGIS Experience Builder development tasks.
