import { loadArcGISJSAPIModules } from 'jimu-arcgis'
import type { PackageCartItem } from './types'
import {
  CREATED_DATE_FIELD,
  formatDateValue,
  getAttributeValue,
  INSPECTOR_FIELD,
  PROPERTY_NAME_FIELD,
  WORK_CODE_FIELD
} from './utils'

const ATTACHMENT_LIMIT_PER_FEATURE = 4
const ATTACHMENT_DOWNLOAD_CONCURRENCY = 4
const EMPTY_REPORT_VALUE = '--'

interface GeneratePackageReportOptions {
  reportWindow: Window
  packageId: string
  layerUrl: string
  features: PackageCartItem[]
}

interface ReportAttachment {
  name: string
  blobUrl?: string
  error?: string
}

interface FeatureReportData {
  feature: PackageCartItem
  attachmentCount: number
  attachments: ReportAttachment[]
}

const escapeHtml = (value: any) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;')

const hasValue = (value: any) =>
  value !== null && value !== undefined && String(value).trim() !== ''

const displayReportValue = (value: any) =>
  hasValue(value) ? String(value) : EMPTY_REPORT_VALUE

const mapWithConcurrency = async <T, R>(
  items: T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<R>
): Promise<R[]> => {
  const results = new Array<R>(items.length)
  let nextIndex = 0

  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await task(items[index], index)
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      await worker()
    })
  )
  return results
}

const renderLoading = (reportWindow: Window, packageId: string, current = 0, total = 0) => {
  const doc = reportWindow.document
  const safeTotal = Math.max(total, 0)
  const safeCurrent = safeTotal > 0 ? Math.min(Math.max(current, 0), safeTotal) : 0
  const percent = safeTotal > 0 ? Math.round((safeCurrent / safeTotal) * 100) : 0
  const statusText = safeTotal > 0 && safeCurrent > 0
    ? `Processing ${safeCurrent} of ${safeTotal}`
    : safeTotal > 0
      ? `Preparing ${safeTotal} deficiencies`
      : 'Preparing report'
  doc.open()
  doc.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(packageId)} report</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #e9edf2;
      color: #17202a;
      font-family: "Aptos", "Segoe UI", Arial, Helvetica, sans-serif;
    }
    .loading {
      width: min(92vw, 680px);
      padding: .36in;
      border: 1px solid #cbd4dd;
      border-top: 4px solid #1f6f8b;
      border-radius: 8px;
      background: #fff;
      box-shadow: 0 2px 16px rgba(23, 32, 42, .14);
    }
    .eyebrow {
      margin: 0 0 .14rem;
      color: #657380;
      font-size: 8pt;
      font-weight: 800;
      letter-spacing: 0;
      text-transform: uppercase;
    }
    h1 {
      margin: 0;
      color: #17202a;
      font-size: 22pt;
      line-height: 1.08;
      overflow-wrap: anywhere;
    }
    .subtitle {
      margin: .45rem 0 1.2rem;
      color: #516170;
      font-size: 10.5pt;
    }
    .progress-row {
      display: grid;
      grid-template-columns: 42px minmax(0, 1fr);
      gap: .75rem;
      align-items: center;
    }
    .spinner {
      width: 42px;
      height: 42px;
      border: 4px solid #dce2e8;
      border-top-color: #1f6f8b;
      border-radius: 50%;
      animation: spin .8s linear infinite;
    }
    .progress-label {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: .35rem;
      color: #31414f;
      font-size: 9.5pt;
      font-weight: 800;
    }
    .progress-label span:last-child {
      color: #657380;
      font-size: 8.5pt;
    }
    .progress-track {
      width: 100%;
      height: 10px;
      overflow: hidden;
      border-radius: 999px;
      background: #dce2e8;
    }
    .progress-bar {
      width: ${percent}%;
      height: 100%;
      border-radius: inherit;
      background: #1f6f8b;
      transition: width .18s ease;
    }
    .footnote {
      margin: 1rem 0 0;
      color: #657380;
      font-size: 8.5pt;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div class="loading">
    <p class="eyebrow">AiM Package Report</p>
    <h1>${escapeHtml(packageId)}</h1>
    <p class="subtitle">Generating package report and loading image attachments.</p>
    <div class="progress-row">
      <div class="spinner" aria-hidden="true"></div>
      <div>
        <div class="progress-label">
          <span>${escapeHtml(statusText)}</span>
          <span>${percent}%</span>
        </div>
        <div class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="${safeTotal}" aria-valuenow="${safeCurrent}" aria-label="${escapeHtml(statusText)}">
          <div class="progress-bar"></div>
        </div>
      </div>
    </div>
    <p class="footnote">This window will update automatically when the report is ready.</p>
  </div>
</body>
</html>`)
  doc.close()
}

export const renderReportError = (reportWindow: Window, message: string) => {
  const doc = reportWindow.document
  doc.open()
  doc.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Report generation error</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 2rem; color: #1f2933; }
    .error { max-width: 720px; margin: 10vh auto; padding: 1.5rem; border: 1px solid #b42318; border-radius: 8px; }
    h1 { color: #b42318; }
  </style>
</head>
<body>
  <div class="error">
    <h1>Unable to generate report</h1>
    <p>${escapeHtml(message)}</p>
  </div>
</body>
</html>`)
  doc.close()
}

const formatReportDate = (value: any) =>
  hasValue(value) ? formatDateValue(value) : EMPTY_REPORT_VALUE

const renderValue = (value: any) => escapeHtml(displayReportValue(value))

const renderSummaryItem = (label: string, value: any) => {
  return `<div class="summary-item">
    <span>${escapeHtml(label)}</span>
    <strong>${renderValue(value)}</strong>
  </div>`
}

const renderField = (label: string, value: any) => {
  return `<div class="field">
    <dt>${escapeHtml(label)}</dt>
    <dd>${renderValue(value)}</dd>
  </div>`
}

const renderFieldGroup = (title: string, fields: Array<[string, any]>, className = '') => {
  const renderedFields = fields
    .map(([label, value]) => renderField(label, value))
    .join('')

  return `<section class="detail-group ${escapeHtml(className)}">
    <h3>${escapeHtml(title)}</h3>
    <dl>${renderedFields}</dl>
  </section>`
}

const renderFeatureDetails = (feature: PackageCartItem, index: number, totalCount: number) => {
  const attributes = feature.attributes || {}

  const summaryItems = [
    renderSummaryItem('Deficiency', `${index + 1} of ${totalCount}`),
    renderSummaryItem('Object ID', feature.objectId),
    renderSummaryItem('Work Code', getAttributeValue(attributes, WORK_CODE_FIELD)),
    renderSummaryItem('Location', getAttributeValue(attributes, 'LocationCode')),
    renderSummaryItem('Work Unit', getAttributeValue(attributes, 'WorkUnit')),
    renderSummaryItem('Inspected Date', formatReportDate(getAttributeValue(attributes, CREATED_DATE_FIELD))),
    renderSummaryItem('Inspector', getAttributeValue(attributes, INSPECTOR_FIELD))
  ].filter(Boolean).join('')

  const primaryFields: Array<[string, any]> = [
    ['Repair Recommendation', getAttributeValue(attributes, 'RepairRecommendation')],
    ['Estimated Work Quantity', getAttributeValue(attributes, 'EstimatedWorkQuantity')],
    ['Dimensions', getAttributeValue(attributes, 'Dimensions')],
    ['Notes', getAttributeValue(attributes, 'Notes')]
  ]

  const locationFields: Array<[string, any]> = [
    ['Property Name', getAttributeValue(attributes, PROPERTY_NAME_FIELD)],
    ['Deficiency Location', getAttributeValue(attributes, 'DeficiencyLocation')],
    ['Location Description', getAttributeValue(attributes, 'LocationDescription')],
    ['Latitude', getAttributeValue(attributes, 'Latitude')],
    ['Longitude', getAttributeValue(attributes, 'Longitude')]
  ]

  return `<div class="deficiency-summary">${summaryItems}</div>
    <div class="detail-layout">
      ${renderFieldGroup('Core Details', primaryFields)}
      ${renderFieldGroup('Location Details', locationFields, 'wide')}
    </div>`
}

const renderAttachments = (reportData: FeatureReportData) => {
  if (reportData.attachmentCount === 0) {
    return `<section class="attachment-section">
      <div class="attachment-heading">
        <h3>Photos</h3>
        <p class="empty">No image attachments.</p>
      </div>
    </section>`
  }

  const summary = reportData.attachmentCount > ATTACHMENT_LIMIT_PER_FEATURE
    ? `<p class="attachment-summary">Showing ${ATTACHMENT_LIMIT_PER_FEATURE} of ${reportData.attachmentCount} image attachments.</p>`
    : ''

  return `<section class="attachment-section">
    <div class="attachment-heading">
      <h3>Photos</h3>
      ${summary}
    </div>
    <div class="attachment-grid">
      ${reportData.attachments.map((attachment) => {
        if (attachment.error || !attachment.blobUrl) {
          return `<div class="attachment-error">
            <strong>${escapeHtml(attachment.name)}</strong>
            <span>${escapeHtml(attachment.error || 'Unable to load attachment.')}</span>
          </div>`
        }
        return `<figure class="attachment">
          <img src="${escapeHtml(attachment.blobUrl)}" alt="${escapeHtml(attachment.name)}">
          <figcaption>${escapeHtml(attachment.name)}</figcaption>
        </figure>`
      }).join('')}
    </div>
  </section>`
}

const renderReport = (
  reportWindow: Window,
  packageId: string,
  reportData: FeatureReportData[]
) => {
  const doc = reportWindow.document
  const generatedAt = new Date().toLocaleString()
  doc.open()
  doc.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(packageId)} report</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #e9edf2;
      color: #17202a;
      font-family: "Aptos", "Segoe UI", Arial, Helvetica, sans-serif;
      font-size: 9.5pt;
      line-height: 1.3;
    }
    .toolbar {
      position: sticky;
      top: 0;
      z-index: 2;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: .5rem;
      padding: .55rem .75rem;
      border-bottom: 1px solid #c8d0d8;
      background: rgba(255, 255, 255, .96);
    }
    .view-controls { display: flex; align-items: center; gap: .4rem; }
    .view-label { margin-right: .15rem; color: #516170; font-size: 8.5pt; font-weight: 700; text-transform: uppercase; }
    button {
      border: 1px solid #1f6f8b;
      border-radius: 4px;
      padding: .42rem .7rem;
      background: #1f6f8b;
      color: #fff;
      cursor: pointer;
      font: inherit;
      font-weight: 700;
      font-size: 9pt;
    }
    .view-button {
      background: #fff;
      color: #1f6f8b;
    }
    .view-button.active {
      background: #1f6f8b;
      color: #fff;
    }
    main {
      width: min(100%, 8.5in);
      margin: .65rem auto;
      padding: .32in;
      background: #fff;
      box-shadow: 0 2px 16px rgba(23, 32, 42, .14);
    }
    .report-header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(2.65in, auto);
      gap: .35rem .65rem;
      align-items: stretch;
      margin-bottom: .52rem;
      padding-bottom: .42rem;
      border-bottom: 2px solid #1f6f8b;
    }
    .title-block {
      min-width: 0;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
    }
    .eyebrow {
      margin: 0 0 .08rem;
      color: #657380;
      font-size: 7.2pt;
      font-weight: 800;
      letter-spacing: 0;
      text-transform: uppercase;
    }
    h1 {
      margin: 0;
      color: #17202a;
      font-size: 18pt;
      line-height: 1.05;
      overflow-wrap: anywhere;
    }
    .report-meta {
      display: grid;
      grid-template-columns: .92in minmax(1.55in, 1fr);
      gap: .2rem;
      align-self: end;
      color: #516170;
    }
    .meta-item {
      min-width: 0;
      padding: .18rem .24rem;
      border: 1px solid #cbd4dd;
      border-radius: 4px;
      background: #f7f9fb;
    }
    .meta-item span {
      display: block;
      color: #657380;
      font-size: 6.8pt;
      font-weight: 800;
      line-height: 1.1;
      text-transform: uppercase;
    }
    .meta-item strong {
      display: block;
      margin-top: .06rem;
      color: #17202a;
      font-size: 9pt;
      line-height: 1.15;
      overflow-wrap: anywhere;
    }
    .deficiency {
      margin: 0 0 .42rem;
      padding: .38rem .42rem .42rem;
      border: 1px solid #c5cdd5;
      border-left: 4px solid #1f6f8b;
      border-radius: 5px;
      background: #fff;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .deficiency-summary {
      display: grid;
      grid-template-columns: .68in .68in minmax(.66in, .9fr) minmax(.62in, .85fr) minmax(.62in, .78fr) minmax(.78in, 1fr) minmax(.7in, .9fr);
      gap: .2rem;
      margin-bottom: .32rem;
      padding-bottom: .3rem;
      border-bottom: 1px solid #dce2e8;
    }
    .summary-item {
      min-width: 0;
      padding: .14rem .22rem;
      border-radius: 3px;
      background: #f4f7f9;
    }
    .summary-item span {
      display: block;
      color: #657380;
      font-size: 6.9pt;
      font-weight: 800;
      line-height: 1.1;
      text-transform: uppercase;
    }
    .summary-item strong {
      display: block;
      margin-top: .04rem;
      font-size: 8.6pt;
      line-height: 1.15;
      overflow-wrap: anywhere;
    }
    .detail-layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
      gap: .35rem .45rem;
    }
    .detail-group {
      min-width: 0;
      break-inside: avoid;
    }
    .detail-group.wide { grid-column: auto; }
    h3 {
      margin: 0 0 .12rem;
      color: #31414f;
      font-size: 7.5pt;
      font-weight: 800;
      letter-spacing: 0;
      text-transform: uppercase;
    }
    .detail-group dl {
      display: grid;
      grid-template-columns: minmax(.82in, .86fr) minmax(0, 1.35fr);
      gap: .08rem .26rem;
      margin: 0;
    }
    .field { display: contents; }
    dt {
      color: #657380;
      font-size: 7.3pt;
      font-weight: 800;
      line-height: 1.2;
      text-transform: uppercase;
    }
    dd {
      margin: 0;
      color: #17202a;
      font-size: 8.3pt;
      line-height: 1.2;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .attachment-section {
      margin-top: .35rem;
      padding-top: .28rem;
      border-top: 1px solid #dce2e8;
    }
    .attachment-heading {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: .5rem;
      margin-bottom: .22rem;
    }
    .attachment-heading h3 { margin: 0; }
    .attachment-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: .28rem;
    }
    .attachment {
      margin: 0;
      padding: .16rem;
      border: 1px solid #d3dbe3;
      border-radius: 4px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .attachment img {
      display: block;
      width: 100%;
      height: auto;
      max-height: 1.8in;
      object-fit: contain;
    }
    figcaption {
      margin-top: .08rem;
      color: #657380;
      font-size: 6.7pt;
      line-height: 1.15;
      overflow-wrap: anywhere;
    }
    .empty, .attachment-summary {
      margin: 0;
      color: #657380;
      font-size: 7.5pt;
    }
    .attachment-error {
      padding: .4rem;
      border: 1px solid #f0b4ae;
      background: #fff4f2;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .attachment-error span { display: block; margin-top: .25rem; color: #8a1c13; }
    @media screen {
      body.spacious { font-size: 10.5pt; }
      body.spacious main { padding: .5in; }
      body.spacious .report-header { margin-bottom: .8rem; padding-bottom: .55rem; }
      body.spacious h1 { font-size: 21pt; }
      body.spacious .deficiency { margin-bottom: .85rem; padding: .65rem; }
      body.spacious .deficiency-summary { margin-bottom: .55rem; padding-bottom: .45rem; }
      body.spacious .detail-layout {
        grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
        gap: .55rem .75rem;
      }
      body.spacious .detail-group dl {
        grid-template-columns: minmax(1.18in, .75fr) minmax(0, 1.75fr);
        gap: .16rem .45rem;
      }
      body.spacious dt { font-size: 8pt; }
      body.spacious dd { font-size: 9.5pt; }
      body.spacious .attachment-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .55rem; }
      body.spacious .attachment { padding: .3rem; }
      body.spacious .attachment img { max-height: 4.2in; }
      body.spacious figcaption { margin-top: .22rem; font-size: 8pt; }
    }
    @page { size: letter; margin: .32in; }
    @media print {
      body { background: #fff; font-size: 8.5pt; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .toolbar { display: none; }
      main { width: auto; margin: 0; padding: 0; box-shadow: none; }
      .report-header { margin-bottom: .32rem; padding-bottom: .28rem; }
      h1 { font-size: 16pt; }
      .report-meta { grid-template-columns: .85in minmax(1.45in, 1fr); gap: .16rem; }
      .meta-item { padding: .14rem .18rem; }
      .meta-item span { font-size: 6.3pt; }
      .meta-item strong { font-size: 8pt; }
      .deficiency {
        margin-bottom: .34rem;
        padding: .32rem .36rem .36rem;
        border-color: #aeb8c2;
        break-inside: avoid-page;
        page-break-inside: avoid;
      }
      .deficiency-summary { gap: .2rem; margin-bottom: .26rem; padding-bottom: .24rem; }
      .summary-item { padding: .1rem .16rem; }
      .summary-item span { font-size: 6.4pt; }
      .summary-item strong { font-size: 8pt; }
      .detail-layout { grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr); gap: .26rem .34rem; }
      h3 { font-size: 7pt; }
      .detail-group dl { grid-template-columns: minmax(.74in, .8fr) minmax(0, 1.4fr); gap: .06rem .2rem; }
      dt { font-size: 6.7pt; }
      dd { font-size: 7.7pt; }
      .attachment-section { margin-top: .26rem; padding-top: .22rem; }
      .attachment-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .22rem; }
      .attachment { padding: .12rem; }
      .attachment img { max-height: 1.55in; }
      figcaption { font-size: 6.2pt; }
      body.spacious .attachment-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .34rem; }
      body.spacious .attachment { padding: .18rem; }
      body.spacious .attachment img { max-height: 3.15in; }
      body.spacious figcaption { margin-top: .12rem; font-size: 6.8pt; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <div class="view-controls">
      <span class="view-label">View:</span>
      <button type="button" class="view-button active" data-report-view="compact" onclick="setReportView('compact')">Compact</button>
      <button type="button" class="view-button" data-report-view="spacious" onclick="setReportView('spacious')">Spacious</button>
    </div>
    <button type="button" onclick="window.print()">Print / Save as PDF</button>
  </div>
  <main>
    <header class="report-header">
      <div class="title-block">
        <p class="eyebrow">AiM Package Report</p>
        <h1>${escapeHtml(packageId)}</h1>
      </div>
      <div class="report-meta">
        <div class="meta-item">
          <span>Deficiencies</span>
          <strong>${reportData.length}</strong>
        </div>
        <div class="meta-item">
          <span>Report Generated</span>
          <strong>${escapeHtml(generatedAt)}</strong>
        </div>
      </div>
    </header>
    ${reportData.map((item, index) => `
      <section class="deficiency">
        ${renderFeatureDetails(item.feature, index, reportData.length)}
        ${renderAttachments(item)}
      </section>
    `).join('')}
  </main>
  <script>
    function setReportView(view) {
      document.body.classList.toggle('spacious', view === 'spacious');
      document.querySelectorAll('[data-report-view]').forEach(function (button) {
        var isActive = button.getAttribute('data-report-view') === view;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-pressed', String(isActive));
      });
    }
  </script>
</body>
</html>`)
  doc.close()
}

export const generatePackageReport = async ({
  reportWindow,
  packageId,
  layerUrl,
  features
}: GeneratePackageReportOptions) => {
  renderLoading(reportWindow, packageId, 0, features.length)

  const [FeatureLayer, esriRequest] = await loadArcGISJSAPIModules([
    'esri/layers/FeatureLayer',
    'esri/request'
  ])
  const layer = new FeatureLayer({ url: layerUrl })
  await layer.load()

  if (!layer.capabilities?.data?.supportsAttachment) {
    throw new Error('The selected feature layer does not support attachments.')
  }

  const objectIds = features.map((feature) => Number(feature.objectId))
  const attachmentsByObjectId = await layer.queryAttachments({ objectIds })
  const blobUrls: string[] = []

  const reportData = await mapWithConcurrency(
    features,
    1,
    async (feature, index): Promise<FeatureReportData> => {
      renderLoading(reportWindow, packageId, index + 1, features.length)
      const attachmentInfos = (attachmentsByObjectId?.[String(feature.objectId)] || [])
        .filter((attachment: any) => attachment.contentType?.toLowerCase().startsWith('image/'))
      const selectedInfos = attachmentInfos.slice(0, ATTACHMENT_LIMIT_PER_FEATURE)
      const attachments = await mapWithConcurrency(
        selectedInfos,
        ATTACHMENT_DOWNLOAD_CONCURRENCY,
        async (attachment: any): Promise<ReportAttachment> => {
          const attachmentUrl = attachment.url ||
            `${layerUrl.replace(/\/+$/, '')}/${feature.objectId}/attachments/${attachment.id}`
          try {
            const response = await esriRequest(attachmentUrl, { responseType: 'blob' })
            const blob = response.data instanceof Blob
              ? response.data
              : new Blob([response.data], { type: attachment.contentType })
            const blobUrl = URL.createObjectURL(blob)
            blobUrls.push(blobUrl)
            return { name: attachment.name || `Attachment ${attachment.id}`, blobUrl }
          } catch (error) {
            return {
              name: attachment.name || `Attachment ${attachment.id}`,
              error: error instanceof Error ? error.message : 'Unable to load attachment.'
            }
          }
        }
      )

      return {
        feature,
        attachmentCount: attachmentInfos.length,
        attachments
      }
    }
  )

  renderReport(reportWindow, packageId, reportData)
  reportWindow.addEventListener('beforeunload', () => {
    blobUrls.forEach((blobUrl) => {
      URL.revokeObjectURL(blobUrl)
    })
  }, { once: true })
}
