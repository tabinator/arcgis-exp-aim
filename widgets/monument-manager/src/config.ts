import type { ImmutableObject } from 'seamless-immutable'

export interface Config {
  surveyMonumentsLayerUrl?: string
  monumentProjectsLayerUrl?: string
  traverseConnectionsLayerUrl?: string
  monumentHistoryTableUrl?: string
  projectGlobalIdField?: string
  projectDisplayField?: string
  monumentGlobalIdField?: string
  monumentPointNumberField?: string
  historyMonumentGlobalIdField?: string
  historyProjectGlobalIdField?: string
  traverseProjectGlobalIdField?: string
  traverseFromPointNumberField?: string
  traverseToPointNumberField?: string
}

export const DEFAULT_SURVEY_MONUMENTS_LAYER_URL = 'https://www.ocgis.com/landbase/rest/services/FieldServices/Monument_Mobile_App/FeatureServer/999066'
export const DEFAULT_MONUMENT_PROJECTS_LAYER_URL = 'https://www.ocgis.com/landbase/rest/services/FieldServices/Monument_Mobile_App/FeatureServer/999068'
export const DEFAULT_TRAVERSE_CONNECTIONS_LAYER_URL = 'https://www.ocgis.com/landbase/rest/services/FieldServices/Monument_Mobile_App/FeatureServer/999082'
export const DEFAULT_MONUMENT_HISTORY_TABLE_URL = 'https://www.ocgis.com/landbase/rest/services/FieldServices/Monument_Mobile_App/FeatureServer/999069'

export type IMConfig = ImmutableObject<Config>
