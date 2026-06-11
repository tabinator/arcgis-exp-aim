# arcgis-exp-aim

ArcGIS Experience Builder custom widgets for AiM integration.

## Repository Layout

- `widgets/` source of truth for all custom widgets tracked in GitHub
- `apps/` curated Experience Builder app snapshots tracked in GitHub
- `templates/basic-test/` scaffold baseline used to create new widgets
- `scripts/new-widget.sh` generate a new widget from scaffold
- `scripts/link-widgets.sh` symlink repo widgets into Experience Builder
- `scripts/export-app.sh` save a local Experience Builder app into `apps/`
- `scripts/import-app.sh` restore a saved app into Experience Builder
- `scripts/setup-workstation.sh` link widgets and restore the default app on a new machine

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

- `widgets/aim-manager`
- `widgets/aim-create-work-order`

## Current Apps

- `apps/aim-manager-demo`

### Local Development (Experience Builder Developer Edition 1.20)

1. Copy or sync this widget into Experience Builder:
   - Source: `widgets/aim-manager`
   - Target: `/Users/gisdev/arcgis-experience-builder/client/your-extensions/widgets/aim-manager`
2. In Experience Builder, start the developer server from:
   - `/Users/gisdev/arcgis-experience-builder`
3. Open the builder UI and add the `AiM Manager` widget.
4. Configure target layer URLs, package field, and optional folder base URL in widget settings.

## App Snapshot Workflow

Experience Builder Developer Edition stores app layouts and page configuration in
the local product install, not inside widget folders. This repo keeps named
snapshots under `apps/` so another workstation can restore the same app layout.

### Save an App into Git

Export one local Experience Builder app into this repo:

```bash
./scripts/export-app.sh 0 aim-manager-demo
```

Export every local Experience Builder app:

```bash
./scripts/export-all-apps.sh
```

Use `--force` only when intentionally replacing an existing snapshot:

```bash
./scripts/export-app.sh 0 aim-manager-demo --force
```

### Restore an App on Another Workstation

From the cloned repo, link widgets and import the default app:

```bash
./scripts/setup-workstation.sh
```

Or run the steps manually:

```bash
./scripts/link-widgets.sh
./scripts/import-app.sh aim-manager-demo 0
```

Open the restored app in Experience Builder:

```text
http://localhost:3001/builder/?id=0
```

Set `EXB_HOME` if Experience Builder is installed somewhere else:

```bash
EXB_HOME=/path/to/arcgis-experience-builder ./scripts/setup-workstation.sh
```

## Notes

- Widget folder name and `manifest.json` `name` are both `aim-manager`.
- This starter is intentionally minimal and ready for incremental AiM API integration.
- `basic-test` remains your canonical scaffold template.

## Managed By Tabs

This repo includes agent instructions in `AGENTS.md` so Tabs can help with issue triage, branch workflows, PR prep, and ArcGIS Experience Builder development tasks.
