/** @jsx jsx */
import { React, jsx, type AllWidgetProps } from 'jimu-core'
import type { IMConfig } from '../config'

const Widget = (props: AllWidgetProps<IMConfig>) => {
  const message = props.config?.message || 'AiM Create Work Order widget is ready.'

  return (
    <div className="widget-aim-create-work-order jimu-widget p-3">
      <h3 className="mb-2">AiM Create Work Order Widget</h3>
      <p className="mb-0">{message}</p>
    </div>
  )
}

export default Widget
