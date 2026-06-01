import { React } from 'jimu-core'
import type { AllWidgetSettingProps } from 'jimu-for-builder'
import { TextInput } from 'jimu-ui'
import { SettingSection, SettingRow } from 'jimu-ui/advanced/setting-components'
import type { IMConfig } from '../config'
import defaultMessages from './translations/default'

const Setting = (props: AllWidgetSettingProps<IMConfig>) => {
  const messageLabel = props.intl.formatMessage({
    id: 'messageLabel',
    defaultMessage: defaultMessages.messageLabel
  })

  const onMessageChange = (event) => {
    props.onSettingChange({
      id: props.id,
      config: props.config.set('message', event.target.value)
    })
  }

  return (
    <SettingSection title={defaultMessages.generalSection}>
      <SettingRow label={messageLabel} />
      <SettingRow>
        <TextInput
          aria-label={messageLabel}
          className="w-100"
          size="sm"
          value={props.config?.message || ''}
          onChange={onMessageChange}
        />
      </SettingRow>
    </SettingSection>
  )
}

export default Setting
