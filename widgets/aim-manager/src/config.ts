import type { ImmutableObject } from 'seamless-immutable'

export interface Config {
  packageField?: string
  folderBaseUrl?: string
  targetLayerName1?: string
  targetLayerName2?: string
  targetLayerName3?: string
  targetLayerName4?: string
  targetLayerName5?: string
  targetLayerUrl1?: string
  targetLayerUrl2?: string
  targetLayerUrl3?: string
  targetLayerUrl4?: string
  targetLayerUrl5?: string
}

export type IMConfig = ImmutableObject<Config>
