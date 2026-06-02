import { React } from 'jimu-core'
import type { AllWidgetProps } from 'jimu-core'
import { JimuMapViewComponent, loadArcGISJSAPIModules } from 'jimu-arcgis'
import { Alert, Button, Card, CardBody, CardHeader, Checkbox } from 'jimu-ui'
import defaultMessages from './translations/default'
import type { IMConfig } from '../config'

interface QueryFeature { attributes?: { [key: string]: any }, geometry?: any }
interface QueryResponse {
  features?: QueryFeature[]
  exceededTransferLimit?: boolean
  error?: { message?: string }
  geometryType?: string
  spatialReference?: any
}

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
  const [jimuMapView, setJimuMapView] = React.useState<any>(null)
  const highlightLayerRef = React.useRef<any>(null)
  const highlightMapRef = React.useRef<any>(null)

  const targetLayers = React.useMemo(() => [
    { name: props.config?.targetLayerName1?.trim() || '', url: props.config?.targetLayerUrl1?.trim() || '' },
    { name: props.config?.targetLayerName2?.trim() || '', url: props.config?.targetLayerUrl2?.trim() || '' },
    { name: props.config?.targetLayerName3?.trim() || '', url: props.config?.targetLayerUrl3?.trim() || '' },
    { name: props.config?.targetLayerName4?.trim() || '', url: props.config?.targetLayerUrl4?.trim() || '' },
    { name: props.config?.targetLayerName5?.trim() || '', url: props.config?.targetLayerUrl5?.trim() || '' }
  ].filter((layer) => Boolean(layer.url)), [
    props.config?.targetLayerName1,
    props.config?.targetLayerName2,
    props.config?.targetLayerName3,
    props.config?.targetLayerName4,
    props.config?.targetLayerName5,
    props.config?.targetLayerUrl1,
    props.config?.targetLayerUrl2,
    props.config?.targetLayerUrl3,
    props.config?.targetLayerUrl4,
    props.config?.targetLayerUrl5
  ])

  const loadLayerPackages = React.useCallback(async (layerUrl: string): Promise<string[]> => {
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
  }, [packageField])

  const escapeSqlString = (value: string) => value.replace(/'/g, "''")

  const queryPackageFeatures = async (layerUrl: string, pkg: string): Promise<QueryResponse> => {
    const allFeatures: QueryFeature[] = []
    let offset = 0
    let hasMore = true
    let geometryType: string | null = null
    let spatialReference: any = null
    while (hasMore) {
      const params: { [key: string]: string } = {
        where: `${packageField} = '${escapeSqlString(pkg)}'`,
        outFields: '*',
        returnGeometry: 'true',
        f: 'json',
        resultOffset: String(offset),
        resultRecordCount: String(QUERY_PAGE_SIZE)
      }
      const outWkid = jimuMapView?.view?.spatialReference?.wkid
      if (outWkid) params.outSR = String(outWkid)

      const q = new URL(layerUrl + '/query')
      q.search = new URLSearchParams(params).toString()
      const r = await fetch(q.toString())
      const d = await r.json() as QueryResponse
      if (!r.ok || d.error) throw new Error(d.error?.message || r.statusText)
      if (d.geometryType) geometryType = d.geometryType
      if (d.spatialReference) spatialReference = d.spatialReference
      const feats = d.features || []
      allFeatures.push(...feats)
      const fullPage = feats.length === QUERY_PAGE_SIZE
      hasMore = Boolean(d.exceededTransferLimit) || fullPage
      offset += feats.length
      if (feats.length === 0) hasMore = false
    }
    return { features: allFeatures, geometryType: geometryType || undefined, spatialReference }
  }

  const ensureHighlightLayer = async () => {
    if (!jimuMapView?.view?.map) throw new Error(m.mapNotConfigured)
    if (highlightLayerRef.current && highlightMapRef.current !== jimuMapView.view.map) {
      highlightMapRef.current?.remove?.(highlightLayerRef.current)
      highlightLayerRef.current = null
      highlightMapRef.current = null
    }
    if (!highlightLayerRef.current) {
      const [GraphicsLayer] = await loadArcGISJSAPIModules(['esri/layers/GraphicsLayer'])
      highlightLayerRef.current = new GraphicsLayer({
        id: `${props.id}-package-highlight`,
        title: 'AiM package selection',
        listMode: 'hide'
      })
      jimuMapView.view.map.add(highlightLayerRef.current)
      highlightMapRef.current = jimuMapView.view.map
    }
    return highlightLayerRef.current
  }

  const getGeometryJson = (geometry: any, geometryType?: string, spatialReference?: any) => {
    const geometryJson = { ...geometry }
    if (geometryType && !geometryJson.type) {
      geometryJson.type = geometryType.replace('esriGeometry', '').toLowerCase()
    }
    if (spatialReference && !geometryJson.spatialReference) {
      geometryJson.spatialReference = spatialReference
    }
    return geometryJson
  }

  const getHighlightSymbol = (geometry: any) => {
    const type = geometry?.type
    if (type === 'point' || type === 'multipoint') {
      return {
        type: 'simple-marker',
        style: 'circle',
        color: [0, 171, 190, 0.85],
        size: 12,
        outline: { color: [255, 255, 255, 1], width: 2 }
      }
    }
    if (type === 'polyline') {
      return {
        type: 'simple-line',
        color: [0, 171, 190, 1],
        width: 4
      }
    }
    return {
      type: 'simple-fill',
      color: [0, 171, 190, 0.18],
      outline: { color: [0, 171, 190, 1], width: 2 }
    }
  }

  const clearHighlightedFeatures = () => {
    highlightLayerRef.current?.removeAll?.()
  }

  const zoomToGraphics = async (graphics: any[]) => {
    const view = jimuMapView?.view
    if (!view || graphics.length === 0) return false

    const geometries = graphics
      .map((graphic) => graphic.geometry)
      .filter((geometry) => Boolean(geometry))
    const extents = geometries
      .map((geometry) => geometry.extent || geometry)
      .filter((target) => Boolean(target))
    const singleGeometryType = geometries.length === 1 ? geometries[0]?.type : null
    const isSinglePointTarget = singleGeometryType === 'point' || singleGeometryType === 'multipoint'
    const target = isSinglePointTarget
      ? { target: geometries[0], scale: Math.min(view.scale || 5000, 5000) }
      : extents

    await view.goTo(target, {
      duration: 700,
      padding: { top: 60, right: 60, bottom: 60, left: 60 }
    })

    return true
  }

  React.useEffect(() => () => {
    highlightLayerRef.current?.removeAll?.()
    highlightMapRef.current?.remove?.(highlightLayerRef.current)
  }, [])

  const selectPackage = async (layerUrl: string, pkg: string) => {
    const key = `${layerUrl}::${pkg}`
    if (key === selectedKey) {
      setSelectedKey(null)
      clearHighlightedFeatures()
      setStatus(m.mapSelectionCleared)
      return
    }
    setSelectedKey(key)
    setStatus(m.loadingPackageFeatures)
    try {
      const layer = await ensureHighlightLayer()
      const [Graphic, geometryJsonUtils] = await loadArcGISJSAPIModules([
        'esri/Graphic',
        'esri/geometry/support/jsonUtils'
      ])
      const result = await queryPackageFeatures(layerUrl, pkg)
      layer.removeAll()
      const features = result.features || []
      const graphics: any[] = []
      features.forEach((feature) => {
        if (!feature.geometry) return
        const geometry = geometryJsonUtils.fromJSON(getGeometryJson(
          feature.geometry,
          result.geometryType,
          result.spatialReference
        ))
        const graphic = new Graphic({
          geometry,
          attributes: feature.attributes || {},
          symbol: getHighlightSymbol(geometry)
        })
        graphics.push(graphic)
        layer.add(graphic)
      })
      if (graphics.length === 0) {
        setStatus(m.noPackageFeatures)
        return
      }

      try {
        await zoomToGraphics(graphics)
        setStatus(`${m.mapSelectionAppliedAndZoomed} ${graphics.length}`)
      } catch {
        setStatus(`${m.mapSelectionApplied} ${graphics.length}. ${m.mapZoomError}`)
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : m.mapSelectionError)
    }
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
  }, [loadLayerPackages, m.layerPrefix, m.loadError, m.noTargetLayers, targetLayers])

  React.useEffect(() => {
    if (isOpen) {
      refresh().catch(() => undefined)
    }
  }, [isOpen, refresh])

  const row = (layerUrl: string, pkg: string) => {
    const key = `${layerUrl}::${pkg}`
    const isSelected = key === selectedKey
    return h('div', { key, className: 'd-flex align-items-center justify-content-between py-1', style: { gap: '0.5rem' } },
      h('div', { className: 'd-flex align-items-center', style: { gap: '0.5rem' } },
        h(Checkbox, {
          checked: isSelected,
          onChange: () => {
            selectPackage(layerUrl, pkg).catch(() => undefined)
          }
        }),
        h('span', null, pkg)
      ),
      h(Button, {
        size: 'sm', type: 'default', title: m.openFolder, disabled: !folderBaseUrl,
        onClick: () => {
          if (folderBaseUrl) {
            window.open(`${folderBaseUrl}/${pkg}`, '_blank', 'noopener,noreferrer')
          }
        },
        style: { width: 32, minWidth: 32, height: 32, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }
      }, '📁')
    )
  }

  return h(React.Fragment, null,
    props.useMapWidgetIds?.[0] && h(JimuMapViewComponent, {
      useMapWidgetId: props.useMapWidgetIds[0],
      onActiveViewChange: setJimuMapView
    }),
    h(Card, { className: 'h-100 w-100' },
      h(CardHeader, null, m.widgetTitle),
      h(CardBody, { className: 'd-flex flex-column', style: { minHeight: 0 } },
        h('div', { className: 'd-flex flex-column flex-grow-1', style: { gap: '0.75rem', minHeight: 0 } },
          h(Button, {
            type: 'primary',
            onClick: () => {
              setIsOpen(!isOpen)
            }
          }, isOpen ? m.hidePackageList : m.openPackageList),
          isOpen && h('div', { className: 'border rounded p-2 d-flex flex-column flex-grow-1', style: { minHeight: 0 } },
            h('div', { className: 'd-flex align-items-center justify-content-between mb-2', style: { gap: '0.5rem' } },
              h('div', { className: 'font-weight-bold' }, m.widgetTitle),
              h(Button, {
                size: 'sm',
                type: 'default',
                onClick: () => {
                  refresh().catch(() => undefined)
                },
                disabled: loading
              }, m.refreshList)
            ),
            loading && h('div', null, m.loadingPackages),
            error && h(Alert, { form: 'basic', type: 'warning', text: `${m.loadError} ${error}` }),
            h('div', { className: 'flex-grow-1', style: { minHeight: 0, overflowY: 'auto', overflowX: 'hidden' } },
              !loading && !error && groups.length === 0 && h('div', null, m.noPackages),
              ...groups.map((g) => {
                const isActive = g.layerUrl === activeLayerUrl
                return h('div', { key: g.layerUrl, className: 'mb-2 border rounded' },
                  h('button', {
                    type: 'button',
                    className: 'w-100 text-left p-2 border-0 bg-transparent',
                    onClick: () => {
                      setActiveLayerUrl(isActive ? null : g.layerUrl)
                    },
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
              h(Button, {
                type: 'primary',
                onClick: () => {
                  setStatus(m.createPending)
                }
              }, m.createPackage),
              h(Button, {
                type: 'default',
                onClick: () => {
                  setStatus(selectedKey ? m.deletePending : m.deleteNeedsSelection)
                }
              }, m.deletePackage)
            )
          ),
          status && h(Alert, { form: 'basic', type: 'info', text: status })
        )
      )
    )
  )
}

export default Widget
