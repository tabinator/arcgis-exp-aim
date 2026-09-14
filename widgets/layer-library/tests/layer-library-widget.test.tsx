import { React } from 'jimu-core'
import _Widget from '../src/runtime/widget'
import { widgetRender, wrapWidget } from 'jimu-for-test'

const render = widgetRender()

describe('test layer-library widget', () => {
  it('renders the settings prompt when no map is configured', () => {
    const Widget = wrapWidget(_Widget, {
      config: {
        categories: [],
        selectionMode: 'multiple',
        showSearch: true,
        showLayerFilters: true,
        showZoomToLayer: true,
        showVisibilityToggle: true,
        showLegend: false
      }
    })

    const { queryByText } = render(<Widget widgetId="Widget_1" />)

    expect(queryByText('Select a Map widget and add categories in the widget settings.')).toBeTruthy()
  })
})
