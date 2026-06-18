import type { ImmutableObject } from 'seamless-immutable'

export interface Config {
  packageField?: string
  folderBaseUrl?: string
  aimSubmitUrl?: string
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

export const DEFAULT_AIM_SUBMIT_URL = 'https://ocpw-intigration-hub-staging.azurewebsites.net/api/aim/workorders/submit'

export type IMConfig = ImmutableObject<Config>
