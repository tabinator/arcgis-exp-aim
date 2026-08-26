import {
  DataSourceSelectionMode,
  React,
  WidgetState,
  type AllWidgetProps,
  type ArcGISQueryParams,
  type UseDataSource
} from 'jimu-core'
import { Button } from 'jimu-ui'
import { JimuMapViewComponent, type JimuMapView } from 'jimu-arcgis'
import Graphic from 'esri/Graphic'
import GraphicsLayer from 'esri/layers/GraphicsLayer'
import SketchViewModel from 'esri/widgets/Sketch/SketchViewModel'
import type Polygon from 'esri/geometry/Polygon'
import type { IMConfig } from '../config'
import defaultMessages from './translations/default'

type CreateEvent = __esri.SketchViewModelCreateEvent
type SelectableJimuLayerView = {
  layer?: __esri.FeatureLayer
  layerDataSourceId?: string
  selectFeaturesByQuery?: (
    query: ArcGISQueryParams,
    selectionMode: DataSourceSelectionMode
  ) => Promise<Array<__esri.Graphic | unknown>>
}

const getTargetDataSourceIds = (configIds: string[], useDataSources: UseDataSource[]): string[] => {
  const useDataSourceIds = (useDataSources || []).map((useDataSource) => useDataSource.dataSourceId)
  return Array.from(new Set([...(configIds || []), ...useDataSourceIds].filter(Boolean)))
}

const getTargetLayers = (
  jimuMapView: JimuMapView,
  targetDataSourceIds: string[],
  targetLayerIds: string[]
): SelectableJimuLayerView[] => {
  const targetDataSourceIdSet = new Set(targetDataSourceIds)
  const layerViews: SelectableJimuLayerView[] = []

  Object.values(jimuMapView.jimuLayerViews || {}).forEach((jimuLayerView) => {
    const isTarget = targetDataSourceIdSet.has(jimuLayerView.layerDataSourceId)

    if (isTarget && jimuLayerView.layer?.type === 'feature' && jimuLayerView.selectFeaturesByQuery) {
      layerViews.push(jimuLayerView as SelectableJimuLayerView)
    }
  })

  if (layerViews.length > 0) return layerViews

  const normalizedLayerTargets = (targetLayerIds || []).map((value) => value.toLowerCase())

  Object.values(jimuMapView.jimuLayerViews || {}).forEach((jimuLayerView) => {
    const layerId = jimuLayerView.layer?.id?.toLowerCase()
    const layerTitle = jimuLayerView.layer?.title?.toLowerCase()
    const isTarget = normalizedLayerTargets.includes(layerId) || normalizedLayerTargets.includes(layerTitle)

    if (isTarget && jimuLayerView.layer?.type === 'feature' && jimuLayerView.selectFeaturesByQuery) {
      layerViews.push(jimuLayerView as SelectableJimuLayerView)
    }
  })

  return layerViews
}

const Widget = (props: AllWidgetProps<IMConfig>) => {
  const h = React.createElement
  const [jimuMapView, setJimuMapView] = React.useState<JimuMapView>(null)
  const [isSelecting, setIsSelecting] = React.useState(false)
  const [status, setStatus] = React.useState(defaultMessages.ready)
  const sketchViewModelRef = React.useRef<SketchViewModel>(null)
  const sketchLayerRef = React.useRef<GraphicsLayer>(null)
  const createHandleRef = React.useRef<__esri.Handle>(null)

  const useMapWidgetId = props.useMapWidgetIds?.[0]
  const configuredTargetDataSourceIds = props.config?.targetDataSourceIds as string[]
  const useDataSources = props.useDataSources as UseDataSource[]
  const targetDataSourceIds = React.useMemo(() => {
    return getTargetDataSourceIds(configuredTargetDataSourceIds, useDataSources)
  }, [configuredTargetDataSourceIds, useDataSources])
  const targetLayerIds = props.config?.targetLayerIds || []
  const targetCount = targetDataSourceIds.length || targetLayerIds.length
  const hasRequiredSettings = !!useMapWidgetId && targetCount > 0
  const isOffPanel = props.inControllerUx === 'offPanel'
  const isOffPanelActive = isOffPanel && props.state !== WidgetState.Closed && props.state !== WidgetState.Hidden && props.state !== undefined

  const clearHighlights = React.useCallback(() => {
    jimuMapView?.clearSelectedFeatures()
    sketchLayerRef.current?.removeAll()
    setStatus(defaultMessages.ready)
  }, [jimuMapView])

  const stopSelecting = React.useCallback(() => {
    sketchViewModelRef.current?.cancel()
    setIsSelecting(false)
  }, [])

  const selectFeatures = React.useCallback(async (geometry: Polygon) => {
    if (!jimuMapView) return

    clearHighlights()
    const targetLayerViews = getTargetLayers(jimuMapView, targetDataSourceIds, targetLayerIds)
    let selectedCount = 0

    if (targetLayerViews.length === 0) {
      setStatus(defaultMessages.noMatchingMapLayers)
      return
    }

    await Promise.all(targetLayerViews.map(async (jimuLayerView) => {
      const query: ArcGISQueryParams = {
        geometry,
        spatialRelationship: 'intersects',
        returnGeometry: true,
        outFields: ['*']
      }

      const features = await jimuLayerView.selectFeaturesByQuery(query, DataSourceSelectionMode.AddToCurrent)
      selectedCount += features.length
    }))

    jimuMapView.onSelectByQueryProgressChange()

    setStatus(
      selectedCount > 0
        ? defaultMessages.selectedCount.replace('{count}', selectedCount.toString())
        : defaultMessages.noMatches
    )
  }, [clearHighlights, jimuMapView, targetDataSourceIds, targetLayerIds])

  React.useEffect(() => {
    if (!jimuMapView) return

    const sketchLayer = new GraphicsLayer({
      id: `${props.id}-lasso-selection`
    })
    jimuMapView.view.map.add(sketchLayer)
    sketchLayerRef.current = sketchLayer

    const sketchViewModel = new SketchViewModel({
      view: jimuMapView.view,
      layer: sketchLayer,
      polygonSymbol: {
        type: 'simple-fill',
        color: [0, 122, 194, 0.12],
        outline: {
          color: [0, 122, 194, 1],
          width: 2
        }
      } as __esri.SimpleFillSymbolProperties
    })

    sketchViewModelRef.current = sketchViewModel

    createHandleRef.current = sketchViewModel.on('create', async (event: CreateEvent) => {
      if (event.state !== 'complete') return

      const graphic = event.graphic as Graphic
      await selectFeatures(graphic.geometry as Polygon)

      if (props.config?.keepActiveAfterSelect || isOffPanelActive) {
        setIsSelecting(true)
        sketchViewModel.create('polygon', { mode: 'freehand' })
      } else {
        setIsSelecting(false)
      }
    })

    return () => {
      createHandleRef.current?.remove()
      sketchViewModel.destroy()
      jimuMapView.view.map.remove(sketchLayer)
    }
  }, [isOffPanelActive, jimuMapView, props.config?.keepActiveAfterSelect, props.id, selectFeatures])

  const startSelecting = () => {
    if (!sketchViewModelRef.current || !hasRequiredSettings) return

    setIsSelecting(true)
    setStatus(defaultMessages.selecting)
    sketchLayerRef.current?.removeAll()
    sketchViewModelRef.current.create('polygon', { mode: 'freehand' })
  }

  const toggleSelecting = () => {
    if (isSelecting) {
      stopSelecting()
      setStatus(defaultMessages.ready)
    } else {
      startSelecting()
    }
  }

  React.useEffect(() => {
    if (!isOffPanel) return

    if (isOffPanelActive) {
      startSelecting()
    } else {
      stopSelecting()
      setStatus(defaultMessages.ready)
    }
  }, [isOffPanel, isOffPanelActive, jimuMapView, hasRequiredSettings])

  const message = !useMapWidgetId
    ? defaultMessages.configureWidget
    : targetCount === 0
      ? defaultMessages.noTargetLayers
      : status

  if (isOffPanel) {
    return h('div', {
      className: 'widget-lasso-select jimu-widget',
      style: { width: 0, height: 0, overflow: 'hidden' }
    },
      useMapWidgetId && h(JimuMapViewComponent, {
        useMapWidgetId,
        onActiveViewChange: setJimuMapView
      })
    )
  }

  return h('div', { className: 'widget-lasso-select jimu-widget p-3' },
    useMapWidgetId && h(JimuMapViewComponent, {
      useMapWidgetId,
      onActiveViewChange: setJimuMapView
    }),
    h('div', { className: 'd-flex align-items-center justify-content-between mb-2' },
      h('strong', null, defaultMessages._widgetLabel),
      h('span', { className: 'text-muted small' }, targetCount ? `${targetCount} sources` : 'No sources')
    ),
    h('div', { className: 'd-flex align-items-center mb-2', style: { gap: 8 } },
      h(Button, {
        size: 'sm',
        type: isSelecting ? 'primary' : 'secondary',
        disabled: !hasRequiredSettings || !jimuMapView,
        onClick: toggleSelecting
      }, isSelecting ? defaultMessages.selecting : defaultMessages.selectArea),
      h(Button, {
        size: 'sm',
        type: 'tertiary',
        disabled: !jimuMapView,
        onClick: clearHighlights
      }, defaultMessages.clear)
    ),
    h('p', { className: 'mb-0 small text-muted' }, message)
  )
}

export default Widget
