import { DataSourceManager, React, ReactRedux } from 'jimu-core'
import type { AllWidgetProps, IMState } from 'jimu-core'
import { JimuMapViewComponent, loadArcGISJSAPIModules } from 'jimu-arcgis'
import { Alert, Button, Card, CardBody, CardHeader, Checkbox, TextInput } from 'jimu-ui'
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

interface TargetLayer { name: string, url: string }
interface SelectionSource {
  dataSourceId: string
  layerName: string
  layerUrl: string
}
interface PackageCartItem {
  key: string
  dataSourceId: string
  layerName: string
  layerUrl: string
  layerKey: string
  objectId: string | number
  attributes: { [key: string]: any }
  record?: any
}

const normalizeUrl = (url?: string) => {
  const rawUrl = (url || '').trim()
  if (!rawUrl) return ''
  try {
    const parsed = new URL(rawUrl)
    return `${parsed.origin}${parsed.pathname}`.replace(/\/query$/i, '').replace(/\/+$/, '').toLowerCase()
  } catch {
    return rawUrl.split('?')[0].split('#')[0].replace(/\/query$/i, '').replace(/\/+$/, '').toLowerCase()
  }
}

const getServiceLayerKey = (url?: string) => {
  const normalized = normalizeUrl(url)
  const match = normalized.match(/\/rest\/services\/(.+)\/(featureserver|mapserver)\/(\d+)$/i)
  return match ? `${match[1]}/${match[2]}/${match[3]}`.toLowerCase() : normalized
}

const getRecordLabel = (attributes: { [key: string]: any }, objectId: string | number) => {
  const labelFields = ['ASSET_ID', 'ASSETID', 'asset_id', 'assetid', 'NAME', 'Name', 'name', 'FACILITYID', 'facilityid']
  const label = labelFields
    .map((field) => attributes?.[field])
    .find((value) => value !== null && value !== undefined && String(value).trim() !== '')
  return label === undefined ? String(objectId) : String(label)
}

const getLayerDataSourceMatches = (state: IMState, targetLayers: TargetLayer[]): SelectionSource[] => {
  const appConfig: any = (state as any).appConfig || (state as any).appStateInBuilder?.appConfig
  const dataSources: { [id: string]: any } = appConfig?.dataSources || {}
  const configuredLayers = targetLayers.map((layer) => ({
    ...layer,
    normalizedUrl: normalizeUrl(layer.url)
  }))
  const matches: SelectionSource[] = []

  const visit = (dsJson: any) => {
    if (!dsJson?.id) return
    const dsUrl = normalizeUrl(dsJson.url)
    const dsLayerUrl = dsJson.url && dsJson.layerId !== undefined
      ? normalizeUrl(`${dsJson.url}/${dsJson.layerId}`)
      : dsUrl
    const match = configuredLayers.find((layer) =>
      layer.normalizedUrl === dsUrl || layer.normalizedUrl === dsLayerUrl
    )
    if (match) {
      matches.push({
        dataSourceId: dsJson.id,
        layerName: match.name,
        layerUrl: match.url
      })
    }
    Object.keys(dsJson.childDataSourceJsons || {}).forEach((childId) => {
      visit(dsJson.childDataSourceJsons[childId])
    })
  }

  Object.keys(dataSources).forEach((id) => {
    visit(dataSources[id])
  })

  return matches
}

const urlCandidatesMatch = (targetUrl: string, candidates: string[]) => {
  const normalizedTarget = normalizeUrl(targetUrl)
  const targetServiceKey = getServiceLayerKey(targetUrl)
  return candidates.some((candidate) => {
    const normalizedCandidate = normalizeUrl(candidate)
    const candidateServiceKey = getServiceLayerKey(candidate)
    return normalizedCandidate === normalizedTarget || candidateServiceKey === targetServiceKey
  })
}

const getGraphicObjectId = (graphic: any) => {
  const layer = graphic?.layer || graphic?.sourceLayer
  const objectIdField = layer?.objectIdField || 'OBJECTID'
  return graphic?.attributes?.[objectIdField] ?? graphic?.attributes?.OBJECTID ?? graphic?.attributes?.ObjectID ?? graphic?.attributes?.objectid
}

const getUniqueLayerKeys = (items: PackageCartItem[]) => Array.from(new Set(items.map((item) => item.layerKey)))

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
  const [isCreateMode, setIsCreateMode] = React.useState(false)
  const [draftPackageId, setDraftPackageId] = React.useState('')
  const [autoAddSelection, setAutoAddSelection] = React.useState(false)
  const [cartItems, setCartItems] = React.useState<PackageCartItem[]>([])
  const [submittingPackage, setSubmittingPackage] = React.useState(false)
  const [mapSelectionSources, setMapSelectionSources] = React.useState<SelectionSource[]>([])
  const [selectedMapFeatures, setSelectedMapFeatures] = React.useState<any[]>([])
  const highlightLayerRef = React.useRef<any>(null)
  const highlightMapRef = React.useRef<any>(null)

  const targetLayers: TargetLayer[] = React.useMemo(() => [
    { name: props.config?.targetLayerName1?.trim() || '', url: props.config?.targetLayerUrl1?.trim() || '' },
    { name: props.config?.targetLayerName2?.trim() || '', url: props.config?.targetLayerUrl2?.trim() || '' },
    { name: props.config?.targetLayerName3?.trim() || '', url: props.config?.targetLayerUrl3?.trim() || '' },
    { name: props.config?.targetLayerName4?.trim() || '', url: props.config?.targetLayerUrl4?.trim() || '' },
    { name: props.config?.targetLayerName5?.trim() || '', url: props.config?.targetLayerUrl5?.trim() || '' }
  ].filter((layer) => Boolean(layer.url)).map((layer, idx) => ({
    name: layer.name || `${m.layerPrefix} ${idx + 1}`,
    url: layer.url
  })), [
    m.layerPrefix,
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

  React.useEffect(() => {
    let cancelled = false

    const resolveMapSelectionSources = async () => {
      if (!jimuMapView || targetLayers.length === 0) {
        setMapSelectionSources([])
        return
      }

      try {
        await jimuMapView.whenAllJimuLayerViewLoaded?.()
        const layerViews = jimuMapView.getAllLoadedJimuLayerViews?.() || []
        const sources: SelectionSource[] = []

        for (const layerView of layerViews) {
          const layer = layerView.layer || {}
          let layerDataSource = layerView.getLayerDataSource?.()
          if (!layerDataSource && layerView.createLayerDataSource) {
            try {
              layerDataSource = await layerView.createLayerDataSource()
            } catch {
              layerDataSource = null
            }
          }
          const layerId = layerDataSource?.layerId ?? layer.layerId
          const candidates = [
            layer.url,
            layer.parsedUrl?.path,
            layer.sourceJSON?.url,
            layerDataSource?.url,
            layerDataSource?.getDataSourceJson?.()?.url
          ].filter(Boolean).map(String)

          if (layerId !== undefined) {
            candidates.push(...candidates.map((url) => `${url.replace(/\/+$/, '')}/${layerId}`))
          }

          const targetLayer = targetLayers.find((target) => urlCandidatesMatch(target.url, candidates))
          const dataSourceId = layerDataSource?.id || layerView.layerDataSourceId
          if (targetLayer && dataSourceId && !sources.some((source) => source.dataSourceId === dataSourceId)) {
            sources.push({
              dataSourceId,
              layerName: targetLayer.name,
              layerUrl: targetLayer.url
            })
          }
        }

        if (!cancelled) setMapSelectionSources(sources)
      } catch {
        if (!cancelled) setMapSelectionSources([])
      }
    }

    resolveMapSelectionSources().catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [jimuMapView, targetLayers])

  React.useEffect(() => {
    let cancelled = false

    const updateSelectedMapFeatures = async () => {
      if (!jimuMapView?.getSelectedFeatures) {
        setSelectedMapFeatures([])
        return
      }
      try {
        const features = await jimuMapView.getSelectedFeatures()
        if (!cancelled) setSelectedMapFeatures(features || [])
      } catch {
        if (!cancelled) setSelectedMapFeatures([])
      }
    }

    updateSelectedMapFeatures().catch(() => undefined)
    jimuMapView?.addJimuLayerViewSelectedFeaturesChangeListener?.(updateSelectedMapFeatures)

    return () => {
      cancelled = true
      jimuMapView?.removeJimuLayerViewSelectedFeaturesChangeListener?.(updateSelectedMapFeatures)
    }
  }, [jimuMapView])

  const configuredSelectionSources = ReactRedux.useSelector((state: IMState) => getLayerDataSourceMatches(state, targetLayers))
  const selectionSources = React.useMemo(() => {
    const sources: SelectionSource[] = []
    const mergedSources = [...mapSelectionSources, ...configuredSelectionSources]
    mergedSources.forEach((source) => {
      if (!sources.some((existing) => existing.dataSourceId === source.dataSourceId)) {
        sources.push(source)
      }
    })
    return sources
  }, [configuredSelectionSources, mapSelectionSources])

  const selectionInfos = ReactRedux.useSelector((state: IMState) =>
    selectionSources.map((source) => ({
      ...source,
      selectedIds: Array.from(((state as any).dataSourcesInfo?.[source.dataSourceId]?.selectedIds || []) as Array<string | number>)
    }))
  )
  const currentSelectionItems = React.useMemo<PackageCartItem[]>(() => {
    const dsManager = DataSourceManager.getInstance()
    const dataSourceItems = selectionInfos.flatMap((info) => {
      const ds: any = dsManager.getDataSource(info.dataSourceId)
      const records = ds?.getSelectedRecords?.() || []
      return records.map((record: any) => {
        const objectId = record.getId()
        const layerKey = getServiceLayerKey(info.layerUrl)
        return {
          key: `${layerKey}::${objectId}`,
          dataSourceId: info.dataSourceId,
          layerName: info.layerName,
          layerUrl: info.layerUrl,
          layerKey,
          objectId,
          attributes: record.getData?.() || {},
          record: record.clone?.(true) || record
        }
      })
    })
    const knownKeys = new Set(dataSourceItems.map((item) => item.key))
    const mapFeatureItems = selectedMapFeatures.flatMap((feature) => {
      const layer = feature?.layer || feature?.sourceLayer || {}
      const layerId = layer.layerId ?? layer.sourceJSON?.id
      const candidates = [
        layer.url,
        layer.parsedUrl?.path,
        layer.sourceJSON?.url
      ].filter(Boolean).map(String)

      if (layerId !== undefined) {
        candidates.push(...candidates.map((url) => `${url.replace(/\/+$/, '')}/${layerId}`))
      }

      const source = selectionSources.find((selectionSource) => urlCandidatesMatch(selectionSource.layerUrl, candidates))
      if (!source) return []

      const objectId = getGraphicObjectId(feature)
      if (objectId === null || objectId === undefined) return []

      const layerKey = getServiceLayerKey(source.layerUrl)
      const key = `${layerKey}::${objectId}`
      if (knownKeys.has(key)) return []

      const ds: any = dsManager.getDataSource(source.dataSourceId)
      const record = ds?.buildRecord?.(feature)
      return [{
        key,
        dataSourceId: source.dataSourceId,
        layerName: source.layerName,
        layerUrl: source.layerUrl,
        layerKey,
        objectId,
        attributes: feature.attributes || {},
        record: record?.clone?.(true) || record
      }]
    })

    return [...dataSourceItems, ...mapFeatureItems]
  }, [selectedMapFeatures, selectionInfos, selectionSources])

  const currentSelectionCount = Math.max(
    selectionInfos.reduce((total, info) => total + info.selectedIds.length, 0),
    selectedMapFeatures.length
  )
  const cartKeys = React.useMemo(() => new Set(cartItems.map((item) => item.key)), [cartItems])
  const cartLayerKey = cartItems[0]?.layerKey || null
  const cartLayerName = cartItems[0]?.layerName || null
  const currentSelectionLayerKeys = React.useMemo(() => getUniqueLayerKeys(currentSelectionItems), [currentSelectionItems])

  const addItemsToCart = React.useCallback((items: PackageCartItem[]) => {
    if (items.length === 0) {
      setStatus(m.noCurrentSelection)
      return
    }
    const layerKeys = getUniqueLayerKeys(items)
    if (!cartItems.length && layerKeys.length > 1) {
      setStatus(m.selectionMustBeSingleLayer)
      return
    }
    const lockedLayerKey = cartItems[0]?.layerKey || layerKeys[0]
    const lockedLayerName = cartItems[0]?.layerName || items.find((item) => item.layerKey === lockedLayerKey)?.layerName || m.targetLayer
    const incompatibleItems = items.filter((item) => item.layerKey !== lockedLayerKey)
    if (incompatibleItems.length > 0) {
      setStatus(`${m.selectionLayerMismatch} ${lockedLayerName}`)
      return
    }
    setCartItems((current) => {
      const known = new Set(current.map((item) => item.key))
      const additions = items.filter((item) => !known.has(item.key))
      if (additions.length === 0) {
        setStatus(m.selectionAlreadyInCart)
        return current
      }
      setStatus(`${m.addedSelectionToCart} ${additions.length}`)
      return [...current, ...additions]
    })
  }, [cartItems, m.addedSelectionToCart, m.noCurrentSelection, m.selectionAlreadyInCart, m.selectionLayerMismatch, m.selectionMustBeSingleLayer, m.targetLayer])

  React.useEffect(() => {
    if (isCreateMode && autoAddSelection) {
      const candidateItems = cartLayerKey
        ? currentSelectionItems.filter((item) => item.layerKey === cartLayerKey)
        : currentSelectionLayerKeys.length === 1 ? currentSelectionItems : []
      const newSelectionItems = candidateItems.filter((item) => !cartKeys.has(item.key))
      if (newSelectionItems.length > 0) {
        addItemsToCart(newSelectionItems)
      }
    }
  }, [addItemsToCart, autoAddSelection, cartKeys, cartLayerKey, currentSelectionItems, currentSelectionLayerKeys.length, isCreateMode])

  const removeCartItem = (key: string) => {
    setCartItems((current) => current.filter((item) => item.key !== key))
  }

  const clearCreateDraft = () => {
    setDraftPackageId('')
    setAutoAddSelection(false)
    setCartItems([])
  }

  const cancelCreateMode = () => {
    clearCreateDraft()
    setIsCreateMode(false)
    setStatus(m.createModeCancelled)
  }

  const startCreateMode = () => {
    clearHighlightedFeatures()
    setSelectedKey(null)
    setIsCreateMode(true)
    setIsOpen(false)
    setStatus(m.createModeStarted)
  }

  const getValidationWarnings = () => {
    const warnings: string[] = []
    if (draftPackageId.trim() === '') warnings.push(m.packageIdRequired)
    if (cartItems.length === 0) warnings.push(m.cartRequiresItems)
    if (getUniqueLayerKeys(cartItems).length > 1) warnings.push(m.cartMustBeSingleLayer)
    const alreadyPackagedCount = cartItems.filter((item) => {
      const value = item.attributes?.[packageField]
      return value !== null && value !== undefined && String(value).trim() !== ''
    }).length
    if (alreadyPackagedCount > 0) warnings.push(`${alreadyPackagedCount} ${m.assetsAlreadyPackaged}`)
    return warnings
  }

  const groupItemsByLayer = (items: PackageCartItem[]) => {
    const layerGroups: Array<{ layerName: string, items: PackageCartItem[] }> = []
    items.forEach((item) => {
      let group = layerGroups.find((g) => g.layerName === item.layerName)
      if (!group) {
        group = { layerName: item.layerName, items: [] }
        layerGroups.push(group)
      }
      group.items.push(item)
    })
    return layerGroups
  }

  const submitCreatePackage = async () => {
    const validationWarnings = getValidationWarnings()
    if (validationWarnings.length > 0) {
      setStatus(`${m.validationPrefix} ${validationWarnings.join(' ')}`)
      return
    }

    const packageId = draftPackageId.trim()
    setSubmittingPackage(true)
    setStatus(m.creatingPackage)
    try {
      const dsManager = DataSourceManager.getInstance()
      const groupsByDataSource = cartItems.reduce((acc, item) => {
        const items = acc.get(item.dataSourceId) || []
        items.push(item)
        acc.set(item.dataSourceId, items)
        return acc
      }, new Map<string, PackageCartItem[]>())

      for (const [dataSourceId, items] of groupsByDataSource.entries()) {
        const ds: any = dsManager.getDataSource(dataSourceId)
        if (!ds?.updateRecords) throw new Error(`${m.dataSourceNotEditable} ${dataSourceId}`)
        const records = items.map((item) => {
          const record = item.record?.clone?.(true) || item.record
          if (!record?.setData) throw new Error(`${m.recordNotEditable} ${item.objectId}`)
          record.setData({
            ...(record.getData?.() || item.attributes),
            [packageField]: packageId
          })
          return record
        })
        const updated = await ds.updateRecords(records)
        if (!updated) throw new Error(`${m.packageCreateFailedForLayer} ${items[0]?.layerName || dataSourceId}`)
      }

      const createdCount = cartItems.length
      clearCreateDraft()
      setIsCreateMode(false)
      setIsOpen(true)
      setStatus(`${m.packageCreated} ${packageId} (${createdCount})`)
      refresh().catch(() => undefined)
    } catch (e) {
      setStatus(e instanceof Error ? e.message : m.packageCreateFailed)
    } finally {
      setSubmittingPackage(false)
    }
  }

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

  const itemRow = (item: PackageCartItem, removable: boolean) =>
    h('div', { key: item.key, className: 'd-flex align-items-center justify-content-between py-1', style: { gap: '0.5rem' } },
      h('div', { style: { minWidth: 0 } },
        h('div', { style: { fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, getRecordLabel(item.attributes, item.objectId)),
        h('div', { style: { fontSize: 10, opacity: 0.7 } }, `${m.objectIdPrefix} ${item.objectId}`)
      ),
      removable
        ? h(Button, {
          size: 'sm',
          type: 'tertiary',
          title: m.removeFromCart,
          onClick: () => {
            removeCartItem(item.key)
          },
          style: { width: 28, minWidth: 28, height: 28, padding: 0 }
        }, 'x')
        : null
    )

  const groupedItemsPanel = (items: PackageCartItem[], emptyMessage: string, removable: boolean) => {
    const itemGroups = groupItemsByLayer(items)
    if (itemGroups.length === 0) return h('div', { style: { fontSize: 12, opacity: 0.75 } }, emptyMessage)
    return h(React.Fragment, null,
      ...itemGroups.map((group) =>
        h('div', { key: group.layerName, className: 'mb-2' },
          h('div', { className: 'font-weight-bold mb-1', style: { fontSize: 12 } }, `${group.layerName} (${group.items.length})`),
          ...group.items.map((item) => itemRow(item, removable))
        )
      )
    )
  }

  const createModeView = () => {
    const validationWarnings = getValidationWarnings()
    const canCreate = validationWarnings.length === 0

    return h('div', { className: 'd-flex flex-column flex-grow-1', style: { gap: '0.75rem', minHeight: 0 } },
      h('div', { className: 'd-flex align-items-center justify-content-between', style: { gap: '0.5rem' } },
        h('div', { className: 'font-weight-bold' }, m.creatingNewPackage),
        h(Button, {
          size: 'sm',
          type: 'tertiary',
          onClick: cancelCreateMode
        }, m.cancel)
      ),
      h('div', null,
        h('div', { className: 'mb-1', style: { fontSize: 12, fontWeight: 600 } }, m.packageIdLabel),
        h(TextInput, {
          value: draftPackageId,
          placeholder: m.packageIdPlaceholder,
          onChange: (evt) => {
            setDraftPackageId(evt.target.value)
          }
        })
      ),
      h('label', { className: 'd-flex align-items-center', style: { gap: '0.5rem', fontSize: 12 } },
        h(Checkbox, {
          checked: autoAddSelection,
          onChange: (_evt, checked) => {
            setAutoAddSelection(Boolean(checked))
          }
        }),
        h('span', null, m.autoAddSelection)
      ),
      h('div', { className: 'border rounded p-2' },
        h('div', { className: 'd-flex align-items-center justify-content-between mb-2', style: { gap: '0.5rem' } },
          h('div', { className: 'font-weight-bold', style: { fontSize: 12 } }, m.currentMapSelection),
          h('div', { style: { fontSize: 11, opacity: 0.75 } }, `${currentSelectionCount} ${m.selectedCountSuffix}`)
        ),
        h('div', { className: 'mb-2', style: { fontSize: 10, opacity: 0.72 } },
          `${m.selectionSourcesPrefix} ${selectionSources.length} | ${m.selectedGraphicsPrefix} ${selectedMapFeatures.length}`
        ),
        cartLayerName && h('div', { className: 'mb-2', style: { fontSize: 11, opacity: 0.82 } },
          `${m.packageLayerLocked} ${cartLayerName}`
        ),
        !cartLayerKey && currentSelectionLayerKeys.length > 1 && h(Alert, {
          form: 'basic',
          type: 'warning',
          text: m.selectionMustBeSingleLayer
        }),
        cartLayerKey && currentSelectionItems.some((item) => item.layerKey !== cartLayerKey) && h(Alert, {
          form: 'basic',
          type: 'warning',
          text: `${m.selectionLayerMismatch} ${cartLayerName || m.targetLayer}`
        }),
        groupedItemsPanel(currentSelectionItems, m.noCurrentSelection, false),
        h(Button, {
          className: 'mt-2',
          size: 'sm',
          type: 'primary',
          disabled: currentSelectionItems.length === 0 || (!cartLayerKey && currentSelectionLayerKeys.length > 1) || Boolean(cartLayerKey && currentSelectionItems.some((item) => item.layerKey !== cartLayerKey)),
          onClick: () => {
            addItemsToCart(currentSelectionItems)
          }
        }, m.addSelectionToPackage)
      ),
      h('div', { className: 'border rounded p-2 d-flex flex-column flex-grow-1', style: { minHeight: 0 } },
        h('div', { className: 'd-flex align-items-center justify-content-between mb-2', style: { gap: '0.5rem' } },
          h('div', { className: 'font-weight-bold', style: { fontSize: 12 } }, m.packageCart),
          h('div', { style: { fontSize: 11, opacity: 0.75 } }, `${cartItems.length} ${m.stagedCountSuffix}`)
        ),
        cartLayerName && h('div', { className: 'mb-2', style: { fontSize: 11, opacity: 0.82 } }, `${m.packageLayer} ${cartLayerName}`),
        h('div', { className: 'flex-grow-1', style: { minHeight: 0, overflowY: 'auto', overflowX: 'hidden' } },
          groupedItemsPanel(cartItems, m.cartEmpty, true)
        )
      ),
      validationWarnings.length > 0
        ? h(Alert, { form: 'basic', type: 'warning', text: `${m.validationPrefix} ${validationWarnings.join(' ')}` })
        : h(Alert, { form: 'basic', type: 'success', text: m.validationReady }),
      h('div', { className: 'd-flex', style: { gap: '0.5rem' } },
        h(Button, {
          type: 'default',
          onClick: () => {
            setCartItems([])
            setStatus(m.cartCleared)
          },
          disabled: cartItems.length === 0
        }, m.clearCart),
        h(Button, {
          type: 'primary',
          disabled: !canCreate || submittingPackage,
          onClick: () => {
            submitCreatePackage().catch(() => undefined)
          }
        }, submittingPackage ? m.creatingPackage : m.createPackage)
      )
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
        isCreateMode ? createModeView() : h('div', { className: 'd-flex flex-column flex-grow-1', style: { gap: '0.75rem', minHeight: 0 } },
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
                onClick: startCreateMode
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
