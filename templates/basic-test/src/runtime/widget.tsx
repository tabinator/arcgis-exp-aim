import { React, type AllWidgetProps } from 'jimu-core'
import type { IMConfig } from '../config'

const Widget = (props: AllWidgetProps<IMConfig>) => {
  const message = props.config?.message || 'Basic custom widget is ready.'

  return (
    <div className="widget-basic-test jimu-widget p-3">
      <h3 className="mb-2">Basic Test Widget</h3>
      <p className="mb-0">{message}</p>
    </div>
  )
}

export default Widget
