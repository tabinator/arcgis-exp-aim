import {
  DataRecordsSelectionChangeMessage,
  DataSourceManager,
  MessageManager,
  React,
  ReactRedux,
  type AllWidgetProps,
  type DataRecord,
  type IMState
} from 'jimu-core'
import { JimuMapViewComponent, loadArcGISJSAPIModules } from 'jimu-arcgis'
import { Alert, Button, Card, CardBody, CardHeader, Checkbox, TextInput } from 'jimu-ui'
import {
  DEFAULT_MONUMENT_HISTORY_TABLE_URL,
  DEFAULT_MONUMENT_PROJECTS_LAYER_URL,
  DEFAULT_SURVEY_MONUMENTS_LAYER_URL,
  DEFAULT_TRAVERSE_CONNECTIONS_LAYER_URL
} from '../config'
import type { IMConfig } from '../config'
import defaultMessages from './translations/default'

type MonumentMode = 'finder' | 'history' | 'create' | 'traverse' | 'update-xy'

interface ModeDefinition {
  id: MonumentMode
  label: string
  title: string
}

interface MonumentProjectSummary {
  objectId: number | string
  globalId?: string
  name: string
  jobNo?: string
  fileNo?: string
  surveyYear?: number | string
  folderUrl?: string
  historyCount: number
}

interface MonumentHistorySummary {
  objectId: number | string
  globalId?: string
  monumentGlobalId?: string
  projectGlobalId?: string
  projectName?: string
  pointNumber: string
  status: string
  monumentType: string
  embeddedIn: string
  markerType: string
  markerMaterial: string
}

interface SurveyMonumentSummary {
  objectId: number | string
  globalId?: string
  pointNumber: string
  monumentType: string
  status: string
}

interface QueryResponse {
  features?: Array<{ attributes?: { [key: string]: any }, geometry?: any }>
  geometryType?: string
  spatialReference?: any
  error?: { message?: string }
}

const PROJECT_COMPLETED_FIELD = 'FieldWorkComp'
const PROJECT_SEARCH_MINIMUM_LENGTH = 3
const PROJECT_QUERY_LIMIT = 100
const HISTORY_QUERY_LIMIT = 2000
const MONUMENT_GLOBAL_ID_QUERY_CHUNK_SIZE = 50
const SURVEY_MONUMENTS_LAYER_ID = '999066'
const MONUMENT_HISTORY_LAYER_ID = '999069'

const escapeSqlString = (value: string) => value.replace(/'/g, "''")

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

const urlCandidatesMatch = (targetUrl: string, candidates: string[]) => {
  const normalizedTarget = normalizeUrl(targetUrl)
  const targetServiceKey = getServiceLayerKey(targetUrl)
  return candidates.some((candidate) => {
    const normalizedCandidate = normalizeUrl(candidate)
    const candidateServiceKey = getServiceLayerKey(candidate)
    return normalizedCandidate === normalizedTarget || candidateServiceKey === targetServiceKey
  })
}

const getAttributeValue = (attributes: { [key: string]: any }, key: string) => {
  if (!attributes) return undefined
  if (attributes[key] !== undefined) return attributes[key]
  const matchingKey = Object.keys(attributes).find((attributeKey) => attributeKey.toLowerCase() === key.toLowerCase())
  return matchingKey ? attributes[matchingKey] : undefined
}

const getStringAttribute = (attributes: { [key: string]: any }, key: string) => {
  const value = getAttributeValue(attributes, key)
  if (value === null || value === undefined) return ''
  return String(value)
}

const collectMatchingDataSourceIds = (
  appConfig: any,
  targetUrl: string,
  layerNamePattern: RegExp,
  layerIdText: string
) => {
  const dataSources: { [id: string]: any } = appConfig?.dataSources || {}
  const matches: string[] = []

  const addMatch = (dataSourceId?: string) => {
    if (dataSourceId && !matches.includes(dataSourceId)) matches.push(dataSourceId)
  }

  const visit = (dataSourceJson: any) => {
    if (!dataSourceJson?.id) return
    const dataSourceUrl = normalizeUrl(dataSourceJson.url)
    const dataSourceLayerUrl = dataSourceJson.url && dataSourceJson.layerId !== undefined
      ? normalizeUrl(`${dataSourceJson.url}/${dataSourceJson.layerId}`)
      : dataSourceUrl
    if (urlCandidatesMatch(targetUrl, [dataSourceUrl, dataSourceLayerUrl])) {
      addMatch(dataSourceJson.id)
    }
    Object.keys(dataSourceJson.childDataSourceJsons || {}).forEach((childId) => {
      visit(dataSourceJson.childDataSourceJsons[childId])
    })
  }

  Object.keys(dataSources).forEach((dataSourceId) => {
    visit(dataSources[dataSourceId])
  })

  Object.values(appConfig?.widgets || {}).forEach((widget: any) => {
    ;(widget?.config?.layersConfig || []).forEach((layerConfig: any) => {
      const layerText = JSON.stringify({
        id: layerConfig?.id,
        name: layerConfig?.name,
        useDataSource: layerConfig?.useDataSource
      })
      const isTargetLayer = layerNamePattern.test(layerText) || layerText.includes(layerIdText)
      const dataSourceId = layerConfig?.useDataSource?.dataSourceId || layerConfig?.id
      if (isTargetLayer) addMatch(dataSourceId)
    })
  })

  return matches.sort().join('|')
}

const Widget = (props: AllWidgetProps<IMConfig>) => {
  const h = React.createElement
  const m = defaultMessages
  const cfg: any = props.config || {}
  const [mode, setMode] = React.useState<MonumentMode>('finder')
  const [jimuMapView, setJimuMapView] = React.useState<any>(null)
  const [projects, setProjects] = React.useState<MonumentProjectSummary[]>([])
  const [selectedProject, setSelectedProject] = React.useState<MonumentProjectSummary | null>(null)
  const [historyItems, setHistoryItems] = React.useState<MonumentHistorySummary[]>([])
  const [selectedHistoryKeys, setSelectedHistoryKeys] = React.useState<string[]>([])
  const [activeHistoryKey, setActiveHistoryKey] = React.useState('')
  const [assignSurveyMonuments, setAssignSurveyMonuments] = React.useState<SurveyMonumentSummary[]>([])
  const [activeAssignSurveyKey, setActiveAssignSurveyKey] = React.useState('')
  const [assignHistoryItems, setAssignHistoryItems] = React.useState<MonumentHistorySummary[]>([])
  const [activeAssignHistoryKey, setActiveAssignHistoryKey] = React.useState('')
  const [selectedMapFeatures, setSelectedMapFeatures] = React.useState<any[]>([])
  const [projectSearchTerm, setProjectSearchTerm] = React.useState('')
  const [loadingProjects, setLoadingProjects] = React.useState(false)
  const [projectError, setProjectError] = React.useState('')
  const [loadingHistory, setLoadingHistory] = React.useState(false)
  const [historyError, setHistoryError] = React.useState('')
  const [loadingAssignHistory, setLoadingAssignHistory] = React.useState(false)
  const [status, setStatus] = React.useState(m.statusReady)
  const searchInitializedRef = React.useRef(false)
  const projectLayerFiltersRef = React.useRef(new Map<string, { layer: any, definitionExpression: string | null | undefined }>())
  const monumentGraphicsLayerRef = React.useRef<any>(null)
  const monumentGraphicsMapRef = React.useRef<any>(null)
  const suppressAssignSurveySelectionSyncRef = React.useRef(false)

  const workflowModes: ModeDefinition[] = [
    { id: 'history', label: m.viewHistoryMode, title: m.viewHistoryTitle },
    { id: 'create', label: m.createMode, title: m.assignProjectTitle },
    { id: 'traverse', label: m.traverseMode, title: m.traverseTitle },
    { id: 'update-xy', label: m.updateXyMode, title: m.updateXyTitle }
  ]

  const activeMode = workflowModes.find((item) => item.id === mode) || workflowModes[0]
  const configuredSources = [
    { label: m.surveyMonumentsLayer, value: cfg.surveyMonumentsLayerUrl || DEFAULT_SURVEY_MONUMENTS_LAYER_URL },
    { label: m.monumentProjectsLayer, value: cfg.monumentProjectsLayerUrl || DEFAULT_MONUMENT_PROJECTS_LAYER_URL },
    { label: m.traverseConnectionsLayer, value: cfg.traverseConnectionsLayerUrl || DEFAULT_TRAVERSE_CONNECTIONS_LAYER_URL },
    { label: m.monumentHistoryTable, value: cfg.monumentHistoryTableUrl || DEFAULT_MONUMENT_HISTORY_TABLE_URL }
  ]
  const monumentProjectsUrl = cfg.monumentProjectsLayerUrl || DEFAULT_MONUMENT_PROJECTS_LAYER_URL
  const surveyMonumentsUrl = cfg.surveyMonumentsLayerUrl || DEFAULT_SURVEY_MONUMENTS_LAYER_URL
  const monumentHistoryUrl = cfg.monumentHistoryTableUrl || DEFAULT_MONUMENT_HISTORY_TABLE_URL
  const projectDisplayField = cfg.projectDisplayField || 'Name'
  const projectGlobalIdField = cfg.projectGlobalIdField || 'GlobalID'
  const monumentGlobalIdField = cfg.monumentGlobalIdField || 'GlobalID'
  const historyMonumentGlobalIdField = cfg.historyMonumentGlobalIdField || 'PointGlobalID'
  const historyProjectGlobalIdField = cfg.historyProjectGlobalIdField || 'ProjectGlobalID'
  const configuredMonumentHistoryDataSourceIds = React.useMemo(
    () => (props.useDataSources || [])
      .map((useDataSource: any) => useDataSource?.dataSourceId)
      .filter(Boolean),
    [props.useDataSources]
  )
  const monumentHistoryDataSourceIdsKey = ReactRedux.useSelector((state: IMState) => {
    const appConfig: any = (state as any).appConfig || (state as any).appStateInBuilder?.appConfig
    return collectMatchingDataSourceIds(appConfig, monumentHistoryUrl, /monument history/i, MONUMENT_HISTORY_LAYER_ID)
  })
  const monumentHistoryDataSourceIds = React.useMemo(
    () => Array.from(new Set([
      ...configuredMonumentHistoryDataSourceIds,
      ...(monumentHistoryDataSourceIdsKey ? monumentHistoryDataSourceIdsKey.split('|') : [])
    ])),
    [configuredMonumentHistoryDataSourceIds, monumentHistoryDataSourceIdsKey]
  )
  const surveyMonumentDataSourceIdsKey = ReactRedux.useSelector((state: IMState) => {
    const appConfig: any = (state as any).appConfig || (state as any).appStateInBuilder?.appConfig
    return collectMatchingDataSourceIds(appConfig, surveyMonumentsUrl, /survey monuments/i, SURVEY_MONUMENTS_LAYER_ID)
  })
  const surveyMonumentDataSourceIds = React.useMemo(
    () => surveyMonumentDataSourceIdsKey ? surveyMonumentDataSourceIdsKey.split('|') : [],
    [surveyMonumentDataSourceIdsKey]
  )
  const surveyMonumentSelectionKey = ReactRedux.useSelector((state: IMState) =>
    surveyMonumentDataSourceIds
      .map((dataSourceId) => {
        const selectedIds = (state as any).dataSourcesInfo?.[dataSourceId]?.selectedIds || []
        return `${dataSourceId}:${selectedIds.join(',')}`
      })
      .join('|')
  )

  const modeButtonStyle: React.CSSProperties = {
    flex: '1 1 0',
    minWidth: 0,
    height: 32,
    padding: '0 6px',
    fontSize: 11,
    lineHeight: '14px',
    whiteSpace: 'normal',
    textAlign: 'center'
  }

  const modeActionButtonStyle: React.CSSProperties = {
    height: 30,
    padding: '0 10px',
    fontSize: 11,
    lineHeight: '14px',
    whiteSpace: 'nowrap',
    textAlign: 'center'
  }

  const metadataRow = (label: string, value?: string) =>
    h('div', { className: 'd-flex justify-content-between', style: { gap: '0.75rem', fontSize: 12 } },
      h('span', { style: { opacity: 0.72 } }, label),
      h('span', { style: { fontWeight: 600, minWidth: 0, overflowWrap: 'anywhere', textAlign: 'right' } }, value || '-')
    )

  const displayOptionalValue = (value: any) =>
    value === null || value === undefined || String(value).trim() === '' ? '-' : String(value)

  const toProjectSummary = React.useCallback((attributes: { [key: string]: any }): MonumentProjectSummary => ({
    objectId: attributes.OBJECTID,
    globalId: getStringAttribute(attributes, projectGlobalIdField),
    name: getStringAttribute(attributes, projectDisplayField) || getStringAttribute(attributes, 'Name') || `Project ${attributes.OBJECTID}`,
    jobNo: getStringAttribute(attributes, 'JobNo'),
    fileNo: getStringAttribute(attributes, 'FileNo'),
    surveyYear: attributes.SurveyYear,
    folderUrl: getStringAttribute(attributes, 'Folder'),
    historyCount: 0
  }), [projectDisplayField, projectGlobalIdField])

  const toHistorySummary = React.useCallback((attributes: { [key: string]: any }): MonumentHistorySummary => ({
    objectId: attributes.OBJECTID,
    globalId: getStringAttribute(attributes, 'GlobalID'),
    monumentGlobalId: getStringAttribute(attributes, historyMonumentGlobalIdField),
    projectGlobalId: getStringAttribute(attributes, historyProjectGlobalIdField),
    pointNumber: displayOptionalValue(attributes.PointNumber),
    status: displayOptionalValue(attributes.Status),
    monumentType: displayOptionalValue(attributes.Type),
    embeddedIn: displayOptionalValue(attributes.EmbeddedIn),
    markerType: displayOptionalValue(attributes.MarkerType ?? attributes.MarkingType),
    markerMaterial: displayOptionalValue(attributes.MarkerMaterial ?? attributes.MarkingMaterial)
  }), [historyMonumentGlobalIdField, historyProjectGlobalIdField])

  const getHistoryKey = (item: MonumentHistorySummary) => String(item.globalId || item.objectId)

  const getRecordAttributes = (record: any) =>
    record?.getDataBeforeMapping?.() || record?.feature?.attributes || record?.getData?.() || {}

  const hasAttribute = (attributes: { [key: string]: any }, key: string) =>
    Object.keys(attributes || {}).some((attributeKey) => attributeKey.toLowerCase() === key.toLowerCase())

  const isSurveyMonumentAttributes = React.useCallback((attributes: { [key: string]: any }) =>
    !hasAttribute(attributes, historyMonumentGlobalIdField) &&
    !hasAttribute(attributes, historyProjectGlobalIdField),
  [historyMonumentGlobalIdField, historyProjectGlobalIdField])

  const toSurveyMonumentSummary = React.useCallback((attributes: { [key: string]: any }): SurveyMonumentSummary => ({
    objectId: getAttributeValue(attributes, 'OBJECTID'),
    globalId: getStringAttribute(attributes, monumentGlobalIdField),
    pointNumber: displayOptionalValue(getAttributeValue(attributes, cfg.monumentPointNumberField || 'PointNumber')),
    monumentType: displayOptionalValue(getAttributeValue(attributes, 'Type')),
    status: displayOptionalValue(getAttributeValue(attributes, 'Status'))
  }), [cfg.monumentPointNumberField, monumentGlobalIdField])

  const getSurveyMonumentKey = (item: SurveyMonumentSummary) => String(item.objectId)

  const loadHistoryCounts = React.useCallback(async (projectGlobalIds: string[]) => {
    const uniqueIds = Array.from(new Set(projectGlobalIds.filter(Boolean)))
    if (uniqueIds.length === 0) return new Map<string, number>()

    const counts = new Map<string, number>()
    const batchSize = 50
    for (let index = 0; index < uniqueIds.length; index += batchSize) {
      const batch = uniqueIds.slice(index, index + batchSize)
      const query = new URL(`${monumentHistoryUrl}/query`)
      query.search = new URLSearchParams({
        where: `${historyProjectGlobalIdField} IN (${batch.map((id) => `'${escapeSqlString(id)}'`).join(',')})`,
        groupByFieldsForStatistics: historyProjectGlobalIdField,
        outStatistics: JSON.stringify([{
          statisticType: 'count',
          onStatisticField: 'OBJECTID',
          outStatisticFieldName: 'history_count'
        }]),
        returnGeometry: 'false',
        f: 'json'
      }).toString()

      const response = await fetch(query.toString())
      const data = await response.json() as QueryResponse
      if (!response.ok || data.error) throw new Error(data.error?.message || response.statusText)

      ;(data.features || []).forEach((feature) => {
        const attributes = feature.attributes || {}
        const projectId = getStringAttribute(attributes, historyProjectGlobalIdField)
        const countValue = attributes.history_count ?? attributes.HISTORY_COUNT ?? attributes.History_Count ?? 0
        counts.set(projectId, Number(countValue) || 0)
      })
    }

    return counts
  }, [historyProjectGlobalIdField, monumentHistoryUrl])

  const loadProjectNamesByGlobalIds = React.useCallback(async (projectGlobalIds: string[]) => {
    const uniqueIds = Array.from(new Set(projectGlobalIds.filter(Boolean)))
    if (uniqueIds.length === 0) return new Map<string, string>()

    const names = new Map<string, string>()
    const batchSize = 50
    for (let index = 0; index < uniqueIds.length; index += batchSize) {
      const batch = uniqueIds.slice(index, index + batchSize)
      const query = new URL(`${monumentProjectsUrl}/query`)
      query.search = new URLSearchParams({
        where: `${projectGlobalIdField} IN (${batch.map((id) => `'${escapeSqlString(id)}'`).join(',')})`,
        outFields: [
          projectGlobalIdField,
          projectDisplayField
        ].join(','),
        returnGeometry: 'false',
        resultRecordCount: String(PROJECT_QUERY_LIMIT),
        f: 'json'
      }).toString()

      const response = await fetch(query.toString())
      const data = await response.json() as QueryResponse
      if (!response.ok || data.error) throw new Error(data.error?.message || response.statusText)

      ;(data.features || []).forEach((feature) => {
        const attributes = feature.attributes || {}
        const projectId = getStringAttribute(attributes, projectGlobalIdField)
        const projectName = getStringAttribute(attributes, projectDisplayField) || projectId
        if (projectId) names.set(projectId, projectName)
      })
    }

    return names
  }, [monumentProjectsUrl, projectDisplayField, projectGlobalIdField])

  const loadProjectHistory = React.useCallback(async (project: MonumentProjectSummary) => {
    if (!project.globalId) {
      setHistoryItems([])
      setHistoryError(m.historyMissingProjectId)
      setStatus(m.historyMissingProjectId)
      return
    }

    setLoadingHistory(true)
    setHistoryError('')

    try {
      const query = new URL(`${monumentHistoryUrl}/query`)
      query.search = new URLSearchParams({
        where: `${historyProjectGlobalIdField} = '${escapeSqlString(project.globalId)}'`,
        outFields: [
          'OBJECTID',
          'GlobalID',
          historyProjectGlobalIdField,
          historyMonumentGlobalIdField,
          'PointNumber',
          'Status',
          'Type',
          'EmbeddedIn',
          'MarkingType',
          'MarkingMaterial'
        ].join(','),
        returnGeometry: 'false',
        orderByFields: 'PointNumber ASC',
        resultRecordCount: String(HISTORY_QUERY_LIMIT),
        f: 'json'
      }).toString()

      const response = await fetch(query.toString())
      const data = await response.json() as QueryResponse
      if (!response.ok || data.error) throw new Error(data.error?.message || response.statusText)

      const nextHistoryItems = (data.features || [])
        .map((feature) => toHistorySummary(feature.attributes || {}))
        .filter((item) => item.objectId !== undefined && item.objectId !== null)
        .sort((left, right) => left.pointNumber.localeCompare(right.pointNumber, undefined, { numeric: true, sensitivity: 'base' }))
      setHistoryItems(nextHistoryItems)
      setSelectedHistoryKeys((current) => {
        const nextKeys = new Set(nextHistoryItems.map(getHistoryKey))
        return current.filter((key) => nextKeys.has(key))
      })
      setActiveHistoryKey((current) => {
        const nextKeys = new Set(nextHistoryItems.map(getHistoryKey))
        return nextKeys.has(current) ? current : ''
      })
      setStatus(`${m.historyLoaded} ${nextHistoryItems.length}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : m.historyLoadFailed
      setHistoryError(message)
      setStatus(m.historyLoadFailed)
    } finally {
      setLoadingHistory(false)
    }
  }, [historyMonumentGlobalIdField, historyProjectGlobalIdField, m.historyLoaded, m.historyLoadFailed, m.historyMissingProjectId, monumentHistoryUrl, toHistorySummary])

  const buildProjectWhere = React.useCallback((rawSearchText: string) => {
    const term = rawSearchText.trim()
    const activeWhere = `${PROJECT_COMPLETED_FIELD} = 0`
    if (term.length < PROJECT_SEARCH_MINIMUM_LENGTH) return activeWhere

    const escaped = escapeSqlString(term.toUpperCase())
    const textSearch = [
      `UPPER(${projectDisplayField}) LIKE '%${escaped}%'`,
      `UPPER(JobNo) LIKE '%${escaped}%'`,
      `UPPER(FileNo) LIKE '%${escaped}%'`
    ]
    if (/^\d{4}$/.test(term)) textSearch.push(`SurveyYear = ${term}`)

    return `${activeWhere} AND (${textSearch.join(' OR ')})`
  }, [projectDisplayField])

  const getLayerKey = (layer: any, fallback: string) => String(layer?.uid || layer?.id || fallback)

  const dataSourceMatchesUrl = React.useCallback((dataSource: any, targetUrl: string) => {
    const dataSourceJson = dataSource?.getDataSourceJson?.()
    const dataSourceLayerId = dataSourceJson?.layerId ?? dataSource?.layerId
    const dataSourceUrl = dataSourceJson?.url || dataSource?.url
    const candidates = [
      dataSourceUrl,
      dataSourceUrl && dataSourceLayerId !== undefined ? `${String(dataSourceUrl).replace(/\/+$/, '')}/${dataSourceLayerId}` : ''
    ].filter(Boolean).map(String)
    return urlCandidatesMatch(targetUrl, candidates)
  }, [])

  const getRuntimeDataSources = React.useCallback(async (targetUrl: string, configuredDataSourceIds: string[] = []) => {
    const dataSourceManager = DataSourceManager.getInstance()
    const dataSources: any[] = []
    const addDataSource = (dataSource: any, force = false) => {
      if (!dataSource) return
      if (!force && !dataSourceMatchesUrl(dataSource, targetUrl)) return
      if (!dataSources.some((existing) => existing.id === dataSource.id)) dataSources.push(dataSource)
    }

    for (const dataSourceId of configuredDataSourceIds) {
      try {
        addDataSource(dataSourceManager.getDataSource(dataSourceId) || await dataSourceManager.createDataSource(dataSourceId), true)
      } catch {
        // Keep trying runtime/map-created data sources.
      }
    }

    dataSourceManager.getDataSourcesAsArray?.().forEach(addDataSource)

    await jimuMapView?.whenAllJimuLayerViewLoaded?.()
    const layerViews = jimuMapView?.getAllLoadedJimuLayerViews?.() || []
    for (const layerView of layerViews) {
      let layerDataSource = layerView.getLayerDataSource?.()
      if (!layerDataSource && layerView.createLayerDataSource) {
        try {
          layerDataSource = await layerView.createLayerDataSource()
        } catch {
          layerDataSource = null
        }
      }
      addDataSource(layerDataSource)
    }

    return dataSources
  }, [dataSourceMatchesUrl, jimuMapView])

  const getMonumentHistoryRuntimeDataSources = React.useCallback(async () =>
    getRuntimeDataSources(monumentHistoryUrl, monumentHistoryDataSourceIds),
  [getRuntimeDataSources, monumentHistoryDataSourceIds, monumentHistoryUrl])

  const getSurveyMonumentRuntimeDataSources = React.useCallback(async () =>
    getRuntimeDataSources(surveyMonumentsUrl, surveyMonumentDataSourceIds),
  [getRuntimeDataSources, surveyMonumentDataSourceIds, surveyMonumentsUrl])

  const selectMonumentHistoryRecord = React.useCallback(async (objectId?: string | number | null) => {
    const dataSources = await getMonumentHistoryRuntimeDataSources()
    for (const dataSource of dataSources) {
      try {
        let jimuLayerView: any = null
        try {
          jimuLayerView = jimuMapView?.getJimuLayerViewByDataSourceId?.(dataSource.id) ||
            (dataSource ? await jimuMapView?.whenJimuLayerViewLoadedByDataSource?.(dataSource) : null)
        } catch {
          jimuLayerView = null
        }

        if (objectId === null || objectId === undefined || objectId === '') {
          MessageManager.getInstance().publishMessage(
            new DataRecordsSelectionChangeMessage(props.id, [], [dataSource.id])
          )
          dataSource.clearSelection?.()
          jimuLayerView?.selectFeaturesByIds?.([])
        } else {
          const queryObjectId = typeof objectId === 'number' ? objectId : Number(objectId)
          const queryObjectIds = Number.isFinite(queryObjectId) ? [queryObjectId] : [objectId]
          let records: DataRecord[] = []
          try {
            const queryResult = await dataSource.query?.({
              objectIds: queryObjectIds,
              outFields: ['*'],
              returnGeometry: true
            })
            records = queryResult?.records || []
          } catch {
            records = []
          }
          const selectedIds = records.length > 0 ? records.map((record) => record.getId()) : queryObjectIds
          MessageManager.getInstance().publishMessage(
            new DataRecordsSelectionChangeMessage(props.id, records, [dataSource.id])
          )
          dataSource.selectRecordsByIds?.(selectedIds, records)
          jimuLayerView?.selectFeaturesByIds?.(selectedIds, records)
        }
      } catch {
        // Table selection should not block drawing the active monument graphic.
      }
    }
  }, [getMonumentHistoryRuntimeDataSources, jimuMapView, props.id])

  const loadSurveyMonumentsByObjectIds = React.useCallback(async (objectIds: Array<string | number>) => {
    const numericObjectIds = Array.from(new Set(objectIds
      .map((objectId) => typeof objectId === 'number' ? objectId : Number(objectId))
      .filter((objectId) => Number.isFinite(objectId))))
    if (numericObjectIds.length === 0) return new Map<string, SurveyMonumentSummary>()

    const monuments = new Map<string, SurveyMonumentSummary>()
    for (let offset = 0; offset < numericObjectIds.length; offset += MONUMENT_GLOBAL_ID_QUERY_CHUNK_SIZE) {
      const ids = numericObjectIds.slice(offset, offset + MONUMENT_GLOBAL_ID_QUERY_CHUNK_SIZE)
      const query = new URL(`${surveyMonumentsUrl}/query`)
      query.search = new URLSearchParams({
        objectIds: ids.join(','),
        outFields: '*',
        returnGeometry: 'false',
        f: 'json'
      }).toString()

      const response = await fetch(query.toString())
      const data = await response.json() as QueryResponse
      if (!response.ok || data.error) throw new Error(data.error?.message || response.statusText)

      ;(data.features || []).forEach((feature) => {
        const item = toSurveyMonumentSummary(feature.attributes || {})
        monuments.set(String(item.objectId), item)
      })
    }

    return monuments
  }, [surveyMonumentsUrl, toSurveyMonumentSummary])

  const loadSelectedSurveyMonuments = React.useCallback(async () => {
    if (suppressAssignSurveySelectionSyncRef.current) return

    const dataSources = await getSurveyMonumentRuntimeDataSources()
    const records: DataRecord[] = []

    for (const dataSource of dataSources) {
      const selectedIds = dataSource.getSelectedRecordIds?.() || []
      if (selectedIds.length === 0) continue

      const selectedRecords = dataSource.getSelectedRecords?.() || []
      records.push(...selectedRecords)

      if (selectedRecords.length < selectedIds.length) {
        try {
          const queryObjectIds = selectedIds
            .map((id) => typeof id === 'number' ? id : Number(id))
            .filter((id) => Number.isFinite(id))
          const queryResult = await dataSource.query?.({
            objectIds: queryObjectIds.length > 0 ? queryObjectIds : selectedIds,
            outFields: ['*'],
            returnGeometry: true
          })
          records.push(...(queryResult?.records || []))
        } catch {
          // Keep any selected records already available from the data source.
        }
      }
    }

    const mapFeatureSurveyMonuments = selectedMapFeatures.flatMap((feature) => {
      const attributes = feature.attributes || {}
      if (!isSurveyMonumentAttributes(attributes)) return []
      const layer = feature?.layer || feature?.sourceLayer || {}
      if (layer.id === `${props.id}-project-monuments`) return []
      const layerId = layer.layerId ?? layer.sourceJSON?.id
      const candidates = [
        layer.url,
        layer.parsedUrl?.path,
        layer.sourceJSON?.url
      ].filter(Boolean).map(String)

      if (layerId !== undefined) {
        candidates.push(...candidates.map((url) => `${url.replace(/\/+$/, '')}/${layerId}`))
      }

      if (!urlCandidatesMatch(surveyMonumentsUrl, candidates)) return []
      return [toSurveyMonumentSummary(attributes)]
    })

    const seenIncomingKeys = new Set<string>()
    const rawIncomingSurveyMonuments = [
      ...records
        .flatMap((record: any) => {
          const attributes = getRecordAttributes(record)
          const sourceDataSource = record?.dataSource
          if (sourceDataSource && !dataSourceMatchesUrl(sourceDataSource, surveyMonumentsUrl)) return []
          if (!isSurveyMonumentAttributes(attributes)) return []
          return [toSurveyMonumentSummary(attributes)]
        }),
      ...mapFeatureSurveyMonuments
    ]
      .filter((item) => item.objectId !== undefined && item.objectId !== null)
      .filter((item) => {
        const key = getSurveyMonumentKey(item)
        if (seenIncomingKeys.has(key)) return false
        seenIncomingKeys.add(key)
        return true
      })

    const missingGlobalIdObjectIds = rawIncomingSurveyMonuments
      .filter((item) => !item.globalId && item.objectId !== undefined && item.objectId !== null)
      .map((item) => item.objectId)
    const enrichedMonuments = await loadSurveyMonumentsByObjectIds(missingGlobalIdObjectIds)
    const incomingSurveyMonuments = rawIncomingSurveyMonuments.map((item) =>
      item.globalId ? item : enrichedMonuments.get(String(item.objectId)) || item
    )

    setAssignSurveyMonuments((current) => {
      const knownKeys = new Set(current.map(getSurveyMonumentKey))
      const additions = incomingSurveyMonuments.filter((item) => !knownKeys.has(getSurveyMonumentKey(item)))
      const nextSurveyMonuments = [...current, ...additions]
        .sort((left, right) => left.pointNumber.localeCompare(right.pointNumber, undefined, { numeric: true, sensitivity: 'base' }))
      if (nextSurveyMonuments.length === 0) {
        setAssignHistoryItems([])
        setActiveAssignHistoryKey('')
        setStatus(m.assignSelectSurveyMonuments)
      } else if (additions.length > 0) {
        setStatus(`${m.selectedSurveyMonuments}: ${nextSurveyMonuments.length}`)
      }
      return nextSurveyMonuments
    })
  }, [dataSourceMatchesUrl, getSurveyMonumentRuntimeDataSources, isSurveyMonumentAttributes, loadSurveyMonumentsByObjectIds, m.assignSelectSurveyMonuments, m.selectedSurveyMonuments, props.id, selectedMapFeatures, surveyMonumentsUrl, toSurveyMonumentSummary])

  const loadAssignHistoryForSurveyMonument = React.useCallback(async (monument?: SurveyMonumentSummary) => {
    if (!monument?.globalId) {
      setAssignHistoryItems([])
      setStatus(m.assignSurveyMissingGlobalId)
      return
    }

    setLoadingAssignHistory(true)

    try {
      const query = new URL(`${monumentHistoryUrl}/query`)
      query.search = new URLSearchParams({
        where: `${historyMonumentGlobalIdField} = '${escapeSqlString(monument.globalId)}'`,
        outFields: [
          'OBJECTID',
          'GlobalID',
          historyProjectGlobalIdField,
          historyMonumentGlobalIdField,
          'PointNumber',
          'Status',
          'Type',
          'EmbeddedIn',
          'MarkingType',
          'MarkingMaterial'
        ].join(','),
        returnGeometry: 'false',
        orderByFields: 'PointNumber ASC',
        resultRecordCount: String(HISTORY_QUERY_LIMIT),
        f: 'json'
      }).toString()

      const response = await fetch(query.toString())
      const data = await response.json() as QueryResponse
      if (!response.ok || data.error) throw new Error(data.error?.message || response.statusText)

      const nextHistoryItems = (data.features || [])
        .map((feature) => toHistorySummary(feature.attributes || {}))
        .filter((item) => item.objectId !== undefined && item.objectId !== null)
        .sort((left, right) => left.pointNumber.localeCompare(right.pointNumber, undefined, { numeric: true, sensitivity: 'base' }))
      const projectNames = await loadProjectNamesByGlobalIds(nextHistoryItems.map((item) => item.projectGlobalId || ''))
      const historyItemsWithProjects = nextHistoryItems.map((item) => ({
        ...item,
        projectName: projectNames.get(item.projectGlobalId || '') || item.projectGlobalId || '-'
      }))
      setAssignHistoryItems(historyItemsWithProjects)
      setActiveAssignHistoryKey((current) => {
        const nextKeys = new Set(historyItemsWithProjects.map(getHistoryKey))
        return nextKeys.has(current) ? current : ''
      })
      setStatus(`${m.assignHistoryLoaded} ${historyItemsWithProjects.length}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : m.historyLoadFailed
      setStatus(message || m.historyLoadFailed)
    } finally {
      setLoadingAssignHistory(false)
    }
  }, [historyMonumentGlobalIdField, historyProjectGlobalIdField, loadProjectNamesByGlobalIds, m.assignHistoryLoaded, m.assignSurveyMissingGlobalId, m.historyLoadFailed, monumentHistoryUrl, toHistorySummary])

  const ensureMonumentGraphicsLayer = React.useCallback(async () => {
    if (!jimuMapView?.view?.map) return null
    if (monumentGraphicsLayerRef.current && monumentGraphicsMapRef.current !== jimuMapView.view.map) {
      monumentGraphicsMapRef.current?.remove?.(monumentGraphicsLayerRef.current)
      monumentGraphicsLayerRef.current = null
      monumentGraphicsMapRef.current = null
    }
    if (!monumentGraphicsLayerRef.current) {
      const [GraphicsLayer] = await loadArcGISJSAPIModules(['esri/layers/GraphicsLayer'])
      monumentGraphicsLayerRef.current = new GraphicsLayer({
        id: `${props.id}-project-monuments`,
        title: 'Monument Manager project monuments',
        listMode: 'hide'
      })
      jimuMapView.view.map.add(monumentGraphicsLayerRef.current)
      monumentGraphicsMapRef.current = jimuMapView.view.map
    }
    const layerIndex = jimuMapView.view.map.layers?.length
    if (typeof layerIndex === 'number' && layerIndex > 0) {
      jimuMapView.view.map.reorder?.(monumentGraphicsLayerRef.current, layerIndex - 1)
    }
    return monumentGraphicsLayerRef.current
  }, [jimuMapView, props.id])

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

  const getMonumentGraphicSymbol = (geometry: any, selected = false) => {
    const type = geometry?.type
    const color = selected ? [105, 220, 255, 0.72] : [255, 244, 120, 0.74]
    const lineColor = selected ? [105, 220, 255, 0.86] : [255, 244, 120, 0.8]
    const fillColor = selected ? [105, 220, 255, 0.16] : [255, 244, 120, 0.14]
    const fillOutlineColor = selected ? [105, 220, 255, 0.92] : [255, 255, 255, 0.95]
    if (type === 'point' || type === 'multipoint') {
      return {
        type: 'simple-marker',
        style: 'circle',
        color,
        size: 14,
        outline: { color: [255, 255, 255, 1], width: 2 }
      }
    }
    if (type === 'polyline') {
      return {
        type: 'simple-line',
        color: lineColor,
        width: 5
      }
    }
    return {
      type: 'simple-fill',
      color: fillColor,
      outline: { color: fillOutlineColor, width: 3 }
    }
  }

  const querySurveyMonumentsByGlobalIds = React.useCallback(async (globalIds: string[]): Promise<QueryResponse[]> => {
    const results: QueryResponse[] = []
    const uniqueIds = Array.from(new Set(globalIds.filter(Boolean)))
    for (let offset = 0; offset < uniqueIds.length; offset += MONUMENT_GLOBAL_ID_QUERY_CHUNK_SIZE) {
      const ids = uniqueIds.slice(offset, offset + MONUMENT_GLOBAL_ID_QUERY_CHUNK_SIZE)
      const params: { [key: string]: string } = {
        where: `${monumentGlobalIdField} IN (${ids.map((id) => `'${escapeSqlString(id)}'`).join(',')})`,
        outFields: '*',
        returnGeometry: 'true',
        f: 'json'
      }
      const outWkid = jimuMapView?.view?.spatialReference?.wkid
      if (outWkid) params.outSR = String(outWkid)

      const query = new URL(`${surveyMonumentsUrl}/query`)
      query.search = new URLSearchParams(params).toString()
      const response = await fetch(query.toString())
      const data = await response.json() as QueryResponse
      if (!response.ok || data.error) throw new Error(data.error?.message || response.statusText)
      results.push(data)
    }
    return results
  }, [jimuMapView, monumentGlobalIdField, surveyMonumentsUrl])

  const renderProjectMonumentGraphics = React.useCallback(async (items: MonumentHistorySummary[], activeKey: string) => {
    const layer = await ensureMonumentGraphicsLayer()
    if (!layer) return

    const monumentGlobalIds = items
      .map((item) => item.monumentGlobalId || '')
      .filter((globalId) => globalId.trim() !== '')

    if (monumentGlobalIds.length === 0) {
      layer.removeAll()
      return
    }

    const [Graphic, geometryJsonUtils] = await loadArcGISJSAPIModules([
      'esri/Graphic',
      'esri/geometry/support/jsonUtils'
    ])
    const historyByMonumentGlobalId = new Map(items.map((item) => [String(item.monumentGlobalId || '').toLowerCase(), item]))
    const activeHistoryItem = items.find((item) => getHistoryKey(item) === activeKey)
    const graphics: any[] = []
    const results = await querySurveyMonumentsByGlobalIds(monumentGlobalIds)

    results.forEach((result) => {
      ;(result.features || []).forEach((feature) => {
        if (!feature.geometry) return
        const attributes = feature.attributes || {}
        const globalId = getStringAttribute(attributes, monumentGlobalIdField)
        const historyItem = historyByMonumentGlobalId.get(globalId.toLowerCase())
        const historyKey = historyItem ? getHistoryKey(historyItem) : globalId
        const geometry = geometryJsonUtils.fromJSON(getGeometryJson(
          feature.geometry,
          result.geometryType,
          result.spatialReference
        ))
        graphics.push(new Graphic({
          geometry,
          attributes: {
            ...attributes,
            __monumentManagerHistoryKey: historyKey,
            __monumentManagerMonumentGlobalId: globalId
          },
          symbol: getMonumentGraphicSymbol(geometry, historyKey === activeKey)
        }))
      })
    })

    layer.removeAll()
    if (graphics.length > 0) layer.addMany(graphics)
    await selectMonumentHistoryRecord(activeKey ? activeHistoryItem?.objectId : null)
  }, [ensureMonumentGraphicsLayer, monumentGlobalIdField, querySurveyMonumentsByGlobalIds, selectMonumentHistoryRecord])

  const renderAssignSurveyMonumentGraphics = React.useCallback(async (items: SurveyMonumentSummary[], activeKey: string) => {
    const layer = await ensureMonumentGraphicsLayer()
    if (!layer) return

    const monumentGlobalIds = items
      .map((item) => item.globalId || '')
      .filter((globalId) => globalId.trim() !== '')

    if (monumentGlobalIds.length === 0) {
      layer.removeAll()
      return
    }

    const [Graphic, geometryJsonUtils] = await loadArcGISJSAPIModules([
      'esri/Graphic',
      'esri/geometry/support/jsonUtils'
    ])
    const activeMonument = items.find((item) => getSurveyMonumentKey(item) === activeKey)
    const activeGlobalId = String(activeMonument?.globalId || '').toLowerCase()
    const graphics: any[] = []
    const results = await querySurveyMonumentsByGlobalIds(monumentGlobalIds)

    results.forEach((result) => {
      ;(result.features || []).forEach((feature) => {
        if (!feature.geometry) return
        const attributes = feature.attributes || {}
        const globalId = getStringAttribute(attributes, monumentGlobalIdField)
        const geometry = geometryJsonUtils.fromJSON(getGeometryJson(
          feature.geometry,
          result.geometryType,
          result.spatialReference
        ))
        graphics.push(new Graphic({
          geometry,
          attributes: {
            ...attributes,
            __monumentManagerSurveyGlobalId: globalId
          },
          symbol: getMonumentGraphicSymbol(geometry, globalId.toLowerCase() === activeGlobalId)
        }))
      })
    })

    layer.removeAll()
    if (graphics.length > 0) layer.addMany(graphics)
  }, [ensureMonumentGraphicsLayer, monumentGlobalIdField, querySurveyMonumentsByGlobalIds])

  const getProjectWhere = (project: MonumentProjectSummary) => {
    if (project.globalId) return `${projectGlobalIdField} = '${escapeSqlString(project.globalId)}'`
    return `OBJECTID = ${project.objectId}`
  }

  const getProjectMapLayers = async () => {
    if (!jimuMapView) return []

    await jimuMapView.whenAllJimuLayerViewLoaded?.()
    const layerViews = jimuMapView.getAllLoadedJimuLayerViews?.() || []
    const layers: any[] = []

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

      if (urlCandidatesMatch(monumentProjectsUrl, candidates) && !layers.includes(layer)) {
        layers.push(layer)
      }
    }

    return layers
  }

  const restoreProjectLayerFilters = () => {
    projectLayerFiltersRef.current.forEach((entry) => {
      entry.layer.definitionExpression = entry.definitionExpression || null
    })
    projectLayerFiltersRef.current.clear()
  }

  const filterAndZoomToProject = async (project: MonumentProjectSummary) => {
    const view = jimuMapView?.view
    if (!view) {
      setStatus(m.mapUnavailable)
      return false
    }

    const layers = await getProjectMapLayers()
    if (layers.length === 0) {
      setStatus(m.projectLayerNotFound)
      return false
    }

    const where = getProjectWhere(project)
    let targetExtent: any = null

    layers.forEach((layer, index) => {
      const layerKey = getLayerKey(layer, `${monumentProjectsUrl}-${index}`)
      if (!projectLayerFiltersRef.current.has(layerKey)) {
        projectLayerFiltersRef.current.set(layerKey, {
          layer,
          definitionExpression: layer.definitionExpression
        })
      }
      const original = projectLayerFiltersRef.current.get(layerKey)?.definitionExpression
      layer.definitionExpression = original ? `(${original}) AND (${where})` : where
    })

    for (const layer of layers) {
      if (!layer.queryExtent) continue
      const query = layer.createQuery ? layer.createQuery() : {}
      query.where = where
      try {
        const result = await layer.queryExtent(query)
        if (result?.extent) {
          targetExtent = result.extent
          break
        }
      } catch {
        // Keep filtering even when one map layer cannot provide an extent.
      }
    }

    if (!targetExtent) {
      setStatus(m.projectZoomFailed)
      return false
    }

    const expandedExtent = targetExtent.expand ? targetExtent.expand(1.75) : targetExtent
    await view.goTo(expandedExtent, {
      duration: 1200,
      padding: { top: 80, right: 80, bottom: 80, left: 80 }
    })
    setStatus(`${m.projectFiltered}: ${project.name}`)
    return true
  }

  const selectProject = async (project: MonumentProjectSummary, selected: boolean) => {
    if (selected) {
      restoreProjectLayerFilters()
      setSelectedProject(null)
      setStatus(m.projectFilterCleared)
      return
    }

    setSelectedProject(project)
    try {
      await filterAndZoomToProject(project)
    } catch (err) {
      const message = err instanceof Error ? err.message : m.projectZoomFailed
      setStatus(message)
    }
  }

  const loadProjects = React.useCallback(async (rawSearchText = '') => {
    const searchText = rawSearchText.trim()
    if (searchText.length > 0 && searchText.length < PROJECT_SEARCH_MINIMUM_LENGTH) {
      setStatus(m.projectSearchMinimum)
      return
    }

    setLoadingProjects(true)
    setProjectError('')

    try {
      const query = new URL(`${monumentProjectsUrl}/query`)
      query.search = new URLSearchParams({
        where: buildProjectWhere(searchText),
        outFields: [
          'OBJECTID',
          projectGlobalIdField,
          projectDisplayField,
          'JobNo',
          'FileNo',
          'SurveyYear',
          'Folder',
          PROJECT_COMPLETED_FIELD
        ].join(','),
        returnGeometry: 'false',
        orderByFields: `${projectDisplayField} ASC`,
        resultRecordCount: String(PROJECT_QUERY_LIMIT),
        f: 'json'
      }).toString()

      const response = await fetch(query.toString())
      const data = await response.json() as QueryResponse
      if (!response.ok || data.error) throw new Error(data.error?.message || response.statusText)

      const nextProjects = (data.features || [])
        .map((feature) => toProjectSummary(feature.attributes || {}))
        .filter((project) => project.objectId !== undefined && project.objectId !== null)
      const historyCounts = await loadHistoryCounts(nextProjects.map((project) => project.globalId || ''))
      const projectsWithCounts = nextProjects.map((project) => ({
        ...project,
        historyCount: historyCounts.get(project.globalId || '') || 0
      }))

      setProjects(projectsWithCounts)
      setSelectedProject((current) => {
        if (!current) return null
        return projectsWithCounts.find((project) => String(project.objectId) === String(current.objectId)) || null
      })
      setStatus(searchText ? `${m.projectSearchReady} ${projectsWithCounts.length}` : m.projectListReady)
    } catch (err) {
      const message = err instanceof Error ? err.message : m.loadProjectsFailed
      setProjectError(message)
      setStatus(searchText ? m.projectSearchFailed : m.loadProjectsFailed)
    } finally {
      setLoadingProjects(false)
    }
  }, [
    buildProjectWhere,
    loadHistoryCounts,
    m.loadProjectsFailed,
    m.projectListReady,
    m.projectSearchFailed,
    m.projectSearchMinimum,
    m.projectSearchReady,
    monumentProjectsUrl,
    projectDisplayField,
    projectGlobalIdField,
    toProjectSummary
  ])

  React.useEffect(() => {
    if (mode !== 'finder') return
    if (searchInitializedRef.current) return
    searchInitializedRef.current = true
    loadProjects().catch(() => undefined)
  }, [loadProjects, mode, monumentProjectsUrl])

  React.useEffect(() => {
    if (mode !== 'finder') return
    const timeout = window.setTimeout(() => {
      loadProjects(projectSearchTerm).catch(() => undefined)
    }, 450)
    return () => {
      window.clearTimeout(timeout)
    }
  }, [loadProjects, mode, projectSearchTerm, monumentProjectsUrl])

  React.useEffect(() => {
    if (mode !== 'history' || !selectedProject) return
    loadProjectHistory(selectedProject).catch(() => undefined)
  }, [loadProjectHistory, mode, selectedProject, selectedProject?.objectId, selectedProject?.globalId, monumentHistoryUrl])

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

  React.useEffect(() => {
    let cancelled = false

    const syncMonumentGraphics = async () => {
      if (mode === 'create') return
      if (mode !== 'history' || !selectedProject) {
        monumentGraphicsLayerRef.current?.removeAll?.()
        if (activeHistoryKey || historyItems.length > 0) {
          await selectMonumentHistoryRecord(null)
        }
        return
      }
      await renderProjectMonumentGraphics(historyItems, activeHistoryKey)
    }

    syncMonumentGraphics().catch(() => {
      if (!cancelled) setStatus(m.monumentGraphicsFailed)
    })

    return () => {
      cancelled = true
    }
  }, [activeHistoryKey, historyItems, m.monumentGraphicsFailed, mode, renderProjectMonumentGraphics, selectMonumentHistoryRecord, selectedProject])

  React.useEffect(() => {
    if (mode !== 'create') return
    loadSelectedSurveyMonuments().catch(() => {
      setStatus(m.assignSurveySelectionFailed)
    })
  }, [loadSelectedSurveyMonuments, m.assignSurveySelectionFailed, mode, surveyMonumentSelectionKey])

  React.useEffect(() => {
    if (mode !== 'create') return
    const activeSurveyMonument = assignSurveyMonuments.find((item) => getSurveyMonumentKey(item) === activeAssignSurveyKey)
    if (!activeSurveyMonument) {
      setAssignHistoryItems([])
      setActiveAssignHistoryKey('')
      return
    }
    loadAssignHistoryForSurveyMonument(activeSurveyMonument).catch(() => {
      setStatus(m.historyLoadFailed)
    })
  }, [activeAssignSurveyKey, assignSurveyMonuments, loadAssignHistoryForSurveyMonument, m.historyLoadFailed, mode])

  React.useEffect(() => {
    let cancelled = false

    const syncAssignGraphics = async () => {
      if (mode !== 'create') return
      await renderAssignSurveyMonumentGraphics(assignSurveyMonuments, activeAssignSurveyKey)
    }

    syncAssignGraphics().catch(() => {
      if (!cancelled) setStatus(m.monumentGraphicsFailed)
    })

    return () => {
      cancelled = true
    }
  }, [activeAssignSurveyKey, assignSurveyMonuments, m.monumentGraphicsFailed, mode, renderAssignSurveyMonumentGraphics])

  React.useEffect(() => () => {
    monumentGraphicsLayerRef.current?.removeAll?.()
    monumentGraphicsMapRef.current?.remove?.(monumentGraphicsLayerRef.current)
  }, [])

  const projectRow = (project: MonumentProjectSummary) => {
    const selected = String(selectedProject?.objectId) === String(project.objectId)
    const toggleProject = () => {
      selectProject(project, selected).catch(() => undefined)
    }

    return h('div', {
      key: project.objectId,
      className: 'd-flex align-items-center justify-content-between py-1',
      style: { gap: '0.5rem', backgroundColor: selected ? 'rgba(0, 121, 193, 0.07)' : 'transparent' }
    },
    h('div', { className: 'd-flex align-items-center', style: { gap: '0.5rem', minWidth: 0 } },
      h(Checkbox, {
        checked: selected,
        onChange: toggleProject
      }),
      h('span', {
        title: project.name,
        style: {
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontSize: 12
        }
      }, project.name),
      h('span', {
        title: `${project.historyCount} ${m.historyCountLabel}`,
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
      }, String(project.historyCount))
    ),
    h(Button, {
      size: 'sm',
      type: 'default',
      title: project.folderUrl ? m.openFolder : m.folderUnavailable,
      disabled: !project.folderUrl,
      onClick: () => {
        if (!project.folderUrl) return
        const openedWindow = window.open(project.folderUrl, '_blank', 'noopener,noreferrer')
        setStatus(openedWindow ? `${m.openedFolder}: ${project.name}` : m.folderPopupBlocked)
      },
      style: { width: 32, minWidth: 32, height: 32, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }
    }, '📁')
    )
  }

  const startWorkflowMode = (nextMode: MonumentMode) => {
    if (!selectedProject) {
      setStatus(m.selectProjectFirst)
      return
    }
    setMode(nextMode)
    const workflow = workflowModes.find((item) => item.id === nextMode)
    setStatus(`${workflow?.label || m.selectedProject}: ${selectedProject.name}`)
  }

  const clearAssignLists = () => {
    setAssignSurveyMonuments([])
    setActiveAssignSurveyKey('')
    setAssignHistoryItems([])
    setActiveAssignHistoryKey('')
    monumentGraphicsLayerRef.current?.removeAll?.()
    setStatus(m.historySelectionCleared)
  }

  const historyRow = (item: MonumentHistorySummary) => {
    const itemKey = getHistoryKey(item)
    const checked = selectedHistoryKeys.includes(itemKey)
    const active = activeHistoryKey === itemKey
    const toggleHistorySelection = () => {
      setSelectedHistoryKeys((current) => {
        const isChecked = current.includes(itemKey)
        const nextKeys = isChecked ? current.filter((key) => key !== itemKey) : [...current, itemKey]
        setStatus(`${m.selectedHistoryCount}: ${nextKeys.length}`)
        return nextKeys
      })
    }
    const activateHistoryItem = () => {
      setActiveHistoryKey(itemKey)
      setStatus(`${m.selectedHistoryItem}: ${item.pointNumber}`)
    }
    const primaryText = `${item.pointNumber} | ${item.status} | ${item.monumentType}`
    const secondaryParts = [
      { label: m.embeddedInLabel, value: item.embeddedIn },
      { label: m.markerTypeLabel, value: item.markerType },
      { label: m.markerMaterialLabel, value: item.markerMaterial }
    ]
    const secondaryText = secondaryParts.map((part) => `${part.label}: ${part.value}`).join(' | ')

    return h('div', {
      key: item.objectId,
      className: 'd-flex align-items-center justify-content-between py-1',
      onClick: activateHistoryItem,
      style: {
        gap: '0.5rem',
        paddingLeft: '0.5rem',
        paddingRight: '0.5rem',
        cursor: 'pointer',
        backgroundColor: active ? 'rgba(105, 220, 255, 0.18)' : undefined
      }
    },
    h('div', { className: 'd-flex align-items-center', style: { gap: '0.5rem', minWidth: 0, overflow: 'hidden' } },
      h(Checkbox, {
        checked,
        onClick: (evt) => {
          evt.stopPropagation()
        },
        onChange: (evt) => {
          evt.stopPropagation()
          toggleHistorySelection()
        }
      }),
      h('div', { style: { minWidth: 0, overflow: 'hidden' } },
      h('div', {
        title: primaryText,
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '0.35rem',
          minWidth: 0,
          overflow: 'hidden',
          fontSize: 12,
          whiteSpace: 'nowrap'
        }
      },
      h('span', { style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 } }, item.pointNumber),
      h('span', { style: { opacity: 0.48 } }, '|'),
      h('span', {
        style: {
          flex: '0 1 auto',
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          padding: '1px 6px',
          borderRadius: 4,
          backgroundColor: 'rgba(105, 220, 255, 0.16)',
          color: 'var(--sys-color-primary-dark)'
        }
      }, item.status),
      h('span', { style: { opacity: 0.48 } }, '|'),
      h('span', { style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', opacity: 0.78 } }, item.monumentType)
      ),
      h('div', {
        title: secondaryText,
        style: {
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.2rem 0.65rem',
          minWidth: 0,
          overflow: 'hidden',
          fontSize: 10,
          lineHeight: '14px'
        }
      },
      secondaryParts.map((part, index) =>
        h(React.Fragment, { key: part.label },
          index > 0 && h('span', { style: { opacity: 0.42 } }, '|'),
          h('span', { style: { minWidth: 0, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
            h('span', { style: { opacity: 0.58, fontWeight: 600 } }, `${part.label}: `),
            h('span', { style: { opacity: 0.78 } }, part.value)
          )
        )
      ))
      )
    ),
    h('div', { className: 'd-flex align-items-center', style: { gap: '0.25rem', flex: '0 0 auto' } },
      h(Button, {
        size: 'sm',
        type: 'default',
        title: m.deleteHistoryFeature,
        onClick: (evt) => {
          evt.stopPropagation()
          setStatus(m.deleteHistoryFeaturePending)
        },
        style: { width: 32, minWidth: 32, height: 32, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }
      }, '🗑️')
    )
    )
  }

  const assignSurveyMonumentRow = (item: SurveyMonumentSummary) => {
    const itemKey = getSurveyMonumentKey(item)
    const active = activeAssignSurveyKey === itemKey
    const primaryText = `PointID: ${item.pointNumber} | ObjectID: ${item.objectId}`

    return h('div', {
      key: item.objectId,
      className: 'd-flex align-items-center justify-content-between py-1',
      onClick: () => {
        setActiveAssignSurveyKey(itemKey)
        setStatus(`${m.selectedSurveyMonument}: ${item.pointNumber}`)
      },
      style: {
        gap: '0.5rem',
        paddingLeft: '0.5rem',
        paddingRight: '0.5rem',
        cursor: 'pointer',
        backgroundColor: active ? 'rgba(105, 220, 255, 0.18)' : undefined
      }
    },
    h('div', {
      title: primaryText,
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: '0.35rem',
        minWidth: 0,
        overflow: 'hidden',
        fontSize: 12,
        whiteSpace: 'nowrap'
      }
    },
    h('span', { style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 } }, `PointID: ${item.pointNumber}`),
    h('span', { style: { opacity: 0.48 } }, '|'),
    h('span', { style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', opacity: 0.78 } }, `ObjectID: ${item.objectId}`)
    )
    )
  }

  const assignHistoryRow = (item: MonumentHistorySummary) => {
    const itemKey = getHistoryKey(item)
    const active = activeAssignHistoryKey === itemKey
    const activateHistoryItem = () => {
      setActiveAssignHistoryKey(itemKey)
      suppressAssignSurveySelectionSyncRef.current = true
      selectMonumentHistoryRecord(item.objectId)
        .catch(() => undefined)
        .finally(() => {
          window.setTimeout(() => {
            suppressAssignSurveySelectionSyncRef.current = false
          }, 750)
        })
      setStatus(`${m.selectedHistoryItem}: ${item.pointNumber}`)
    }
    const primaryText = `${item.pointNumber} | ${item.status} | ${item.monumentType}`
    const projectText = item.projectName || '-'

    return h('div', {
      key: item.objectId,
      className: 'd-flex align-items-center justify-content-between py-1',
      onClick: activateHistoryItem,
      style: {
        gap: '0.5rem',
        paddingLeft: '0.5rem',
        paddingRight: '0.5rem',
        cursor: 'pointer',
        backgroundColor: active ? 'rgba(105, 220, 255, 0.18)' : undefined
      }
    },
    h('div', { className: 'd-flex align-items-center', style: { gap: '0.5rem', minWidth: 0, overflow: 'hidden' } },
      h('div', { style: { minWidth: 0, overflow: 'hidden' } },
        h('div', {
          title: primaryText,
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
            minWidth: 0,
            overflow: 'hidden',
            fontSize: 12,
            whiteSpace: 'nowrap'
          }
        },
        h('span', { style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 } }, item.pointNumber),
        h('span', { style: { opacity: 0.48 } }, '|'),
        h('span', {
          style: {
            flex: '0 1 auto',
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            padding: '1px 6px',
            borderRadius: 4,
            backgroundColor: 'rgba(105, 220, 255, 0.16)',
            color: 'var(--sys-color-primary-dark)'
          }
        }, item.status),
        h('span', { style: { opacity: 0.48 } }, '|'),
        h('span', { style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', opacity: 0.78 } }, item.monumentType)
        ),
        h('div', {
          title: projectText,
          style: {
            minWidth: 0,
            overflow: 'hidden',
            fontSize: 10,
            lineHeight: '14px',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }
        },
        h('span', { style: { opacity: 0.78 } }, projectText)
        )
      )
    ),
    h('div', { className: 'd-flex align-items-center', style: { gap: '0.25rem', flex: '0 0 auto' } },
      h(Button, {
        size: 'sm',
        type: 'default',
        title: m.assignProjectValue,
        onClick: (evt) => {
          evt.stopPropagation()
          setStatus(m.assignProjectValuePending)
        },
        style: { width: 32, minWidth: 32, height: 32, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }
      }, '↗')
    )
    )
  }

  const viewHistoryPanel = () =>
    h('div', { className: 'd-flex flex-column flex-grow-1', style: { gap: '0.75rem', minHeight: 0 } },
      h('div', { className: 'd-flex align-items-center justify-content-between', style: { gap: '0.5rem' } },
        h('div', { className: 'font-weight-bold' }, m.viewingProjectMonuments),
        h(Button, {
          size: 'sm',
          type: 'tertiary',
          onClick: () => {
            setMode('finder')
          }
        }, m.cancel)
      ),
      selectedProject && h('div', { style: { fontSize: 14, fontWeight: 700, lineHeight: '18px', overflowWrap: 'anywhere' } }, selectedProject.name),
      h('div', { className: 'border rounded p-2 d-flex flex-column flex-grow-1', style: { minHeight: 0 } },
        h('div', { className: 'd-flex align-items-center justify-content-between mb-2', style: { gap: '0.5rem' } },
          h('div', { className: 'font-weight-bold', style: { fontSize: 12 } }, m.monumentHistoryTitle),
          h('div', { style: { fontSize: 11, opacity: 0.75 } }, `${historyItems.length} ${m.featureCountLabel}`)
        ),
        historyError && h(Alert, { form: 'basic', type: 'warning', text: historyError }),
        h('div', { className: 'flex-grow-1', style: { minHeight: 0, overflowY: 'auto', overflowX: 'hidden' } },
          loadingHistory
            ? h('div', { style: { fontSize: 12, opacity: 0.75 } }, m.loadingHistory)
            : historyItems.length === 0
              ? h('div', { style: { fontSize: 12, opacity: 0.75 } }, m.historyEmpty)
              : historyItems.map(historyRow)
        ),
        h('div', { className: 'd-flex mt-2', style: { gap: '0.35rem' } },
          h(Button, {
            type: 'default',
            size: 'sm',
            style: modeActionButtonStyle,
            onClick: () => {
              const allKeys = historyItems.map(getHistoryKey)
              setSelectedHistoryKeys(allKeys)
              setStatus(`${m.selectedHistoryCount}: ${allKeys.length}`)
            }
          }, m.selectAll),
          h(Button, {
            type: 'default',
            size: 'sm',
            style: modeActionButtonStyle,
            onClick: () => {
              setSelectedHistoryKeys([])
              setStatus(m.historySelectionCleared)
            }
          }, m.clearSelection),
          h(Button, {
            type: 'primary',
            size: 'sm',
            style: modeActionButtonStyle,
            onClick: () => {
              if (selectedHistoryKeys.length === 0) {
                setStatus(m.selectHistoryFirst)
                return
              }
              setStatus(`${m.updatePointNumber}: ${selectedHistoryKeys.length}`)
            }
          }, m.updatePointNumber)
        )
      )
    )

  const assignProjectPanel = () =>
    h('div', { className: 'd-flex flex-column flex-grow-1', style: { gap: '0.75rem', minHeight: 0 } },
      h('div', { className: 'd-flex align-items-center justify-content-between', style: { gap: '0.5rem' } },
        h('div', { className: 'font-weight-bold' }, m.assignProjectTitle),
        h(Button, {
          size: 'sm',
          type: 'tertiary',
          onClick: () => {
            setMode('finder')
          }
        }, m.cancel)
      ),
      selectedProject && h('div', { style: { fontSize: 14, fontWeight: 700, lineHeight: '18px', overflowWrap: 'anywhere' } }, selectedProject.name),
      h('div', { className: 'border rounded p-2 d-flex flex-column', style: { minHeight: 120, flex: '0 0 38%' } },
        h('div', { className: 'd-flex align-items-center justify-content-between mb-2', style: { gap: '0.5rem' } },
          h('div', { className: 'font-weight-bold', style: { fontSize: 12 } }, m.surveyMonumentsTitle),
          h('div', { className: 'd-flex align-items-center', style: { gap: '0.35rem', flex: '0 0 auto' } },
            h('div', { style: { fontSize: 11, opacity: 0.75 } }, `${assignSurveyMonuments.length} ${m.featureCountLabel}`),
            h(Button, {
              size: 'sm',
              type: 'tertiary',
              disabled: assignSurveyMonuments.length === 0 && assignHistoryItems.length === 0,
              onClick: clearAssignLists,
              style: { height: 24, padding: '0 6px', fontSize: 11 }
            }, m.clear)
          )
        ),
        h('div', { className: 'flex-grow-1', style: { minHeight: 0, overflowY: 'auto', overflowX: 'hidden' } },
          assignSurveyMonuments.length === 0
            ? h('div', { style: { fontSize: 12, opacity: 0.75 } }, m.assignSelectSurveyMonuments)
            : assignSurveyMonuments.map(assignSurveyMonumentRow)
        ),
        h('div', { className: 'd-flex mt-2', style: { gap: '0.35rem' } },
          h(Button, {
            type: 'primary',
            size: 'sm',
            style: modeActionButtonStyle,
            disabled: assignSurveyMonuments.length === 0,
            onClick: () => {
              setStatus(`${m.assignAll}: ${assignSurveyMonuments.length}`)
            }
          }, m.assignAll)
        )
      ),
      h('div', { className: 'border rounded p-2 d-flex flex-column flex-grow-1', style: { minHeight: 0 } },
        h('div', { className: 'd-flex align-items-center justify-content-between mb-2', style: { gap: '0.5rem' } },
          h('div', { className: 'font-weight-bold', style: { fontSize: 12 } }, m.monumentHistoryTitle),
          h('div', { style: { fontSize: 11, opacity: 0.75 } }, `${assignHistoryItems.length} ${m.featureCountLabel}`)
        ),
        h('div', { className: 'flex-grow-1', style: { minHeight: 0, overflowY: 'auto', overflowX: 'hidden' } },
          loadingAssignHistory
            ? h('div', { style: { fontSize: 12, opacity: 0.75 } }, m.loadingHistory)
            : assignHistoryItems.length === 0
              ? h('div', { style: { fontSize: 12, opacity: 0.75 } }, m.assignHistoryEmpty)
              : assignHistoryItems.map(assignHistoryRow)
        )
      )
    )

  const monumentProjectFinder = () =>
    h('div', { className: 'border rounded p-2 d-flex flex-column flex-grow-1', style: { minHeight: 0 } },
      h('div', { className: 'd-flex align-items-center justify-content-between mb-2', style: { gap: '0.5rem' } },
        h('div', { className: 'font-weight-bold' }, m.monumentProjectFinderTitle),
        h('div', { className: 'd-flex align-items-center', style: { gap: '0.35rem', flex: '0 0 auto' } },
          h(Button, {
            size: 'sm',
            type: 'primary',
            onClick: () => {
              setMode('create')
              setStatus(m.createTitle)
            }
          }, m.createTitle),
          h(Button, {
            size: 'sm',
            type: 'default',
            onClick: () => {
              loadProjects(projectSearchTerm).catch(() => undefined)
            },
            disabled: loadingProjects
          }, m.refreshList)
        )
      ),
      h('div', { className: 'mb-2' },
        h(TextInput, {
          value: projectSearchTerm,
          placeholder: m.projectSearchPlaceholder,
          onChange: (evt) => {
            setProjectSearchTerm(evt.target.value)
          }
        }),
        (loadingProjects || (projectSearchTerm.trim().length > 0 && projectSearchTerm.trim().length < PROJECT_SEARCH_MINIMUM_LENGTH)) &&
          h('div', { className: 'mt-1', style: { fontSize: 10, opacity: 0.7 } },
            loadingProjects ? m.searchingProjects : m.projectSearchMinimum
          )
      ),
      projectError && h(Alert, { form: 'basic', type: 'warning', text: projectError }),
      h('div', { className: 'flex-grow-1', style: { minHeight: 0, overflowY: 'auto', overflowX: 'hidden' } },
        !loadingProjects && !projectError && projects.length === 0 && h('div', { style: { fontSize: 12, opacity: 0.72 } }, m.noProjects),
        ...projects.map(projectRow)
      ),
      h('div', { className: 'd-flex mt-2', style: { gap: '0.35rem' } },
        ...workflowModes.map((item) =>
          h(Button, {
            key: item.id,
            size: 'sm',
            type: item.id === 'history' ? 'primary' : 'default',
            style: modeButtonStyle,
            onClick: () => {
              startWorkflowMode(item.id)
            }
          }, item.label)
        )
      )
    )

  const modePanel = () =>
    h('div', { className: 'border rounded p-2 d-flex flex-column', style: { gap: '0.5rem', minHeight: 160 } },
      h('div', { className: 'd-flex align-items-center justify-content-between', style: { gap: '0.5rem' } },
        h('div', { className: 'font-weight-bold' }, activeMode.title),
        h(Button, {
          size: 'sm',
          type: 'tertiary',
          onClick: () => {
            setMode('finder')
          }
        }, m.projectFinderTitle)
      ),
      selectedProject && h('div', { style: { fontSize: 12, fontWeight: 600, overflowWrap: 'anywhere' } }, selectedProject.name),
      h('div', { style: { fontSize: 12, lineHeight: '17px', opacity: 0.82 } }, m.nextStep),
      h('div', { className: 'border rounded p-2', style: { backgroundColor: 'rgba(0, 0, 0, 0.02)' } },
        h('div', { className: 'font-weight-bold mb-2', style: { fontSize: 12 } }, m.configuredSources),
        ...configuredSources.map((source) => metadataRow(source.label, source.value || m.notConfigured))
      ),
      h('div', { className: 'border rounded p-2', style: { backgroundColor: 'rgba(0, 0, 0, 0.02)' } },
        h('div', { className: 'font-weight-bold mb-2', style: { fontSize: 12 } }, m.relationshipFields),
        metadataRow(m.projectGlobalIdField, cfg.projectGlobalIdField || 'GlobalID'),
        metadataRow(m.projectDisplayField, cfg.projectDisplayField || 'Name'),
        metadataRow(m.monumentGlobalIdField, cfg.monumentGlobalIdField || 'GlobalID'),
        metadataRow(m.monumentPointNumberField, cfg.monumentPointNumberField || 'PointNumber'),
        metadataRow(m.historyMonumentGlobalIdField, cfg.historyMonumentGlobalIdField || 'PointGlobalID'),
        metadataRow(m.historyProjectGlobalIdField, cfg.historyProjectGlobalIdField || 'ProjectGlobalID'),
        metadataRow(m.traverseProjectGlobalIdField, cfg.traverseProjectGlobalIdField || 'ProjectID'),
        metadataRow(m.traverseFromPointNumberField, cfg.traverseFromPointNumberField || 'FromPointNum'),
        metadataRow(m.traverseToPointNumberField, cfg.traverseToPointNumberField || 'ToPointNum')
      )
    )

  return h(React.Fragment, null,
    props.useMapWidgetIds?.[0] && h(JimuMapViewComponent, {
      useMapWidgetId: props.useMapWidgetIds[0],
      onActiveViewChange: setJimuMapView
    }),
    h(Card, { className: 'widget-monument-manager h-100 w-100' },
      h(CardHeader, null, m.widgetTitle),
      h(CardBody, { className: 'd-flex flex-column', style: { gap: '0.75rem', minHeight: 0 } },
        mode === 'finder' ? monumentProjectFinder() : mode === 'history' ? viewHistoryPanel() : mode === 'create' ? assignProjectPanel() : modePanel(),
        mode !== 'finder' && mode !== 'history' && mode !== 'create' && h('div', { className: 'border rounded p-2 flex-grow-1', style: { minHeight: 110 } },
          h('div', { className: 'font-weight-bold mb-2', style: { fontSize: 12 } }, m.selectedFeatures),
          h('div', { style: { fontSize: 12, opacity: 0.72 } }, m.selectedFeaturesEmpty)
        ),
        h(Alert, { form: 'basic', type: 'info', text: status })
      )
    )
  )
}

export default Widget
