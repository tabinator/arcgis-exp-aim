import { DataSourceTypes, Immutable, React, type UseDataSource } from 'jimu-core'
import type { AllWidgetSettingProps } from 'jimu-for-builder'
import { TextInput } from 'jimu-ui'
import { DataSourceSelector } from 'jimu-ui/advanced/data-source-selector'
import { MapWidgetSelector, SettingSection, SettingRow } from 'jimu-ui/advanced/setting-components'
import {
  DEFAULT_MONUMENT_HISTORY_TABLE_URL,
  DEFAULT_MONUMENT_PROJECTS_LAYER_URL,
  DEFAULT_SURVEY_MONUMENTS_LAYER_URL,
  DEFAULT_TRAVERSE_CONNECTIONS_LAYER_URL
} from '../config'
import type { IMConfig } from '../config'
import defaultMessages from './translations/default'

const monumentHistoryDataSourceTypes = Immutable([
  DataSourceTypes.FeatureLayer,
  DataSourceTypes.Table
])

const Setting = (props: AllWidgetSettingProps<IMConfig>) => {
  const h = React.createElement
  const cfg: any = props.config || {}

  const onConfigChange = (key: string, value: string) => {
    const config: any = props.config
    if (!config || typeof config.set !== 'function') return
    props.onSettingChange({ id: props.id, config: config.set(key, value) })
  }

  const row = (label: string, key: string, placeholder: string, fallbackValue = '') =>
    h(SettingRow, null,
      h('div', { className: 'w-100' },
        h('div', { className: 'mb-1', style: { fontWeight: 600 } }, label),
        h(TextInput, {
          'aria-label': label,
          className: 'w-100',
          size: 'sm',
          value: cfg[key] || fallbackValue,
          placeholder,
          onChange: (evt) => {
            onConfigChange(key, evt.target.value)
          }
        })
      )
    )

  return h('div', null,
    h(SettingSection, { title: defaultMessages.dataSourcesSection },
      h(SettingRow, null,
        h('div', { className: 'w-100' },
          h('div', { className: 'mb-1', style: { fontWeight: 600 } }, defaultMessages.mapWidgetLabel),
          h(MapWidgetSelector, {
            useMapWidgetIds: props.useMapWidgetIds,
            onSelect: (useMapWidgetIds: string[]) => {
              props.onSettingChange({ id: props.id, useMapWidgetIds })
            }
          })
        )
      ),
      h(SettingRow, null,
        h('div', { className: 'w-100' },
          h('div', { className: 'mb-1', style: { fontWeight: 600 } }, defaultMessages.monumentHistoryDataSourceLabel),
          h(DataSourceSelector, {
            types: monumentHistoryDataSourceTypes,
            useDataSources: props.useDataSources,
            mustUseDataSource: true,
            isMultiple: false,
            hideDataView: true,
            closeDataSourceListOnChange: true,
            widgetId: props.id,
            onChange: (useDataSources: UseDataSource[]) => {
              props.onSettingChange({ id: props.id, useDataSources })
            }
          })
        )
      ),
      row(defaultMessages.surveyMonumentsLayerUrlLabel, 'surveyMonumentsLayerUrl', DEFAULT_SURVEY_MONUMENTS_LAYER_URL, DEFAULT_SURVEY_MONUMENTS_LAYER_URL),
      row(defaultMessages.monumentProjectsLayerUrlLabel, 'monumentProjectsLayerUrl', DEFAULT_MONUMENT_PROJECTS_LAYER_URL, DEFAULT_MONUMENT_PROJECTS_LAYER_URL),
      row(defaultMessages.traverseConnectionsLayerUrlLabel, 'traverseConnectionsLayerUrl', DEFAULT_TRAVERSE_CONNECTIONS_LAYER_URL, DEFAULT_TRAVERSE_CONNECTIONS_LAYER_URL),
      row(defaultMessages.monumentHistoryTableUrlLabel, 'monumentHistoryTableUrl', DEFAULT_MONUMENT_HISTORY_TABLE_URL, DEFAULT_MONUMENT_HISTORY_TABLE_URL)
    ),
    h(SettingSection, { title: defaultMessages.fieldsSection },
      row(defaultMessages.projectGlobalIdFieldLabel, 'projectGlobalIdField', defaultMessages.projectGlobalIdFieldPlaceholder),
      row(defaultMessages.projectDisplayFieldLabel, 'projectDisplayField', defaultMessages.projectDisplayFieldPlaceholder),
      row(defaultMessages.monumentGlobalIdFieldLabel, 'monumentGlobalIdField', defaultMessages.monumentGlobalIdFieldPlaceholder),
      row(defaultMessages.monumentPointNumberFieldLabel, 'monumentPointNumberField', defaultMessages.monumentPointNumberFieldPlaceholder),
      row(defaultMessages.historyMonumentGlobalIdFieldLabel, 'historyMonumentGlobalIdField', defaultMessages.historyMonumentGlobalIdFieldPlaceholder),
      row(defaultMessages.historyProjectGlobalIdFieldLabel, 'historyProjectGlobalIdField', defaultMessages.historyProjectGlobalIdFieldPlaceholder),
      row(defaultMessages.traverseProjectGlobalIdFieldLabel, 'traverseProjectGlobalIdField', defaultMessages.traverseProjectGlobalIdFieldPlaceholder),
      row(defaultMessages.traverseFromPointNumberFieldLabel, 'traverseFromPointNumberField', defaultMessages.traverseFromPointNumberFieldPlaceholder),
      row(defaultMessages.traverseToPointNumberFieldLabel, 'traverseToPointNumberField', defaultMessages.traverseToPointNumberFieldPlaceholder)
    )
  )
}

export default Setting
