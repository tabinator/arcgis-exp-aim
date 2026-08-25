import { React } from 'jimu-core'
import _Widget from '../src/runtime/widget'
import { widgetRender, wrapWidget } from 'jimu-for-test'

const render = widgetRender()

describe('test clear-selection widget', () => {
  it('renders configure message without a map widget', () => {
    const Widget = wrapWidget(_Widget, {
      config: {}
    })

    const { queryByText } = render(<Widget widgetId="Widget_1" />)

    expect(queryByText('Select a map widget in settings.').tagName).toBe('P')
  })
})
