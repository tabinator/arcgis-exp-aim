import type { PackageCartItem, WorkOrderApiResponse } from './types'
import {
  getAttributeValue,
  INSPECTOR_FIELD,
  PROPERTY_NAME_FIELD,
  WORK_CODE_FIELD
} from './utils'
import { DEFAULT_AIM_POST_ATTACHMENT_URL } from '../config'

const getNullableAttributeValue = (attributes: { [key: string]: any }, fieldName: string) => {
  const value = getAttributeValue(attributes, fieldName)
  return value === undefined ? null : value
}

const getAimObjectId = (objectId: string | number) => {
  if (typeof objectId === 'number') return objectId
  const numericObjectId = Number(objectId)
  return Number.isNaN(numericObjectId) ? objectId : numericObjectId
}

export const getAimWorkOrderPayload = (items: PackageCartItem[]) => ({
  department: 'OM',
  facId: 'ROAD',
  propertyName: getNullableAttributeValue(items[0]?.attributes || {}, PROPERTY_NAME_FIELD),
  entClerk: 'Test User',
  caseNumber: null,
  features: items.map((item) => {
    const attributes = item.attributes || {}
    return {
      objectId: getAimObjectId(item.objectId),
      locationCode: getNullableAttributeValue(attributes, 'LocationCode'),
      workCode: getNullableAttributeValue(attributes, WORK_CODE_FIELD),
      repairRecommendation: getNullableAttributeValue(attributes, 'RepairRecommendation'),
      estimatedWorkQuantity: getNullableAttributeValue(attributes, 'EstimatedWorkQuantity'),
      workUnit: getNullableAttributeValue(attributes, 'WorkUnit'),
      deficiencyLocation: getNullableAttributeValue(attributes, 'DeficiencyLocation'),
      latitude: getNullableAttributeValue(attributes, 'Latitude'),
      longitude: getNullableAttributeValue(attributes, 'Longitude'),
      inspector: getNullableAttributeValue(attributes, INSPECTOR_FIELD),
      dimensions: getNullableAttributeValue(attributes, 'Dimensions')
    }
  })
})

export const submitAimWorkOrder = async (
  url: string,
  items: PackageCartItem[]
): Promise<WorkOrderApiResponse> => {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(getAimWorkOrderPayload(items)),
    redirect: 'follow'
  })

  return {
    ok: response.ok,
    status: response.status,
    text: await response.text()
  }
}

const findValueByKey = (value: any, keys: Set<string>): string | null => {
  if (!value || typeof value !== 'object') return null
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findValueByKey(item, keys)
      if (found) return found
    }
    return null
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (keys.has(key.replace(/[^a-z0-9]/gi, '').toLowerCase()) && nestedValue !== null && nestedValue !== undefined) {
      const normalized = String(nestedValue).trim()
      if (normalized) return normalized
    }
  }

  for (const nestedValue of Object.values(value)) {
    const found = findValueByKey(nestedValue, keys)
    if (found) return found
  }

  return null
}

export const getAimWorkOrderNumberFromResponse = (text: string): string | null => {
  const trimmed = String(text || '').trim()
  if (!trimmed) return null

  try {
    const parsed = JSON.parse(trimmed)
    const keyedValue = findValueByKey(parsed, new Set(['proposal']))
    if (keyedValue) return keyedValue
  } catch {
    return null
  }

  return null
}

export const getAimAttachmentUrl = (url: string | undefined, workOrderNumber: string) => {
  const configuredUrl = (url || DEFAULT_AIM_POST_ATTACHMENT_URL).trim() || DEFAULT_AIM_POST_ATTACHMENT_URL
  const encodedWorkOrderNumber = encodeURIComponent(workOrderNumber)

  if (configuredUrl.includes('{workOrderNumber}') || configuredUrl.includes('{workOrderNo}') || configuredUrl.includes('{woNumber}')) {
    return configuredUrl
      .replace(/\{workOrderNumber\}/g, encodedWorkOrderNumber)
      .replace(/\{workOrderNo\}/g, encodedWorkOrderNumber)
      .replace(/\{woNumber\}/g, encodedWorkOrderNumber)
  }

  const normalizedUrl = configuredUrl.replace(/\/+$/, '')
  if (/\/workorders\/[^/]+\/documents$/i.test(normalizedUrl)) {
    return normalizedUrl.replace(/\/workorders\/[^/]+\/documents$/i, `/workorders/${encodedWorkOrderNumber}/documents`)
  }

  if (/\/workorders$/i.test(normalizedUrl)) {
    return `${normalizedUrl}/${encodedWorkOrderNumber}/documents`
  }

  return `${normalizedUrl}/${encodedWorkOrderNumber}/documents`
}

export const postAimWorkOrderAttachment = async (
  url: string,
  workOrderNumber: string,
  file: File,
  documentName: string,
  description: string
): Promise<WorkOrderApiResponse> => {
  const formData = new FormData()
  formData.append('File', file, file.name)
  formData.append('DocumentName', documentName)
  formData.append('Description', description)

  const response = await fetch(getAimAttachmentUrl(url, workOrderNumber), {
    method: 'POST',
    body: formData,
    redirect: 'follow'
  })

  return {
    ok: response.ok,
    status: response.status,
    text: await response.text()
  }
}
