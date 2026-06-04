import { React } from 'jimu-core'
import type { AllWidgetSettingProps } from 'jimu-for-builder'
import { MapWidgetSelector, SettingSection, SettingRow } from 'jimu-ui/advanced/setting-components'
import { TextInput } from 'jimu-ui'
import defaultMessages from './translations/default'
import type { IMConfig } from '../config'

const Setting = (props: AllWidgetSettingProps<IMConfig>) => {
  const m = defaultMessages
  const cfg: any = props.config || {}
  const h = React.createElement

  const onConfigChange = (key: string, value: string) => {
    const config: any = props.config
    if (!config || typeof config.set !== 'function') return
    props.onSettingChange({ id: props.id, config: config.set(key, value) })
  }

  const onMapWidgetSelected = (useMapWidgetIds: string[]) => {
    props.onSettingChange({ id: props.id, useMapWidgetIds })
  }

  const row = (label: string, key: string, placeholder?: string) =>
    h(SettingRow, null,
      h('div', { className: 'mb-1', style: { fontWeight: 600 } }, label),
      h(TextInput, {
        value: cfg[key] || '',
        placeholder: placeholder || m.targetLayerPlaceholder,
        onChange: (evt) => {
          onConfigChange(key, evt.target.value)
        }
      })
    )

  return h('div', { className: 'p-2' },
    h(SettingSection, { title: 'AiM' },
      h(SettingRow, null,
        h('div', { className: 'mb-1', style: { fontWeight: 600 } }, m.mapWidgetLabel),
        h(MapWidgetSelector, {
          useMapWidgetIds: props.useMapWidgetIds,
          onSelect: onMapWidgetSelected
        })
      ),
      h(SettingRow, null,
        h('div', { className: 'mb-1', style: { fontWeight: 600 } }, m.packageFieldLabel),
        h(TextInput, {
          value: cfg.packageField || '',
          placeholder: m.packageFieldPlaceholder,
          onChange: (evt) => {
            onConfigChange('packageField', evt.target.value)
          }
        })
      ),
      h(SettingRow, null,
        h('div', { className: 'mb-1', style: { fontWeight: 600 } }, m.folderBaseUrlLabel),
        h(TextInput, {
          value: cfg.folderBaseUrl || '',
          placeholder: m.folderBaseUrlPlaceholder,
          onChange: (evt) => {
            onConfigChange('folderBaseUrl', evt.target.value)
          }
        })
      ),
      row(m.targetLayerName1Label, 'targetLayerName1', m.targetLayerNamePlaceholder),
      row(m.targetLayer1Label, 'targetLayerUrl1'),
      row(m.targetLayerName2Label, 'targetLayerName2', m.targetLayerNamePlaceholder),
      row(m.targetLayer2Label, 'targetLayerUrl2'),
      row(m.targetLayerName3Label, 'targetLayerName3', m.targetLayerNamePlaceholder),
      row(m.targetLayer3Label, 'targetLayerUrl3'),
      row(m.targetLayerName4Label, 'targetLayerName4', m.targetLayerNamePlaceholder),
      row(m.targetLayer4Label, 'targetLayerUrl4'),
      row(m.targetLayerName5Label, 'targetLayerName5', m.targetLayerNamePlaceholder),
      row(m.targetLayer5Label, 'targetLayerUrl5')
    )
  )
}

export default Setting
