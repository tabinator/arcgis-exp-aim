import { DataSourceManager, React, ReactRedux } from 'jimu-core'
import type { AllWidgetProps, IMState } from 'jimu-core'
import { JimuMapViewComponent, loadArcGISJSAPIModules } from 'jimu-arcgis'
import { Alert, Button, Card, CardBody, CardHeader, Checkbox, Modal, ModalBody, ModalFooter, ModalHeader, Option, Select, TextInput } from 'jimu-ui'
import defaultMessages from './translations/default'
import { submitAimWorkOrder } from './aim-api'
import { generatePackageReport, renderReportError } from './report-service'
import {
  CREATED_DATE_FIELD,
  filterByPropertyName,
  filterByWorkCode,
  formatDateValue,
  getAttributeValue,
  getFeatureObjectId,
  getGeneratedPackageId,
  getGraphicObjectId,
  getLayerDataSourceMatches,
  getPackageKey,
  getPropertyNameKey,
  getPropertyNameKeyFromAttributes,
  getRecordLabel,
  getServiceLayerKey,
  getUniqueLayerKeys,
  getWorkCodeKey,
  getWorkCodeKeyFromAttributes,
  hasEmptyPackageValue,
  hasPackageValue,
  INSPECTOR_FIELD,
  OBJECT_ID_QUERY_CHUNK_SIZE,
  PROPERTY_NAME_FIELD,
  QUERY_PAGE_SIZE,
  urlCandidatesMatch,
  WORK_CODE_FIELD
} from './utils'
import type {
  CartLayerQueryResult,
  PackageCartItem,
  PackageSummary,
  QueryResponse,
  SelectedPackage,
  SelectionSource,
  TargetLayer,
  WorkOrderApiResponse
} from './types'
import { DEFAULT_AIM_SUBMIT_URL } from '../config'
import type { IMConfig } from '../config'

interface LayerFieldInfo {
  name: string
  alias?: string
  type?: string
  domain?: {
    codedValues?: Array<{
      name?: string
      code?: any
    }>
  }
}

const PACKAGE_ID_SEARCH_FIELD = 'PCKGID'
const WORK_ORDER_NUMBER_SEARCH_FIELD = 'WorkOrderNumber'
const REPAIR_COMPLETED_DATE_FIELD = 'RepairCompletedDate'
const AIM_STATUS_FIELD = 'AIMStatus'
const PACKAGE_SEARCH_MINIMUM_LENGTH = 3
const PACKAGE_SEARCH_DEBOUNCE_MS = 450

const Widget = (props: AllWidgetProps<IMConfig>) => {
  const h = React.createElement
  const m = defaultMessages
  const packageField = props.config?.packageField?.trim() || 'PCKGID'
  const folderBaseUrl = props.config?.folderBaseUrl?.trim()
  const aimSubmitUrl = props.config?.aimSubmitUrl?.trim() || DEFAULT_AIM_SUBMIT_URL

  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [selectedPackage, setSelectedPackage] = React.useState<SelectedPackage | null>(null)
  const [isCreateConfirmationOpen, setIsCreateConfirmationOpen] = React.useState(false)
  const [isCreateWorkOrderConfirmationOpen, setIsCreateWorkOrderConfirmationOpen] = React.useState(false)
  const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = React.useState(false)
  const [phasePendingRemoval, setPhasePendingRemoval] = React.useState<PackageCartItem | null>(null)
  const [status, setStatus] = React.useState<string | null>(null)
  const [groups, setGroups] = React.useState<Array<{ layerUrl: string, layerName: string, packages: PackageSummary[] }>>([])
  const [activeLayerUrl, setActiveLayerUrl] = React.useState<string | null>(null)
  const [packageSearchTerm, setPackageSearchTerm] = React.useState('')
  const [searchingPackages, setSearchingPackages] = React.useState(false)
  const [jimuMapView, setJimuMapView] = React.useState<any>(null)
  const [isCreateMode, setIsCreateMode] = React.useState(false)
  const [isModifyMode, setIsModifyMode] = React.useState(false)
  const [isReviewWorkOrderMode, setIsReviewWorkOrderMode] = React.useState(false)
  const [draftPackageId, setDraftPackageId] = React.useState('')
  const [skipPackagedAssets, setSkipPackagedAssets] = React.useState(true)
  const [uniqueWorkCodes, setUniqueWorkCodes] = React.useState(true)
  const [propertyNamesMustMatch, setPropertyNamesMustMatch] = React.useState(true)
  const [cartItems, setCartItems] = React.useState<PackageCartItem[]>([])
  const [packagePhaseItems, setPackagePhaseItems] = React.useState<PackageCartItem[]>([])
  const [selectedPackagePhaseKey, setSelectedPackagePhaseKey] = React.useState<string | null>(null)
  const [modifySelectionItems, setModifySelectionItems] = React.useState<PackageCartItem[]>([])
  const [modifySkipPackagedAssets, setModifySkipPackagedAssets] = React.useState(true)
  const [modifyUniqueWorkCodes, setModifyUniqueWorkCodes] = React.useState(true)
  const [modifyPropertyNamesMustMatch, setModifyPropertyNamesMustMatch] = React.useState(true)
  const [stagedWorkOrderFile, setStagedWorkOrderFile] = React.useState<File | null>(null)
  const [stagedStatusUpdateFile, setStagedStatusUpdateFile] = React.useState<File | null>(null)
  const [workOrderApiResponse, setWorkOrderApiResponse] = React.useState<WorkOrderApiResponse | null>(null)
  const [workOrderStatusOptions, setWorkOrderStatusOptions] = React.useState<Array<{ label: string, value: string }>>([])
  const [selectedWorkOrderStatus, setSelectedWorkOrderStatus] = React.useState('')
  const [defaultWorkOrderStatus, setDefaultWorkOrderStatus] = React.useState('')
  const [selectedWorkOrderPhaseKeys, setSelectedWorkOrderPhaseKeys] = React.useState<string[]>([])
  const [isUpdateStatusConfirmationOpen, setIsUpdateStatusConfirmationOpen] = React.useState(false)
  const [loadingPackagePhases, setLoadingPackagePhases] = React.useState(false)
  const [submittingPackagePhases, setSubmittingPackagePhases] = React.useState(false)
  const [submittingWorkOrder, setSubmittingWorkOrder] = React.useState(false)
  const [generatingReport, setGeneratingReport] = React.useState(false)
  const [cartQueryResults, setCartQueryResults] = React.useState<CartLayerQueryResult[]>([])
  const [pendingSelectionRemovalKeys, setPendingSelectionRemovalKeys] = React.useState<string[]>([])
  const [submittingPackage, setSubmittingPackage] = React.useState(false)
  const [mapSelectionSources, setMapSelectionSources] = React.useState<SelectionSource[]>([])
  const [selectedMapFeatures, setSelectedMapFeatures] = React.useState<any[]>([])
  const packageIdWasEditedRef = React.useRef(false)
  const generatedPackageIdRef = React.useRef('')
  const generatedPackageSourceKeyRef = React.useRef('')
  const packageSearchInitializedRef = React.useRef(false)
  const workOrderFileInputRef = React.useRef<HTMLInputElement>(null)
  const statusUpdateFileInputRef = React.useRef<HTMLInputElement>(null)
  const highlightLayerRef = React.useRef<any>(null)
  const highlightMapRef = React.useRef<any>(null)
  const cartGraphicsLayerRef = React.useRef<any>(null)
  const cartGraphicsMapRef = React.useRef<any>(null)
  const phaseSelectionLayerRef = React.useRef<any>(null)
  const phaseSelectionMapRef = React.useRef<any>(null)

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

  const cartKeys = React.useMemo(() => new Set(cartItems.map((item) => item.key)), [cartItems])
  const cartLayerKey = cartItems[0]?.layerKey || null
  const cartLayerName = cartItems[0]?.layerName || null
  const packageWorkCodeKeys = React.useMemo(
    () => Array.from(new Set(packagePhaseItems.map((item) => getWorkCodeKey(item)))),
    [packagePhaseItems]
  )
  const packagePropertyNameKeys = React.useMemo(
    () => Array.from(new Set(packagePhaseItems.map((item) => getPropertyNameKey(item)))),
    [packagePhaseItems]
  )
  const packageWorkCodeConflict = packageWorkCodeKeys.length > 1
  const packagePropertyNameConflict = packagePropertyNameKeys.length > 1
  const packageWorkCodeKey = packageWorkCodeKeys.length === 1 ? packageWorkCodeKeys[0] : null
  const packagePropertyNameKey = packagePropertyNameKeys.length === 1 ? packagePropertyNameKeys[0] : null

  const addItemsToCart = React.useCallback((items: PackageCartItem[]) => {
    if (items.length === 0) {
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
      const newItems = items.filter((item) => !known.has(item.key))
      const lockedWorkCodeKey = current[0] ? getWorkCodeKey(current[0]) : newItems[0] ? getWorkCodeKey(newItems[0]) : null
      const workCodeFilteredItems = uniqueWorkCodes && lockedWorkCodeKey
        ? filterByWorkCode(newItems, lockedWorkCodeKey)
        : newItems
      const lockedPropertyNameKey = current[0] ? getPropertyNameKey(current[0]) : newItems[0] ? getPropertyNameKey(newItems[0]) : null
      const additions = propertyNamesMustMatch && lockedPropertyNameKey
        ? filterByPropertyName(workCodeFilteredItems, lockedPropertyNameKey)
        : workCodeFilteredItems
      if (additions.length === 0) {
        setStatus(propertyNamesMustMatch && workCodeFilteredItems.length > 0 ? m.selectionPropertyNameMismatch : newItems.length > 0 && uniqueWorkCodes ? m.selectionWorkCodeMismatch : m.selectionAlreadyInCart)
        return current
      }
      setStatus(`${m.addedSelectionToCart} ${additions.length}`)
      return [...current, ...additions]
    })
  }, [cartItems, m.addedSelectionToCart, m.selectionAlreadyInCart, m.selectionLayerMismatch, m.selectionMustBeSingleLayer, m.selectionPropertyNameMismatch, m.selectionWorkCodeMismatch, m.targetLayer, propertyNamesMustMatch, uniqueWorkCodes])

  React.useEffect(() => {
    if (isCreateMode && skipPackagedAssets) {
      setCartItems((current) => current.filter((item) => hasEmptyPackageValue(item, packageField)))
    }
  }, [isCreateMode, packageField, skipPackagedAssets])

  React.useEffect(() => {
    if (isCreateMode && uniqueWorkCodes) {
      setCartItems((current) => current[0] ? filterByWorkCode(current, getWorkCodeKey(current[0])) : current)
    }
  }, [isCreateMode, uniqueWorkCodes])

  React.useEffect(() => {
    if (isCreateMode && propertyNamesMustMatch) {
      setCartItems((current) => current[0] ? filterByPropertyName(current, getPropertyNameKey(current[0])) : current)
    }
  }, [isCreateMode, propertyNamesMustMatch])

  React.useEffect(() => {
    if (!isCreateMode || packageIdWasEditedRef.current) return
    const firstItem = cartItems[0]
    if (!firstItem) {
      if (generatedPackageSourceKeyRef.current) {
        generatedPackageIdRef.current = ''
        generatedPackageSourceKeyRef.current = ''
        setDraftPackageId('')
      }
      return
    }
    if (firstItem.key === generatedPackageSourceKeyRef.current) return
    const generatedPackageId = getGeneratedPackageId(firstItem.attributes || {})
    if (!generatedPackageId || generatedPackageId === generatedPackageIdRef.current) return
    generatedPackageIdRef.current = generatedPackageId
    generatedPackageSourceKeyRef.current = firstItem.key
    setDraftPackageId(generatedPackageId)
  }, [cartItems, isCreateMode])

  React.useEffect(() => {
    if (isCreateMode && pendingSelectionRemovalKeys.length === 0) {
      const eligibleItems = skipPackagedAssets
        ? currentSelectionItems.filter((item) => hasEmptyPackageValue(item, packageField))
        : currentSelectionItems
      const eligibleLayerKeys = getUniqueLayerKeys(eligibleItems)
      const candidateItems = cartLayerKey
        ? eligibleItems.filter((item) => item.layerKey === cartLayerKey)
        : eligibleLayerKeys.length === 1 ? eligibleItems : []
      const newSelectionItems = candidateItems.filter((item) => !cartKeys.has(item.key))
      if (newSelectionItems.length > 0) {
        addItemsToCart(newSelectionItems)
      }
    }
  }, [addItemsToCart, cartKeys, cartLayerKey, currentSelectionItems, isCreateMode, packageField, pendingSelectionRemovalKeys, skipPackagedAssets])

  React.useEffect(() => {
    if (!isModifyMode || !selectedPackage || loadingPackagePhases || pendingSelectionRemovalKeys.length > 0) return
    if (modifyUniqueWorkCodes && packageWorkCodeConflict) {
      setStatus(m.modifyPackageWorkCodeConflict)
      return
    }
    if (modifyPropertyNamesMustMatch && packagePropertyNameConflict) {
      setStatus(m.modifyPackagePropertyNameConflict)
      return
    }
    const packageLayerKey = getServiceLayerKey(selectedPackage.layerUrl)
    const phaseKeys = new Set(packagePhaseItems.map((item) => item.key))
    setModifySelectionItems((current) => {
      const knownKeys = new Set([...phaseKeys, ...current.map((item) => item.key)])
      const eligibleItems = modifySkipPackagedAssets
        ? currentSelectionItems.filter((item) => hasEmptyPackageValue(item, packageField))
        : currentSelectionItems
      const newItems = eligibleItems.filter((item) =>
        item.layerKey === packageLayerKey &&
        !knownKeys.has(item.key)
      )
      const lockedWorkCodeKey = packageWorkCodeKey || (current[0] ? getWorkCodeKey(current[0]) : newItems[0] ? getWorkCodeKey(newItems[0]) : null)
      const workCodeFilteredItems = modifyUniqueWorkCodes && lockedWorkCodeKey
        ? filterByWorkCode(newItems, lockedWorkCodeKey)
        : newItems
      const lockedPropertyNameKey = packagePropertyNameKey || (current[0] ? getPropertyNameKey(current[0]) : newItems[0] ? getPropertyNameKey(newItems[0]) : null)
      const additions = modifyPropertyNamesMustMatch && lockedPropertyNameKey
        ? filterByPropertyName(workCodeFilteredItems, lockedPropertyNameKey)
        : workCodeFilteredItems
      if (additions.length < newItems.length) {
        setStatus(
          workCodeFilteredItems.length < newItems.length
            ? m.modifySelectionWorkCodeMismatch
            : m.modifySelectionPropertyNameMismatch
        )
      }
      return additions.length > 0 ? [...current, ...additions] : current
    })
  }, [
    currentSelectionItems,
    isModifyMode,
    loadingPackagePhases,
    m.modifyPackagePropertyNameConflict,
    m.modifyPackageWorkCodeConflict,
    m.modifySelectionPropertyNameMismatch,
    m.modifySelectionWorkCodeMismatch,
    modifyPropertyNamesMustMatch,
    modifySkipPackagedAssets,
    modifyUniqueWorkCodes,
    packageField,
    packagePhaseItems,
    packagePropertyNameConflict,
    packagePropertyNameKey,
    packageWorkCodeConflict,
    packageWorkCodeKey,
    pendingSelectionRemovalKeys,
    selectedPackage
  ])

  React.useEffect(() => {
    if (pendingSelectionRemovalKeys.length > 0) {
      const selectedKeys = new Set(currentSelectionItems.map((item) => item.key))
      if (pendingSelectionRemovalKeys.every((key) => !selectedKeys.has(key))) {
        setPendingSelectionRemovalKeys([])
      }
    }
  }, [currentSelectionItems, pendingSelectionRemovalKeys])

  const removeCartItemsFromSelection = (items: PackageCartItem[]) => {
    if (items.length === 0) return
    setPendingSelectionRemovalKeys(items.map((item) => item.key))
    const dsManager = DataSourceManager.getInstance()
    const itemsByDataSource = items.reduce((groups, item) => {
      const dataSourceItems = groups.get(item.dataSourceId) || []
      dataSourceItems.push(item)
      groups.set(item.dataSourceId, dataSourceItems)
      return groups
    }, new Map<string, PackageCartItem[]>())
    itemsByDataSource.forEach((dataSourceItems, dataSourceId) => {
      const ds: any = dsManager.getDataSource(dataSourceId)
      const removedIds = new Set(dataSourceItems.map((item) => String(item.objectId)))
      const remainingSelectedIds = (ds?.getSelectedRecordIds?.() || [])
        .filter((id: string | number) => !removedIds.has(String(id)))
      ds?.selectRecordsByIds?.(remainingSelectedIds)
    })
    setSelectedMapFeatures((current) => current.filter((feature) => {
      const objectId = getGraphicObjectId(feature)
      const layer = feature?.layer || feature?.sourceLayer || {}
      const layerId = layer.layerId ?? layer.sourceJSON?.id
      const candidates = [layer.url, layer.parsedUrl?.path, layer.sourceJSON?.url].filter(Boolean).map(String)
      if (layerId !== undefined) candidates.push(...candidates.map((url) => `${url.replace(/\/+$/, '')}/${layerId}`))
      return !items.some((item) =>
        String(objectId) === String(item.objectId) && urlCandidatesMatch(item.layerUrl, candidates)
      )
    }))
  }

  const removeCartItem = (item: PackageCartItem) => {
    removeCartItemsFromSelection([item])
    setCartItems((current) => current.filter((cartItem) => cartItem.key !== item.key))
  }

  const removeModifySelectionItem = (item: PackageCartItem) => {
    removeCartItemsFromSelection([item])
    setModifySelectionItems((current) => current.filter((selectionItem) => selectionItem.key !== item.key))
  }

  const clearPackageCart = () => {
    setPendingSelectionRemovalKeys(currentSelectionItems.map((item) => item.key))
    jimuMapView?.clearSelectedFeatures?.()
    const dsManager = DataSourceManager.getInstance()
    selectionSources.forEach((source) => {
      dsManager.getDataSource(source.dataSourceId)?.clearSelection?.()
    })
    setSelectedMapFeatures([])
    setCartItems([])
    setStatus(m.cartCleared)
  }

  const clearModifySelection = () => {
    removeCartItemsFromSelection(modifySelectionItems)
    setModifySelectionItems([])
    setStatus(m.cartCleared)
  }

  const requestRemovePackagePhase = (item: PackageCartItem) => {
    setPhasePendingRemoval(item)
  }

  const clearCreateDraft = () => {
    setIsCreateConfirmationOpen(false)
    packageIdWasEditedRef.current = false
    generatedPackageIdRef.current = ''
    generatedPackageSourceKeyRef.current = ''
    setDraftPackageId('')
    setSkipPackagedAssets(true)
    setUniqueWorkCodes(true)
    setPropertyNamesMustMatch(true)
    setPendingSelectionRemovalKeys([])
    setCartItems([])
    setCartQueryResults([])
  }

  const clearModifyDraft = () => {
    setIsCreateWorkOrderConfirmationOpen(false)
    setIsUpdateStatusConfirmationOpen(false)
    setStagedWorkOrderFile(null)
    setStagedStatusUpdateFile(null)
    setWorkOrderApiResponse(null)
    if (workOrderFileInputRef.current) workOrderFileInputRef.current.value = ''
    if (statusUpdateFileInputRef.current) statusUpdateFileInputRef.current.value = ''
    setPackagePhaseItems([])
    setSelectedPackagePhaseKey(null)
    setWorkOrderStatusOptions([])
    setSelectedWorkOrderStatus('')
    setDefaultWorkOrderStatus('')
    setSelectedWorkOrderPhaseKeys([])
    setModifySelectionItems([])
    setModifySkipPackagedAssets(true)
    setModifyUniqueWorkCodes(true)
    setModifyPropertyNamesMustMatch(true)
    setLoadingPackagePhases(false)
    setSubmittingPackagePhases(false)
    phaseSelectionLayerRef.current?.removeAll?.()
  }

  const cancelCreateMode = () => {
    clearCreateDraft()
    setIsCreateMode(false)
    setStatus(m.createModeCancelled)
  }

  const startCreateMode = () => {
    clearHighlightedFeatures()
    setSelectedPackage(null)
    setIsModifyMode(false)
    setIsReviewWorkOrderMode(false)
    setIsCreateMode(true)
    setStatus(m.createModeStarted)
  }

  const getValidationWarnings = () => {
    const warnings: string[] = []
    if (draftPackageId.trim() === '') warnings.push(m.packageIdRequired)
    if (cartItems.length === 0) warnings.push(m.cartRequiresItems)
    if (getUniqueLayerKeys(cartItems).length > 1) warnings.push(m.cartMustBeSingleLayer)
    const alreadyPackagedCount = cartItems.filter((item) => hasPackageValue(item, packageField)).length
    if (alreadyPackagedCount > 0) warnings.push(`${alreadyPackagedCount} ${m.assetsAlreadyPackaged}`)
    return warnings
  }

  const openCreateConfirmation = () => {
    const validationWarnings = getValidationWarnings()
    if (validationWarnings.length > 0) {
      setStatus(`${m.validationPrefix} ${validationWarnings.join(' ')}`)
      return
    }
    setIsCreateConfirmationOpen(true)
  }

  const closeCreateConfirmation = () => {
    if (!submittingPackage) setIsCreateConfirmationOpen(false)
  }

  const confirmCreatePackage = () => {
    setIsCreateConfirmationOpen(false)
    submitCreatePackage().catch(() => undefined)
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

  const compactActionButtonStyle = {
    flex: '1 1 0',
    minWidth: 0,
    height: 30,
    padding: '0 6px',
    fontSize: 11,
    lineHeight: '14px',
    whiteSpace: 'normal',
    textAlign: 'center'
  }

  const modeActionButtonStyle = {
    height: 30,
    padding: '0 10px',
    fontSize: 11,
    lineHeight: '14px',
    whiteSpace: 'nowrap',
    textAlign: 'center'
  }

  const submitPackagePhases = async () => {
    if (!selectedPackage || modifySelectionItems.length === 0) return
    if (modifyUniqueWorkCodes && packageWorkCodeConflict) {
      setStatus(m.modifyPackageWorkCodeConflict)
      return
    }
    if (modifyPropertyNamesMustMatch && packagePropertyNameConflict) {
      setStatus(m.modifyPackagePropertyNameConflict)
      return
    }
    if (
      modifyUniqueWorkCodes &&
      packageWorkCodeKey &&
      modifySelectionItems.some((item) =>
        getWorkCodeKeyFromAttributes(cartRestAttributes[item.key] || item.attributes) !== packageWorkCodeKey
      )
    ) {
      setStatus(m.modifySelectionWorkCodeMismatch)
      return
    }
    if (
      modifyPropertyNamesMustMatch &&
      packagePropertyNameKey &&
      modifySelectionItems.some((item) =>
        getPropertyNameKeyFromAttributes(cartRestAttributes[item.key] || item.attributes) !== packagePropertyNameKey
      )
    ) {
      setStatus(m.modifySelectionPropertyNameMismatch)
      return
    }
    setSubmittingPackagePhases(true)
    setStatus(m.addingPackagePhases)
    try {
      const dsManager = DataSourceManager.getInstance()
      const groupsByDataSource = modifySelectionItems.reduce((groups, item) => {
        const items = groups.get(item.dataSourceId) || []
        items.push(item)
        groups.set(item.dataSourceId, items)
        return groups
      }, new Map<string, PackageCartItem[]>())

      for (const [dataSourceId, items] of groupsByDataSource.entries()) {
        const ds: any = dsManager.getDataSource(dataSourceId)
        if (!dataSourceId || !ds?.updateRecords) throw new Error(`${m.dataSourceNotEditable} ${dataSourceId || items[0]?.layerName}`)
        const records = items.map((item) => {
          const record = item.record?.clone?.(true) || item.record
          if (!record?.setData) throw new Error(`${m.recordNotEditable} ${item.objectId}`)
          record.setData({
            ...(record.getData?.() || item.attributes),
            [packageField]: selectedPackage.id
          })
          return record
        })
        const updated = await ds.updateRecords(records)
        if (!updated) throw new Error(`${m.packageCreateFailedForLayer} ${items[0]?.layerName || dataSourceId}`)
      }

      const addedCount = modifySelectionItems.length
      removeCartItemsFromSelection(modifySelectionItems)
      setModifySelectionItems([])
      await loadSelectedPackagePhases()
      setStatus(`${m.packagePhasesAdded} ${addedCount}`)
      refresh().catch(() => undefined)
    } catch (e) {
      setStatus(e instanceof Error ? e.message : m.packagePhasesAddFailed)
    } finally {
      setSubmittingPackagePhases(false)
    }
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
      setStatus(`${m.packageCreated} ${packageId} (${createdCount})`)
      refresh().catch(() => undefined)
    } catch (e) {
      setStatus(e instanceof Error ? e.message : m.packageCreateFailed)
    } finally {
      setSubmittingPackage(false)
    }
  }

  const escapeSqlString = (value: string) => value.replace(/'/g, "''")

  const escapeSqlLikeString = (value: string) => escapeSqlString(value).replace(/[%_]/g, (match) => `\\${match}`)

  const normalizeFieldName = (value?: string) => String(value || '').replace(/[^a-z0-9]/gi, '').toLowerCase()

  const isStringField = (field?: LayerFieldInfo) => {
    const type = String(field?.type || '').toLowerCase()
    return !type || type.includes('string') || type.includes('guid') || type.includes('globalid')
  }

  const isNumericField = (field?: LayerFieldInfo) => {
    const type = String(field?.type || '').toLowerCase()
    return type.includes('integer') || type.includes('smallinteger') || type.includes('double') || type.includes('single') || type.includes('oid')
  }

  const getLayerFields = async (layerUrl: string): Promise<LayerFieldInfo[]> => {
    const q = new URL(layerUrl)
    q.search = new URLSearchParams({ f: 'json' }).toString()
    const r = await fetch(q.toString())
    const d = await r.json()
    if (!r.ok || d.error) throw new Error(d.error?.message || r.statusText)
    return Array.isArray(d.fields) ? d.fields : []
  }

  const findLayerField = (fields: LayerFieldInfo[], fieldName: string) =>
    fields.find((field) => normalizeFieldName(field.name) === normalizeFieldName(fieldName))

  const getStatusOptionsFromFields = (fields: LayerFieldInfo[]) => {
    const statusField = findLayerField(fields, 'Status')
    return (statusField?.domain?.codedValues || []).map((codedValue) => ({
      label: displayOptionalValue(codedValue.name ?? codedValue.code),
      value: String(codedValue.code ?? '')
    })).filter((option) => option.value.trim() !== '')
  }

  const resolvePackageStatusValue = (
    phaseItems: PackageCartItem[],
    statusOptions: Array<{ label: string, value: string }>
  ) => {
    if (phaseItems.length === 0 || statusOptions.length === 0) return ''

    const domainValues = new Set(statusOptions.map((option) => option.value))
    let resolvedStatus: string | null = null

    for (const phaseItem of phaseItems) {
      const rawStatus = getAttributeValue(phaseItem.attributes || {}, 'Status')
      const statusValue = rawStatus === null || rawStatus === undefined ? '' : String(rawStatus)
      if (statusValue.trim() === '' || !domainValues.has(statusValue)) return ''
      if (resolvedStatus === null) {
        resolvedStatus = statusValue
      } else if (resolvedStatus !== statusValue) {
        return ''
      }
    }

    return resolvedStatus || ''
  }

  const getSearchWhereClause = (
    searchText: string,
    searchFields: LayerFieldInfo[]
  ) => {
    const trimmed = searchText.trim()
    if (trimmed.length < PACKAGE_SEARCH_MINIMUM_LENGTH) return ''

    const escapedLikeValue = `%${escapeSqlLikeString(trimmed).toUpperCase()}%`
    const exactNumberValue = Number(trimmed)
    const clauses: string[] = []

    searchFields.forEach((field) => {
      if (isStringField(field)) {
        clauses.push(`UPPER(${field.name}) LIKE '${escapedLikeValue}' ESCAPE '\\'`)
      } else if (isNumericField(field) && !Number.isNaN(exactNumberValue)) {
        clauses.push(`${field.name} = ${exactNumberValue}`)
      }
    })

    return clauses.length ? ` AND (${clauses.join(' OR ')})` : ''
  }

  const loadLayerPackages = React.useCallback(async (layerUrl: string, searchText = ''): Promise<PackageSummary[]> => {
    const fields = await getLayerFields(layerUrl)
    const searchFields = [
      findLayerField(fields, PACKAGE_ID_SEARCH_FIELD),
      findLayerField(fields, WORK_ORDER_NUMBER_SEARCH_FIELD)
    ].filter(Boolean) as LayerFieldInfo[]
    const searchWhereClause = getSearchWhereClause(searchText, searchFields)
    const outFieldNames = Array.from(new Set([packageField, ...searchFields.map((field) => field.name)]))
    const packageCounts = new Map<string, number>()
    let offset = 0
    let hasMore = true
    while (hasMore) {
      const q = new URL(layerUrl + '/query')
      q.search = new URLSearchParams({
        where: `${packageField} IS NOT NULL AND ${packageField} <> ''${searchWhereClause}`,
        outFields: outFieldNames.join(','),
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
        if (v !== null && v !== undefined && String(v).trim() !== '') {
          const packageId = String(v)
          packageCounts.set(packageId, (packageCounts.get(packageId) || 0) + 1)
        }
      })
      const fullPage = feats.length === QUERY_PAGE_SIZE
      hasMore = Boolean(d.exceededTransferLimit) || fullPage
      offset += feats.length
      if (feats.length === 0) hasMore = false
    }
    return Array.from(packageCounts.entries())
      .map(([id, featureCount]) => ({ id, featureCount }))
      .sort((a, b) => a.id.localeCompare(b.id))
  }, [packageField])

  const queryPackageFeatures = async (layerUrl: string, pkg: string): Promise<QueryResponse> => {
    const allFeatures: QueryFeature[] = []
    let offset = 0
    let hasMore = true
    let geometryType: string | null = null
    let spatialReference: any = null
    let objectIdFieldName: string | null = null
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
      if (d.objectIdFieldName) objectIdFieldName = d.objectIdFieldName
      const feats = d.features || []
      allFeatures.push(...feats)
      const fullPage = feats.length === QUERY_PAGE_SIZE
      hasMore = Boolean(d.exceededTransferLimit) || fullPage
      offset += feats.length
      if (feats.length === 0) hasMore = false
    }
    return {
      features: allFeatures,
      geometryType: geometryType || undefined,
      spatialReference,
      objectIdFieldName: objectIdFieldName || undefined
    }
  }

  const buildPackagePhaseItems = (layerUrl: string, result: QueryResponse): PackageCartItem[] => {
    const source = selectionSources.find((selectionSource) => getServiceLayerKey(selectionSource.layerUrl) === getServiceLayerKey(layerUrl))
    const targetLayer = targetLayers.find((layer) => getServiceLayerKey(layer.url) === getServiceLayerKey(layerUrl))
    const ds: any = source ? DataSourceManager.getInstance().getDataSource(source.dataSourceId) : null
    const layerKey = getServiceLayerKey(layerUrl)

    return (result.features || []).flatMap((feature) => {
      const attributes = feature.attributes || {}
      const objectId = getFeatureObjectId(attributes, result.objectIdFieldName)
      if (objectId === null || objectId === undefined) return []
      const record = ds?.buildRecord?.(feature)
      return [{
        key: `${layerKey}::${objectId}`,
        dataSourceId: source?.dataSourceId || '',
        layerName: source?.layerName || targetLayer?.name || m.targetLayer,
        layerUrl,
        layerKey,
        objectId,
        attributes,
        record: record?.clone?.(true) || record
      }]
    })
  }

  const loadSelectedPackagePhases = async () => {
    if (!selectedPackage) return
    setLoadingPackagePhases(true)
    try {
      const [result, fields] = await Promise.all([
        queryPackageFeatures(selectedPackage.layerUrl, selectedPackage.id),
        getLayerFields(selectedPackage.layerUrl)
      ])
      const phaseItems = buildPackagePhaseItems(selectedPackage.layerUrl, result)
      const statusOptions = getStatusOptionsFromFields(fields)
      const resolvedStatus = resolvePackageStatusValue(phaseItems, statusOptions)
      setPackagePhaseItems(phaseItems)
      setWorkOrderStatusOptions(statusOptions)
      setSelectedWorkOrderStatus(resolvedStatus)
      setDefaultWorkOrderStatus(resolvedStatus)
      setSelectedWorkOrderPhaseKeys([])
      setStatus(`${m.packagePhasesLoaded} ${result.features?.length || 0}`)
    } catch (e) {
      setPackagePhaseItems([])
      setWorkOrderStatusOptions([])
      setSelectedWorkOrderStatus('')
      setDefaultWorkOrderStatus('')
      setSelectedWorkOrderPhaseKeys([])
      setStatus(e instanceof Error ? e.message : m.packagePhasesLoadError)
    } finally {
      setLoadingPackagePhases(false)
    }
  }

  const startModifyMode = () => {
    if (!selectedPackage) {
      setStatus(m.viewNeedsSelection)
      return
    }
    clearModifyDraft()
    setIsCreateMode(false)
    setIsReviewWorkOrderMode(false)
    setIsModifyMode(true)
    setStatus(m.loadingPackagePhases)
    loadSelectedPackagePhases().catch(() => undefined)
  }

  const cancelModifyMode = () => {
    clearModifyDraft()
    setIsModifyMode(false)
    setStatus(m.modifyModeCancelled)
  }

  const startReviewWorkOrderMode = () => {
    if (!selectedPackage) {
      setStatus(m.viewNeedsSelection)
      return
    }
    clearModifyDraft()
    setIsCreateMode(false)
    setIsModifyMode(false)
    setIsReviewWorkOrderMode(true)
    setStatus(m.loadingPackagePhases)
    loadSelectedPackagePhases().catch(() => undefined)
  }

  const cancelReviewWorkOrderMode = () => {
    clearModifyDraft()
    setIsReviewWorkOrderMode(false)
    setStatus(m.reviewWorkOrderModeCancelled)
  }

  const toggleWorkOrderPhaseSelection = (item: PackageCartItem) => {
    setSelectedWorkOrderPhaseKeys((keys) =>
      keys.includes(item.key)
        ? keys.filter((key) => key !== item.key)
        : [...keys, item.key]
    )
  }

  const selectAllWorkOrderPhases = () => {
    setSelectedWorkOrderPhaseKeys(Array.from(new Set(packagePhaseItems.map((item) => item.key))))
  }

  const clearWorkOrderPhaseSelection = () => {
    setSelectedWorkOrderPhaseKeys([])
  }

  const getWorkOrderStatusUpdateItems = () =>
    packagePhaseItems.filter((item) => selectedWorkOrderPhaseKeys.includes(item.key))

  const getSelectedWorkOrderStatusLabel = () =>
    workOrderStatusOptions.find((option) => option.value === selectedWorkOrderStatus)?.label ||
    selectedWorkOrderStatus ||
    m.workOrderStatusEmptyOption

  const getWorkOrderStatusLabel = (statusValue: any, emptyLabel = '-') => {
    const normalizedStatus = statusValue === null || statusValue === undefined ? '' : String(statusValue)
    if (normalizedStatus.trim() === '') return emptyLabel
    return workOrderStatusOptions.find((option) => option.value === normalizedStatus)?.label || normalizedStatus
  }

  const getPhaseStatusLabel = (item: PackageCartItem) =>
    getWorkOrderStatusLabel(getAttributeValue(item.attributes || {}, 'Status'))

  const selectedStatusRequiresCompletionFile = () =>
    getSelectedWorkOrderStatusLabel().trim().toLowerCase() === 'repairs completed'

  const isAcceptedAttachmentFile = (file: File | null | undefined) =>
    Boolean(file && (
      file.type === 'application/pdf' ||
      file.type.startsWith('image/') ||
      /\.pdf$/i.test(file.name)
    ))

  const openUpdateStatusConfirmation = () => {
    setStagedStatusUpdateFile(null)
    if (statusUpdateFileInputRef.current) statusUpdateFileInputRef.current.value = ''
    setIsUpdateStatusConfirmationOpen(true)
  }

  const closeUpdateStatusConfirmation = () => {
    setIsUpdateStatusConfirmationOpen(false)
    setStagedStatusUpdateFile(null)
    if (statusUpdateFileInputRef.current) statusUpdateFileInputRef.current.value = ''
  }

  const confirmUpdateWorkOrderStatus = () => {
    const updateItems = getWorkOrderStatusUpdateItems()
    const attachmentNote = stagedStatusUpdateFile ? ` (${stagedStatusUpdateFile.name})` : ''
    setIsUpdateStatusConfirmationOpen(false)
    setStatus(`${m.updateStatusPending} ${updateItems.length} ${m.featureCountLabel}${attachmentNote}`)
  }

  const openCreateWorkOrderConfirmation = () => {
    setWorkOrderApiResponse(null)
    setIsCreateWorkOrderConfirmationOpen(true)
  }

  const closeCreateWorkOrderConfirmation = () => {
    if (submittingWorkOrder) return
    setIsCreateWorkOrderConfirmationOpen(false)
    setStagedWorkOrderFile(null)
    setWorkOrderApiResponse(null)
    if (workOrderFileInputRef.current) workOrderFileInputRef.current.value = ''
  }

  const confirmCreateWorkOrder = async () => {
    if (!stagedWorkOrderFile) {
      setStatus(m.workOrderFileRequired)
      return
    }
    if (!selectedPackage || packagePhaseItems.length === 0) {
      setStatus(m.workOrderRequiresFeatures)
      return
    }

    setSubmittingWorkOrder(true)
    setWorkOrderApiResponse(null)
    setStatus(m.creatingWorkOrder)
    try {
      const aimResponse = await submitAimWorkOrder(aimSubmitUrl, packagePhaseItems)
      setWorkOrderApiResponse({
        ...aimResponse,
        text: aimResponse.text || m.emptyApiResponse
      })
      if (!aimResponse.ok) {
        throw new Error(`${m.aimSubmitFailed} HTTP ${aimResponse.status}${aimResponse.text ? `: ${aimResponse.text}` : ''}`)
      }

      setStatus(`${m.workOrderCreated} ${selectedPackage.id}`)
    } catch (e) {
      const message = e instanceof Error ? e.message : m.workOrderCreateFailed
      setWorkOrderApiResponse((current) => current || { ok: false, text: message })
      setStatus(message)
    } finally {
      setSubmittingWorkOrder(false)
    }
  }

  const generateSelectedPackageReport = async (variant: 'package' | 'completion' = 'package') => {
    const isCompletionReport = variant === 'completion'
    if (!selectedPackage || packagePhaseItems.length === 0) {
      setStatus(m.reportRequiresFeatures)
      return
    }

    const reportWindow = window.open('', '_blank')
    if (!reportWindow) {
      setStatus(m.reportPopupBlocked)
      return
    }

    setGeneratingReport(true)
    setStatus(isCompletionReport ? m.generatingCompletionReport : m.generatingReport)
    try {
      await generatePackageReport({
        reportWindow,
        packageId: selectedPackage.id,
        layerUrl: selectedPackage.layerUrl,
        features: packagePhaseItems,
        variant
      })
      setStatus(`${isCompletionReport ? m.completionReportGenerated : m.reportGenerated} ${selectedPackage.id}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : m.reportGenerationFailed
      renderReportError(reportWindow, message)
      setStatus(`${m.reportGenerationFailed} ${message}`)
    } finally {
      setGeneratingReport(false)
    }
  }

  const openDeleteConfirmation = () => {
    if (!selectedPackage) {
      setStatus(m.deleteNeedsSelection)
      return
    }
    setIsDeleteConfirmationOpen(true)
  }

  const closeDeleteConfirmation = () => {
    setIsDeleteConfirmationOpen(false)
  }

  const confirmDeletePackage = () => {
    setIsDeleteConfirmationOpen(false)
    setStatus(m.deletePending)
  }

  const closeRemovePhaseConfirmation = () => {
    setPhasePendingRemoval(null)
  }

  const confirmRemovePackagePhase = () => {
    const objectId = phasePendingRemoval?.objectId
    setPhasePendingRemoval(null)
    setStatus(`${m.removePackagePhasePending} ${objectId || ''}`)
  }

  const queryCartFeatures = React.useCallback(async (layerUrl: string, objectIds: Array<string | number>): Promise<QueryResponse[]> => {
    const results: QueryResponse[] = []
    for (let offset = 0; offset < objectIds.length; offset += OBJECT_ID_QUERY_CHUNK_SIZE) {
      const params: { [key: string]: string } = {
        objectIds: objectIds.slice(offset, offset + OBJECT_ID_QUERY_CHUNK_SIZE).join(','),
        outFields: '*',
        returnGeometry: 'true',
        f: 'json'
      }
      const outWkid = jimuMapView?.view?.spatialReference?.wkid
      if (outWkid) params.outSR = String(outWkid)

      const q = new URL(layerUrl + '/query')
      q.search = new URLSearchParams(params).toString()
      const r = await fetch(q.toString())
      const d = await r.json() as QueryResponse
      if (!r.ok || d.error) throw new Error(d.error?.message || r.statusText)
      results.push(d)
    }
    return results
  }, [jimuMapView])

  const metadataQueryItems = React.useMemo(
    () => isCreateMode ? cartItems : isModifyMode ? modifySelectionItems : [],
    [cartItems, isCreateMode, isModifyMode, modifySelectionItems]
  )

  React.useEffect(() => {
    let cancelled = false

    const loadCartQueryResults = async () => {
      if (metadataQueryItems.length === 0) {
        setCartQueryResults([])
        return
      }

      setCartQueryResults([])
      const itemsByLayer = metadataQueryItems.reduce((groups, item) => {
        const items = groups.get(item.layerUrl) || []
        items.push(item)
        groups.set(item.layerUrl, items)
        return groups
      }, new Map<string, PackageCartItem[]>())
      const queryResults: CartLayerQueryResult[] = await Promise.all(Array.from(itemsByLayer.entries()).map(async ([layerUrl, items]) => ({
        layerUrl,
        results: await queryCartFeatures(layerUrl, items.map((item) => item.objectId))
      })))
      if (cancelled) return
      setCartQueryResults(queryResults)
    }

    loadCartQueryResults().catch(() => {
      if (!cancelled) {
        setCartQueryResults([])
        setStatus(m.cartGraphicsError)
      }
    })

    return () => {
      cancelled = true
    }
  }, [m.cartGraphicsError, metadataQueryItems, queryCartFeatures])

  const cartRestAttributes = React.useMemo(() => {
    const attributesByKey: { [key: string]: { [key: string]: any } } = {}
    cartQueryResults.forEach(({ layerUrl, results }) => {
      const layerKey = getServiceLayerKey(layerUrl)
      results.forEach((result) => {
        ;(result.features || []).forEach((feature) => {
          const attributes = feature.attributes || {}
          const objectId = getFeatureObjectId(attributes, result.objectIdFieldName)
          if (objectId !== null && objectId !== undefined) {
            attributesByKey[`${layerKey}::${objectId}`] = attributes
          }
        })
      })
    })
    return attributesByKey
  }, [cartQueryResults])

  React.useEffect(() => {
    if (!uniqueWorkCodes || cartItems.length === 0) return
    const firstItemAttributes = cartRestAttributes[cartItems[0].key]
    if (!firstItemAttributes) return

    const lockedWorkCodeKey = getWorkCodeKeyFromAttributes(firstItemAttributes)
    const rejectedItems = cartItems.filter((item) => {
      const restAttributes = cartRestAttributes[item.key]
      return restAttributes && getWorkCodeKeyFromAttributes(restAttributes) !== lockedWorkCodeKey
    })
    if (rejectedItems.length === 0) return

    removeCartItemsFromSelection(rejectedItems)
    const rejectedKeys = new Set(rejectedItems.map((item) => item.key))
    setCartItems((current) => current.filter((item) => !rejectedKeys.has(item.key)))
  }, [cartItems, cartRestAttributes, uniqueWorkCodes])

  React.useEffect(() => {
    if (!propertyNamesMustMatch || cartItems.length === 0) return
    const firstItemAttributes = cartRestAttributes[cartItems[0].key]
    if (!firstItemAttributes) return

    const lockedPropertyNameKey = getPropertyNameKeyFromAttributes(firstItemAttributes)
    const rejectedItems = cartItems.filter((item) => {
      const restAttributes = cartRestAttributes[item.key]
      return restAttributes && getPropertyNameKeyFromAttributes(restAttributes) !== lockedPropertyNameKey
    })
    if (rejectedItems.length === 0) return

    removeCartItemsFromSelection(rejectedItems)
    const rejectedKeys = new Set(rejectedItems.map((item) => item.key))
    setCartItems((current) => current.filter((item) => !rejectedKeys.has(item.key)))
    setStatus(m.selectionPropertyNameMismatch)
  }, [cartItems, cartRestAttributes, m.selectionPropertyNameMismatch, propertyNamesMustMatch])

  React.useEffect(() => {
    if (!isModifyMode || !modifySkipPackagedAssets || modifySelectionItems.length === 0) return
    const rejectedItems = modifySelectionItems.filter((item) => {
      const attributes = cartRestAttributes[item.key]
      const packageValue = attributes ? getAttributeValue(attributes, packageField) : undefined
      return packageValue !== null && packageValue !== undefined && String(packageValue).trim() !== ''
    })
    if (rejectedItems.length === 0) return

    removeCartItemsFromSelection(rejectedItems)
    const rejectedKeys = new Set(rejectedItems.map((item) => item.key))
    setModifySelectionItems((current) => current.filter((item) => !rejectedKeys.has(item.key)))
    setStatus(m.modifySelectionAlreadyPackaged)
  }, [cartRestAttributes, isModifyMode, m.modifySelectionAlreadyPackaged, modifySelectionItems, modifySkipPackagedAssets, packageField])

  React.useEffect(() => {
    if (!isModifyMode || !modifyUniqueWorkCodes || modifySelectionItems.length === 0) return
    if (packageWorkCodeConflict) {
      removeCartItemsFromSelection(modifySelectionItems)
      setModifySelectionItems([])
      setStatus(m.modifyPackageWorkCodeConflict)
      return
    }
    const firstItemAttributes = cartRestAttributes[modifySelectionItems[0].key] || modifySelectionItems[0].attributes
    const lockedWorkCodeKey = packageWorkCodeKey || getWorkCodeKeyFromAttributes(firstItemAttributes)
    const rejectedItems = modifySelectionItems.filter((item) => {
      const attributes = cartRestAttributes[item.key] || item.attributes
      return getWorkCodeKeyFromAttributes(attributes) !== lockedWorkCodeKey
    })
    if (rejectedItems.length === 0) return

    removeCartItemsFromSelection(rejectedItems)
    const rejectedKeys = new Set(rejectedItems.map((item) => item.key))
    setModifySelectionItems((current) => current.filter((item) => !rejectedKeys.has(item.key)))
    setStatus(m.modifySelectionWorkCodeMismatch)
  }, [cartRestAttributes, isModifyMode, m.modifyPackageWorkCodeConflict, m.modifySelectionWorkCodeMismatch, modifySelectionItems, modifyUniqueWorkCodes, packageWorkCodeConflict, packageWorkCodeKey])

  React.useEffect(() => {
    if (!isModifyMode || !modifyPropertyNamesMustMatch || modifySelectionItems.length === 0) return
    if (packagePropertyNameConflict) {
      removeCartItemsFromSelection(modifySelectionItems)
      setModifySelectionItems([])
      setStatus(m.modifyPackagePropertyNameConflict)
      return
    }
    const firstItemAttributes = cartRestAttributes[modifySelectionItems[0].key] || modifySelectionItems[0].attributes
    const lockedPropertyNameKey = packagePropertyNameKey || getPropertyNameKeyFromAttributes(firstItemAttributes)
    const rejectedItems = modifySelectionItems.filter((item) => {
      const attributes = cartRestAttributes[item.key] || item.attributes
      return getPropertyNameKeyFromAttributes(attributes) !== lockedPropertyNameKey
    })
    if (rejectedItems.length === 0) return

    removeCartItemsFromSelection(rejectedItems)
    const rejectedKeys = new Set(rejectedItems.map((item) => item.key))
    setModifySelectionItems((current) => current.filter((item) => !rejectedKeys.has(item.key)))
    setStatus(m.modifySelectionPropertyNameMismatch)
  }, [cartRestAttributes, isModifyMode, m.modifyPackagePropertyNameConflict, m.modifySelectionPropertyNameMismatch, modifyPropertyNamesMustMatch, modifySelectionItems, packagePropertyNameConflict, packagePropertyNameKey])

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
        title: 'AiM Manager selection',
        listMode: 'hide'
      })
      jimuMapView.view.map.add(highlightLayerRef.current)
      highlightMapRef.current = jimuMapView.view.map
    }
    return highlightLayerRef.current
  }

  const ensureCartGraphicsLayer = React.useCallback(async () => {
    if (!jimuMapView?.view?.map) return null
    if (cartGraphicsLayerRef.current && cartGraphicsMapRef.current !== jimuMapView.view.map) {
      cartGraphicsMapRef.current?.remove?.(cartGraphicsLayerRef.current)
      cartGraphicsLayerRef.current = null
      cartGraphicsMapRef.current = null
    }
    if (!cartGraphicsLayerRef.current) {
      const [GraphicsLayer] = await loadArcGISJSAPIModules(['esri/layers/GraphicsLayer'])
      cartGraphicsLayerRef.current = new GraphicsLayer({
        id: `${props.id}-package-cart`,
        title: 'AiM Manager package cart',
        listMode: 'hide'
      })
      jimuMapView.view.map.add(cartGraphicsLayerRef.current)
      cartGraphicsMapRef.current = jimuMapView.view.map
    }
    return cartGraphicsLayerRef.current
  }, [jimuMapView, props.id])

  const ensurePhaseSelectionLayer = async () => {
    if (!jimuMapView?.view?.map) throw new Error(m.mapNotConfigured)
    if (phaseSelectionLayerRef.current && phaseSelectionMapRef.current !== jimuMapView.view.map) {
      phaseSelectionMapRef.current?.remove?.(phaseSelectionLayerRef.current)
      phaseSelectionLayerRef.current = null
      phaseSelectionMapRef.current = null
    }
    if (!phaseSelectionLayerRef.current) {
      const [GraphicsLayer] = await loadArcGISJSAPIModules(['esri/layers/GraphicsLayer'])
      phaseSelectionLayerRef.current = new GraphicsLayer({
        id: `${props.id}-package-phase-selection`,
        title: 'AiM Manager package phase selection',
        listMode: 'hide'
      })
      jimuMapView.view.map.add(phaseSelectionLayerRef.current)
      phaseSelectionMapRef.current = jimuMapView.view.map
    }
    return phaseSelectionLayerRef.current
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

  const getCartGraphicSymbol = (geometry: any) => {
    const type = geometry?.type
    if (type === 'point' || type === 'multipoint') {
      return {
        type: 'simple-marker',
        style: 'circle',
        color: [255, 170, 0, 0.9],
        size: 11,
        outline: { color: [255, 255, 255, 1], width: 2 }
      }
    }
    if (type === 'polyline') {
      return {
        type: 'simple-line',
        color: [255, 170, 0, 1],
        width: 4
      }
    }
    return {
      type: 'simple-fill',
      color: [255, 170, 0, 0.18],
      outline: { color: [255, 170, 0, 1], width: 2 }
    }
  }

  const getPhaseSelectionSymbol = (geometry: any) => {
    const type = geometry?.type
    if (type === 'point' || type === 'multipoint') {
      return {
        type: 'simple-marker',
        style: 'circle',
        color: [204, 51, 255, 0.9],
        size: 14,
        outline: { color: [255, 255, 255, 1], width: 2 }
      }
    }
    if (type === 'polyline') {
      return {
        type: 'simple-line',
        color: [204, 51, 255, 1],
        width: 5
      }
    }
    return {
      type: 'simple-fill',
      color: [204, 51, 255, 0.22],
      outline: { color: [204, 51, 255, 1], width: 3 }
    }
  }

  const clearHighlightedFeatures = () => {
    highlightLayerRef.current?.removeAll?.()
  }

  const selectPackagePhase = async (item: PackageCartItem) => {
    setSelectedPackagePhaseKey(item.key)
    try {
      const layer = await ensurePhaseSelectionLayer()
      const [Graphic, geometryJsonUtils] = await loadArcGISJSAPIModules([
        'esri/Graphic',
        'esri/geometry/support/jsonUtils'
      ])
      const results = await queryCartFeatures(item.layerUrl, [item.objectId])
      const graphics: any[] = []
      results.forEach((result) => {
        ;(result.features || []).forEach((feature) => {
          if (!feature.geometry) return
          const geometry = geometryJsonUtils.fromJSON(getGeometryJson(
            feature.geometry,
            result.geometryType,
            result.spatialReference
          ))
          graphics.push(new Graphic({
            geometry,
            attributes: feature.attributes || {},
            symbol: getPhaseSelectionSymbol(geometry)
          }))
        })
      })
      layer.removeAll()
      if (graphics.length > 0) {
        layer.addMany(graphics)
        await zoomToGraphics(graphics)
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : m.mapSelectionError)
    }
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

  React.useEffect(() => {
    let cancelled = false

    const syncCartGraphics = async () => {
      const layer = await ensureCartGraphicsLayer()
      if (!layer || cancelled) return

      if (!isCreateMode || cartItems.length === 0) {
        layer.removeAll()
        return
      }

      const [Graphic, geometryJsonUtils] = await loadArcGISJSAPIModules([
        'esri/Graphic',
        'esri/geometry/support/jsonUtils'
      ])
      if (cancelled) return

      const graphics: any[] = []
      cartQueryResults.forEach(({ results }) => {
        results.forEach((result) => {
          const features = result.features || []
          features.forEach((feature) => {
            if (!feature.geometry) return
            const geometry = geometryJsonUtils.fromJSON(getGeometryJson(
              feature.geometry,
              result.geometryType,
              result.spatialReference
            ))
            graphics.push(new Graphic({
              geometry,
              attributes: feature.attributes || {},
              symbol: getCartGraphicSymbol(geometry)
            }))
          })
        })
      })

      layer.removeAll()
      if (graphics.length > 0) layer.addMany(graphics)
    }

    syncCartGraphics().catch(() => {
      if (!cancelled) setStatus(m.cartGraphicsError)
    })

    return () => {
      cancelled = true
    }
  }, [cartItems, cartQueryResults, ensureCartGraphicsLayer, isCreateMode, m.cartGraphicsError])

  React.useEffect(() => () => {
    highlightLayerRef.current?.removeAll?.()
    highlightMapRef.current?.remove?.(highlightLayerRef.current)
    cartGraphicsLayerRef.current?.removeAll?.()
    cartGraphicsMapRef.current?.remove?.(cartGraphicsLayerRef.current)
    phaseSelectionLayerRef.current?.removeAll?.()
    phaseSelectionMapRef.current?.remove?.(phaseSelectionLayerRef.current)
  }, [])

  const selectPackage = async (layerUrl: string, pkg: string) => {
    const key = getPackageKey(layerUrl, pkg)
    if (selectedPackage?.key === key) {
      setSelectedPackage(null)
      clearHighlightedFeatures()
      setStatus(m.mapSelectionCleared)
      return
    }
    setSelectedPackage({ key, layerUrl, id: pkg })
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
    if (!isCreateMode && !isModifyMode && !isReviewWorkOrderMode) {
      refresh().catch(() => undefined)
    }
  }, [isCreateMode, isModifyMode, isReviewWorkOrderMode, refresh])

  const runPackageSearch = async (rawSearchText: string) => {
    const searchText = rawSearchText.trim()
    if (searchText.length > 0 && searchText.length < PACKAGE_SEARCH_MINIMUM_LENGTH) {
      setStatus(m.packageSearchMinimum)
      return
    }

    if (!targetLayers.length) {
      setGroups([])
      setError(m.noTargetLayers)
      return
    }

    setSearchingPackages(true)
    setError(null)
    try {
      const data = await Promise.all(targetLayers.map(async (layer, idx) => ({
        layerUrl: layer.url,
        layerName: layer.name || `${m.layerPrefix} ${idx + 1}`,
        packages: await loadLayerPackages(layer.url, searchText)
      })))
      setGroups(data)
      setActiveLayerUrl((current) => {
        if (!searchText) {
          return current && data.some((g) => g.layerUrl === current) ? current : (data[0]?.layerUrl || null)
        }
        const firstResultGroup = data.find((group) => group.packages.length > 0)
        return firstResultGroup?.layerUrl || (data[0]?.layerUrl || null)
      })
      const resultCount = data.reduce((total, group) => total + group.packages.length, 0)
      setStatus(searchText
        ? `${m.packageSearchReady} ${resultCount}`
        : m.packageListReady)
    } catch (e) {
      setStatus(e instanceof Error ? e.message : m.packageSearchFailed)
    } finally {
      setSearchingPackages(false)
    }
  }

  React.useEffect(() => {
    if (!packageSearchInitializedRef.current) {
      packageSearchInitializedRef.current = true
      return
    }

    const timer = window.setTimeout(() => {
      runPackageSearch(packageSearchTerm).catch(() => undefined)
    }, PACKAGE_SEARCH_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timer)
    }
  }, [packageSearchTerm])

  const row = (layerUrl: string, pkg: PackageSummary) => {
    const key = getPackageKey(layerUrl, pkg.id)
    const isSelected = key === selectedPackage?.key
    return h('div', { key, className: 'd-flex align-items-center justify-content-between py-1', style: { gap: '0.5rem' } },
      h('div', { className: 'd-flex align-items-center', style: { gap: '0.5rem', minWidth: 0 } },
        h(Checkbox, {
          checked: isSelected,
          onChange: () => {
            selectPackage(layerUrl, pkg.id).catch(() => undefined)
          }
        }),
        h('span', { style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, pkg.id),
        h('span', {
          title: `${pkg.featureCount} ${m.featureCountLabel}`,
          style: {
            flex: '0 0 auto',
            borderRadius: 999,
            padding: '2px 8px',
            fontSize: 11,
            fontWeight: 700,
            lineHeight: '16px',
            color: 'var(--info-600, #0077ac)',
            backgroundColor: 'transparent'
          }
        }, String(pkg.featureCount))
      ),
      h(Button, {
        size: 'sm', type: 'default', title: m.openFolder, disabled: !folderBaseUrl,
        onClick: () => {
          if (folderBaseUrl) {
            window.open(`${folderBaseUrl}/${pkg.id}`, '_blank', 'noopener,noreferrer')
          }
        },
        style: { width: 32, minWidth: 32, height: 32, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }
      }, '📁')
    )
  }

  const itemRow = (
    item: PackageCartItem,
    onRemove?: (item: PackageCartItem) => void,
    onAction?: (item: PackageCartItem) => void,
    onSelect?: (item: PackageCartItem) => void,
    showPropertyMetadata?: boolean,
    showStatusInPrimaryText?: boolean,
    selectedPhaseKeys?: string[],
    onPhaseSelectionToggle?: (item: PackageCartItem) => void
  ) => {
    const restAttributes = cartRestAttributes[item.key] || {}
    const workCodeValue = getAttributeValue(restAttributes, WORK_CODE_FIELD) ?? getAttributeValue(item.attributes || {}, WORK_CODE_FIELD)
    const workCode = workCodeValue === null || workCodeValue === undefined || String(workCodeValue).trim() === ''
      ? '-'
      : String(workCodeValue)
    const inspectorValue = getAttributeValue(restAttributes, INSPECTOR_FIELD) ?? getAttributeValue(item.attributes || {}, INSPECTOR_FIELD)
    const inspector = inspectorValue === null || inspectorValue === undefined || String(inspectorValue).trim() === ''
      ? '-'
      : String(inspectorValue)
    const dateInspected = formatDateValue(
      getAttributeValue(restAttributes, CREATED_DATE_FIELD) ?? getAttributeValue(item.attributes || {}, CREATED_DATE_FIELD)
    )
    const propertyNameValue = getAttributeValue(restAttributes, PROPERTY_NAME_FIELD) ?? getAttributeValue(item.attributes || {}, PROPERTY_NAME_FIELD)
    const propertyName = propertyNameValue === null || propertyNameValue === undefined || String(propertyNameValue).trim() === ''
      ? '-'
      : String(propertyNameValue)
    const statusValue = getAttributeValue(restAttributes, 'Status') ?? getAttributeValue(item.attributes || {}, 'Status')
    const status = getWorkOrderStatusLabel(statusValue)
    const repairCompletedDate = formatDateValue(
      getAttributeValue(restAttributes, REPAIR_COMPLETED_DATE_FIELD) ?? getAttributeValue(item.attributes || {}, REPAIR_COMPLETED_DATE_FIELD)
    )
    const aimStatusValue = getAttributeValue(restAttributes, AIM_STATUS_FIELD) ?? getAttributeValue(item.attributes || {}, AIM_STATUS_FIELD)
    const aimStatus = aimStatusValue === null || aimStatusValue === undefined || String(aimStatusValue).trim() === ''
      ? '-'
      : String(aimStatusValue)
    const primaryText = showPropertyMetadata
      ? `${getRecordLabel(item.attributes, item.objectId)} | ${dateInspected} | ${showStatusInPrimaryText ? status : propertyName}`
      : getRecordLabel(item.attributes, item.objectId)
    const metadata = showStatusInPrimaryText
      ? `${m.workCodePrefix} ${workCode} | ${m.completedDatePrefix} ${repairCompletedDate} | ${m.aimStatusPrefix} ${aimStatus}`
      : showPropertyMetadata
      ? `${m.objectIdPrefix} ${item.objectId} | ${m.workCodePrefix} ${workCode} | ${m.inspectorPrefix} ${inspector}`
      : `${m.objectIdPrefix} ${item.objectId} | ${m.workCodePrefix} ${workCode} | ${m.dateInspectedPrefix} ${dateInspected}`

    const isSelectedPhase = item.key === selectedPackagePhaseKey
    const isCheckedForStatusUpdate = Boolean(selectedPhaseKeys?.includes(item.key))

    return h('div', {
      key: item.key,
      className: 'd-flex align-items-center justify-content-between py-1',
      onClick: onPhaseSelectionToggle
        ? () => {
          onPhaseSelectionToggle(item)
          if (onSelect) onSelect(item)
        }
        : onSelect ? () => { onSelect(item) } : undefined,
      style: {
        gap: '0.5rem',
        cursor: onSelect || onPhaseSelectionToggle ? 'pointer' : undefined,
        backgroundColor: isSelectedPhase ? 'rgba(204, 51, 255, 0.1)' : undefined
      }
    },
      h('div', { className: 'd-flex align-items-center', style: { gap: '0.5rem', minWidth: 0, overflow: 'hidden' } },
        onPhaseSelectionToggle && h(Checkbox, {
          checked: isCheckedForStatusUpdate,
          onClick: (evt) => {
            evt.stopPropagation()
          },
          onChange: (evt) => {
            evt.stopPropagation()
            onPhaseSelectionToggle(item)
          }
        }),
        h('div', { style: { minWidth: 0, overflow: 'hidden' } },
          h('div', { style: { fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, primaryText),
          h('div', {
            title: metadata,
            style: { fontSize: 10, opacity: 0.7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
          }, metadata)
        )
      ),
      onAction
        ? h(Button, {
          size: 'sm',
          type: 'default',
          title: m.removePackagePhase,
          onClick: (evt) => {
            evt.stopPropagation()
            onAction(item)
          },
          style: { width: 32, minWidth: 32, height: 32, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }
        }, '🗑️')
        : onRemove
        ? h(Button, {
          size: 'sm',
          type: 'tertiary',
          title: m.removeFromCart,
          onClick: (evt) => {
            evt.stopPropagation()
            onRemove(item)
          },
          style: { width: 28, minWidth: 28, height: 28, padding: 0 }
        }, 'x')
        : null
    )
  }

  const groupedItemsPanel = (
    items: PackageCartItem[],
    emptyMessage: string,
    onRemove?: (item: PackageCartItem) => void,
    onAction?: (item: PackageCartItem) => void,
    onSelect?: (item: PackageCartItem) => void,
    showPropertyMetadata?: boolean,
    showStatusInPrimaryText?: boolean,
    selectedPhaseKeys?: string[],
    onPhaseSelectionToggle?: (item: PackageCartItem) => void
  ) => {
    const itemGroups = groupItemsByLayer(items)
    if (itemGroups.length === 0) return h('div', { style: { fontSize: 12, opacity: 0.75 } }, emptyMessage)
    return h(React.Fragment, null,
      ...itemGroups.map((group) =>
        h('div', { key: group.layerName },
          ...group.items.map((item) => itemRow(
            item,
            onRemove,
            onAction,
            onSelect,
            showPropertyMetadata,
            showStatusInPrimaryText,
            selectedPhaseKeys,
            onPhaseSelectionToggle
          ))
        )
      )
    )
  }

  const displayOptionalValue = (value: any) =>
    value === null || value === undefined || String(value).trim() === '' ? '-' : String(value)

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
            packageIdWasEditedRef.current = true
            generatedPackageIdRef.current = ''
            generatedPackageSourceKeyRef.current = ''
            setDraftPackageId(evt.target.value)
          }
        })
      ),
      h('div', { className: 'd-flex flex-column', style: { gap: '0.35rem' } },
        h('label', { className: 'd-flex align-items-center mb-0', style: { gap: '0.5rem', fontSize: 12 } },
          h(Checkbox, {
            checked: skipPackagedAssets,
            onChange: (_evt, checked) => {
              setSkipPackagedAssets(Boolean(checked))
            }
          }),
          h('span', null, m.skipPackagedAssets)
        ),
        h('label', { className: 'd-flex align-items-center mb-0', style: { gap: '0.5rem', fontSize: 12 } },
          h(Checkbox, {
            checked: uniqueWorkCodes,
            onChange: (_evt, checked) => {
              setUniqueWorkCodes(Boolean(checked))
            }
          }),
          h('span', null, m.uniqueWorkCodes)
        ),
        h('label', { className: 'd-flex align-items-center mb-0', style: { gap: '0.5rem', fontSize: 12 } },
          h(Checkbox, {
            checked: propertyNamesMustMatch,
            onChange: (_evt, checked) => {
              setPropertyNamesMustMatch(Boolean(checked))
            }
          }),
          h('span', null, m.propertyNamesMustMatch)
        )
      ),
      h('div', { className: 'border rounded p-2 d-flex flex-column flex-grow-1', style: { minHeight: 0 } },
        h('div', { className: 'd-flex align-items-center justify-content-between mb-2', style: { gap: '0.5rem' } },
          h('div', { className: 'font-weight-bold', style: { fontSize: 12 } }, m.packageCart),
          h('div', { style: { fontSize: 11, opacity: 0.75 } }, `${cartItems.length} ${m.stagedCountSuffix}`)
        ),
        cartLayerName && h('div', { className: 'mb-2', style: { fontSize: 11, opacity: 0.82 } }, `${m.packageLayer} ${cartLayerName}`),
        h('div', { className: 'flex-grow-1', style: { minHeight: 0, overflowY: 'auto', overflowX: 'hidden' } },
          groupedItemsPanel(cartItems, m.cartEmpty, removeCartItem, undefined, undefined, true)
        )
      ),
      validationWarnings.length > 0
        ? h(Alert, { form: 'basic', type: 'warning', text: `${m.validationPrefix} ${validationWarnings.join(' ')}` })
        : h(Alert, { form: 'basic', type: 'success', text: m.validationReady }),
      h('div', { className: 'd-flex', style: { gap: '0.35rem' } },
        h(Button, {
          type: 'default',
          size: 'sm',
          style: modeActionButtonStyle,
          onClick: clearPackageCart,
          disabled: cartItems.length === 0
        }, m.clearCart),
        h(Button, {
          type: 'primary',
          size: 'sm',
          style: modeActionButtonStyle,
          disabled: !canCreate || submittingPackage,
          onClick: openCreateConfirmation
        }, submittingPackage ? m.creatingPackage : m.createPackage)
      )
    )
  }

  const modifyModeView = () =>
    h('div', { className: 'd-flex flex-column flex-grow-1', style: { gap: '0.75rem', minHeight: 0 } },
      h('div', { className: 'd-flex align-items-center justify-content-between', style: { gap: '0.5rem' } },
        h('div', { className: 'font-weight-bold' }, m.modifyingExistingPackage),
        h(Button, {
          size: 'sm',
          type: 'tertiary',
          onClick: cancelModifyMode
        }, m.cancel)
      ),
      h('div', { className: 'd-flex flex-column', style: { gap: '0.35rem' } },
        h('label', { className: 'd-flex align-items-center mb-0', style: { gap: '0.5rem', fontSize: 12 } },
          h(Checkbox, {
            checked: modifySkipPackagedAssets,
            onChange: (_evt, checked) => {
              setModifySkipPackagedAssets(Boolean(checked))
            }
          }),
          h('span', null, m.skipPackagedAssets)
        ),
        h('label', { className: 'd-flex align-items-center mb-0', style: { gap: '0.5rem', fontSize: 12 } },
          h(Checkbox, {
            checked: modifyUniqueWorkCodes,
            onChange: (_evt, checked) => {
              setModifyUniqueWorkCodes(Boolean(checked))
            }
          }),
          h('span', null, m.uniqueWorkCodes)
        ),
        h('label', { className: 'd-flex align-items-center mb-0', style: { gap: '0.5rem', fontSize: 12 } },
          h(Checkbox, {
            checked: modifyPropertyNamesMustMatch,
            onChange: (_evt, checked) => {
              setModifyPropertyNamesMustMatch(Boolean(checked))
            }
          }),
          h('span', null, m.propertyNamesMustMatch)
        )
      ),
      h('div', { className: 'border rounded p-2 d-flex flex-column', style: { minHeight: 100, flex: '7 1 0' } },
        h('div', { className: 'd-flex align-items-center justify-content-between mb-2', style: { gap: '0.5rem' } },
          h('div', { className: 'font-weight-bold', style: { fontSize: 12 } }, m.selectFeatures),
          h('div', { style: { fontSize: 11, opacity: 0.75 } }, `${modifySelectionItems.length} ${m.stagedFeaturesCountSuffix}`)
        ),
        h('div', { className: 'flex-grow-1', style: { minHeight: 0, overflowY: 'auto', overflowX: 'hidden' } },
          groupedItemsPanel(modifySelectionItems, m.selectFeaturesEmpty, removeModifySelectionItem, undefined, undefined, true)
        ),
        h('div', { className: 'd-flex mt-2', style: { gap: '0.35rem' } },
          h(Button, {
            type: 'default',
            size: 'sm',
            style: modeActionButtonStyle,
            onClick: clearModifySelection,
            disabled: modifySelectionItems.length === 0
          }, m.clearCart),
          h(Button, {
            type: 'primary',
            size: 'sm',
            style: modeActionButtonStyle,
            disabled: modifySelectionItems.length === 0 ||
              submittingPackagePhases ||
              (modifyUniqueWorkCodes && packageWorkCodeConflict) ||
              (modifyPropertyNamesMustMatch && packagePropertyNameConflict),
            onClick: () => {
              submitPackagePhases().catch(() => undefined)
            }
          }, submittingPackagePhases ? m.addingPackagePhases : m.addPhases)
        )
      ),
      h('div', { className: 'border rounded p-2 d-flex flex-column', style: { minHeight: 100, flex: '13 1 0' } },
        h('div', { className: 'd-flex align-items-center justify-content-between mb-2', style: { gap: '0.5rem' } },
          h('div', { className: 'font-weight-bold', style: { fontSize: 12 } }, m.packagePhases),
          h('div', { style: { fontSize: 11, opacity: 0.75 } }, `${packagePhaseItems.length} ${m.featureCountLabel}`)
        ),
        h('div', { className: 'flex-grow-1', style: { minHeight: 0, overflowY: 'auto', overflowX: 'hidden' } },
          loadingPackagePhases
            ? h('div', { style: { fontSize: 12, opacity: 0.75 } }, m.loadingPackagePhases)
            : groupedItemsPanel(packagePhaseItems, m.packagePhasesEmpty, undefined, requestRemovePackagePhase, (item) => {
              selectPackagePhase(item).catch(() => undefined)
            }, true)
        )
      ),
      status && h(Alert, {
        form: 'basic',
        type: (modifyUniqueWorkCodes && packageWorkCodeConflict) ||
          (modifyPropertyNamesMustMatch && packagePropertyNameConflict)
          ? 'warning'
          : 'info',
        text: status
      }),
      h('div', { className: 'd-flex', style: { gap: '0.35rem' } },
        h(Button, {
          type: 'default',
          size: 'sm',
          style: modeActionButtonStyle,
          onClick: () => {
            generateSelectedPackageReport().catch(() => undefined)
          },
          disabled: loadingPackagePhases || packagePhaseItems.length === 0 || generatingReport
        }, generatingReport ? m.generatingReport : m.createReport),
        h(Button, {
          type: 'primary',
          size: 'sm',
          style: modeActionButtonStyle,
          onClick: openCreateWorkOrderConfirmation,
          disabled: loadingPackagePhases || packagePhaseItems.length === 0 || submittingWorkOrder
        }, m.createWorkOrder)
      )
    )

  const reviewWorkOrderModeView = () => {
    const firstPhaseAttributes = packagePhaseItems[0]?.attributes || {}
    const workOrderNumber = displayOptionalValue(getAttributeValue(firstPhaseAttributes, WORK_ORDER_NUMBER_SEARCH_FIELD))
    const packageLayerName = groups.find((group) => group.layerUrl === selectedPackage?.layerUrl)?.layerName ||
      targetLayers.find((layer) => layer.url === selectedPackage?.layerUrl)?.name
    const statusUpdateItems = getWorkOrderStatusUpdateItems()
    const selectedPhaseCount = statusUpdateItems.length
    const statusHasChanged = selectedWorkOrderStatus !== defaultWorkOrderStatus
    const hasConcreteStatus = selectedWorkOrderStatus.trim() !== ''
    const canUpdateStatus = !loadingPackagePhases &&
      packagePhaseItems.length > 0 &&
      statusHasChanged &&
      hasConcreteStatus &&
      selectedPhaseCount > 0

    return h('div', { className: 'd-flex flex-column flex-grow-1', style: { gap: '0.75rem', minHeight: 0 } },
      h('div', { className: 'd-flex align-items-center justify-content-between', style: { gap: '0.5rem' } },
        h('div', { className: 'font-weight-bold' }, m.reviewingWorkOrder),
        h(Button, {
          size: 'sm',
          type: 'tertiary',
          onClick: cancelReviewWorkOrderMode
        }, m.cancel)
      ),
      h('div', { className: 'border rounded p-2', style: { backgroundColor: 'rgba(0, 0, 0, 0.02)' } },
        h('div', { className: 'd-flex flex-wrap', style: { gap: '0.75rem 1rem' } },
          h('div', { className: 'd-flex align-items-center', style: { minWidth: 120, gap: '0.4rem' } },
            h('div', { style: { minWidth: 0 } },
              h('div', { style: { fontSize: 10, opacity: 0.7, fontWeight: 700, textTransform: 'uppercase' } }, m.selectedPackageLabel),
              h('div', { style: { fontSize: 12, fontWeight: 600, overflowWrap: 'anywhere', minWidth: 0 } }, displayOptionalValue(selectedPackage?.id))
            ),
            h(Button, {
              size: 'sm',
              type: 'default',
              title: m.openFolder,
              disabled: !folderBaseUrl || !selectedPackage?.id,
              onClick: () => {
                if (folderBaseUrl && selectedPackage?.id) {
                  window.open(`${folderBaseUrl}/${selectedPackage.id}`, '_blank', 'noopener,noreferrer')
                }
              },
              style: { width: 28, minWidth: 28, height: 28, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }
            }, '📁')
          ),
          h('div', { style: { minWidth: 120 } },
            h('div', { style: { fontSize: 10, opacity: 0.7, fontWeight: 700, textTransform: 'uppercase' } }, m.packageLayerLabel),
            h('div', { style: { fontSize: 12, fontWeight: 600, overflowWrap: 'anywhere' } }, displayOptionalValue(packageLayerName))
          ),
          h('div', { style: { minWidth: 120 } },
            h('div', { style: { fontSize: 10, opacity: 0.7, fontWeight: 700, textTransform: 'uppercase' } }, m.workOrderNumberLabel),
            h('div', { style: { fontSize: 12, fontWeight: 600, overflowWrap: 'anywhere' } }, loadingPackagePhases ? m.loadingPackagePhases : workOrderNumber)
          )
        )
      ),
      h('div', { className: 'border rounded p-2' },
        h('div', { className: 'font-weight-bold mb-2', style: { fontSize: 12 } }, m.workOrderStatusGroupTitle),
        h('div', { className: 'd-flex flex-wrap', style: { gap: '0.5rem' } },
          h('div', { style: { flex: '1 1 170px', minWidth: 0 } },
            h('div', { className: 'mb-1', style: { fontSize: 10, opacity: 0.7, fontWeight: 700, textTransform: 'uppercase' } }, m.workOrderStatusLabel),
            h(Select, {
              className: 'w-100',
              size: 'sm',
              'aria-label': m.workOrderStatusGroupTitle,
              value: selectedWorkOrderStatus,
              disabled: loadingPackagePhases || workOrderStatusOptions.length === 0,
              onChange: (evt, value) => {
                setSelectedWorkOrderStatus(String(value ?? evt?.target?.value ?? ''))
              }
            },
            workOrderStatusOptions.length === 0
              ? h(Option, { value: '' }, loadingPackagePhases ? m.loadingPackagePhases : m.noStatusValues)
              : [
                h(Option, { key: 'empty-status', value: '' }, m.workOrderStatusEmptyOption),
                ...workOrderStatusOptions.map((option) =>
                h(Option, { key: option.value, value: option.value }, option.label)
                )
              ]
            )
          ),
          h('div', { style: { flex: '0 1 130px', minWidth: 120 } },
            h('div', { className: 'mb-1', style: { fontSize: 10, opacity: 0.7, fontWeight: 700, textTransform: 'uppercase' } }, m.updateScopeLabel),
            h(Button, {
              className: 'w-100',
              size: 'sm',
              disabled: loadingPackagePhases || packagePhaseItems.length === 0,
              onClick: selectAllWorkOrderPhases
            }, m.updateScopeAll)
          )
        ),
        h('div', { className: 'mt-2', style: { fontSize: 11, opacity: 0.75 } },
          `${statusUpdateItems.length} ${m.featuresWillBeUpdatedSuffix}`
        )
      ),
      h('div', { className: 'border rounded p-2 d-flex flex-column flex-grow-1', style: { minHeight: 0 } },
        h('div', { className: 'd-flex align-items-center justify-content-between mb-2', style: { gap: '0.5rem' } },
          h('div', { className: 'font-weight-bold', style: { fontSize: 12 } }, m.packagePhases),
          h('div', { className: 'd-flex align-items-center', style: { gap: '0.35rem' } },
            h('div', { style: { fontSize: 11, opacity: 0.75 } }, `${selectedPhaseCount}/${packagePhaseItems.length} ${m.selectedFeaturesSuffix}`),
            h(Button, {
              size: 'sm',
              type: 'tertiary',
              onClick: clearWorkOrderPhaseSelection,
              disabled: loadingPackagePhases || selectedPhaseCount === 0
            }, m.clearSelection)
          )
        ),
        h('div', { className: 'flex-grow-1', style: { minHeight: 0, overflowY: 'auto', overflowX: 'hidden' } },
          loadingPackagePhases
            ? h('div', { style: { fontSize: 12, opacity: 0.75 } }, m.loadingPackagePhases)
            : groupedItemsPanel(packagePhaseItems, m.packagePhasesEmpty, undefined, undefined, (item) => {
              selectPackagePhase(item).catch(() => undefined)
            }, true, true, selectedWorkOrderPhaseKeys, toggleWorkOrderPhaseSelection)
        )
      ),
      status && h(Alert, { form: 'basic', type: 'info', text: status }),
      h('div', { className: 'd-flex', style: { gap: '0.35rem' } },
        h(Button, {
          type: 'default',
          size: 'sm',
          style: modeActionButtonStyle,
          onClick: () => {
            generateSelectedPackageReport('completion').catch(() => undefined)
          },
          disabled: loadingPackagePhases || packagePhaseItems.length === 0 || generatingReport
        }, generatingReport ? m.generatingCompletionReport : m.completionReport),
        h(Button, {
          type: 'primary',
          size: 'sm',
          style: modeActionButtonStyle,
          onClick: () => {
            openUpdateStatusConfirmation()
          },
          disabled: !canUpdateStatus
        }, m.updateStatus)
      )
    )
  }

  const updateStatusConfirmationItems = getWorkOrderStatusUpdateItems()
  const showStatusUpdateFileUpload = selectedStatusRequiresCompletionFile()
  const statusUpdateFilePicker = showStatusUpdateFileUpload && h('div', {
    className: 'mt-2 mb-1 p-2 border rounded',
    style: {
      display: 'inline-block',
      width: 'fit-content',
      maxWidth: '100%',
      backgroundColor: 'transparent',
      borderColor: 'transparent'
    }
  },
    h('label', {
      htmlFor: `${props.id}-status-update-file`,
      className: 'mb-2',
      style: { display: 'block', fontSize: 14, fontWeight: 700 }
    }, m.statusUpdateFileLabel),
    h('input', {
      ref: statusUpdateFileInputRef,
      id: `${props.id}-status-update-file`,
      type: 'file',
      accept: 'application/pdf,image/*',
      onChange: (evt: React.ChangeEvent<HTMLInputElement>) => {
        const file = evt.target.files?.[0] || null
        if (file && !isAcceptedAttachmentFile(file)) {
          evt.target.value = ''
          setStagedStatusUpdateFile(null)
          setStatus(m.workOrderFileTypeInvalid)
          return
        }
        setStagedStatusUpdateFile(file)
      },
      style: { display: 'block', maxWidth: '100%', fontSize: 12 }
    })
  )

  return h(React.Fragment, null,
    props.useMapWidgetIds?.[0] && h(JimuMapViewComponent, {
      useMapWidgetId: props.useMapWidgetIds[0],
      onActiveViewChange: setJimuMapView
    }),
    h(Card, { className: 'h-100 w-100' },
      h(CardHeader, null, m.widgetTitle),
      h(CardBody, { className: 'd-flex flex-column', style: { minHeight: 0 } },
        isCreateMode ? createModeView() : isModifyMode ? modifyModeView() : isReviewWorkOrderMode ? reviewWorkOrderModeView() : h('div', { className: 'd-flex flex-column flex-grow-1', style: { gap: '0.75rem', minHeight: 0 } },
          h('div', { className: 'border rounded p-2 d-flex flex-column flex-grow-1', style: { minHeight: 0 } },
            h('div', { className: 'd-flex align-items-center justify-content-between mb-2', style: { gap: '0.5rem' } },
              h('div', { className: 'font-weight-bold' }, m.packageManagementTitle),
              h(Button, {
                size: 'sm',
                type: 'default',
                onClick: () => {
                  if (packageSearchTerm.trim()) {
                    runPackageSearch(packageSearchTerm).catch(() => undefined)
                  } else {
                    refresh().catch(() => undefined)
                  }
                },
                disabled: loading || searchingPackages
              }, m.refreshList)
            ),
            h('div', { className: 'mb-2' },
              h(TextInput, {
                value: packageSearchTerm,
                placeholder: m.packageSearchPlaceholder,
                onChange: (evt) => {
                  setPackageSearchTerm(evt.target.value)
                }
              }),
              (searchingPackages || (packageSearchTerm.trim().length > 0 && packageSearchTerm.trim().length < PACKAGE_SEARCH_MINIMUM_LENGTH)) &&
                h('div', { className: 'mt-1', style: { fontSize: 10, opacity: 0.7 } },
                  searchingPackages ? m.searchingPackages : m.packageSearchMinimum
                )
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
            h('div', { className: 'd-flex mt-2', style: { gap: '0.35rem' } },
              h(Button, {
                type: 'primary',
                size: 'sm',
                style: compactActionButtonStyle,
                onClick: startCreateMode
              }, m.createPackage),
              h(Button, {
                type: 'default',
                size: 'sm',
                style: compactActionButtonStyle,
                onClick: startModifyMode
              }, m.viewPackage),
              h(Button, {
                type: 'default',
                size: 'sm',
                style: compactActionButtonStyle,
                onClick: startReviewWorkOrderMode
              }, m.viewWorkOrder)
            )
          ),
          h(Alert, { form: 'basic', type: 'info', text: status || m.packageListReady })
        )
      )
    ),
    h(Modal, {
      isOpen: isCreateConfirmationOpen,
      toggle: closeCreateConfirmation,
      centered: true,
      backdrop: 'static'
    },
    h(ModalHeader, { toggle: closeCreateConfirmation }, m.createConfirmationTitle),
    h(ModalBody, null,
      h(Alert, { form: 'basic', type: 'warning', text: m.createConfirmationWarning }),
      h('div', { className: 'mt-2', style: { fontSize: 13 } },
        `${m.createConfirmationPackageLabel} ${draftPackageId.trim()}`
      ),
      h('div', { className: 'mt-1', style: { fontSize: 13 } },
        `${m.createConfirmationFeatureCountLabel} ${cartItems.length}`
      ),
      h('div', { className: 'mt-2', style: { fontSize: 12, opacity: 0.8 } }, m.createConfirmationDetail)
    ),
    h(ModalFooter, null,
      h(Button, { type: 'default', onClick: closeCreateConfirmation, disabled: submittingPackage }, m.cancel),
      h(Button, { type: 'primary', onClick: confirmCreatePackage, disabled: submittingPackage }, m.confirmCreatePackage)
    )),
    h(Modal, {
      isOpen: isCreateWorkOrderConfirmationOpen,
      toggle: closeCreateWorkOrderConfirmation,
      centered: true,
      backdrop: 'static'
    },
    h(ModalHeader, { toggle: closeCreateWorkOrderConfirmation }, m.createWorkOrderConfirmationTitle),
    h(ModalBody, null,
      h(Alert, { form: 'basic', type: 'warning', text: m.createWorkOrderConfirmationWarning }),
      h('div', { className: 'mt-2', style: { fontSize: 13 } },
        `${m.deleteConfirmationPackageLabel} ${selectedPackage?.id || ''}`
      ),
      h('div', { className: 'mt-1', style: { fontSize: 13 } },
        `${m.createWorkOrderFeatureCountLabel} ${packagePhaseItems.length}`
      ),
      h('div', { className: 'mt-3' },
        h('label', {
          htmlFor: `${props.id}-work-order-file`,
          className: 'mb-2',
          style: { display: 'block', fontSize: 12, fontWeight: 600 }
        }, m.workOrderFileLabel),
        h('input', {
          ref: workOrderFileInputRef,
          id: `${props.id}-work-order-file`,
          type: 'file',
          accept: 'application/pdf,image/*',
          onChange: (evt: React.ChangeEvent<HTMLInputElement>) => {
            const file = evt.target.files?.[0] || null
            if (file && !isAcceptedAttachmentFile(file)) {
              evt.target.value = ''
              setStagedWorkOrderFile(null)
              setStatus(m.workOrderFileTypeInvalid)
              return
            }
            setStagedWorkOrderFile(file)
            setWorkOrderApiResponse(null)
          },
          style: { display: 'block', width: '100%', fontSize: 12 }
        }),
        !stagedWorkOrderFile && h('div', {
          className: 'mt-2',
          style: { fontSize: 12, color: 'var(--sys-color-error-main)' }
        }, m.workOrderFileRequired)
      ),
      h('div', { className: 'mt-3', style: { fontSize: 12, opacity: 0.8, lineHeight: 1.45 } }, m.createWorkOrderConfirmationDetail),
      workOrderApiResponse && h('div', { className: 'mt-3' },
        h(Alert, {
          form: 'basic',
          type: workOrderApiResponse.ok ? 'success' : 'warning',
          text: workOrderApiResponse.ok ? m.workOrderApiSuccess : m.workOrderApiFailure
        }),
        h('div', { className: 'mt-2', style: { fontSize: 12, fontWeight: 600 } },
          workOrderApiResponse.status
            ? `${m.workOrderApiStatus} ${workOrderApiResponse.status}`
            : m.workOrderApiNetworkError
        ),
        h('pre', {
          className: 'mt-2 mb-0 p-2 border rounded',
          style: {
            maxHeight: 180,
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
            fontSize: 11
          }
        }, workOrderApiResponse.text)
      )
    ),
    h(ModalFooter, null,
      h(Button, { type: 'default', onClick: closeCreateWorkOrderConfirmation, disabled: submittingWorkOrder }, workOrderApiResponse?.ok ? m.close : m.cancel),
      !workOrderApiResponse?.ok && h(Button, {
        type: 'primary',
        onClick: () => {
          confirmCreateWorkOrder().catch(() => undefined)
        },
        disabled: !stagedWorkOrderFile || submittingWorkOrder
      }, submittingWorkOrder ? m.creatingWorkOrder : workOrderApiResponse ? m.retryCreateWorkOrder : m.confirmCreateWorkOrder)
    )),
    h(Modal, {
      isOpen: isUpdateStatusConfirmationOpen,
      toggle: closeUpdateStatusConfirmation,
      centered: true,
      backdrop: 'static'
    },
    h(ModalHeader, { toggle: closeUpdateStatusConfirmation }, m.updateStatusConfirmationTitle),
    h(ModalBody, null,
      h(Alert, { form: 'basic', type: 'warning', text: m.updateStatusConfirmationWarning }),
      h('div', { className: 'mt-2', style: { fontSize: 14, fontWeight: 700 } },
        `${m.targetStatusLabel} ${getSelectedWorkOrderStatusLabel()}`
      ),
      h('div', { className: 'mt-2', style: { fontSize: 14, fontWeight: 700 } },
        `${m.createWorkOrderFeatureCountLabel} ${updateStatusConfirmationItems.length} of ${packagePhaseItems.length}`
      ),
      h('div', { className: 'mt-3', style: { fontSize: 12, fontWeight: 600 } }, m.affectedFeaturesLabel),
      h('div', {
        className: 'mt-1 border rounded p-2',
        style: { maxHeight: 160, overflowY: 'auto', fontSize: 12 }
      },
      ...updateStatusConfirmationItems.slice(0, 10).map((item) =>
        h('div', { key: item.key }, `${m.objectIdPrefix} ${item.objectId} | ${m.currentStatusPrefix} ${getPhaseStatusLabel(item)}`)
      ),
      updateStatusConfirmationItems.length > 10 &&
        h('div', { className: 'mt-1', style: { opacity: 0.75 } },
          `+ ${updateStatusConfirmationItems.length - 10} ${m.moreFeaturesLabel}`
        )
      ),
      statusUpdateFilePicker
    ),
    h(ModalFooter, null,
      h(Button, { type: 'default', onClick: closeUpdateStatusConfirmation }, m.cancel),
      h(Button, { type: 'primary', onClick: confirmUpdateWorkOrderStatus }, m.confirmUpdateStatus)
    )),
    h(Modal, {
      isOpen: isDeleteConfirmationOpen,
      toggle: closeDeleteConfirmation,
      centered: true,
      backdrop: 'static'
    },
    h(ModalHeader, { toggle: closeDeleteConfirmation }, m.deleteConfirmationTitle),
    h(ModalBody, null,
      h(Alert, { form: 'basic', type: 'warning', text: m.deleteConfirmationWarning }),
      h('div', { className: 'mt-2', style: { fontSize: 13 } },
        `${m.deleteConfirmationPackageLabel} ${selectedPackage?.id || ''}`
      ),
      h('div', { className: 'mt-2', style: { fontSize: 12, opacity: 0.8 } }, m.deleteConfirmationDetail)
    ),
    h(ModalFooter, null,
      h(Button, { type: 'default', onClick: closeDeleteConfirmation }, m.cancel),
      h(Button, { type: 'danger', onClick: confirmDeletePackage }, m.confirmDeletePackage)
    )),
    h(Modal, {
      isOpen: Boolean(phasePendingRemoval),
      toggle: closeRemovePhaseConfirmation,
      centered: true,
      backdrop: 'static'
    },
    h(ModalHeader, { toggle: closeRemovePhaseConfirmation }, m.removePhaseConfirmationTitle),
    h(ModalBody, null,
      h(Alert, { form: 'basic', type: 'warning', text: m.removePhaseConfirmationWarning }),
      h('div', { className: 'mt-2', style: { fontSize: 13 } },
        `${m.deleteConfirmationPackageLabel} ${selectedPackage?.id || ''}`
      ),
      h('div', { className: 'mt-1', style: { fontSize: 13 } },
        `${m.objectIdPrefix} ${phasePendingRemoval?.objectId || ''}`
      ),
      h('div', { className: 'mt-2', style: { fontSize: 12, opacity: 0.8 } }, m.removePhaseConfirmationDetail)
    ),
    h(ModalFooter, null,
      h(Button, { type: 'default', onClick: closeRemovePhaseConfirmation }, m.cancel),
      h(Button, { type: 'danger', onClick: confirmRemovePackagePhase }, m.confirmRemovePackagePhase)
    ))
  )
}

export default Widget
