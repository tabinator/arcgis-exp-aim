import { appActions, getAppStore, React, WidgetState, type AllWidgetProps } from 'jimu-core'
import { Button } from 'jimu-ui'
import { JimuMapViewComponent, type JimuMapView } from 'jimu-arcgis'
import type { IMConfig } from '../config'
import defaultMessages from './translations/default'

const Widget = (props: AllWidgetProps<IMConfig>) => {
  const h = React.createElement
  const [jimuMapView, setJimuMapView] = React.useState<JimuMapView>(null)
  const useMapWidgetId = props.useMapWidgetIds?.[0]
  const isOffPanel = !!props.controllerWidgetId && props.inControllerUx === 'offPanel'
  const isOffPanelActive = isOffPanel && props.state !== WidgetState.Closed && props.state !== WidgetState.Hidden && props.state !== undefined

  const clearSelection = React.useCallback(() => {
    jimuMapView?.clearSelectedFeatures()
  }, [jimuMapView])

  React.useEffect(() => {
    if (!isOffPanelActive || !jimuMapView) return

    clearSelection()
    getAppStore().dispatch(appActions.closeWidget(props.id))
  }, [clearSelection, isOffPanelActive, jimuMapView, props.id])

  if (isOffPanel) {
    return h('div', {
      className: 'widget-clear-selection jimu-widget',
      style: { width: 0, height: 0, overflow: 'hidden' }
    },
      useMapWidgetId && h(JimuMapViewComponent, {
        useMapWidgetId,
        onActiveViewChange: setJimuMapView
      })
    )
  }

  return h('div', { className: 'widget-clear-selection jimu-widget p-3' },
    useMapWidgetId && h(JimuMapViewComponent, {
      useMapWidgetId,
      onActiveViewChange: setJimuMapView
    }),
    h('div', { className: 'd-flex align-items-center justify-content-between mb-2' },
      h('strong', null, defaultMessages._widgetLabel)
    ),
    h(Button, {
      size: 'sm',
      type: 'primary',
      disabled: !useMapWidgetId || !jimuMapView,
      onClick: clearSelection
    }, defaultMessages.clearSelection),
    h('p', { className: 'mb-0 mt-2 small text-muted' },
      useMapWidgetId ? defaultMessages.ready : defaultMessages.configureWidget
    )
  )
}

export default Widget
