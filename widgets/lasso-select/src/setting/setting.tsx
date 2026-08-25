import { AllDataSourceTypes, Immutable, React, type UseDataSource } from 'jimu-core'
import { getAppConfigAction, type AllWidgetSettingProps } from 'jimu-for-builder'
import { Checkbox } from 'jimu-ui'
import { DataSourceSelector } from 'jimu-ui/advanced/data-source-selector'
import { MapWidgetSelector, SettingSection, SettingRow } from 'jimu-ui/advanced/setting-components'
import type { IMConfig } from '../config'
import defaultMessages from './translations/default'

const supportedDataSourceTypes = Immutable([
  AllDataSourceTypes.FeatureLayer
])

const Setting = (props: AllWidgetSettingProps<IMConfig>) => {
  const h = React.createElement

  React.useEffect(() => {
    if (props.inControllerUx !== 'offPanel') {
      getAppConfigAction().editWidgetProperty(props.id, 'inControllerUx', 'offPanel').exec()
    }
  }, [props.id, props.inControllerUx])

  const onMapWidgetSelected = (useMapWidgetIds: string[]) => {
    props.onSettingChange({
      id: props.id,
      useMapWidgetIds
    })
  }

  const onTargetSourcesChange = (useDataSources: UseDataSource[]) => {
    const targetDataSourceIds = (useDataSources || [])
      .map((useDataSource) => useDataSource.dataSourceId)

    props.onSettingChange({
      id: props.id,
      useDataSources,
      config: props.config.set('targetDataSourceIds', targetDataSourceIds)
    })
  }

  const onKeepActiveChange = (_, checked: boolean) => {
    props.onSettingChange({
      id: props.id,
      config: props.config.set('keepActiveAfterSelect', checked)
    })
  }

  return h(React.Fragment, null,
    h(SettingSection, { title: defaultMessages.sourceSection },
      h(SettingRow, { label: defaultMessages.selectSources }),
      h(SettingRow, null,
        h(DataSourceSelector, {
          types: supportedDataSourceTypes,
          useDataSources: props.useDataSources,
          useDataSourcesEnabled: true,
          mustUseDataSource: true,
          isMultiple: true,
          hideDataView: true,
          hideCreateViewButton: true,
          widgetId: props.id,
          buttonLabel: defaultMessages.selectSources,
          onChange: onTargetSourcesChange
        })
      ),
      h(SettingRow, null,
        h('div', { className: 'text-muted small' }, defaultMessages.sourceHint)
      )
    ),

    h(SettingSection, { title: defaultMessages.mapSection },
      h(SettingRow, { label: defaultMessages.selectMapWidget }),
      h(SettingRow, null,
        h(MapWidgetSelector, {
          useMapWidgetIds: props.useMapWidgetIds,
          onSelect: onMapWidgetSelected
        })
      )
    ),

    h(SettingSection, { title: defaultMessages.behaviorSection },
      h(SettingRow, null,
        h('label', { className: 'd-flex align-items-center w-100 mb-0' },
          h(Checkbox, {
            checked: !!props.config?.keepActiveAfterSelect,
            onChange: onKeepActiveChange
          }),
          h('span', { className: 'ml-2' }, defaultMessages.keepActiveLabel)
        )
      )
    )
  )
}

export default Setting
