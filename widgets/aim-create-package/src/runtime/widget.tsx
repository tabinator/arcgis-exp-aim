import { React, type AllWidgetProps } from 'jimu-core'
import { Alert, Button, Card, CardBody, CardHeader, Checkbox } from 'jimu-ui'
import defaultMessages from './translations/default'
import { type IMConfig } from '../config'

interface QueryFeature { attributes?: Record<string, any> }
interface QueryResponse { features?: QueryFeature[], exceededTransferLimit?: boolean, error?: { message?: string } }

const QUERY_PAGE_SIZE = 2000

const Widget = (props: AllWidgetProps<IMConfig>) => {
  const h = React.createElement
  const m = defaultMessages
  const packageField = props.config?.packageField?.trim() || 'PCKGID'
  const folderBaseUrl = props.config?.folderBaseUrl?.trim()

  const [isOpen, setIsOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null)
  const [status, setStatus] = React.useState<string | null>(null)
  const [groups, setGroups] = React.useState<Array<{ layerUrl: string, layerName: string, packages: string[] }>>([])
  const [activeLayerUrl, setActiveLayerUrl] = React.useState<string | null>(null)

  const targetLayers = [
    { name: props.config?.targetLayerName1?.trim() || '', url: props.config?.targetLayerUrl1?.trim() || '' },
    { name: props.config?.targetLayerName2?.trim() || '', url: props.config?.targetLayerUrl2?.trim() || '' },
    { name: props.config?.targetLayerName3?.trim() || '', url: props.config?.targetLayerUrl3?.trim() || '' },
    { name: props.config?.targetLayerName4?.trim() || '', url: props.config?.targetLayerUrl4?.trim() || '' },
    { name: props.config?.targetLayerName5?.trim() || '', url: props.config?.targetLayerUrl5?.trim() || '' }
  ].filter((layer) => Boolean(layer.url))

  const loadLayerPackages = async (layerUrl: string): Promise<string[]> => {
    const ids = new Set<string>()
    let offset = 0
    let hasMore = true
    while (hasMore) {
      const q = new URL(layerUrl + '/query')
      q.search = new URLSearchParams({
        where: `${packageField} IS NOT NULL AND ${packageField} <> ''`,
        outFields: packageField,
        returnGeometry: 'false',
        f: 'json',
        orderByFields: packageField,
        resultOffset: String(offset),
        resultRecordCount: String(QUERY_PAGE_SIZE)
      }).toString()
      const r = await fetch(q.toString())
      const d = await r.json() as QueryResponse
      if (!r.ok || d.error) throw new Error(d.error?.message || r.statusText)
      const feats = d.features || []
      feats.forEach((f) => {
        const v = f.attributes?.[packageField]
        if (v !== null && v !== undefined && String(v).trim() !== '') ids.add(String(v))
      })
      const fullPage = feats.length === QUERY_PAGE_SIZE
      hasMore = Boolean(d.exceededTransferLimit) || fullPage
      offset += feats.length
      if (feats.length === 0) hasMore = false
    }
    return Array.from(ids).sort((a, b) => a.localeCompare(b))
  }

  const refresh = React.useCallback(async () => {
    if (!targetLayers.length) {
      setGroups([])
      setError(m.noTargetLayers)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await Promise.all(targetLayers.map(async (layer, idx) => ({
        layerUrl: layer.url,
        layerName: layer.name || `${m.layerPrefix} ${idx + 1}`,
        packages: await loadLayerPackages(layer.url)
      })))
      setGroups(data)
      setActiveLayerUrl((current) => current && data.some((g) => g.layerUrl === current) ? current : (data[0]?.layerUrl || null))
    } catch (e) {
      setError(e instanceof Error ? e.message : m.loadError)
      setGroups([])
    } finally {
      setLoading(false)
    }
  }, [m.loadError, m.noTargetLayers, packageField, targetLayers.map((layer) => `${layer.name}|${layer.url}`).join('|')])

  React.useEffect(() => { if (isOpen) void refresh() }, [isOpen, refresh])

  const row = (layerUrl: string, pkg: string) => {
    const key = `${layerUrl}::${pkg}`
    const isSelected = key === selectedKey
    return h('div', { key, className: 'd-flex align-items-center justify-content-between py-1', style: { gap: '0.5rem' } },
      h('div', { className: 'd-flex align-items-center', style: { gap: '0.5rem' } },
        h(Checkbox, { checked: isSelected, onChange: () => setSelectedKey(isSelected ? null : key) }),
        h('span', null, pkg)
      ),
      h(Button, {
        size: 'sm', type: 'default', title: m.openFolder, disabled: !folderBaseUrl,
        onClick: () => folderBaseUrl && window.open(`${folderBaseUrl}/${pkg}`, '_blank', 'noopener,noreferrer'),
        style: { width: 32, minWidth: 32, height: 32, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }
      }, '📁')
    )
  }

  return h(Card, { className: 'h-100 w-100' },
    h(CardHeader, null, m.widgetTitle),
    h(CardBody, { className: 'd-flex flex-column', style: { minHeight: 0 } },
      h('div', { className: 'd-flex flex-column flex-grow-1', style: { gap: '0.75rem', minHeight: 0 } },
        h(Button, { type: 'primary', onClick: () => setIsOpen(!isOpen) }, isOpen ? m.hidePackageList : m.openPackageList),
        isOpen && h('div', { className: 'border rounded p-2 d-flex flex-column flex-grow-1', style: { minHeight: 0 } },
          h('div', { className: 'd-flex align-items-center justify-content-between mb-2', style: { gap: '0.5rem' } },
            h('div', { className: 'font-weight-bold' }, m.widgetTitle),
            h(Button, { size: 'sm', type: 'default', onClick: () => void refresh(), disabled: loading }, m.refreshList)
          ),
          loading && h('div', null, m.loadingPackages),
          error && h(Alert, { form: 'basic', type: 'warning', text: `${m.loadError} ${error}` }),
          h('div', { className: 'flex-grow-1', style: { minHeight: 0, overflowY: 'auto', overflowX: 'hidden' } },
            !loading && !error && groups.length === 0 && h('div', null, m.noPackages),
            ...groups.map((g, idx) => {
              const isActive = g.layerUrl === activeLayerUrl
              return h('div', { key: g.layerUrl, className: 'mb-2 border rounded' },
                h('button', {
                  type: 'button',
                  className: 'w-100 text-left p-2 border-0 bg-transparent',
                  onClick: () => setActiveLayerUrl(isActive ? null : g.layerUrl),
                  style: { cursor: 'pointer' }
                },
                h('div', { className: 'd-flex align-items-center justify-content-between' },
                  h('div', { className: 'font-weight-bold', style: { fontSize: 12 } }, g.layerName),
                  h('div', { style: { fontSize: 11, opacity: 0.75 } }, String(g.packages.length))
                )
                ),
                isActive
                  ? h('div', { className: 'px-2 pb-2' },
                    g.packages.length === 0 ? h('div', { className: 'mt-1' }, m.noPackages) : null,
                    ...g.packages.map((p) => row(g.layerUrl, p))
                  )
                  : null
              )
            })
          ),
          h('div', { className: 'mt-2', style: { fontSize: 12 } }, `${m.selectedPrefix} ${selectedKey || m.noneSelected} (${m.packageFieldPrefix}: ${packageField})`),
          h('div', { className: 'd-flex mt-2', style: { gap: '0.5rem' } },
            h(Button, { type: 'primary', onClick: () => setStatus(m.createPending) }, m.createPackage),
            h(Button, { type: 'default', onClick: () => setStatus(selectedKey ? m.deletePending : m.deleteNeedsSelection) }, m.deletePackage)
          )
        ),
        status && h(Alert, { form: 'basic', type: 'info', text: status })
      )
    )
  )
}

export default Widget
