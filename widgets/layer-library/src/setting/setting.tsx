import { React } from 'jimu-core'
import type { AllWidgetSettingProps } from 'jimu-for-builder'
import { Button, Checkbox, Option, Select, TextInput } from 'jimu-ui'
import { JimuMapViewComponent, type JimuLayerView, type JimuMapView } from 'jimu-arcgis'
import { JimuLayerViewSelector, MapWidgetSelector, SettingRow, SettingSection } from 'jimu-ui/advanced/setting-components'
import type { CategorySelectionMode, IMConfig, LayerCategory, LibraryLayer } from '../config'
import defaultMessages from './translations/default'
import { docTextStyles, ensureDocFontLoaded } from '../shared/doc-text-style'

const toMutableCategories = (categories): LayerCategory[] => {
  return (categories?.asMutable ? categories.asMutable({ deep: true }) : categories || []) as LayerCategory[]
}

const moveItem = <T,>(items: T[], fromIndex: number, toIndex: number): T[] => {
  if (toIndex < 0 || toIndex >= items.length) return items
  const next = [...items]
  const [item] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, item)
  return next
}

const getLayerCapabilities = (layer: __esri.Layer): Pick<LibraryLayer, 'allowFiltering' | 'allowOpacity' | 'allowZoom' | 'filterFields'> => {
  const fields = ((layer as unknown as { fields?: Array<{ name: string }> }).fields || [])
    .map((field) => field.name)
    .filter(Boolean)

  return {
    allowFiltering: layer?.type === 'feature' && fields.length > 0,
    allowOpacity: !!layer && 'opacity' in layer,
    allowZoom: !!((layer as unknown as { fullExtent?: __esri.Extent }).fullExtent),
    filterFields: fields
  }
}

const createLibraryLayer = (jimuLayerView: JimuLayerView): LibraryLayer => {
  const layer = jimuLayerView.layer
  const capabilities = getLayerCapabilities(layer)

  return {
    id: jimuLayerView.id,
    jimuLayerViewId: jimuLayerView.id,
    layerDataSourceId: jimuLayerView.layerDataSourceId,
    arcgisLayerId: layer?.id,
    title: layer?.title || jimuLayerView.id,
    type: layer?.type,
    defaultVisible: layer?.visible !== false,
    ...capabilities
  }
}

const Setting = (props: AllWidgetSettingProps<IMConfig>) => {
  const h = React.createElement
  const [jimuMapView, setJimuMapView] = React.useState<JimuMapView>(null)
  const [selectedCategoryId, setSelectedCategoryId] = React.useState('')
  const [draftName, setDraftName] = React.useState('')
  const [draftDescription, setDraftDescription] = React.useState('')

  const useMapWidgetId = props.useMapWidgetIds?.[0]
  const categories = toMutableCategories(props.config?.categories)
  const selectedCategory = categories.find((category) => category.id === selectedCategoryId) || categories[0]
  const activeCategoryId = selectedCategory?.id || ''

  React.useEffect(() => {
    ensureDocFontLoaded()
  }, [])

  React.useEffect(() => {
    if (!activeCategoryId) {
      setSelectedCategoryId('')
    } else if (!selectedCategoryId || !categories.some((category) => category.id === selectedCategoryId)) {
      setSelectedCategoryId(activeCategoryId)
    }
  }, [activeCategoryId, categories, selectedCategoryId])

  const updateConfig = (nextCategories: LayerCategory[] = categories, patch = {}) => {
    props.onSettingChange({
      id: props.id,
      config: props.config
        .set('categories', nextCategories)
        .merge(patch)
    })
  }

  const updateCategory = (categoryId: string, updater: (category: LayerCategory) => LayerCategory) => {
    updateConfig(categories.map((category) => category.id === categoryId ? updater(category) : category))
  }

  const onMapWidgetSelected = (useMapWidgetIds: string[]) => {
    props.onSettingChange({
      id: props.id,
      useMapWidgetIds
    })
  }

  const onAddCategory = () => {
    const name = draftName.trim()
    if (!name) return

    const category: LayerCategory = {
      id: `category-${Date.now()}`,
      name,
      description: draftDescription.trim(),
      layers: []
    }

    updateConfig([...categories, category])
    setSelectedCategoryId(category.id)
    setDraftName('')
    setDraftDescription('')
  }

  const onDeleteCategory = (categoryId: string) => {
    const nextCategories = categories.filter((category) => category.id !== categoryId)
    updateConfig(nextCategories)
    setSelectedCategoryId(nextCategories[0]?.id || '')
  }

  const onLayerSelectionChange = (jimuLayerViewIds: string[]) => {
    if (!activeCategoryId) return

    const allLayerViews = jimuMapView?.jimuLayerViews || {}
    const existingLayersById = new Map((selectedCategory?.layers || []).map((layer) => [layer.jimuLayerViewId || layer.id, layer]))
    const layers = jimuLayerViewIds.map((jimuLayerViewId) => {
      const jimuLayerView = allLayerViews[jimuLayerViewId]
      return jimuLayerView ? createLibraryLayer(jimuLayerView) : existingLayersById.get(jimuLayerViewId)
    }).filter(Boolean) as LibraryLayer[]

    updateCategory(activeCategoryId, (category) => ({ ...category, layers }))
  }

  const setBoolean = (key: string, checked: boolean) => { updateConfig(categories, { [key]: checked }) }
  const selectedLayerIds = (selectedCategory?.layers || []).map((layer) => layer.jimuLayerViewId || layer.id)

  const renderToggle = (label: string, checked: boolean, onChange: (event, checked: boolean) => void) => (
    h('label', { className: 'd-flex align-items-center w-100 mb-0' },
      h(Checkbox, { checked, onChange }),
      h('span', { className: 'ml-2', style: docTextStyles.body }, label)
    )
  )

  return h(React.Fragment, null,
    useMapWidgetId && h(JimuMapViewComponent, {
      useMapWidgetId,
      onActiveViewChange: setJimuMapView
    }),

    h(SettingSection, { title: defaultMessages.mapSection },
      h(SettingRow, { label: defaultMessages.selectMapWidget }),
      h(SettingRow, null,
        h(MapWidgetSelector, {
          useMapWidgetIds: props.useMapWidgetIds,
          onSelect: onMapWidgetSelected
        })
      )
    ),

    h(SettingSection, { title: defaultMessages.categoriesSection },
      h(SettingRow, { label: defaultMessages.categoryName }),
      h(SettingRow, null,
        h(TextInput, {
          className: 'w-100',
          size: 'sm',
          value: draftName,
          onChange: (event) => { setDraftName(event.target.value) }
        })
      ),
      h(SettingRow, { label: defaultMessages.categoryDescription }),
      h(SettingRow, null,
        h(TextInput, {
          className: 'w-100',
          size: 'sm',
          value: draftDescription,
          onChange: (event) => { setDraftDescription(event.target.value) }
        })
      ),
      h(SettingRow, null,
        h(Button, {
          size: 'sm',
          type: 'primary',
          className: 'w-100',
          disabled: !draftName.trim(),
          onClick: onAddCategory
        }, defaultMessages.addCategory)
      ),
      categories.map((category, index) => (
        h('div', {
          key: category.id,
          className: `border-top py-2 ${category.id === activeCategoryId ? 'font-weight-bold' : ''}`
        },
          h('div', { className: 'd-flex align-items-center justify-content-between', style: { gap: 8 } },
            h(TextInput, {
              className: 'flex-fill',
              size: 'sm',
              value: category.name,
              placeholder: defaultMessages.categoryName,
              onFocus: () => { setSelectedCategoryId(category.id) },
              onChange: (event) => {
                const nextName = event.target.value
                setSelectedCategoryId(category.id)
                updateCategory(category.id, (currentCategory) => ({ ...currentCategory, name: nextName }))
              }
            }),
            h('span', {
              style: { ...docTextStyles.badge, flex: '0 0 auto' }
            }, `${category.layers.length} layers`)
          ),
          h('div', { className: 'd-flex align-items-center mt-1', style: { gap: 6 } },
            h(Button, {
              size: 'sm',
              type: 'tertiary',
              disabled: index === 0,
              style: docTextStyles.button,
              onClick: () => { updateConfig(moveItem(categories, index, index - 1)) }
            }, defaultMessages.moveUp),
            h(Button, {
              size: 'sm',
              type: 'tertiary',
              disabled: index === categories.length - 1,
              style: docTextStyles.button,
              onClick: () => { updateConfig(moveItem(categories, index, index + 1)) }
            }, defaultMessages.moveDown),
            h(Button, {
              size: 'sm',
              type: 'tertiary',
              style: docTextStyles.button,
              onClick: () => { onDeleteCategory(category.id) }
            }, defaultMessages.deleteCategory)
          )
        )
      ))
    ),

    h(SettingSection, { title: defaultMessages.assignLayers },
      h(SettingRow, { label: defaultMessages.selectCategory }),
      h(SettingRow, null,
        h(Select, {
          className: 'w-100',
          size: 'sm',
          value: activeCategoryId,
          disabled: categories.length === 0,
          onChange: (event) => { setSelectedCategoryId(event.target.value) }
        },
          categories.map((category) => h(Option, { key: category.id, value: category.id }, category.name))
        )
      ),
      activeCategoryId && h(SettingRow, { label: defaultMessages.editCategory }),
      activeCategoryId && h(SettingRow, null,
        h(TextInput, {
          className: 'w-100',
          size: 'sm',
          value: selectedCategory?.name || '',
          onChange: (event) => {
            updateCategory(activeCategoryId, (category) => ({ ...category, name: event.target.value }))
          }
        })
      ),
      activeCategoryId && h(SettingRow, null,
        h(TextInput, {
          className: 'w-100',
          size: 'sm',
          value: selectedCategory?.description || '',
          placeholder: defaultMessages.categoryDescription,
          onChange: (event) => {
            updateCategory(activeCategoryId, (category) => ({ ...category, description: event.target.value }))
          }
        })
      ),
      h(SettingRow, null,
        !useMapWidgetId
          ? h('div', { style: docTextStyles.muted }, defaultMessages.noMapSelected)
          : !activeCategoryId
            ? h('div', { style: docTextStyles.muted }, defaultMessages.noCategorySelected)
            : jimuMapView
              ? h(JimuLayerViewSelector, {
                jimuMapViewId: jimuMapView.id,
                selectedValues: selectedLayerIds,
                isMultiSelection: true,
                isShowTables: false,
                autoHeight: true,
                onChange: onLayerSelectionChange
              })
              : h('div', { style: docTextStyles.muted }, defaultMessages.layerSelectorHint)
      ),
      activeCategoryId && selectedCategory?.layers?.length > 0 && h(SettingRow, { label: defaultMessages.assignedLayers }),
      activeCategoryId && selectedCategory?.layers?.map((layer, index) => (
        h('div', {
          key: layer.jimuLayerViewId || layer.id,
          className: 'd-flex align-items-center justify-content-between border-top py-2',
          style: { gap: 8 }
        },
          h('span', {
            className: 'text-truncate',
            title: layer.title || layer.id,
            style: { ...docTextStyles.body, minWidth: 0 }
          }, layer.title || layer.id),
          h('span', { className: 'd-flex align-items-center', style: { gap: 4 } },
            h(Button, {
              size: 'sm',
              type: 'tertiary',
              disabled: index === 0,
              style: docTextStyles.button,
              onClick: () => {
                updateCategory(activeCategoryId, (category) => ({ ...category, layers: moveItem(category.layers, index, index - 1) }))
              }
            }, defaultMessages.moveUp),
            h(Button, {
              size: 'sm',
              type: 'tertiary',
              disabled: index === selectedCategory.layers.length - 1,
              style: docTextStyles.button,
              onClick: () => {
                updateCategory(activeCategoryId, (category) => ({ ...category, layers: moveItem(category.layers, index, index + 1) }))
              }
            }, defaultMessages.moveDown)
          )
        )
      )),
      activeCategoryId && h(SettingRow, null,
        h(Button, {
          size: 'sm',
          type: 'tertiary',
          style: docTextStyles.button,
          onClick: () => { updateCategory(activeCategoryId, (category) => ({ ...category, layers: [] })) }
        }, defaultMessages.clearLayers)
      )
    ),

    h(SettingSection, { title: defaultMessages.behaviorSection },
      h(SettingRow, { label: defaultMessages.selectionMode }),
      h(SettingRow, null,
        h(Select, {
          className: 'w-100',
          size: 'sm',
          value: props.config?.selectionMode || 'multiple',
          onChange: (event) => { updateConfig(categories, { selectionMode: event.target.value as CategorySelectionMode }) }
        },
          h(Option, { value: 'multiple' }, defaultMessages.multipleMode),
          h(Option, { value: 'single' }, defaultMessages.singleMode)
        )
      ),
      h(SettingRow, null, renderToggle(defaultMessages.search, props.config?.showSearch, (_, checked) => { setBoolean('showSearch', checked) }))
    ),

    h(SettingSection, { title: defaultMessages.layerControlsSection },
      h(SettingRow, null, renderToggle(defaultMessages.visibility, props.config?.showVisibilityToggle, (_, checked) => { setBoolean('showVisibilityToggle', checked) })),
      h(SettingRow, null, renderToggle(defaultMessages.zoom, props.config?.showZoomToLayer, (_, checked) => { setBoolean('showZoomToLayer', checked) })),
      h(SettingRow, null, renderToggle(defaultMessages.filters, props.config?.showLayerFilters, (_, checked) => { setBoolean('showLayerFilters', checked) })),
      h(SettingRow, null, renderToggle(defaultMessages.exportCsv, props.config?.showExportCsv ?? true, (_, checked) => { setBoolean('showExportCsv', checked) })),
      h(SettingRow, null, renderToggle(defaultMessages.legend, !!props.config?.showLegend, (_, checked) => { setBoolean('showLegend', checked) }))
    )
  )
}

export default Setting
