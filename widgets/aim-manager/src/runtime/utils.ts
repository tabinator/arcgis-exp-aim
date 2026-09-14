import type { IMState } from 'jimu-core'
import type { PackageCartItem, SelectionSource, TargetLayer } from './types'

export const QUERY_PAGE_SIZE = 2000
export const OBJECT_ID_QUERY_CHUNK_SIZE = 200
export const WORK_CODE_FIELD = 'WorkCode'
export const PROPERTY_NAME_FIELD = 'PropertyName'
export const INSPECTOR_FIELD = 'Inspector'
export const CREATED_DATE_FIELD = 'created_date'

export const normalizeUrl = (url?: string) => {
  const rawUrl = (url || '').trim()
  if (!rawUrl) return ''
  try {
    const parsed = new URL(rawUrl)
    return `${parsed.origin}${parsed.pathname}`.replace(/\/query$/i, '').replace(/\/+$/, '').toLowerCase()
  } catch {
    return rawUrl.split('?')[0].split('#')[0].replace(/\/query$/i, '').replace(/\/+$/, '').toLowerCase()
  }
}

export const getServiceLayerKey = (url?: string) => {
  const normalized = normalizeUrl(url)
  const match = normalized.match(/\/rest\/services\/(.+)\/(featureserver|mapserver)\/(\d+)$/i)
  return match ? `${match[1]}/${match[2]}/${match[3]}`.toLowerCase() : normalized
}

export const getRecordLabel = (attributes: { [key: string]: any }, objectId: string | number) => {
  const labelFields = ['ASSET_ID', 'ASSETID', 'asset_id', 'assetid', 'NAME', 'Name', 'name', 'FACILITYID', 'facilityid']
  const label = labelFields
    .map((field) => attributes?.[field])
    .find((value) => value !== null && value !== undefined && String(value).trim() !== '')
  return label === undefined ? String(objectId) : String(label)
}

export const getLayerDataSourceMatches = (state: IMState, targetLayers: TargetLayer[]): SelectionSource[] => {
  const appConfig: any = (state as any).appConfig || (state as any).appStateInBuilder?.appConfig
  const dataSources: { [id: string]: any } = appConfig?.dataSources || {}
  const configuredLayers = targetLayers.map((layer) => ({
    ...layer,
    normalizedUrl: normalizeUrl(layer.url)
  }))
  const matches: SelectionSource[] = []

  const visit = (dsJson: any) => {
    if (!dsJson?.id) return
    const dsUrl = normalizeUrl(dsJson.url)
    const dsLayerUrl = dsJson.url && dsJson.layerId !== undefined
      ? normalizeUrl(`${dsJson.url}/${dsJson.layerId}`)
      : dsUrl
    const match = configuredLayers.find((layer) =>
      layer.normalizedUrl === dsUrl || layer.normalizedUrl === dsLayerUrl
    )
    if (match) {
      matches.push({
        dataSourceId: dsJson.id,
        layerName: match.name,
        layerUrl: match.url
      })
    }
    Object.keys(dsJson.childDataSourceJsons || {}).forEach((childId) => {
      visit(dsJson.childDataSourceJsons[childId])
    })
  }

  Object.keys(dataSources).forEach((id) => {
    visit(dataSources[id])
  })

  return matches
}

export const urlCandidatesMatch = (targetUrl: string, candidates: string[]) => {
  const normalizedTarget = normalizeUrl(targetUrl)
  const targetServiceKey = getServiceLayerKey(targetUrl)
  return candidates.some((candidate) => {
    const normalizedCandidate = normalizeUrl(candidate)
    const candidateServiceKey = getServiceLayerKey(candidate)
    return normalizedCandidate === normalizedTarget || candidateServiceKey === targetServiceKey
  })
}

export const getGraphicObjectId = (graphic: any) => {
  const layer = graphic?.layer || graphic?.sourceLayer
  const objectIdField = layer?.objectIdField || 'OBJECTID'
  return graphic?.attributes?.[objectIdField] ?? graphic?.attributes?.OBJECTID ?? graphic?.attributes?.ObjectID ?? graphic?.attributes?.objectid
}

export const getPackageKey = (layerUrl: string, packageId: string) => `${layerUrl}::${packageId}`

export const hasPackageValue = (item: PackageCartItem, packageField: string) => {
  const value = getAttributeValue(item.attributes || {}, packageField)
  return value !== null && value !== undefined && String(value).trim() !== ''
}

export const hasEmptyPackageValue = (item: PackageCartItem, packageField: string) => {
  const value = getAttributeValue(item.attributes || {}, packageField)
  return value === null || value === undefined || String(value).trim() === ''
}

export const getUniqueLayerKeys = (items: PackageCartItem[]) => Array.from(new Set(items.map((item) => item.layerKey)))

export const getAttributeValue = (attributes: { [key: string]: any }, fieldName: string) => {
  if (Object.prototype.hasOwnProperty.call(attributes, fieldName)) return attributes[fieldName]
  const matchingField = Object.keys(attributes).find((key) => key.toLowerCase() === fieldName.toLowerCase())
  return matchingField ? attributes[matchingField] : undefined
}

export const getFeatureObjectId = (attributes: { [key: string]: any }, objectIdFieldName?: string) =>
  getAttributeValue(attributes, objectIdFieldName || 'OBJECTID') ??
  getAttributeValue(attributes, 'OBJECTID') ??
  getAttributeValue(attributes, 'FID')

export const getWorkCodeKeyFromAttributes = (attributes: { [key: string]: any }) => {
  const value = getAttributeValue(attributes, WORK_CODE_FIELD)
  return value === null || value === undefined ? 'null:' : `${typeof value}:${String(value)}`
}

export const getWorkCodeKey = (item: PackageCartItem) => getWorkCodeKeyFromAttributes(item.attributes || {})

export const filterByWorkCode = (items: PackageCartItem[], workCodeKey: string) =>
  items.filter((item) => getWorkCodeKey(item) === workCodeKey)

export const getPropertyNameKeyFromAttributes = (attributes: { [key: string]: any }) => {
  const value = getAttributeValue(attributes, PROPERTY_NAME_FIELD)
  return value === null || value === undefined ? 'null:' : `${typeof value}:${String(value)}`
}

export const getPropertyNameKey = (item: PackageCartItem) => getPropertyNameKeyFromAttributes(item.attributes || {})

export const filterByPropertyName = (items: PackageCartItem[], propertyNameKey: string) =>
  items.filter((item) => getPropertyNameKey(item) === propertyNameKey)

export const getGeneratedPackageId = (attributes: { [key: string]: any }, date = new Date()) => {
  const propertyName = getAttributeValue(attributes, PROPERTY_NAME_FIELD)
  const workCode = getAttributeValue(attributes, WORK_CODE_FIELD)
  if (
    propertyName === null ||
    propertyName === undefined ||
    String(propertyName).trim() === '' ||
    workCode === null ||
    workCode === undefined ||
    String(workCode).trim() === ''
  ) return ''

  const pad = (value: number) => String(value).padStart(2, '0')
  const datePart = `${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getFullYear() % 100)}`
  const timePart = `${pad(date.getHours())}${pad(date.getMinutes())}`
  return `${String(propertyName).trim().toUpperCase()}-${String(workCode).trim()}-${datePart}-${timePart}`
}

export const formatDateValue = (value: any) => {
  if (value === null || value === undefined || String(value).trim() === '') return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? String(value)
    : new Intl.DateTimeFormat('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' }).format(date)
}
