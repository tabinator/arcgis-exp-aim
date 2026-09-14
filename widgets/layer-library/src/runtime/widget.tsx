import { React, type AllWidgetProps } from 'jimu-core'
import { Button, Checkbox, Option, Select, TextInput } from 'jimu-ui'
import { JimuMapViewComponent, type JimuLayerView, type JimuMapView } from 'jimu-arcgis'
import type { IMConfig, LayerCategory, LibraryLayer } from '../config'
import defaultMessages from './translations/default'

type FilterOperator = 'equals' | 'notEquals' | 'contains' | 'startsWith' | 'anyOf' | 'greaterThan' | 'lessThan'
type FilterJoin = 'AND' | 'OR'
type ExportMode = 'filtered' | 'selected' | 'extent'

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

interface LayerField {
  name: string
  alias?: string
  type?: string
}

interface QueryableFeatureLayer {
  definitionExpression?: string
  fields?: LayerField[]
  objectIdField?: string
  title?: string
  createQuery?: () => __esri.Query
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

const categoryContainsLayer = (category: LayerCategory, targetLayer: LibraryLayer) => {
  const targetKey = layerKey(targetLayer)
  return category.layers.some((layer) => layerKey(layer) === targetKey)
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

const escapeSqlValue = (value: string) => value.replace(/'/g, "''")

const formatFilterValue = (value: string, field?: LayerField) => {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return isTextField(field) ? `'${escapeSqlValue(trimmed)}'` : trimmed
}

const buildFilterClause = (expression: LayerFilterExpression, fields: LayerField[]) => {
  const field = fields.find((candidate) => candidate.name === expression.field)
  const values = expression.value.split(',').map((value) => value.trim()).filter(Boolean)
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

const getCsvFields = (features: __esri.Graphic[], layerFields: LayerField[]) => {
  const configuredFields = layerFields.map((field) => field.name).filter(Boolean)
  if (configuredFields.length > 0) return configuredFields

  const fieldNames = new Set<string>()
  features.forEach((feature) => {
    Object.keys(feature.attributes || {}).forEach((fieldName) => { fieldNames.add(fieldName) })
  })
  return Array.from(fieldNames)
}

const toCsv = (features: __esri.Graphic[], layerFields: LayerField[]) => {
  const fields = getCsvFields(features, layerFields)
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
  height: 24,
  padding: '0 7px',
  fontSize: 11,
  lineHeight: '14px',
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
  border: '1px solid color-mix(in srgb, var(--sys-color-primary-main, #007ac2) 55%, transparent)',
  borderRadius: 999,
  background: 'color-mix(in srgb, var(--sys-color-primary-main, #007ac2) 18%, transparent)',
  color: 'var(--sys-color-primary-main, #007ac2)',
  fontSize: 10,
  fontWeight: 600,
  lineHeight: '16px',
  padding: '0 6px',
  whiteSpace: 'nowrap' as const
}

const Widget = (props: AllWidgetProps<IMConfig>) => {
  const h = React.createElement
  const [jimuMapView, setJimuMapView] = React.useState<JimuMapView>(null)
  const [expandedCategoryIds, setExpandedCategoryIds] = React.useState<string[]>([])
  const [activeCategoryIds, setActiveCategoryIds] = React.useState<string[]>([])
  const [searchText, setSearchText] = React.useState('')
  const [openFilterLayerKey, setOpenFilterLayerKey] = React.useState('')
  const [openExportLayerKey, setOpenExportLayerKey] = React.useState('')
  const [exportStatus, setExportStatus] = React.useState('')
  const [draftFilters, setDraftFilters] = React.useState<LayerFilterByKey>({})
  const [appliedFilters, setAppliedFilters] = React.useState<LayerFilterByKey>({})
  const originalDefinitionExpressions = React.useRef<DefinitionExpressionByKey>({})

  const useMapWidgetId = props.useMapWidgetIds?.[0]
  const categories = React.useMemo(() => {
    return toMutableCategories(props.config?.categories)
  }, [props.config?.categories])
  const selectionMode = props.config?.selectionMode || 'multiple'
  const normalizedSearch = searchText.trim().toLowerCase()

  React.useEffect(() => {
    const configuredIds = categories.map((category) => category.id)
    setExpandedCategoryIds((current) => current.filter((id) => configuredIds.includes(id)))
    setActiveCategoryIds((current) => current.filter((id) => configuredIds.includes(id)))
  }, [categories])

  const toggleExpanded = (categoryId: string) => {
    setExpandedCategoryIds((current) => (
      current.includes(categoryId)
        ? current.filter((id) => id !== categoryId)
        : [...current, categoryId]
    ))
  }

  const activateCategory = (category: LayerCategory, active: boolean) => {
    if (!jimuMapView) return

    if (selectionMode === 'single') {
      categories.forEach((candidate) => {
        candidate.layers.forEach((layer) => { setLayerVisible(jimuMapView, layer, false) })
      })

      if (active) {
        category.layers.forEach((layer) => { setLayerVisible(jimuMapView, layer, layer.defaultVisible) })
        setActiveCategoryIds([category.id])
        setExpandedCategoryIds([category.id])
      } else {
        setActiveCategoryIds([])
      }
      return
    }

    const nextActiveCategoryIds = active
      ? Array.from(new Set([...activeCategoryIds, category.id]))
      : activeCategoryIds.filter((id) => id !== category.id)
    const nextActiveCategories = categories.filter((candidate) => nextActiveCategoryIds.includes(candidate.id))

    category.layers.forEach((layer) => {
      const stillActiveElsewhere = nextActiveCategories.some((candidate) => candidate.id !== category.id && categoryContainsLayer(candidate, layer))
      setLayerVisible(jimuMapView, layer, active ? layer.defaultVisible : stillActiveElsewhere)
    })
    setActiveCategoryIds(nextActiveCategoryIds)
  }

  const toggleLayer = (libraryLayer: LibraryLayer, visible: boolean) => {
    if (!jimuMapView) return
    setLayerVisible(jimuMapView, libraryLayer, visible)
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

  const applyLayerFilter = (libraryLayer: LibraryLayer, fields: LayerField[]) => {
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

    filterableLayer.definitionExpression = combineDefinitionExpressions(originalDefinitionExpressions.current[key], expression)
    setAppliedFilters((current) => ({ ...current, [key]: filter }))
    setDraftFilters((current) => ({ ...current, [key]: filter }))
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
      const features = mode === 'selected'
        ? await ((resolved.jimuLayerView as unknown as SelectableLayerView)?.getSelectedFeatures?.() || Promise.resolve([]))
        : await queryLayerFeatures(featureLayer, mode)

      if (features.length === 0) {
        setExportStatus(defaultMessages.exportNoRecords)
        return
      }

      const csv = toCsv(features, getLayerFields(resolved))
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
    const canExportSelected = !!(resolved.jimuLayerView as unknown as SelectableLayerView)?.getSelectedFeatures
    const exportButton = (label: string, mode: ExportMode, disabled = false) => (
      h(Button, {
        size: 'sm',
        type: 'tertiary',
        className: 'w-100 text-left',
        disabled,
        onClick: () => { exportLayer(libraryLayer, mode).catch(() => { setExportStatus(defaultMessages.exportFailed) }) },
        style: { height: 26, padding: '0 8px', fontSize: 11, justifyContent: 'flex-start' }
      }, label)
    )

    return h('div', {
      className: 'ml-4 mb-2 p-2 border',
      style: {
        ...surfaceStyle,
        borderRadius: 6
      }
    },
      h('div', { className: 'small font-weight-bold mb-1' }, defaultMessages.exportCsv),
      h('div', { className: 'd-flex flex-column', style: { gap: 4 } },
        exportButton(defaultMessages.exportFilteredRecords, 'filtered'),
        exportButton(defaultMessages.exportSelectedRecords, 'selected', !canExportSelected),
        exportButton(defaultMessages.exportVisibleExtent, 'extent', !jimuMapView?.view?.extent)
      )
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
        h('strong', { className: 'small text-truncate' }, `${defaultMessages.filter}: ${libraryLayer.title || libraryLayer.id}`),
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
              onChange: (event) => { updateDraftExpression(key, expression.id, { field: event.target.value }, fields[0]?.name || '') }
            },
              fields.map((field) => h(Option, { key: field.name, value: field.name }, field.alias || field.name))
            ),
            h(Select, {
              size: 'sm',
              value: expression.operator,
              style: { width: 112 },
              onChange: (event) => { updateDraftExpression(key, expression.id, { operator: event.target.value as FilterOperator }, fields[0]?.name || '') }
            },
              h(Option, { value: 'equals' }, defaultMessages.operatorEquals),
              h(Option, { value: 'notEquals' }, defaultMessages.operatorNotEquals),
              h(Option, { value: 'contains' }, defaultMessages.operatorContains),
              h(Option, { value: 'startsWith' }, defaultMessages.operatorStartsWith),
              h(Option, { value: 'anyOf' }, defaultMessages.operatorAnyOf),
              h(Option, { value: 'greaterThan' }, defaultMessages.operatorGreaterThan),
              h(Option, { value: 'lessThan' }, defaultMessages.operatorLessThan)
            ),
            h(Button, {
              size: 'sm',
              type: 'tertiary',
              disabled: filter.expressions.length === 1,
              title: defaultMessages.removeExpression,
              onClick: () => { removeDraftExpression(key, expression.id, fields[0]?.name || '') },
              style: { width: 26, height: 26, padding: 0, fontSize: 13, flex: '0 0 auto' }
            }, 'x')
          ),
          h(TextInput, {
            size: 'sm',
            className: 'w-100',
            value: expression.value,
            placeholder: expression.operator === 'anyOf' ? defaultMessages.filterValuesPlaceholder : defaultMessages.filterValuePlaceholder,
            onChange: (event) => { updateDraftExpression(key, expression.id, { value: event.target.value }, fields[0]?.name || '') }
          })
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
          onClick: () => { applyLayerFilter(libraryLayer, fields) },
          style: { height: 28, padding: '0 10px', fontSize: 11, lineHeight: '14px', whiteSpace: 'nowrap' }
        }, defaultMessages.applyFilter)
      )
    )
  }

  const renderLayer = (libraryLayer: LibraryLayer) => {
    const resolved = jimuMapView ? resolveLayer(jimuMapView, libraryLayer) : libraryLayer as ResolvedLayer
    const visible = resolved.layer?.visible
    const canZoom = (props.config?.showZoomToLayer) && libraryLayer.allowZoom
    const fields = getLayerFields(resolved)
    const key = layerKey(libraryLayer)
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
            style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
          }, resolved.title),
          hasFilter && h('span', {
            className: 'ml-2',
            title: defaultMessages.activeFilter,
            style: badgeStyle
          }, defaultMessages.filterBadge)
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
    const active = activeCategoryIds.includes(category.id)

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
        h(Checkbox, {
          checked: active,
          disabled: !jimuMapView,
          title: active ? defaultMessages.activeCategory : defaultMessages.inactiveCategory,
          onChange: (_, checked: boolean) => { activateCategory(category, checked) }
        }),
        h('div', { className: 'flex-fill', style: { minWidth: 0 } },
          h('div', { className: 'font-weight-bold text-truncate' }, category.name),
          category.description && h('div', { className: 'text-muted small text-truncate' }, category.description)
        ),
        h('span', { className: 'text-muted small' }, category.layers.length),
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
    style: { height: '100%', overflow: 'auto' }
  },
    useMapWidgetId && h(JimuMapViewComponent, {
      useMapWidgetId,
      onActiveViewChange: setJimuMapView
    }),
    h('div', { className: 'd-flex align-items-center justify-content-between mb-2' },
      h('h5', { className: 'mb-0' }, defaultMessages._widgetLabel),
      h('span', { className: 'text-muted small' }, selectionMode === 'single' ? 'Single' : 'Multiple')
    ),
    (props.config?.showSearch) && categories.length > 0 && h(TextInput, {
      className: 'mb-2',
      size: 'sm',
      placeholder: defaultMessages.searchPlaceholder,
      value: searchText,
      onChange: (event) => { setSearchText(event.target.value) }
    }),
    exportStatus && h('div', {
      className: 'small mb-2',
      style: { color: exportStatus === defaultMessages.exportFailed ? 'var(--sys-color-error-main)' : 'var(--sys-color-text-secondary)' }
    }, exportStatus),
    message
      ? h('div', { className: 'text-muted small' }, message)
      : visibleCategories.length > 0
        ? visibleCategories.map(renderCategory)
        : h('div', { className: 'text-muted small' }, defaultMessages.noMatches)
  )
}

export default Widget
