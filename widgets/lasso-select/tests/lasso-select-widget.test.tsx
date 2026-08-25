import { React } from 'jimu-core'
import _Widget from '../src/runtime/widget'
import { widgetRender, wrapWidget } from 'jimu-for-test'

const render = widgetRender()

describe('test lasso-select widget', () => {
  it('renders setup guidance when no map is configured', () => {
    const Widget = wrapWidget(_Widget, {
      config: {
        targetLayerIds: [],
        keepActiveAfterSelect: false
      }
    })

    const { queryByText } = render(<Widget widgetId="Widget_1" />)

    expect(queryByText('Configure a map and target layers in settings.').tagName).toBe('P')
  })
})
