import { React } from 'jimu-core'
import _Widget from '../src/runtime/widget'
import { widgetRender, wrapWidget } from 'jimu-for-test'

const render = widgetRender()

describe('test monument-manager widget', () => {
  it('renders monument manager modes', () => {
    const Widget = wrapWidget(_Widget, {
      config: {
        monumentIdField: 'MonumentID',
        surveyMonumentsLayerUrl: 'https://example.com/FeatureServer/0'
      }
    })

    const { queryByText } = render(<Widget widgetId="Widget_1" />)

    expect(queryByText('Monument Manager')).not.toBeNull()
    expect(queryByText('View History')).not.toBeNull()
    expect(queryByText('Create Project')).not.toBeNull()
  })
})
