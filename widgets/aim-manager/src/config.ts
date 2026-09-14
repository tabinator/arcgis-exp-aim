import type { ImmutableObject } from 'seamless-immutable'

export interface Config {
  packageField?: string
  folderBaseUrl?: string
  boxApiBaseUrl?: string
  boxCreateFolderUrl?: string
  aimSubmitUrl?: string
  aimPostAttachmentUrl?: string
  boxFileUploadUrl?: string
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
  targetLayerBoxFolderId1?: string
  targetLayerBoxFolderId2?: string
  targetLayerBoxFolderId3?: string
  targetLayerBoxFolderId4?: string
  targetLayerBoxFolderId5?: string
}

export const DEFAULT_AIM_SUBMIT_URL = 'https://ocpw-intigration-hub-staging.azurewebsites.net/api/aim/workorders/submit'
export const DEFAULT_AIM_POST_ATTACHMENT_URL = 'https://ocpw-intigration-hub-staging.azurewebsites.net/api/aim/workorders/{workOrderNumber}/documents'
export const DEFAULT_BOX_CREATE_FOLDER_URL = 'https://ocpw-box-api-staging.azurewebsites.net/api/createfolder'
export const DEFAULT_BOX_FILE_UPLOAD_URL = 'https://ocpw-box-api.azurewebsites.net/api/file/upload'
export const DEFAULT_BOX_GET_FOLDER_SHARE_LINK_URL = 'https://ocpw-box-api.azurewebsites.net/api'

export type IMConfig = ImmutableObject<Config>
