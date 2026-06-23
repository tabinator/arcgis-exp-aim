import { React } from 'jimu-core'
import type { AllWidgetSettingProps } from 'jimu-for-builder'
import { MapWidgetSelector, SettingSection, SettingRow } from 'jimu-ui/advanced/setting-components'
import { TextInput } from 'jimu-ui'
import defaultMessages from './translations/default'
import { DEFAULT_AIM_SUBMIT_URL, DEFAULT_BOX_CREATE_FOLDER_URL, DEFAULT_BOX_GET_FOLDER_SHARE_LINK_URL } from '../config'
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
          value: cfg.boxApiBaseUrl || cfg.folderBaseUrl || DEFAULT_BOX_GET_FOLDER_SHARE_LINK_URL,
          placeholder: DEFAULT_BOX_GET_FOLDER_SHARE_LINK_URL,
          onChange: (evt) => {
            onConfigChange('boxApiBaseUrl', evt.target.value)
          }
        })
      ),
      h(SettingRow, null,
        h('div', { className: 'mb-1', style: { fontWeight: 600 } }, m.boxCreateFolderUrlLabel),
        h(TextInput, {
          value: cfg.boxCreateFolderUrl || DEFAULT_BOX_CREATE_FOLDER_URL,
          placeholder: DEFAULT_BOX_CREATE_FOLDER_URL,
          onChange: (evt) => {
            onConfigChange('boxCreateFolderUrl', evt.target.value)
          }
        })
      ),
      h(SettingRow, null,
        h('div', { className: 'mb-1', style: { fontWeight: 600 } }, m.aimSubmitUrlLabel),
        h(TextInput, {
          value: cfg.aimSubmitUrl || DEFAULT_AIM_SUBMIT_URL,
          placeholder: DEFAULT_AIM_SUBMIT_URL,
          onChange: (evt) => {
            onConfigChange('aimSubmitUrl', evt.target.value)
          }
        })
      ),
      h(SettingRow, null,
        h('div', { className: 'mb-1', style: { fontWeight: 600 } }, m.aimPostAttachmentUrlLabel),
        h(TextInput, {
          value: cfg.aimPostAttachmentUrl || '',
          placeholder: m.aimPostAttachmentUrlPlaceholder,
          onChange: (evt) => {
            onConfigChange('aimPostAttachmentUrl', evt.target.value)
          }
        })
      ),
      row(m.targetLayerName1Label, 'targetLayerName1', m.targetLayerNamePlaceholder),
      row(m.targetLayer1Label, 'targetLayerUrl1'),
      row(m.targetLayerBoxFolderId1Label, 'targetLayerBoxFolderId1', m.targetLayerBoxFolderIdPlaceholder),
      row(m.targetLayerName2Label, 'targetLayerName2', m.targetLayerNamePlaceholder),
      row(m.targetLayer2Label, 'targetLayerUrl2'),
      row(m.targetLayerBoxFolderId2Label, 'targetLayerBoxFolderId2', m.targetLayerBoxFolderIdPlaceholder),
      row(m.targetLayerName3Label, 'targetLayerName3', m.targetLayerNamePlaceholder),
      row(m.targetLayer3Label, 'targetLayerUrl3'),
      row(m.targetLayerBoxFolderId3Label, 'targetLayerBoxFolderId3', m.targetLayerBoxFolderIdPlaceholder),
      row(m.targetLayerName4Label, 'targetLayerName4', m.targetLayerNamePlaceholder),
      row(m.targetLayer4Label, 'targetLayerUrl4'),
      row(m.targetLayerBoxFolderId4Label, 'targetLayerBoxFolderId4', m.targetLayerBoxFolderIdPlaceholder),
      row(m.targetLayerName5Label, 'targetLayerName5', m.targetLayerNamePlaceholder),
      row(m.targetLayer5Label, 'targetLayerUrl5'),
      row(m.targetLayerBoxFolderId5Label, 'targetLayerBoxFolderId5', m.targetLayerBoxFolderIdPlaceholder)
    )
  )
}

export default Setting
