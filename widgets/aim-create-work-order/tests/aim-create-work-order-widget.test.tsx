import { React } from 'jimu-core'
import _Widget from '../src/runtime/widget'
import { widgetRender, wrapWidget } from 'jimu-for-test'

const render = widgetRender()

describe('test aim-create-work-order widget', () => {
  it('renders configured message', () => {
    const Widget = wrapWidget(_Widget, {
      config: { message: 'Scaffold works' }
    })

    const { queryByText } = render(<Widget widgetId="Widget_1" />)

    expect(queryByText('Scaffold works').tagName).toBe('P')
  })
})
