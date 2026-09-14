import { type WidgetUpgradeInfo, WidgetVersionManager } from 'jimu-core'

class VersionManager extends WidgetVersionManager {
  versions = [{
    version: '1.20.1',
    description: 'Keep existing controller instances off panel.',
    upgradeFullInfo: true,
    upgrader: (oldInfo: WidgetUpgradeInfo) => {
      const widgetJson = oldInfo.widgetJson.set('inControllerUx', 'offPanel')
      return {
        ...oldInfo,
        widgetJson
      }
    }
  }]
}

export const versionManager: WidgetVersionManager = new VersionManager()
