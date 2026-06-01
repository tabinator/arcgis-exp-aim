/** @jsx jsx */
import { React, jsx, type ImmutableObject, type AllWidgetSettingProps } from 'jimu-core'
import { SettingSection, SettingRow } from 'jimu-ui/advanced/setting-components'
import { TextInput } from 'jimu-ui'
import defaultMessages from './translations/default'
import { type Config } from '../config'

const Setting = (props: AllWidgetSettingProps<Config>) => {
  const messages = defaultMessages

  const onEndpointChange = (evt: React.ChangeEvent<HTMLInputElement>) => {
    const endpointUrl = evt.target.value
    props.onSettingChange({
      id: props.id,
      config: props.config.set('endpointUrl', endpointUrl) as ImmutableObject<Config>
    })
  }

  return (
    <div className='p-2'>
      <SettingSection title='AiM'>
        <SettingRow label={messages.endpointLabel}>
          <TextInput
            value={props.config?.endpointUrl ?? ''}
            placeholder={messages.endpointPlaceholder}
            onChange={onEndpointChange}
          />
        </SettingRow>
      </SettingSection>
    </div>
  )
}

export default Setting

