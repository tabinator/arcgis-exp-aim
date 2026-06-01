/** @jsx jsx */
import { React, jsx, type AllWidgetProps } from 'jimu-core'
import { Alert, Card, CardBody, CardHeader } from 'jimu-ui'
import defaultMessages from './translations/default'
import { type Config } from '../config'

const Widget = (props: AllWidgetProps<Config>) => {
  const messages = defaultMessages
  const endpointUrl = props.config?.endpointUrl?.trim()

  return (
    <Card className='h-100 w-100'>
      <CardHeader>{messages.widgetTitle}</CardHeader>
      <CardBody>
        {endpointUrl ? (
          <div>Configured AiM endpoint: {endpointUrl}</div>
        ) : (
          <Alert form='basic' type='warning' text={messages.missingEndpoint} />
        )}
      </CardBody>
    </Card>
  )
}

export default Widget

