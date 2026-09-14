import { React, type AllWidgetProps } from 'jimu-core'
import { Button, Checkbox, TextInput } from 'jimu-ui'
import { JimuMapViewComponent, type JimuLayerView, type JimuMapView } from 'jimu-arcgis'
import type { IMConfig, LayerCategory, LibraryLayer } from '../config'
import defaultMessages from './translations/default'

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

const Widget = (props: AllWidgetProps<IMConfig>) => {
  const h = React.createElement
  const [jimuMapView, setJimuMapView] = React.useState<JimuMapView>(null)
  const [expandedCategoryIds, setExpandedCategoryIds] = React.useState<string[]>([])
  const [activeCategoryIds, setActiveCategoryIds] = React.useState<string[]>([])
  const [searchText, setSearchText] = React.useState('')

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

  const renderLayer = (libraryLayer: LibraryLayer) => {
    const resolved = jimuMapView ? resolveLayer(jimuMapView, libraryLayer) : libraryLayer as ResolvedLayer
    const visible = resolved.layer?.visible
    const canZoom = (props.config?.showZoomToLayer) && libraryLayer.allowZoom

    return h('div', {
      key: layerKey(libraryLayer),
      className: 'd-flex align-items-center justify-content-between py-1 pl-4',
      style: { gap: 8 }
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
        }, resolved.title)
      ),
      canZoom && h(Button, {
        size: 'sm',
        type: 'tertiary',
        disabled: !resolved.layer,
        title: defaultMessages.zoomToLayer,
        onClick: () => zoomToLayer(libraryLayer),
        style: { height: 24, padding: '0 6px', fontSize: 11 }
      }, 'Zoom')
    )
  }

  const renderCategory = (category: LayerCategory) => {
    const expanded = expandedCategoryIds.includes(category.id) || !!normalizedSearch
    const active = activeCategoryIds.includes(category.id)

    return h('div', { key: category.id, className: 'border-bottom' },
      h('div', { className: 'd-flex align-items-center py-2', style: { gap: 8 } },
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
        h('span', { className: 'text-muted small' }, category.layers.length)
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
    message
      ? h('div', { className: 'text-muted small' }, message)
      : visibleCategories.length > 0
        ? visibleCategories.map(renderCategory)
        : h('div', { className: 'text-muted small' }, defaultMessages.noMatches)
  )
}

export default Widget
