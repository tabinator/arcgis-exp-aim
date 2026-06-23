export interface QueryFeature {
  attributes?: { [key: string]: any }
  geometry?: any
}

export interface QueryResponse {
  features?: QueryFeature[]
  exceededTransferLimit?: boolean
  error?: { message?: string }
  geometryType?: string
  spatialReference?: any
  objectIdFieldName?: string
}

export interface CartLayerQueryResult {
  layerUrl: string
  results: QueryResponse[]
}

export interface TargetLayer {
  name: string
  url: string
  boxFolderId?: string
}

export interface SelectionSource {
  dataSourceId: string
  layerName: string
  layerUrl: string
}

export interface PackageCartItem {
  key: string
  dataSourceId: string
  layerName: string
  layerUrl: string
  layerKey: string
  objectId: string | number
  attributes: { [key: string]: any }
  record?: any
}

export interface PackageSummary {
  id: string
  featureCount: number
}

export interface SelectedPackage {
  key: string
  layerUrl: string
  id: string
}

export interface WorkOrderApiResponse {
  ok: boolean
  status?: number
  text: string
}
