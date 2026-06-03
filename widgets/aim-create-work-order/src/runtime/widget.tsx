import { React, type AllWidgetProps } from 'jimu-core'
import type { IMConfig } from '../config'

const Widget = (props: AllWidgetProps<IMConfig>) => {
  const h = React.createElement
  const message = props.config?.message || 'AiM Create Work Order widget is ready.'

  return h('div', { className: 'widget-aim-create-work-order jimu-widget p-3' },
    h('h3', { className: 'mb-2' }, 'AiM Create Work Order Widget'),
    h('p', { className: 'mb-0' }, message)
  )
}

export default Widget
