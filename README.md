# arcgis-exp-aim

ArcGIS Experience Builder custom widgets for AiM integration.

## Getting Started

This repository currently includes one starter widget:

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

## Managed By Tabs

This repo includes agent instructions in `AGENTS.md` so Tabs can help with issue triage, branch workflows, PR prep, and ArcGIS Experience Builder development tasks.
