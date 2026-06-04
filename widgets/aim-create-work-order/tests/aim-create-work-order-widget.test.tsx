import { React } from 'jimu-core'
import _Widget from '../src/runtime/widget'

describe('test aim-create-work-order widget', () => {
  it('renders configured message', () => {
    const Widget = _Widget as any
    const element = Widget({
      widgetId: 'Widget_1',
      config: { message: 'Scaffold works' }
    })
    const paragraph = React.Children.toArray(element.props.children).find((child: any) =>
      child?.type === 'p' && child?.props?.children === 'Scaffold works'
    ) as any

    expect(paragraph?.type).toBe('p')
  })
})
