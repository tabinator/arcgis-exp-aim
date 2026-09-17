import { React, type AllWidgetProps } from 'jimu-core'
import { Button, Checkbox, Option, Select, TextInput } from 'jimu-ui'
import { JimuMapViewComponent, type JimuLayerView, type JimuMapView } from 'jimu-arcgis'
import type { IMConfig, LayerCategory, LibraryLayer } from '../config'
import defaultMessages from './translations/default'
import { docTextStyles, ensureDocFontLoaded } from '../shared/doc-text-style'

type FilterOperator = 'equals' | 'notEquals' | 'contains' | 'startsWith' | 'anyOf' | 'greaterThan' | 'lessThan'
type FilterJoin = 'AND' | 'OR'
type ExportMode = 'filtered' | 'selected' | 'extent'
type ExportFieldMode = 'all' | 'custom'

interface LayerFilterExpression {
  id: string
  field: string
  operator: FilterOperator
  value: string
}

interface LayerFilter {
  join: FilterJoin
  expressions: LayerFilterExpression[]
}

interface LayerFilterByKey {
  [key: string]: LayerFilter
}

interface DefinitionExpressionByKey {
  [key: string]: string
}

interface FilterCountByKey {
  [key: string]: number
}

interface LayerVisibilityByKey {
  [key: string]: boolean
}

interface ExportFieldModeByKey {
  [key: string]: ExportFieldMode
}

interface ExportFieldsByKey {
  [key: string]: string[]
}

interface ExportFieldSearchByKey {
  [key: string]: string
}

interface LayerField {
  name: string
  alias?: string
  type?: string
  domain?: {
    type?: string
    codedValues?: Array<{
      name?: string
      code?: string | number
    }>
  }
}

interface QueryableFeatureLayer {
  definitionExpression?: string
  fields?: LayerField[]
  objectIdField?: string
  title?: string
  createQuery?: () => __esri.Query
  queryFeatureCount?: (query: __esri.Query | __esri.QueryProperties) => Promise<number>
  queryFeatures?: (query: __esri.Query | __esri.QueryProperties) => Promise<__esri.FeatureSet>
}

interface SelectableLayerView {
  getSelectedFeatures?: () => Promise<__esri.Graphic[]>
}

type ResolvedLayer = LibraryLayer & {
  jimuLayerView?: JimuLayerView
  layer?: __esri.Layer
}

const toMutableCategories = (categories): LayerCategory[] => {
  return (categories?.asMutable ? categories.asMutable({ deep: true }) : categories || []) as LayerCategory[]
}

const layerKey = (layer: LibraryLayer) => layer.jimuLayerViewId || layer.layerDataSourceId || layer.arcgisLayerId || layer.id

const resolveLayer = (jimuMapView: JimuMapView, libraryLayer: LibraryLayer): ResolvedLayer => {
  const layerViews = jimuMapView?.jimuLayerViews || {}
  const jimuLayerView = layerViews[libraryLayer.jimuLayerViewId] ||
    Object.values(layerViews).find((candidate) => {
      return candidate.layerDataSourceId === libraryLayer.layerDataSourceId ||
        candidate.layer?.id === libraryLayer.arcgisLayerId
    })

  return {
    ...libraryLayer,
    jimuLayerView,
    layer: jimuLayerView?.layer,
    title: libraryLayer.title || jimuLayerView?.layer?.title || libraryLayer.id
  }
}

const setLayerVisible = (jimuMapView: JimuMapView, libraryLayer: LibraryLayer, visible: boolean) => {
  const resolved = resolveLayer(jimuMapView, libraryLayer)
  if (resolved.layer) {
    resolved.layer.visible = visible
  }
}

const getFilterableLayer = (layer?: __esri.Layer) => {
  if (!layer || layer.type !== 'feature') return null
  return layer as unknown as QueryableFeatureLayer
}

const getQueryableFeatureLayer = (layer?: __esri.Layer) => {
  const featureLayer = getFilterableLayer(layer)
  return typeof featureLayer?.queryFeatures === 'function' ? featureLayer : null
}

const getLayerFields = (resolved: ResolvedLayer): LayerField[] => {
  const layerFields = getFilterableLayer(resolved.layer)?.fields || []
  if (layerFields.length > 0) return layerFields.filter((field) => !!field.name)
  return (resolved.filterFields || []).map((fieldName) => ({ name: fieldName }))
}

const isTextField = (field?: LayerField) => {
  return !field?.type || field.type === 'string'
}

const getFieldDomainValues = (field?: LayerField) => {
  if (!field?.domain?.codedValues || field.domain.codedValues.length === 0) return []
  return field.domain.codedValues
    .filter((codedValue) => codedValue.code !== undefined && codedValue.code !== null)
    .map((codedValue) => ({
      label: codedValue.name || String(codedValue.code),
      value: String(codedValue.code)
    }))
}

const getFilterOperatorsForField = (field?: LayerField): FilterOperator[] => {
  return getFieldDomainValues(field).length > 0
    ? ['equals', 'notEquals', 'anyOf']
    : ['equals', 'notEquals', 'contains', 'startsWith', 'anyOf', 'greaterThan', 'lessThan']
}

const parseFilterValues = (value: string) => {
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

const escapeSqlValue = (value: string) => value.replace(/'/g, "''")

const formatFilterValue = (value: string, field?: LayerField) => {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return isTextField(field) ? `'${escapeSqlValue(trimmed)}'` : trimmed
}

const buildFilterClause = (expression: LayerFilterExpression, fields: LayerField[]) => {
  const field = fields.find((candidate) => candidate.name === expression.field)
  const values = parseFilterValues(expression.value)
  const fieldName = expression.field

  if (!fieldName || values.length === 0) return ''

  switch (expression.operator) {
    case 'notEquals':
      return `${fieldName} <> ${formatFilterValue(values[0], field)}`
    case 'contains':
      return `${fieldName} LIKE '%${escapeSqlValue(values[0])}%'`
    case 'startsWith':
      return `${fieldName} LIKE '${escapeSqlValue(values[0])}%'`
    case 'anyOf':
      return `${fieldName} IN (${values.map((value) => formatFilterValue(value, field)).join(', ')})`
    case 'greaterThan':
      return `${fieldName} > ${formatFilterValue(values[0], field)}`
    case 'lessThan':
      return `${fieldName} < ${formatFilterValue(values[0], field)}`
    case 'equals':
      return `${fieldName} = ${formatFilterValue(values[0], field)}`
  }
}

const buildDefinitionExpression = (filter: LayerFilter, fields: LayerField[]) => {
  const clauses = filter.expressions
    .map((expression) => buildFilterClause(expression, fields))
    .filter(Boolean)

  if (clauses.length === 0) return ''
  if (clauses.length === 1) return clauses[0]
  return clauses.map((clause) => `(${clause})`).join(` ${filter.join} `)
}

const combineDefinitionExpressions = (baseExpression: string, filterExpression: string) => {
  if (!baseExpression) return filterExpression
  return `(${baseExpression}) AND (${filterExpression})`
}

const sanitizeFileName = (value: string) => {
  return (value || 'Layer export')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

const formatCsvValue = (value: unknown) => {
  if (value === null || value === undefined) return ''
  let text: string
  if (value instanceof Date) {
    text = value.toISOString()
  } else if (typeof value === 'string') {
    text = value
  } else if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    text = value.toString()
  } else {
    text = JSON.stringify(value)
  }
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

const getCsvFields = (features: __esri.Graphic[], layerFields: LayerField[], selectedFieldNames?: string[]) => {
  if (selectedFieldNames) return selectedFieldNames.filter(Boolean)

  const configuredFields = layerFields.map((field) => field.name).filter(Boolean)
  if (configuredFields.length > 0) return configuredFields

  const fieldNames = new Set<string>()
  features.forEach((feature) => {
    Object.keys(feature.attributes || {}).forEach((fieldName) => { fieldNames.add(fieldName) })
  })
  return Array.from(fieldNames)
}

const toCsv = (features: __esri.Graphic[], layerFields: LayerField[], selectedFieldNames?: string[]) => {
  const fields = getCsvFields(features, layerFields, selectedFieldNames)
  const aliases = new Map(layerFields.map((field) => [field.name, field.alias || field.name]))
  const rows = [
    fields.map((field) => formatCsvValue(aliases.get(field) || field)).join(','),
    ...features.map((feature) => (
      fields.map((field) => formatCsvValue((feature.attributes || {})[field])).join(',')
    ))
  ]
  return rows.join('\r\n')
}

const downloadCsv = (fileName: string, csv: string) => {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${sanitizeFileName(fileName)}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

const readStoredRecord = <T,>(storageKey: string, parseEntry: (value: unknown) => T | undefined): { [key: string]: T } => {
  if (typeof window === 'undefined') return {}

  try {
    const saved = window.localStorage.getItem(storageKey)
    const parsed = saved ? JSON.parse(saved) : {}
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

    return Object.entries(parsed).reduce<{ [key: string]: T }>((record, [key, value]) => {
      const parsedValue = parseEntry(value)
      if (parsedValue !== undefined) record[key] = parsedValue
      return record
    }, {})
  } catch {
    return {}
  }
}

const writeStoredRecord = (storageKey: string, value: object) => {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(value))
  } catch {
    // Ignore storage failures; widget state can fall back to its configured defaults.
  }
}

const pruneRecordByKeys = <T,>(record: { [key: string]: T }, allowedKeys: Set<string>): { [key: string]: T } => {
  let changed = false
  const next = Object.entries(record).reduce<{ [key: string]: T }>((prunedRecord, [key, value]) => {
    if (allowedKeys.has(key)) {
      prunedRecord[key] = value
    } else {
      changed = true
    }
    return prunedRecord
  }, {})

  return changed ? next : record
}

const getExpandedCategoryStorageKey = (widgetId: string) => `layer-library:${widgetId}:expanded-categories`

const readStoredExpandedCategoryIds = (widgetId: string) => {
  if (typeof window === 'undefined') return []

  try {
    const saved = window.localStorage.getItem(getExpandedCategoryStorageKey(widgetId))
    const parsed = saved ? JSON.parse(saved) : []
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []
  } catch {
    return []
  }
}

const writeStoredExpandedCategoryIds = (widgetId: string, categoryIds: string[]) => {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(getExpandedCategoryStorageKey(widgetId), JSON.stringify(categoryIds))
  } catch {
    // Ignore private browsing/storage quota failures; expanded state is only a convenience.
  }
}

const getLayerVisibilityStorageKey = (widgetId: string) => `layer-library:${widgetId}:layer-visibility`

const readStoredLayerVisibility = (widgetId: string): LayerVisibilityByKey => {
  return readStoredRecord<boolean>(getLayerVisibilityStorageKey(widgetId), (value) => typeof value === 'boolean' ? value : undefined)
}

const writeStoredLayerVisibility = (widgetId: string, visibilityByKey: LayerVisibilityByKey) => {
  writeStoredRecord(getLayerVisibilityStorageKey(widgetId), visibilityByKey)
}

const getExportFieldModeStorageKey = (widgetId: string) => `layer-library:${widgetId}:export-field-mode`

const readStoredExportFieldMode = (widgetId: string): ExportFieldModeByKey => {
  return readStoredRecord<ExportFieldMode>(getExportFieldModeStorageKey(widgetId), (value) => (
    value === 'all' || value === 'custom' ? value : undefined
  ))
}

const writeStoredExportFieldMode = (widgetId: string, modeByKey: ExportFieldModeByKey) => {
  writeStoredRecord(getExportFieldModeStorageKey(widgetId), modeByKey)
}

const getExportFieldsStorageKey = (widgetId: string) => `layer-library:${widgetId}:export-fields`

const readStoredExportFields = (widgetId: string): ExportFieldsByKey => {
  return readStoredRecord<string[]>(getExportFieldsStorageKey(widgetId), (value) => {
    return Array.isArray(value) ? value.filter((fieldName) => typeof fieldName === 'string') : undefined
  })
}

const writeStoredExportFields = (widgetId: string, fieldsByKey: ExportFieldsByKey) => {
  writeStoredRecord(getExportFieldsStorageKey(widgetId), fieldsByKey)
}

const createFilterExpression = (field = ''): LayerFilterExpression => ({
  id: `expression-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  field,
  operator: 'equals',
  value: ''
})

const createLayerFilter = (field = ''): LayerFilter => ({
  join: 'AND',
  expressions: [createFilterExpression(field)]
})

const surfaceStyle = {
  borderColor: 'var(--sys-color-divider, rgba(127, 127, 127, 0.35))',
  background: 'color-mix(in srgb, var(--sys-color-surface-paper, transparent) 88%, var(--sys-color-primary-main, #007ac2) 12%)',
  color: 'var(--sys-color-text-primary)'
}

const subtleSurfaceStyle = {
  borderColor: 'var(--sys-color-divider, rgba(127, 127, 127, 0.28))',
  background: 'color-mix(in srgb, var(--sys-color-surface-paper, transparent) 94%, var(--sys-color-primary-main, #007ac2) 6%)'
}

const utilityButtonStyle = {
  ...docTextStyles.button,
  height: 24,
  padding: '0 7px',
  whiteSpace: 'nowrap' as const
}

const iconButtonStyle = {
  width: 28,
  height: 24,
  padding: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center'
}

const badgeStyle = {
  ...docTextStyles.badge,
  border: '1px solid color-mix(in srgb, var(--sys-color-primary-main, #007ac2) 55%, transparent)',
  background: 'color-mix(in srgb, var(--sys-color-primary-main, #007ac2) 18%, transparent)',
  fontSize: 10,
  lineHeight: '16px',
  padding: '0 6px',
  whiteSpace: 'nowrap' as const
}

const Widget = (props: AllWidgetProps<IMConfig>) => {
  const h = React.createElement
  const [jimuMapView, setJimuMapView] = React.useState<JimuMapView>(null)
  const [expandedCategoryIds, setExpandedCategoryIds] = React.useState<string[]>(() => readStoredExpandedCategoryIds(props.id))
  const [searchText, setSearchText] = React.useState('')
  const [openFilterLayerKey, setOpenFilterLayerKey] = React.useState('')
  const [openExportLayerKey, setOpenExportLayerKey] = React.useState('')
  const [exportStatus, setExportStatus] = React.useState('')
  const [storedLayerVisibility, setStoredLayerVisibility] = React.useState<LayerVisibilityByKey>(() => readStoredLayerVisibility(props.id))
  const [exportFieldModeByKey, setExportFieldModeByKey] = React.useState<ExportFieldModeByKey>(() => readStoredExportFieldMode(props.id))
  const [exportFieldsByKey, setExportFieldsByKey] = React.useState<ExportFieldsByKey>(() => readStoredExportFields(props.id))
  const [exportFieldSearchByKey, setExportFieldSearchByKey] = React.useState<ExportFieldSearchByKey>({})
  const [draftFilters, setDraftFilters] = React.useState<LayerFilterByKey>({})
  const [appliedFilters, setAppliedFilters] = React.useState<LayerFilterByKey>({})
  const [filterCounts, setFilterCounts] = React.useState<FilterCountByKey>({})
  const originalDefinitionExpressions = React.useRef<DefinitionExpressionByKey>({})

  const useMapWidgetId = props.useMapWidgetIds?.[0]
  const categories = React.useMemo(() => {
    return toMutableCategories(props.config?.categories)
  }, [props.config?.categories])
  const selectionMode = props.config?.selectionMode || 'multiple'
  const normalizedSearch = searchText.trim().toLowerCase()

  React.useEffect(() => {
    ensureDocFontLoaded()
  }, [])

  React.useEffect(() => {
    const configuredIds = categories.map((category) => category.id)
    const configuredLayerKeys = new Set(categories.flatMap((category) => category.layers.map(layerKey)))

    setExpandedCategoryIds((current) => current.filter((id) => configuredIds.includes(id)))
    setStoredLayerVisibility((current) => pruneRecordByKeys(current, configuredLayerKeys))
    setExportFieldModeByKey((current) => pruneRecordByKeys(current, configuredLayerKeys))
    setExportFieldsByKey((current) => pruneRecordByKeys(current, configuredLayerKeys))
    setFilterCounts((current) => pruneRecordByKeys(current, configuredLayerKeys))
  }, [categories])

  React.useEffect(() => {
    writeStoredExpandedCategoryIds(props.id, expandedCategoryIds)
  }, [expandedCategoryIds, props.id])

  React.useEffect(() => {
    writeStoredLayerVisibility(props.id, storedLayerVisibility)
  }, [props.id, storedLayerVisibility])

  React.useEffect(() => {
    writeStoredExportFieldMode(props.id, exportFieldModeByKey)
  }, [props.id, exportFieldModeByKey])

  React.useEffect(() => {
    writeStoredExportFields(props.id, exportFieldsByKey)
  }, [props.id, exportFieldsByKey])

  React.useEffect(() => {
    if (!jimuMapView) return

    categories.forEach((category) => {
      category.layers.forEach((layer) => {
        const key = layerKey(layer)
        if (key in storedLayerVisibility) {
          setLayerVisible(jimuMapView, layer, storedLayerVisibility[key])
        }
      })
    })
  }, [categories, jimuMapView, storedLayerVisibility])

  const setStoredLayerVisible = (libraryLayer: LibraryLayer, visible: boolean) => {
    if (jimuMapView) setLayerVisible(jimuMapView, libraryLayer, visible)
    setStoredLayerVisibility((current) => ({
      ...current,
      [layerKey(libraryLayer)]: visible
    }))
  }

  const toggleExpanded = (categoryId: string) => {
    setExpandedCategoryIds((current) => (
      current.includes(categoryId)
        ? current.filter((id) => id !== categoryId)
        : [...current, categoryId]
    ))
  }

  const toggleLayer = (libraryLayer: LibraryLayer, visible: boolean) => {
    setStoredLayerVisible(libraryLayer, visible)
  }

  const setCategoryLayerVisibility = (category: LayerCategory, mode: 'show' | 'hide' | 'reset') => {
    if (!jimuMapView) return

    if (selectionMode === 'single' && mode !== 'hide') {
      categories.forEach((candidate) => {
        candidate.layers.forEach((layer) => { setStoredLayerVisible(layer, false) })
      })
      setExpandedCategoryIds([category.id])
    }

    category.layers.forEach((layer) => {
      const visible = mode === 'show'
        ? true
        : mode === 'hide'
          ? false
          : layer.defaultVisible
      setStoredLayerVisible(layer, visible)
    })
  }

  const getSelectedExportFieldNames = (key: string, fields: LayerField[]) => {
    const fieldNames = fields.map((field) => field.name).filter(Boolean)
    if ((exportFieldModeByKey[key] || 'all') === 'all') return undefined

    const selectedFields = key in exportFieldsByKey ? exportFieldsByKey[key] : fieldNames
    return selectedFields.filter((fieldName) => fieldNames.includes(fieldName))
  }

  const setExportFieldMode = (key: string, mode: ExportFieldMode) => {
    setExportFieldModeByKey((current) => ({
      ...current,
      [key]: mode
    }))
  }

  const setExportFieldSearch = (key: string, value: string) => {
    setExportFieldSearchByKey((current) => ({
      ...current,
      [key]: value
    }))
  }

  const setExportFields = (key: string, fieldNames: string[]) => {
    setExportFieldsByKey((current) => ({
      ...current,
      [key]: fieldNames
    }))
  }

  const toggleExportField = (key: string, fields: LayerField[], fieldName: string, checked: boolean) => {
    const selectedFields = getSelectedExportFieldNames(key, fields) || []
    const nextFields = checked
      ? Array.from(new Set([...selectedFields, fieldName]))
      : selectedFields.filter((selectedField) => selectedField !== fieldName)

    setExportFields(key, nextFields)
  }

  const getDraftFilter = (libraryLayer: LibraryLayer, fields: LayerField[]) => {
    const key = layerKey(libraryLayer)
    return draftFilters[key] || appliedFilters[key] || createLayerFilter(fields[0]?.name || '')
  }

  const updateDraftFilter = (key: string, patch: Partial<LayerFilter>, fallbackField = '') => {
    setDraftFilters((current) => {
      const existing = current[key] || appliedFilters[key] || createLayerFilter(fallbackField)
      return {
        ...current,
        [key]: {
          ...existing,
          ...patch
        }
      }
    })
  }

  const updateDraftExpression = (key: string, expressionId: string, patch: Partial<LayerFilterExpression>, fallbackField = '') => {
    setDraftFilters((current) => {
      const existing = current[key] || appliedFilters[key] || createLayerFilter(fallbackField)
      return {
        ...current,
        [key]: {
          ...existing,
          expressions: existing.expressions.map((expression) => expression.id === expressionId ? { ...expression, ...patch } : expression)
        }
      }
    })
  }

  const updateDraftExpressionField = (key: string, expression: LayerFilterExpression, fieldName: string, fields: LayerField[]) => {
    const field = fields.find((candidate) => candidate.name === fieldName)
    const operators = getFilterOperatorsForField(field)
    updateDraftExpression(key, expression.id, {
      field: fieldName,
      operator: operators.includes(expression.operator) ? expression.operator : 'equals',
      value: ''
    }, fields[0]?.name || '')
  }

  const addDraftExpression = (key: string, fallbackField = '') => {
    setDraftFilters((current) => {
      const existing = current[key] || appliedFilters[key] || createLayerFilter(fallbackField)
      return {
        ...current,
        [key]: {
          ...existing,
          expressions: [...existing.expressions, createFilterExpression(fallbackField)]
        }
      }
    })
  }

  const removeDraftExpression = (key: string, expressionId: string, fallbackField = '') => {
    setDraftFilters((current) => {
      const existing = current[key] || appliedFilters[key] || createLayerFilter(fallbackField)
      const expressions = existing.expressions.filter((expression) => expression.id !== expressionId)
      return {
        ...current,
        [key]: {
          ...existing,
          expressions: expressions.length > 0 ? expressions : [createFilterExpression(fallbackField)]
        }
      }
    })
  }

  const queryFilteredFeatureCount = async (featureLayer: QueryableFeatureLayer, where: string) => {
    if (typeof featureLayer.queryFeatureCount !== 'function') return null

    try {
      const query = typeof featureLayer.createQuery === 'function'
        ? featureLayer.createQuery()
        : {} as __esri.QueryProperties

      query.where = where || '1=1'
      query.returnGeometry = false
      return await featureLayer.queryFeatureCount(query)
    } catch {
      return null
    }
  }

  const applyLayerFilter = async (libraryLayer: LibraryLayer, fields: LayerField[]) => {
    if (!jimuMapView) return

    const key = layerKey(libraryLayer)
    const resolved = resolveLayer(jimuMapView, libraryLayer)
    const filterableLayer = getFilterableLayer(resolved.layer)
    const filter = getDraftFilter(libraryLayer, fields)
    const expression = buildDefinitionExpression(filter, fields)

    if (!filterableLayer || !expression) return

    if (!(key in originalDefinitionExpressions.current)) {
      originalDefinitionExpressions.current[key] = filterableLayer.definitionExpression || ''
    }

    const nextDefinitionExpression = combineDefinitionExpressions(originalDefinitionExpressions.current[key], expression)
    filterableLayer.definitionExpression = nextDefinitionExpression
    setAppliedFilters((current) => ({ ...current, [key]: filter }))
    setDraftFilters((current) => ({ ...current, [key]: filter }))

    const count = await queryFilteredFeatureCount(filterableLayer, nextDefinitionExpression)
    setFilterCounts((current) => {
      const next = { ...current }
      if (typeof count === 'number') {
        next[key] = count
      } else {
        delete next[key]
      }
      return next
    })
  }

  const clearLayerFilter = (libraryLayer: LibraryLayer) => {
    if (!jimuMapView) return

    const key = layerKey(libraryLayer)
    const resolved = resolveLayer(jimuMapView, libraryLayer)
    const filterableLayer = getFilterableLayer(resolved.layer)

    if (filterableLayer) {
      filterableLayer.definitionExpression = originalDefinitionExpressions.current[key] || ''
    }

    setAppliedFilters((current) => {
      const next = { ...current }
      delete next[key]
      return next
    })
    setDraftFilters((current) => {
      const next = { ...current }
      delete next[key]
      return next
    })
    setFilterCounts((current) => {
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  const clearCategoryFilters = (category: LayerCategory) => {
    category.layers.forEach(clearLayerFilter)
  }

  const queryLayerFeatures = async (featureLayer: QueryableFeatureLayer, mode: ExportMode) => {
    const query = typeof featureLayer.createQuery === 'function'
      ? featureLayer.createQuery()
      : {} as __esri.QueryProperties

    query.where = featureLayer.definitionExpression || '1=1'
    query.outFields = ['*']
    query.returnGeometry = false

    if (mode === 'extent' && jimuMapView?.view?.extent) {
      query.geometry = jimuMapView.view.extent
      query.spatialRelationship = 'intersects'
    }

    const result = await featureLayer.queryFeatures(query)
    return result.features || []
  }

  const exportLayer = async (libraryLayer: LibraryLayer, mode: ExportMode) => {
    if (!jimuMapView) return

    const resolved = resolveLayer(jimuMapView, libraryLayer)
    const featureLayer = getQueryableFeatureLayer(resolved.layer)
    if (!featureLayer) return

    try {
      const layerFields = getLayerFields(resolved)
      const selectedFieldNames = getSelectedExportFieldNames(layerKey(libraryLayer), layerFields)
      if (selectedFieldNames && selectedFieldNames.length === 0) {
        setExportStatus(defaultMessages.exportNoFields)
        return
      }

      const features = mode === 'selected'
        ? await ((resolved.jimuLayerView as unknown as SelectableLayerView)?.getSelectedFeatures?.() || Promise.resolve([]))
        : await queryLayerFeatures(featureLayer, mode)

      if (features.length === 0) {
        setExportStatus(defaultMessages.exportNoRecords)
        return
      }

      const csv = toCsv(features, layerFields, selectedFieldNames)
      const modeLabel = mode === 'selected'
        ? defaultMessages.exportSelectedRecords
        : mode === 'extent'
          ? defaultMessages.exportVisibleExtent
          : defaultMessages.exportFilteredRecords
      downloadCsv(`${resolved.title || libraryLayer.id} - ${modeLabel}`, csv)
      setOpenExportLayerKey('')
      setExportStatus(defaultMessages.exportDownloaded)
    } catch {
      setExportStatus(defaultMessages.exportFailed)
    }
  }

  const zoomToLayer = async (libraryLayer: LibraryLayer) => {
    if (!jimuMapView) return

    const resolved = resolveLayer(jimuMapView, libraryLayer)
    const layerWithExtent = resolved.layer as unknown as { fullExtent?: __esri.Extent, queryExtent?: () => Promise<{ extent: __esri.Extent }> }

    try {
      if (layerWithExtent?.fullExtent) {
        await jimuMapView.view.goTo(layerWithExtent.fullExtent)
      } else if (typeof layerWithExtent?.queryExtent === 'function') {
        const result = await layerWithExtent.queryExtent()
        if (result?.extent) await jimuMapView.view.goTo(result.extent)
      }
    } catch {
      // Keep runtime interaction quiet if a service refuses extent navigation.
    }
  }

  const matchesSearch = (category: LayerCategory, libraryLayer?: LibraryLayer) => {
    if (!normalizedSearch) return true
    const categoryText = `${category.name} ${category.description || ''}`.toLowerCase()
    const layerText = `${libraryLayer?.title || ''} ${libraryLayer?.type || ''}`.toLowerCase()
    return categoryText.includes(normalizedSearch) || layerText.includes(normalizedSearch)
  }

  const visibleCategories = categories.map((category) => ({
    ...category,
    layers: category.layers.filter((layer) => matchesSearch(category, layer))
  })).filter((category) => matchesSearch(category) || category.layers.length > 0)

  const renderSvgIcon = (title: string, paths: string[]) => (
    h('svg', {
      viewBox: '0 0 24 24',
      width: 15,
      height: 15,
      role: 'img',
      'aria-label': title,
      style: { display: 'block' }
    },
      h('title', null, title),
      paths.map((path) => h('path', {
        key: path,
        d: path,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round'
      }))
    )
  )

  const filterIcon = renderSvgIcon(defaultMessages.openFilter, [
    'M4 5h16l-6 7v5l-4 2v-7L4 5z'
  ])

  const zoomIcon = renderSvgIcon(defaultMessages.zoomToLayer, [
    'M10.5 17a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13z',
    'M15.5 15.5 20 20',
    'M10.5 8v5',
    'M8 10.5h5'
  ])

  const exportIcon = renderSvgIcon(defaultMessages.exportCsv, [
    'M12 4v10',
    'M8 10l4 4 4-4',
    'M5 18h14'
  ])

  const renderExportMenu = (libraryLayer: LibraryLayer) => {
    const resolved = jimuMapView ? resolveLayer(jimuMapView, libraryLayer) : libraryLayer as ResolvedLayer
    const key = layerKey(libraryLayer)
    const fields = getLayerFields(resolved)
    const fieldNames = fields.map((field) => field.name).filter(Boolean)
    const exportFieldMode = exportFieldModeByKey[key] || 'all'
    const selectedFieldNames = getSelectedExportFieldNames(key, fields) || fieldNames
    const fieldSearch = (exportFieldSearchByKey[key] || '').trim().toLowerCase()
    const visibleFields = fields.filter((field) => {
      if (!fieldSearch) return true
      return `${field.alias || ''} ${field.name}`.toLowerCase().includes(fieldSearch)
    })
    const canExportSelected = !!(resolved.jimuLayerView as unknown as SelectableLayerView)?.getSelectedFeatures
    const exportDisabled = exportFieldMode === 'custom' && selectedFieldNames.length === 0
    const exportButton = (label: string, mode: ExportMode, disabled = false) => (
      h(Button, {
        size: 'sm',
        type: 'tertiary',
        className: 'w-100 text-left',
        disabled: disabled || exportDisabled,
        onClick: () => { exportLayer(libraryLayer, mode).catch(() => { setExportStatus(defaultMessages.exportFailed) }) },
        style: { ...docTextStyles.button, height: 26, padding: '0 8px', justifyContent: 'flex-start' }
      }, label)
    )

    return h('div', {
      className: 'ml-4 mb-2 p-2 border',
      style: {
        ...surfaceStyle,
        borderRadius: 6
      }
    },
      h('div', { className: 'mb-1', style: docTextStyles.sectionTitle }, defaultMessages.exportCsv),
      h('div', { className: 'mb-2' },
        h('div', { className: 'mb-1', style: docTextStyles.label }, defaultMessages.exportFields),
        h(Select, {
          size: 'sm',
          className: 'w-100',
          value: exportFieldMode,
          onChange: (event) => { setExportFieldMode(key, event.target.value as ExportFieldMode) }
        },
          h(Option, { value: 'all' }, defaultMessages.exportAllFields),
          h(Option, { value: 'custom' }, defaultMessages.exportCustomFields)
        )
      ),
      exportFieldMode === 'custom' && h('div', { className: 'mb-2' },
        h(TextInput, {
          size: 'sm',
          className: 'w-100 mb-1',
          placeholder: defaultMessages.exportSearchFields,
          value: exportFieldSearchByKey[key] || '',
          onChange: (event) => { setExportFieldSearch(key, event.target.value) }
        }),
        h('div', { className: 'd-flex align-items-center mb-1', style: { gap: 6 } },
          h(Button, {
            size: 'sm',
            type: 'tertiary',
            style: utilityButtonStyle,
            onClick: () => { setExportFields(key, fieldNames) }
          }, defaultMessages.exportSelectAllFields),
          h(Button, {
            size: 'sm',
            type: 'tertiary',
            style: utilityButtonStyle,
            onClick: () => { setExportFields(key, []) }
          }, defaultMessages.exportClearFields),
          h('span', { className: 'ml-auto', style: docTextStyles.muted }, `${selectedFieldNames.length}/${fieldNames.length}`)
        ),
        h('div', {
          className: 'border',
          style: {
            ...subtleSurfaceStyle,
            borderRadius: 4,
            maxHeight: 154,
            overflow: 'auto'
          }
        },
          visibleFields.map((field) => {
            const checked = selectedFieldNames.includes(field.name)
            return h('label', {
              key: field.name,
              className: 'd-flex align-items-center mb-0 px-2 py-1',
              title: field.name,
              style: { gap: 6, minHeight: 28 }
            },
              h(Checkbox, {
                checked,
                onChange: (_, nextChecked: boolean) => { toggleExportField(key, fields, field.name, nextChecked) }
              }),
              h('span', {
                className: 'text-truncate',
                style: { ...docTextStyles.body, minWidth: 0 }
              }, field.alias || field.name)
            )
          })
        )
      ),
      h('div', { className: 'd-flex flex-column', style: { gap: 4 } },
        exportButton(defaultMessages.exportFilteredRecords, 'filtered'),
        exportButton(defaultMessages.exportSelectedRecords, 'selected', !canExportSelected),
        exportButton(defaultMessages.exportVisibleExtent, 'extent', !jimuMapView?.view?.extent)
      )
    )
  }

  const renderOperatorOption = (operator: FilterOperator) => {
    const getOperatorLabel = () => {
      switch (operator) {
        case 'equals':
          return defaultMessages.operatorEquals
        case 'notEquals':
          return defaultMessages.operatorNotEquals
        case 'contains':
          return defaultMessages.operatorContains
        case 'startsWith':
          return defaultMessages.operatorStartsWith
        case 'anyOf':
          return defaultMessages.operatorAnyOf
        case 'greaterThan':
          return defaultMessages.operatorGreaterThan
        case 'lessThan':
          return defaultMessages.operatorLessThan
      }
    }

    return h(Option, { key: operator, value: operator }, getOperatorLabel())
  }

  const renderFilterValueControl = (key: string, expression: LayerFilterExpression, fields: LayerField[]) => {
    const field = fields.find((candidate) => candidate.name === expression.field)
    const domainValues = getFieldDomainValues(field)

    if (domainValues.length === 0) {
      return h(TextInput, {
        size: 'sm',
        className: 'w-100',
        value: expression.value,
        placeholder: expression.operator === 'anyOf' ? defaultMessages.filterValuesPlaceholder : defaultMessages.filterValuePlaceholder,
        onChange: (event) => { updateDraftExpression(key, expression.id, { value: event.target.value }, fields[0]?.name || '') }
      })
    }

    if (expression.operator !== 'anyOf') {
      return h(Select, {
        size: 'sm',
        className: 'w-100',
        value: expression.value,
        onChange: (event) => { updateDraftExpression(key, expression.id, { value: event.target.value }, fields[0]?.name || '') }
      },
        h(Option, { value: '' }, defaultMessages.filterSelectValue),
        domainValues.map((domainValue) => h(Option, { key: domainValue.value, value: domainValue.value }, domainValue.label))
      )
    }

    const selectedValues = parseFilterValues(expression.value)
    return h('div', {
      className: 'border',
      style: {
        ...subtleSurfaceStyle,
        borderRadius: 4,
        maxHeight: 132,
        overflow: 'auto'
      }
    },
      domainValues.map((domainValue) => {
          const checked = selectedValues.includes(domainValue.value)
          const nextValues = checked
            ? selectedValues.filter((value) => value !== domainValue.value)
            : [...selectedValues, domainValue.value]

          return h('label', {
            key: domainValue.value,
            className: 'd-flex align-items-center mb-0 px-2 py-1',
            style: { gap: 6, minHeight: 28 }
          },
            h(Checkbox, {
              checked,
              onChange: () => { updateDraftExpression(key, expression.id, { value: nextValues.join(', ') }, fields[0]?.name || '') }
            }),
            h('span', { className: 'text-truncate', style: { ...docTextStyles.body, minWidth: 0 } }, domainValue.label)
          )
        })
    )
  }

  const renderFilterPanel = (libraryLayer: LibraryLayer, fields: LayerField[]) => {
    const key = layerKey(libraryLayer)
    const filter = getDraftFilter(libraryLayer, fields)
    const active = !!appliedFilters[key]

    return h('div', {
      className: 'ml-4 mb-2 p-2 border',
      style: {
        ...surfaceStyle,
        borderRadius: 6,
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.12)'
      }
    },
      h('div', { className: 'd-flex align-items-center justify-content-between mb-2', style: { gap: 8 } },
        h('strong', { className: 'text-truncate', style: docTextStyles.sectionTitle }, `${defaultMessages.filter}: ${libraryLayer.title || libraryLayer.id}`),
        active && h('span', { style: badgeStyle }, defaultMessages.activeFilter)
      ),
      filter.expressions.map((expression) => (
        h('div', {
          key: expression.id,
          className: 'mb-2 p-2 border',
          style: {
            ...subtleSurfaceStyle,
            borderRadius: 4
          }
        },
          h('div', { className: 'd-flex align-items-center mb-1', style: { gap: 6 } },
            h(Select, {
              size: 'sm',
              value: expression.field,
              className: 'flex-fill',
              style: { minWidth: 0 },
              onChange: (event) => { updateDraftExpressionField(key, expression, event.target.value, fields) }
            },
              fields.map((field) => h(Option, { key: field.name, value: field.name }, field.alias || field.name))
            ),
            h(Select, {
              size: 'sm',
              value: expression.operator,
              style: { width: 112 },
              onChange: (event) => { updateDraftExpression(key, expression.id, { operator: event.target.value as FilterOperator, value: '' }, fields[0]?.name || '') }
            },
              getFilterOperatorsForField(fields.find((field) => field.name === expression.field)).map(renderOperatorOption)
            ),
            h(Button, {
              size: 'sm',
              type: 'tertiary',
              disabled: filter.expressions.length === 1,
              title: defaultMessages.removeExpression,
              onClick: () => { removeDraftExpression(key, expression.id, fields[0]?.name || '') },
              style: { ...docTextStyles.button, width: 26, height: 26, padding: 0, flex: '0 0 auto' }
            }, 'x')
          ),
          renderFilterValueControl(key, expression, fields)
        )
      )),
      h('div', { className: 'd-flex align-items-center', style: { gap: 6 } },
        filter.expressions.length > 1 && h(Select, {
          size: 'sm',
          value: filter.join,
          style: { width: 78 },
          onChange: (event) => { updateDraftFilter(key, { join: event.target.value as FilterJoin }, fields[0]?.name || '') }
        },
          h(Option, { value: 'AND' }, 'AND'),
          h(Option, { value: 'OR' }, 'OR')
        ),
        h(Button, {
          size: 'sm',
          type: 'tertiary',
          onClick: () => { addDraftExpression(key, fields[0]?.name || '') },
          style: { ...utilityButtonStyle, height: 28 }
        }, defaultMessages.addExpression),
        h('span', { className: 'flex-fill' }),
        h(Button, {
          size: 'sm',
          type: 'tertiary',
          disabled: !active,
          onClick: () => { clearLayerFilter(libraryLayer) },
          style: { ...utilityButtonStyle, height: 28 }
        }, defaultMessages.clearFilter),
        h(Button, {
          size: 'sm',
          type: 'primary',
          disabled: !filter.expressions.some((expression) => expression.field && expression.value.trim()),
          onClick: () => { void applyLayerFilter(libraryLayer, fields) },
          style: { ...docTextStyles.button, height: 28, padding: '0 10px', whiteSpace: 'nowrap' }
        }, defaultMessages.applyFilter)
      )
    )
  }

  const renderLayer = (libraryLayer: LibraryLayer) => {
    const resolved = jimuMapView ? resolveLayer(jimuMapView, libraryLayer) : libraryLayer as ResolvedLayer
    const key = layerKey(libraryLayer)
    const visible = key in storedLayerVisibility ? storedLayerVisibility[key] : resolved.layer?.visible
    const canZoom = (props.config?.showZoomToLayer) && libraryLayer.allowZoom
    const fields = getLayerFields(resolved)
    const canFilter = !!props.config?.showLayerFilters && libraryLayer.allowFiltering && !!getFilterableLayer(resolved.layer) && fields.length > 0
    const canExport = (props.config?.showExportCsv ?? true) && !!getQueryableFeatureLayer(resolved.layer)
    const filterOpen = openFilterLayerKey === key
    const exportOpen = openExportLayerKey === key
    const hasFilter = !!appliedFilters[key]

    return h('div', { key, className: 'mb-1' },
      h('div', {
        className: 'd-flex align-items-center justify-content-between ml-4 px-2 py-1',
        style: {
          gap: 8,
          minHeight: 32,
          borderRadius: 4,
          background: hasFilter || filterOpen
            ? 'color-mix(in srgb, var(--sys-color-primary-main, #007ac2) 13%, transparent)'
            : 'transparent'
        }
      },
        h('label', { className: 'd-flex align-items-center flex-fill mb-0', style: { minWidth: 0 } },
          (props.config?.showVisibilityToggle) && h(Checkbox, {
            checked: visible,
            disabled: !resolved.layer,
            onChange: (_, checked: boolean) => { toggleLayer(libraryLayer, checked) }
          }),
          h('span', {
            className: (props.config?.showVisibilityToggle) ? 'ml-2' : '',
            title: resolved.title,
            style: { ...docTextStyles.body, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
          }, resolved.title),
          hasFilter && h('span', {
            className: 'ml-2',
            title: defaultMessages.activeFilter,
            style: badgeStyle
          }, typeof filterCounts[key] === 'number' ? `${defaultMessages.filterBadge} (${filterCounts[key]})` : defaultMessages.filterBadge)
        ),
        canFilter && h(Button, {
          size: 'sm',
          type: hasFilter || filterOpen ? 'primary' : 'tertiary',
          title: defaultMessages.openFilter,
          'aria-label': defaultMessages.openFilter,
          onClick: () => { setOpenFilterLayerKey(filterOpen ? '' : key) },
          style: iconButtonStyle
        }, filterIcon),
        canZoom && h(Button, {
          size: 'sm',
          type: 'tertiary',
          disabled: !resolved.layer,
          title: defaultMessages.zoomToLayer,
          'aria-label': defaultMessages.zoomToLayer,
          onClick: () => zoomToLayer(libraryLayer),
          style: iconButtonStyle
        }, zoomIcon),
        canExport && h(Button, {
          size: 'sm',
          type: exportOpen ? 'primary' : 'tertiary',
          title: defaultMessages.exportCsv,
          'aria-label': defaultMessages.exportCsv,
          onClick: () => { setOpenExportLayerKey(exportOpen ? '' : key) },
          style: iconButtonStyle
        }, exportIcon)
      ),
      filterOpen && renderFilterPanel(libraryLayer, fields),
      exportOpen && renderExportMenu(libraryLayer)
    )
  }

  const renderCategory = (category: LayerCategory) => {
    const expanded = expandedCategoryIds.includes(category.id) || !!normalizedSearch

    return h('div', {
      key: category.id,
      className: 'border-bottom',
      style: { borderColor: 'var(--sys-color-divider, rgba(127, 127, 127, 0.35))' }
    },
      h('div', { className: 'd-flex align-items-center py-2', style: { gap: 8, minHeight: 44 } },
        h(Button, {
          size: 'sm',
          type: 'tertiary',
          title: expanded ? 'Collapse' : 'Expand',
          onClick: () => { toggleExpanded(category.id) },
          style: { width: 28, height: 28, padding: 0 }
        }, expanded ? 'v' : '>'),
        h('div', { className: 'flex-fill', style: { minWidth: 0 } },
          h('div', { className: 'text-truncate', style: docTextStyles.sectionTitle }, category.name),
          category.description && h('div', { className: 'text-truncate', style: docTextStyles.muted }, category.description)
        ),
        h('span', { style: docTextStyles.badge }, category.layers.length),
        h('div', { className: 'd-flex align-items-center', style: { gap: 4 } },
          h(Button, {
            size: 'sm',
            type: 'tertiary',
            disabled: !jimuMapView,
            title: defaultMessages.showCategoryLayers,
            onClick: () => { setCategoryLayerVisibility(category, 'show') },
            style: utilityButtonStyle
          }, defaultMessages.showCategoryLayers),
          h(Button, {
            size: 'sm',
            type: 'tertiary',
            disabled: !jimuMapView,
            title: defaultMessages.hideCategoryLayers,
            onClick: () => { setCategoryLayerVisibility(category, 'hide') },
            style: utilityButtonStyle
          }, defaultMessages.hideCategoryLayers),
          h(Button, {
            size: 'sm',
            type: 'tertiary',
            disabled: !jimuMapView,
            title: defaultMessages.resetCategoryLayers,
            onClick: () => { setCategoryLayerVisibility(category, 'reset') },
            style: utilityButtonStyle
          }, defaultMessages.resetCategoryLayers)
        ),
        !!props.config?.showLayerFilters && category.layers.some((layer) => !!appliedFilters[layerKey(layer)]) && h(Button, {
          size: 'sm',
          type: 'tertiary',
          title: defaultMessages.clearCategoryFilters,
          onClick: () => { clearCategoryFilters(category) },
          style: utilityButtonStyle
        }, defaultMessages.clearFilters)
      ),
      expanded && h('div', { className: 'pb-2' },
        category.layers.map(renderLayer)
      )
    )
  }

  const message = !useMapWidgetId
    ? defaultMessages.configureWidget
    : categories.length === 0
      ? defaultMessages.noCategories
      : ''

  return h('div', {
    className: 'widget-layer-library jimu-widget p-3',
    style: { ...docTextStyles.shell, height: '100%', overflow: 'auto' }
  },
    useMapWidgetId && h(JimuMapViewComponent, {
      useMapWidgetId,
      onActiveViewChange: setJimuMapView
    }),
    h('div', { className: 'd-flex align-items-center justify-content-between mb-2' },
      h('h5', { className: 'mb-0', style: docTextStyles.title },
        'L A Y E R',
        h('span', { 'aria-hidden': true, style: { display: 'inline-block', width: 8 } }),
        'L I B R A R Y'
      )
    ),
    (props.config?.showSearch) && categories.length > 0 && h(TextInput, {
      className: 'mb-2',
      size: 'sm',
      placeholder: defaultMessages.searchPlaceholder,
      value: searchText,
      onChange: (event) => { setSearchText(event.target.value) }
    }),
    exportStatus && h('div', {
      className: 'mb-2',
      style: {
        ...docTextStyles.muted,
        color: exportStatus === defaultMessages.exportFailed ? 'var(--sys-color-error-main)' : 'var(--sys-color-text-secondary)'
      }
    }, exportStatus),
    message
      ? h('div', { style: docTextStyles.muted }, message)
      : visibleCategories.length > 0
        ? visibleCategories.map(renderCategory)
        : h('div', { style: docTextStyles.muted }, defaultMessages.noMatches)
  )
}

export default Widget
