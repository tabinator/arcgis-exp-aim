import type { PackageCartItem, WorkOrderApiResponse } from './types'
import {
  getAttributeValue,
  INSPECTOR_FIELD,
  PROPERTY_NAME_FIELD,
  WORK_CODE_FIELD
} from './utils'

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
