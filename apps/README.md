# Experience Builder Apps

This folder stores curated Experience Builder app snapshots that can be restored
into a local Experience Builder Developer Edition install.

The live Experience Builder workspace keeps apps under:

```text
<experience-builder>/server/public/apps/<app-id>/
```

This repo stores named copies under:

```text
apps/<app-name>/
```

## Export from Local Experience Builder

Save one local app into the repo:

```bash
./scripts/export-app.sh 0 aim-manager-demo
```

Save all local apps into the repo:

```bash
./scripts/export-all-apps.sh
```

## Import into Local Experience Builder

Restore a saved app into app slot `0`:

```bash
./scripts/import-app.sh aim-manager-demo 0
```

The import script refuses to overwrite an existing app unless `--force` is
passed. When `--force` is used, the existing app folder is moved to a timestamped
backup first.

## Workstation Setup

For a fresh machine, link widgets and import the default app:

```bash
./scripts/setup-workstation.sh
```

Override the defaults if needed:

```bash
APP_NAME=aim-manager-demo APP_ID=1 ./scripts/setup-workstation.sh
```

Set `EXB_HOME` when Experience Builder is installed somewhere other than
`/Users/gisdev/arcgis-experience-builder`:

```bash
EXB_HOME=/path/to/arcgis-experience-builder ./scripts/setup-workstation.sh
```
