import { React } from 'jimu-core'
import { getAppConfigAction, type AllWidgetSettingProps } from 'jimu-for-builder'
import { MapWidgetSelector, SettingRow, SettingSection } from 'jimu-ui/advanced/setting-components'
import type { IMConfig } from '../config'
import defaultMessages from './translations/default'

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

  return h(SettingSection, { title: defaultMessages.mapSection },
    h(SettingRow, { label: defaultMessages.selectMapWidget }),
    h(SettingRow, null,
      h(MapWidgetSelector, {
        useMapWidgetIds: props.useMapWidgetIds,
        onSelect: onMapWidgetSelected
      })
    )
  )
}

export default Setting
