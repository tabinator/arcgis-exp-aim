import {
  DataRecordsSelectionChangeMessage,
  DataSourceManager,
  MessageManager,
  React,
  ReactRedux,
  type AllWidgetProps,
  type DataRecord,
  type IMState
} from 'jimu-core'
import { JimuMapViewComponent, loadArcGISJSAPIModules } from 'jimu-arcgis'
import { Alert, Button, Card, CardBody, CardHeader, Checkbox, Modal, ModalBody, ModalFooter, ModalHeader, TextInput } from 'jimu-ui'
import {
  DEFAULT_MONUMENT_HISTORY_TABLE_URL,
  DEFAULT_MONUMENT_PROJECTS_LAYER_URL,
  DEFAULT_SURVEY_MONUMENTS_LAYER_URL,
  DEFAULT_TRAVERSE_CONNECTIONS_LAYER_URL
} from '../config'
import type { IMConfig } from '../config'
import defaultMessages from './translations/default'

type MonumentMode = 'finder' | 'history' | 'create' | 'create-project' | 'merge-points' | 'remove-monuments' | 'traverse' | 'update-xy'

interface ModeDefinition {
  id: MonumentMode
  label: string
  title: string
}

interface MonumentProjectSummary {
  objectId: number | string
  globalId?: string
  name: string
  jobNo?: string
  fileNo?: string
  surveyYear?: number | string
  folderUrl?: string
  historyCount: number
}

interface MonumentHistorySummary {
  objectId: number | string
  globalId?: string
  monumentGlobalId?: string
  projectGlobalId?: string
  projectName?: string
  createdDate?: number
  pointNumber: string
  status: string
  monumentType: string
  embeddedIn: string
  markerType: string
  markerMaterial: string
}

interface SurveyMonumentSummary {
  objectId: number | string
  globalId?: string
  pointNumber: string
  monumentType: string
  status: string
  joeId?: number | string
  denId?: number | string
}

interface QueryResponse {
  features?: Array<{ attributes?: { [key: string]: any }, geometry?: any }>
  geometryType?: string
  spatialReference?: any
  error?: { message?: string }
}

interface AttachmentSummary {
  id: number
  name: string
  contentType?: string
  size?: number
  url?: string
}

interface StagedAttachmentFile {
  id: string
  file: File
  previewUrl: string
}

interface CsvProjectRow {
  id: string
  rowNumber: number
  attributes: { [key: string]: string }
  pointNumber: string
  validationMessages: string[]
  existingMonuments: SurveyMonumentSummary[]
}

interface CsvProjectCoordinate {
  x: number
  y: number
  z?: number
}

interface TraverseFileSummary {
  id: string
  name: string
  size: number
  lineCount: number
  nonEmptyLineCount: number
  text: string
  basisOfBearing?: string
}

interface ParsedTraverseMonument {
  pointId: string
  northing?: number
  easting?: number
  description: string
  fixedStation: boolean
  stdDevN?: number
  stdDevE?: number
  stdDevElev?: number
  updated: boolean
  sourceFileName: string
}

interface ParsedTraverseConnection {
  fromPointNum: string
  toPointNum: string
  fromPointN?: number
  fromPointE?: number
  toPointN?: number
  toPointE?: number
  distance?: number
  direction?: number
  updated: boolean
  sourceFileName: string
}

interface ParsedTraverseFileResult {
  fileId: string
  fileName: string
  monuments: ParsedTraverseMonument[]
  connections: ParsedTraverseConnection[]
  fixedStations: string[]
}

interface ParsedTraverseData {
  monuments: ParsedTraverseMonument[]
  connections: ParsedTraverseConnection[]
  fixedStations: string[]
  files: ParsedTraverseFileResult[]
}

interface ParsedProjectControl {
  name: string
  resN?: number
  resE?: number
  fixedStation: boolean
  northing?: number
  easting?: number
  elevation?: number
  nonControlStation: boolean
  updated: boolean
  sourceFileName: string
}

interface ParsedStaticFileResult {
  fileId: string
  fileName: string
  projectControls: ParsedProjectControl[]
  basisOfBearing?: string
  validations: FinalizeValidationMessage[]
}

interface ExistingTraverseConnectionSummary {
  objectId: number | string
  geometry?: any
}

type FinalizeEditKind =
  'update-history'
  | 'create-history'
  | 'update-survey-monument'
  | 'create-survey-monument'
  | 'backfill-history-relationship'
  | 'delete-traverse-connection'
  | 'create-traverse-connection'

interface PlannedFinalizeEdit {
  kind: FinalizeEditKind
  label: string
  pointId?: string
  objectId?: string | number
  globalId?: string
  attributes?: { [key: string]: any }
  geometry?: any
}

interface FinalizeValidationMessage {
  severity: 'info' | 'warning' | 'error'
  message: string
  pointId?: string
}

interface FinalizePlan {
  edits: PlannedFinalizeEdit[]
  validations: FinalizeValidationMessage[]
  counts: { [key in FinalizeEditKind]: number }
  canCommit: boolean
  existingTraverseConnections: ExistingTraverseConnectionSummary[]
}

interface FinalizeRollbackStep {
  label: string
  execute: () => Promise<void>
  rollback: () => Promise<void>
}

interface FinalizeHistoryRecord {
  objectId: number | string
  globalId: string
  pointGlobalId: string
  pointNumber: string
  remarks: string
}

interface FinalizeSurveyMonumentRecord {
  objectId: number | string
  globalId: string
  pointNumber: string
}

interface AutoAssignHistoryCandidate {
  objectId: number | string
  pointGlobalId: string
  pointNumber: string
  projectGlobalId: string
  createdDate?: number
}

type AutoAssignPlanAction = 'assign' | 'skip'

interface AutoAssignPlanRow {
  id: string
  monumentKey: string
  pointNumber: string
  historyObjectId?: number | string
  historyPointNumber?: string
  currentProjectGlobalId?: string
  currentProjectName?: string
  createdDate?: number
  action: AutoAssignPlanAction
  status: string
  severity: 'ready' | 'info' | 'warning' | 'error'
}

interface AutoAssignPlan {
  rows: AutoAssignPlanRow[]
  assignableRows: AutoAssignPlanRow[]
  readyCount: number
  alreadyAssignedCount: number
  noEligibleHistoryCount: number
  multipleCandidateCount: number
  errorCount: number
}

type PointNumberPlanAction = 'update' | 'skip'

interface PointNumberPlanRow {
  id: string
  historyObjectId: number | string
  historyPointNumber: string
  pointGlobalId: string
  surveyObjectId?: number | string
  currentPointNumber?: string
  newPointNumber?: string
  action: PointNumberPlanAction
  status: string
  severity: 'ready' | 'info' | 'warning' | 'error'
}

interface PointNumberPlan {
  rows: PointNumberPlanRow[]
  assignableRows: PointNumberPlanRow[]
  selectedCount: number
  readyCount: number
  missingPointGlobalIdCount: number
  missingPointNumberCount: number
  notFoundCount: number
  conflictCount: number
  alreadyMatchedCount: number
  overwriteCount: number
  errorCount: number
}

type CreateProjectPlanAction = 'create-survey-monument' | 'update-survey-monument' | 'none'
type CreateProjectPlanSource = 'new-search-point' | 'existing-monument' | 'multiple-monuments'

interface CreateProjectPlanRow {
  id: string
  source: CreateProjectPlanSource
  pointNumber: string
  description: string
  x?: number
  y?: number
  z?: number
  surveyObjectId?: number | string
  currentPointNumber?: string
  action: CreateProjectPlanAction
  severity: 'ready' | 'info' | 'warning' | 'error'
  validationLabel?: string
}

interface CreateProjectPlan {
  rows: CreateProjectPlanRow[]
  createRows: CreateProjectPlanRow[]
  updateRows: CreateProjectPlanRow[]
  projectName: string
  useSelectedProject: boolean
  canCommit: boolean
  errorCount: number
  warningCount: number
}

interface MergeHistoryReassignment {
  objectId: number | string
  pointNumber: string
  sourceGlobalId: string
  sourcePointNumber: string
  sourceObjectId: number | string
}

interface TargetMergeSourceRow {
  monument: SurveyMonumentSummary
  historyRows: MergeHistoryReassignment[]
}

interface TargetMergePlan {
  target: SurveyMonumentSummary
  sources: TargetMergeSourceRow[]
  validations: FinalizeValidationMessage[]
  canCommit: boolean
  historyUpdateCount: number
  sourceDeleteCount: number
  zeroHistoryCount: number
}

interface RemoveMonumentsPlanRow {
  monument: SurveyMonumentSummary
  historyRows: MergeHistoryReassignment[]
}

interface RemoveMonumentsPlan {
  rows: RemoveMonumentsPlanRow[]
  validations: FinalizeValidationMessage[]
  canCommit: boolean
  surveyDeleteCount: number
  historyDeleteCount: number
  zeroHistoryCount: number
}

interface MeanMergePlan extends TargetMergePlan {
  targetOriginalGeometry: any
  meanGeometry: any
  meanX: number
  meanY: number
  targetOriginalX: number
  targetOriginalY: number
}

type MergeOperationType = 'target' | 'mean'
type FinalizeValidationTab = 'summary' | 'monuments' | 'connections' | 'history' | 'issues'
type ValidationReviewMode = 'traverse' | 'static'

const PROJECT_COMPLETED_FIELD = 'FieldWorkComp'
const PROJECT_BASIS_OF_BEARING_FIELD = 'BasisOfBearing'
const PROJECT_SEARCH_MINIMUM_LENGTH = 3
const PROJECT_QUERY_LIMIT = 100
const HISTORY_QUERY_LIMIT = 2000
const MONUMENT_GLOBAL_ID_QUERY_CHUNK_SIZE = 50
const SURVEY_MONUMENTS_LAYER_ID = '999066'
const MONUMENT_PROJECTS_LAYER_ID = '999068'
const MONUMENT_HISTORY_LAYER_ID = '999069'
const TRAVERSE_CONNECTIONS_LAYER_ID = '999082'
const STANDARD_PROJECT_CSV_FIELDS = ['PointNumber', 'YCoordinate', 'XCoordinate', 'Elevation', 'MonumentDescription'] as const
const ORANGE_COUNTY_STATE_PLANE_SPATIAL_REFERENCE = { wkid: 102646, latestWkid: 2230 }
const CSV_SEARCH_POINT_BUFFER_FEET = 0.03
const CSV_PROJECT_BOUNDARY_PADDING_FEET = 25
const CSV_SPATIAL_QUERY_CONCURRENCY = 8

const escapeSqlString = (value: string) => value.replace(/'/g, "''")

const getEditErrorMessage = (result: any, fallbackMessage: string) => {
  const error = result?.error || result
  const details = error?.details || {}
  const detailMessages = Array.isArray(details)
    ? details.filter(Boolean).join(' ')
    : Array.isArray(details.messages)
      ? details.messages.filter(Boolean).join(' ')
      : ''
  const codeMessage = error?.code ? `Code ${error.code}` : ''
  return error?.message || error?.description || detailMessages || details.message || codeMessage || fallbackMessage
}

const getUnknownErrorMessage = (err: unknown, fallbackMessage: string) =>
  err instanceof Error
    ? err.message
    : getEditErrorMessage(err, fallbackMessage)

const getOperationErrorStatus = (fallbackMessage: string, err: unknown) => {
  const message = getUnknownErrorMessage(err, fallbackMessage)
  if (!message || message === fallbackMessage) return fallbackMessage
  return `${fallbackMessage} ${message}`.trim()
}

const mapWithConcurrency = async <T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>
) => {
  const results: R[] = []
  let nextIndex = 0
  const workerCount = Math.min(limit, items.length)

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex
      nextIndex += 1
      results[currentIndex] = await mapper(items[currentIndex], currentIndex)
    }
  }))

  return results
}

const parseCsvLine = (line: string) => {
  const values: string[] = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const nextChar = line[index + 1]
    if (char === '"' && inQuotes && nextChar === '"') {
      current += '"'
      index += 1
    } else if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }

  values.push(current.trim())
  return values
}

const normalizeCsvHeader = (value: string) => value.replace(/[^a-z0-9]/gi, '').toLowerCase()

const isStandardProjectCsvHeader = (values: string[]) => {
  const normalizedValues = values.map(normalizeCsvHeader)
  return normalizedValues.includes('pointnumber') ||
    normalizedValues.includes('longitude') ||
    normalizedValues.includes('latitude') ||
    normalizedValues.includes('xcoordinate') ||
    normalizedValues.includes('ycoordinate') ||
    normalizedValues.includes('easting') ||
    normalizedValues.includes('northing') ||
    normalizedValues.includes('monumentdescription')
}

const parseCsvText = (text: string) => {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
  if (lines.length === 0) return []

  const firstLineValues = parseCsvLine(lines[0])
  const hasHeader = isStandardProjectCsvHeader(firstLineValues)
  const headers = hasHeader
    ? firstLineValues.map((header, index) => header || `Column ${index + 1}`)
    : firstLineValues.map((_, index) => `Column ${index + 1}`)
  const dataLines = hasHeader ? lines.slice(1) : lines
  const rowNumberOffset = hasHeader ? 2 : 1

  return dataLines.map((line, index) => {
    const values = parseCsvLine(line)
    const attributes = headers.reduce<{ [key: string]: string }>((result, header, headerIndex) => {
      result[header] = values[headerIndex] || ''
      return result
    }, {})
    STANDARD_PROJECT_CSV_FIELDS.forEach((fieldName, fieldIndex) => {
      if (!attributes[fieldName]) attributes[fieldName] = values[fieldIndex] || ''
    })
    attributes.MonumentDescription = attributes.MonumentDescription || values[values.length - 1] || ''
    return { rowNumber: index + rowNumberOffset, attributes }
  })
}

const extractBasisOfBearing = (text: string) => {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const basisLine = lines.find((line) => /basis\s+of\s+bearing/i.test(line))
  if (!basisLine) return ''
  const separatorIndex = basisLine.search(/[:=-]/)
  return separatorIndex >= 0 ? basisLine.slice(separatorIndex + 1).trim() || basisLine : basisLine
}

const normalizeLstColumns = (line: string) => line.trim().replace(/\s+/g, ' ').split(' ').filter(Boolean)

const parseLstNumber = (value?: string) => {
  if (!value) return undefined
  const parsed = Number(value.replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : undefined
}

const parseCsvCoordinate = (value?: string) => {
  if (!value) return undefined
  const parsed = Number(value.replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : undefined
}

const getCsvAttribute = (attributes: { [key: string]: string }, keys: string[]) => {
  for (const key of keys) {
    const matchingKey = Object.keys(attributes).find((attributeKey) => attributeKey.toLowerCase() === key.toLowerCase())
    const value = matchingKey ? attributes[matchingKey] : undefined
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim()
  }
  return ''
}

const getCsvProjectRowCoordinates = (item: CsvProjectRow): CsvProjectCoordinate | null => {
  const x = parseCsvCoordinate(getCsvAttribute(item.attributes, ['XCoordinate', 'Longitude', 'Easting']))
  const y = parseCsvCoordinate(getCsvAttribute(item.attributes, ['YCoordinate', 'Latitude', 'Northing']))
  if (x === undefined || y === undefined) return null
  const coordinate: CsvProjectCoordinate = {
    x,
    y
  }
  const z = parseCsvCoordinate(item.attributes.Elevation)
  if (z !== undefined) coordinate.z = z
  return coordinate
}

const getCsvProjectRowDisplay = (item: CsvProjectRow) => {
  const x = getCsvAttribute(item.attributes, ['XCoordinate', 'Longitude', 'Easting']) || '-'
  const y = getCsvAttribute(item.attributes, ['YCoordinate', 'Latitude', 'Northing']) || '-'
  const z = item.attributes.Elevation || '-'
  const description = getCsvAttribute(item.attributes, ['MonumentDescription', 'Description']) || '-'
  return {
    pointNumber: item.pointNumber || '-',
    description,
    coordinateText: `x: ${x} | y: ${y} | z: ${z}`
  }
}

const shouldOmitCsvProjectRow = (attributes: { [key: string]: string }) =>
  getCsvAttribute(attributes, ['MonumentDescription', 'Description']).toUpperCase().includes('GPS_OMIT')

const projectNameFromCsvFileName = (fileName: string) =>
  fileName
    .replace(/\.csv$/i, '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())

const cleanTraverseDescription = (parts: string[]) => {
  const description = parts.join(' ').trim()
  return description.replace(/\b(CPT_OMIT|MON_OMIT)\s*/g, '').trim()
}

const normalizeComparableName = (value: string) =>
  value
    .replace(/\.[^/.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const namesLookSimilar = (left: string, right: string) => {
  const normalizedLeft = normalizeComparableName(left)
  const normalizedRight = normalizeComparableName(right)
  if (!normalizedLeft || !normalizedRight) return false
  if (normalizedLeft === normalizedRight) return true
  if (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) return true

  const leftTokens = normalizedLeft.split(/\s+/).filter((token) => token.length > 1)
  const rightTokens = normalizedRight.split(/\s+/).filter((token) => token.length > 1)
  if (leftTokens.length === 0 || rightTokens.length === 0) return false

  const rightTokenSet = new Set(rightTokens)
  const matchingTokenCount = leftTokens.filter((token) => rightTokenSet.has(token)).length
  return matchingTokenCount / Math.max(leftTokens.length, rightTokens.length) >= 0.5
}

const calculateTraverseDistance = (fromPointE: number, fromPointN: number, toPointE: number, toPointN: number) =>
  Math.sqrt((toPointE - fromPointE) ** 2 + (toPointN - fromPointN) ** 2)

const calculateTraverseAzimuth = (fromPointE: number, fromPointN: number, toPointE: number, toPointN: number) => {
  const radians = Math.atan2(toPointE - fromPointE, toPointN - fromPointN)
  return (radians * 180 / Math.PI + 360) % 360
}

const calculateAzimuthQuadrant = (azimuth: number) => {
  if (azimuth >= 0 && azimuth <= 90) return 1
  if (azimuth > 90 && azimuth <= 180) return 2
  if (azimuth > 180 && azimuth <= 270) return 3
  return 4
}

const formatBearingDms = (decimalDegrees: number) => {
  const totalSeconds = Math.round(decimalDegrees * 3600)
  const degrees = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds - degrees * 3600) / 60)
  const seconds = totalSeconds - degrees * 3600 - minutes * 60
  return `${String(degrees).padStart(2, '0')}-${String(minutes).padStart(2, '0')}-${String(seconds).padStart(2, '0')}`
}

const formatBearingDistance = (distance: number) => {
  const roundedDistance = Math.round(distance * 100) / 100
  const [whole, decimal = '00'] = roundedDistance.toFixed(2).split('.')
  const formattedWhole = whole.padStart(3, '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${formattedWhole}.${decimal}`
}

const calculateBasisOfBearingFromControls = (projectControls: ParsedProjectControl[]) => {
  const fixedControls = projectControls.filter((control) =>
    control.fixedStation &&
    control.resN === 0 &&
    control.resE === 0 &&
    control.northing !== undefined &&
    control.easting !== undefined
  )
  if (fixedControls.length < 2) return ''

  const startControl = fixedControls[0]
  const endControl = fixedControls[1]
  const azimuth = calculateTraverseAzimuth(startControl.easting, startControl.northing, endControl.easting, endControl.northing)
  const quadrant = calculateAzimuthQuadrant(azimuth)
  let northBearing: number
  if (quadrant === 1) {
    northBearing = azimuth
  } else if (quadrant === 2) {
    northBearing = 360 - (azimuth + 180)
  } else if (quadrant === 3) {
    northBearing = azimuth - 180
  } else {
    northBearing = 360 - azimuth
  }

  const distance = Math.round(calculateTraverseDistance(startControl.easting, startControl.northing, endControl.easting, endControl.northing) * 100) / 100
  if (distance <= 0) return ''

  const bearingSuffix = quadrant === 2 || quadrant === 4 ? 'W' : 'E'
  return `N${formatBearingDms(Math.abs(northBearing))}${bearingSuffix} ${formatBearingDistance(distance)}'`
}

const hasCoordinatePair = (monument?: ParsedTraverseMonument): monument is ParsedTraverseMonument & { northing: number, easting: number } =>
  monument?.northing !== undefined && monument.easting !== undefined

const enrichTraverseConnections = (
  connections: ParsedTraverseConnection[],
  monumentsByPointId: Map<string, ParsedTraverseMonument>
) =>
  connections.map((connection) => {
    const fromMonument = monumentsByPointId.get(connection.fromPointNum)
    const toMonument = monumentsByPointId.get(connection.toPointNum)
    const enrichedConnection: ParsedTraverseConnection = {
      ...connection,
      fromPointN: fromMonument?.northing,
      fromPointE: fromMonument?.easting,
      toPointN: toMonument?.northing,
      toPointE: toMonument?.easting
    }

    if (hasCoordinatePair(fromMonument) && hasCoordinatePair(toMonument)) {
      enrichedConnection.distance = calculateTraverseDistance(
        fromMonument.easting,
        fromMonument.northing,
        toMonument.easting,
        toMonument.northing
      )
      enrichedConnection.direction = calculateTraverseAzimuth(
        fromMonument.easting,
        fromMonument.northing,
        toMonument.easting,
        toMonument.northing
      )
    }

    return enrichedConnection
  })

const buildParsedTraverseDataFromFiles = (files: TraverseFileSummary[], parseControllingStations: boolean): ParsedTraverseData => {
  const fileResults = files.map((file) => parseTraverseText(file.text, file.id, file.name, parseControllingStations))
  const monumentsByPointId = new Map<string, ParsedTraverseMonument>()
  const fixedStations = new Set<string>()

  fileResults.forEach((result) => {
    result.fixedStations.forEach((pointId) => fixedStations.add(pointId))
    result.monuments.forEach((monument) => {
      if (!monumentsByPointId.has(monument.pointId)) monumentsByPointId.set(monument.pointId, monument)
    })
  })
  fixedStations.forEach((pointId) => {
    const monument = monumentsByPointId.get(pointId)
    if (monument) monument.fixedStation = true
  })

  const enrichedFileResults = fileResults.map((result) => ({
    ...result,
    connections: enrichTraverseConnections(result.connections, monumentsByPointId)
  }))

  return {
    monuments: Array.from(monumentsByPointId.values()),
    connections: enrichedFileResults.flatMap((result) => result.connections),
    fixedStations: Array.from(fixedStations),
    files: enrichedFileResults
  }
}

const emptyFinalizeCounts = (): { [key in FinalizeEditKind]: number } => ({
  'update-history': 0,
  'create-history': 0,
  'update-survey-monument': 0,
  'create-survey-monument': 0,
  'backfill-history-relationship': 0,
  'delete-traverse-connection': 0,
  'create-traverse-connection': 0
})

const countFinalizeEdit = (counts: { [key in FinalizeEditKind]: number }, kind: FinalizeEditKind) => {
  counts[kind] += 1
}

const createFinalizeStepRunner = async (steps: FinalizeRollbackStep[]) => {
  const completedSteps: FinalizeRollbackStep[] = []
  try {
    for (const step of steps) {
      await step.execute()
      completedSteps.push(step)
    }
  } catch (err) {
    for (const step of [...completedSteps].reverse()) {
      await step.rollback()
    }
    throw err
  }
}

const parseTraverseText = (text: string, fileId: string, fileName: string, parseControllingStations: boolean): ParsedTraverseFileResult => {
  const monumentsByPointId = new Map<string, ParsedTraverseMonument>()
  const fixedStations = new Set<string>()
  const connections: ParsedTraverseConnection[] = []
  let sumContSta = false
  let sumContStaHeader = false
  let adjCoordinates = false
  let adjCoordinatesHeader = false
  let adjMeasDistObs = false
  let adjMeasDistObsHeader = false
  let staCoorStanDev = false
  let staCoorStanDevHeader = false
  let adjCoordinateDescColumn = 4

  text.split(/\r?\n/).some((rawLine) => {
    const line = rawLine.trim()
    if (line === 'Summary of Controlling Stations' && parseControllingStations) {
      sumContSta = true
      return false
    }
    if (sumContSta && line.startsWith('Fixed Stations')) {
      sumContStaHeader = true
      return false
    }
    if (sumContStaHeader && line !== '') {
      const data = normalizeLstColumns(line)
      if (data[0]) fixedStations.add(data[0])
    }
    if (sumContSta && sumContStaHeader && line === '') {
      sumContSta = false
      sumContStaHeader = false
    }

    if (line === 'Adjusted Coordinates (FeetUS)') {
      adjCoordinates = true
      return false
    }
    if (adjCoordinates && line.startsWith('Station')) {
      adjCoordinatesHeader = true
      const data = normalizeLstColumns(line)
      adjCoordinateDescColumn = data[3] === 'Description' ? 3 : 4
      return false
    }
    if (adjCoordinatesHeader && line !== '') {
      const data = normalizeLstColumns(line)
      const pointId = data[0]
      if (pointId && data.length >= 3 && !monumentsByPointId.has(pointId)) {
        monumentsByPointId.set(pointId, {
          pointId,
          northing: parseLstNumber(data[1]),
          easting: parseLstNumber(data[2]),
          description: cleanTraverseDescription(data.slice(adjCoordinateDescColumn)),
          fixedStation: fixedStations.has(pointId),
          updated: false,
          sourceFileName: fileName
        })
      }
      return false
    }
    if (adjCoordinates && adjCoordinatesHeader && line === '') {
      adjCoordinates = false
      adjCoordinatesHeader = false
    }

    if (line === 'Adjusted Measured Distance Observations (FeetUS)' || line === 'Adjusted Distance Observations (FeetUS)') {
      adjMeasDistObs = true
      return false
    }
    if (adjMeasDistObs && line.startsWith('From')) {
      adjMeasDistObsHeader = true
      return false
    }
    if (adjMeasDistObsHeader && line !== '') {
      const data = normalizeLstColumns(line)
      if (data[0] && data[1]) {
        connections.push({
          fromPointNum: data[0],
          toPointNum: data[1],
          updated: false,
          sourceFileName: fileName
        })
      }
      return false
    }
    if (adjMeasDistObs && adjMeasDistObsHeader && line === '') {
      adjMeasDistObs = false
      adjMeasDistObsHeader = false
    }

    if (line === 'Station Coordinate Standard Deviations (FeetUS)') {
      staCoorStanDev = true
      return false
    }
    if (staCoorStanDev && line.startsWith('Station')) {
      staCoorStanDevHeader = true
      return false
    }
    if (staCoorStanDevHeader && line !== '') {
      const data = normalizeLstColumns(line)
      const monument = monumentsByPointId.get(data[0])
      if (monument) {
        monument.stdDevN = parseLstNumber(data[1])
        monument.stdDevE = parseLstNumber(data[2])
        if (data.length > 3) monument.stdDevElev = parseLstNumber(data[3])
      }
      return false
    }
    if (staCoorStanDev && staCoorStanDevHeader && line === '') {
      return true
    }

    return false
  })

  fixedStations.forEach((pointId) => {
    const monument = monumentsByPointId.get(pointId)
    if (monument) monument.fixedStation = true
  })

  return {
    fileId,
    fileName,
    monuments: Array.from(monumentsByPointId.values()),
    connections,
    fixedStations: Array.from(fixedStations)
  }
}

const parseStaticText = (text: string, fileId: string, fileName: string): ParsedStaticFileResult => {
  const projectControlsByName = new Map<string, ParsedProjectControl>()
  const validations: FinalizeValidationMessage[] = []
  let adjustedStationInfoFound = false
  let adjustedCoordinatesFound = false
  let gpsVectorFound = false
  let stationHeaderFound = false
  let fromHeaderFound = false
  let sawAdjustedStationInfo = false
  let sawAdjustedCoordinates = false
  let sawGpsVectorSummary = false

  text.split(/\r?\n/).some((rawLine) => {
    const line = rawLine.trim()
    if (line === 'Adjusted Station Information') {
      adjustedStationInfoFound = true
      sawAdjustedStationInfo = true
      return false
    }
    if (adjustedStationInfoFound) {
      if (line.startsWith('Station')) {
        stationHeaderFound = true
        return false
      }
      if (stationHeaderFound && !adjustedCoordinatesFound && line !== '') {
        const data = normalizeLstColumns(line)
        const name = data[0]
        const resN = parseLstNumber(data[1])
        const resE = parseLstNumber(data[2])
        if (!name) {
          validations.push({ severity: 'warning', message: 'Static station row is missing a station name.' })
          return false
        }
        projectControlsByName.set(name, {
          name,
          resN,
          resE,
          fixedStation: resN === 0 && resE === 0,
          nonControlStation: false,
          updated: false,
          sourceFileName: fileName
        })
        return false
      }
      if (stationHeaderFound && line === '') {
        stationHeaderFound = false
        adjustedStationInfoFound = false
      }
    }

    if (line === 'Adjusted Coordinates (FeetUS)') {
      adjustedCoordinatesFound = true
      sawAdjustedCoordinates = true
      return false
    }
    if (adjustedCoordinatesFound) {
      if (line.startsWith('Station')) {
        stationHeaderFound = true
        return false
      }
      if (stationHeaderFound && line !== '') {
        const data = normalizeLstColumns(line)
        const name = data[0]
        if (!name) {
          validations.push({ severity: 'warning', message: 'Static coordinate row is missing a station name.' })
          return false
        }
        const existingControl = projectControlsByName.get(name)
        const control = existingControl || {
          name,
          fixedStation: false,
          nonControlStation: true,
          updated: false,
          sourceFileName: fileName
        }
        control.northing = parseLstNumber(data[1])
        control.easting = parseLstNumber(data[2])
        control.elevation = parseLstNumber(data[3])
        control.nonControlStation = !existingControl
        projectControlsByName.set(name, control)
        return false
      }
      if (stationHeaderFound && line === '') {
        stationHeaderFound = false
        adjustedCoordinatesFound = false
      }
    }

    if (line === 'GPS Vector Residual Summary (FeetUS)') {
      gpsVectorFound = true
      sawGpsVectorSummary = true
      return false
    }
    if (gpsVectorFound) {
      if (line.startsWith('From')) {
        fromHeaderFound = true
        return false
      }
      if (fromHeaderFound && line === '') {
        return true
      }
    }

    return false
  })

  if (!sawAdjustedStationInfo) validations.push({ severity: 'warning', message: 'Adjusted Station Information section was not found.' })
  if (!sawAdjustedCoordinates) validations.push({ severity: 'error', message: 'Adjusted Coordinates section was not found.' })
  if (!sawGpsVectorSummary) validations.push({ severity: 'info', message: 'GPS Vector Residual Summary section was not found.' })

  const projectControls = Array.from(projectControlsByName.values())
  projectControls.forEach((control) => {
    if (control.northing === undefined || control.easting === undefined) {
      validations.push({
        severity: 'warning',
        pointId: control.name,
        message: 'Project control station is missing usable northing/easting.'
      })
    }
  })
  const basisOfBearing = calculateBasisOfBearingFromControls(projectControls)
  if (!basisOfBearing) {
    validations.push({
      severity: 'warning',
      message: 'Basis of Bearing could not be calculated from two fixed control stations.'
    })
  }

  return {
    fileId,
    fileName,
    projectControls,
    basisOfBearing,
    validations
  }
}

const normalizeUrl = (url?: string) => {
  const rawUrl = (url || '').trim()
  if (!rawUrl) return ''
  try {
    const parsed = new URL(rawUrl)
    return `${parsed.origin}${parsed.pathname}`.replace(/\/query$/i, '').replace(/\/+$/, '').toLowerCase()
  } catch {
    return rawUrl.split('?')[0].split('#')[0].replace(/\/query$/i, '').replace(/\/+$/, '').toLowerCase()
  }
}

const getServiceLayerKey = (url?: string) => {
  const normalized = normalizeUrl(url)
  const match = normalized.match(/\/rest\/services\/(.+)\/(featureserver|mapserver)\/(\d+)$/i)
  return match ? `${match[1]}/${match[2]}/${match[3]}`.toLowerCase() : normalized
}

const urlCandidatesMatch = (targetUrl: string, candidates: string[]) => {
  const normalizedTarget = normalizeUrl(targetUrl)
  const targetServiceKey = getServiceLayerKey(targetUrl)
  return candidates.some((candidate) => {
    const normalizedCandidate = normalizeUrl(candidate)
    const candidateServiceKey = getServiceLayerKey(candidate)
    return normalizedCandidate === normalizedTarget || candidateServiceKey === targetServiceKey
  })
}

const getAttributeValue = (attributes: { [key: string]: any }, key: string) => {
  if (!attributes) return undefined
  if (attributes[key] !== undefined) return attributes[key]
  const matchingKey = Object.keys(attributes).find((attributeKey) => attributeKey.toLowerCase() === key.toLowerCase())
  return matchingKey ? attributes[matchingKey] : undefined
}

const getStringAttribute = (attributes: { [key: string]: any }, key: string) => {
  const value = getAttributeValue(attributes, key)
  if (value === null || value === undefined) return ''
  return String(value)
}

const hasUsableAttributeValue = (value: any) =>
  value !== null && value !== undefined && String(value).trim() !== '' && String(value).trim() !== '-'

const getIntegerAttributeValue = (value: any) => {
  if (!hasUsableAttributeValue(value)) return null
  const numericValue = Number(value)
  return Number.isInteger(numericValue) ? numericValue : null
}

const formatGuidForEdit = (value?: string) => {
  const trimmed = (value || '').trim()
  const match = trimmed.match(/^\{?([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})\}?$/i)
  return match
    ? `{${match.slice(1).join('-').toUpperCase()}}`
    : trimmed
}

const normalizeGuidKey = (value?: string) => (value || '').replace(/[{}]/g, '').trim().toLowerCase()

const appendDelimitedText = (existingValue?: string, nextValue?: string, delimiter = ' | ') => {
  const existingText = (existingValue || '').trim()
  const nextText = (nextValue || '').trim()
  if (!existingText) return nextText
  if (!nextText) return existingText
  const existingParts = existingText.split(delimiter).map((part) => part.trim()).filter(Boolean)
  if (existingParts.some((part) => part.toLowerCase() === nextText.toLowerCase())) return existingText
  return `${existingText}${delimiter}${nextText}`
}

const stripSystemEditAttributes = (attributes: { [key: string]: any } = {}, layer: any) => {
  const objectIdField = String(layer?.objectIdField || 'OBJECTID').toLowerCase()
  const globalIdField = String(layer?.globalIdField || 'GlobalID').toLowerCase()
  return Object.keys(attributes).reduce<{ [key: string]: any }>((result, key) => {
    const normalizedKey = key.toLowerCase()
    if (normalizedKey === objectIdField || normalizedKey === globalIdField) return result
    result[key] = attributes[key]
    return result
  }, {})
}

const getCopyableAddAttributes = (attributes: { [key: string]: any } = {}, layer: any) => {
  const strippedAttributes = stripSystemEditAttributes(attributes, layer)
  const fields = Array.isArray(layer?.fields) ? layer.fields : []
  if (fields.length === 0) return strippedAttributes

  return Object.keys(strippedAttributes).reduce<{ [key: string]: any }>((result, key) => {
    const field = fields.find((candidate: any) => String(candidate?.name || '').toLowerCase() === key.toLowerCase())
    if (!field) return result
    if (field.editable === false || field.type === 'oid' || field.type === 'global-id') return result
    result[field.name || key] = strippedAttributes[key]
    return result
  }, {})
}

const getRollbackAddAttributes = (attributes: { [key: string]: any } = {}, layer: any) => {
  const copyableAttributes = getCopyableAddAttributes(attributes, layer)
  const globalIdField = layer?.globalIdField || 'GlobalID'
  const globalId = getAttributeValue(attributes, globalIdField)
  return globalId
    ? {
        ...copyableAttributes,
        [globalIdField]: globalId
      }
    : copyableAttributes
}

const layerSupportsRollbackOnFailureOption = (layer: any) =>
  layer?.capabilities?.editing?.supportsRollbackOnFailure === true ||
  layer?.supportsRollbackOnFailureParameter === true

const getApplyEditsOptions = (layer: any, options: { [key: string]: any } = {}) =>
  layerSupportsRollbackOnFailureOption(layer)
    ? { ...options, rollbackOnFailureEnabled: true }
    : options

const getDeleteGraphics = (Graphic: any, layer: any, objectIds: Array<string | number>) => {
  const objectIdField = layer?.objectIdField || 'OBJECTID'
  return objectIds.map((objectId) => new Graphic({
    attributes: { [objectIdField]: objectId }
  }))
}

const queryLayerFeaturesByObjectIds = async (layer: any, objectIds: Array<string | number>, returnGeometry = true) => {
  const numericObjectIds = Array.from(new Set(objectIds
    .map((objectId) => typeof objectId === 'number' ? objectId : Number(objectId))
    .filter((objectId) => Number.isFinite(objectId))))
  if (numericObjectIds.length === 0) return []
  const query = layer.createQuery ? layer.createQuery() : {}
  query.objectIds = numericObjectIds
  query.outFields = ['*']
  query.returnGeometry = returnGeometry
  const result = await layer.queryFeatures(query)
  return result?.features || []
}

const collectMatchingDataSourceIds = (
  appConfig: any,
  targetUrl: string,
  layerNamePattern: RegExp,
  layerIdText: string
) => {
  const dataSources: { [id: string]: any } = appConfig?.dataSources || {}
  const matches: string[] = []

  const addMatch = (dataSourceId?: string) => {
    if (dataSourceId && !matches.includes(dataSourceId)) matches.push(dataSourceId)
  }

  const visit = (dataSourceJson: any) => {
    if (!dataSourceJson?.id) return
    const dataSourceUrl = normalizeUrl(dataSourceJson.url)
    const dataSourceLayerUrl = dataSourceJson.url && dataSourceJson.layerId !== undefined
      ? normalizeUrl(`${dataSourceJson.url}/${dataSourceJson.layerId}`)
      : dataSourceUrl
    if (urlCandidatesMatch(targetUrl, [dataSourceUrl, dataSourceLayerUrl])) {
      addMatch(dataSourceJson.id)
    }
    Object.keys(dataSourceJson.childDataSourceJsons || {}).forEach((childId) => {
      visit(dataSourceJson.childDataSourceJsons[childId])
    })
  }

  Object.keys(dataSources).forEach((dataSourceId) => {
    visit(dataSources[dataSourceId])
  })

  Object.values(appConfig?.widgets || {}).forEach((widget: any) => {
    ;(widget?.config?.layersConfig || []).forEach((layerConfig: any) => {
      const layerText = JSON.stringify({
        id: layerConfig?.id,
        name: layerConfig?.name,
        useDataSource: layerConfig?.useDataSource
      })
      const isTargetLayer = layerNamePattern.test(layerText) || layerText.includes(layerIdText)
      const dataSourceId = layerConfig?.useDataSource?.dataSourceId || layerConfig?.id
      if (isTargetLayer) addMatch(dataSourceId)
    })
  })

  return matches.sort().join('|')
}

const Widget = (props: AllWidgetProps<IMConfig>) => {
  const h = React.createElement
  const m = defaultMessages
  const cfg: any = props.config || {}
  const [mode, setMode] = React.useState<MonumentMode>('finder')
  const [jimuMapView, setJimuMapView] = React.useState<any>(null)
  const [projects, setProjects] = React.useState<MonumentProjectSummary[]>([])
  const [selectedProject, setSelectedProject] = React.useState<MonumentProjectSummary | null>(null)
  const [historyItems, setHistoryItems] = React.useState<MonumentHistorySummary[]>([])
  const [selectedHistoryKeys, setSelectedHistoryKeys] = React.useState<string[]>([])
  const [activeHistoryKey, setActiveHistoryKey] = React.useState('')
  const [assignSurveyMonuments, setAssignSurveyMonuments] = React.useState<SurveyMonumentSummary[]>([])
  const [activeAssignSurveyKey, setActiveAssignSurveyKey] = React.useState('')
  const [assignHistoryItems, setAssignHistoryItems] = React.useState<MonumentHistorySummary[]>([])
  const [activeAssignHistoryKey, setActiveAssignHistoryKey] = React.useState('')
  const [selectedMapFeatures, setSelectedMapFeatures] = React.useState<any[]>([])
  const [projectSearchTerm, setProjectSearchTerm] = React.useState('')
  const [loadingProjects, setLoadingProjects] = React.useState(false)
  const [projectError, setProjectError] = React.useState('')
  const [loadingHistory, setLoadingHistory] = React.useState(false)
  const [historyError, setHistoryError] = React.useState('')
  const [loadingAssignHistory, setLoadingAssignHistory] = React.useState(false)
  const [addingAssignHistory, setAddingAssignHistory] = React.useState(false)
  const [assigningHistoryProjectKey, setAssigningHistoryProjectKey] = React.useState('')
  const [pendingAssignHistoryProjectKey, setPendingAssignHistoryProjectKey] = React.useState('')
  const [buildingAutoAssignPlan, setBuildingAutoAssignPlan] = React.useState(false)
  const [autoAssigningHistory, setAutoAssigningHistory] = React.useState(false)
  const [autoAssignPlan, setAutoAssignPlan] = React.useState<AutoAssignPlan | null>(null)
  const [autoAssignModalOpen, setAutoAssignModalOpen] = React.useState(false)
  const [buildingPointNumberPlan, setBuildingPointNumberPlan] = React.useState(false)
  const [applyingPointNumbers, setApplyingPointNumbers] = React.useState(false)
  const [pointNumberPlan, setPointNumberPlan] = React.useState<PointNumberPlan | null>(null)
  const [pointNumberModalOpen, setPointNumberModalOpen] = React.useState(false)
  const [buildingTargetMergePlan, setBuildingTargetMergePlan] = React.useState(false)
  const [applyingTargetMerge, setApplyingTargetMerge] = React.useState(false)
  const [targetMergePlan, setTargetMergePlan] = React.useState<TargetMergePlan | null>(null)
  const [targetMergeModalOpen, setTargetMergeModalOpen] = React.useState(false)
  const [autoSettingTarget, setAutoSettingTarget] = React.useState(false)
  const [buildingRemoveMonumentsPlan, setBuildingRemoveMonumentsPlan] = React.useState(false)
  const [applyingRemoveMonuments, setApplyingRemoveMonuments] = React.useState(false)
  const [removeMonumentsPlan, setRemoveMonumentsPlan] = React.useState<RemoveMonumentsPlan | null>(null)
  const [removeMonumentsModalOpen, setRemoveMonumentsModalOpen] = React.useState(false)
  const [buildingMeanMergePlan, setBuildingMeanMergePlan] = React.useState(false)
  const [applyingMeanMerge, setApplyingMeanMerge] = React.useState(false)
  const [meanMergePlan, setMeanMergePlan] = React.useState<MeanMergePlan | null>(null)
  const [meanMergeModalOpen, setMeanMergeModalOpen] = React.useState(false)
  const [attachmentItems, setAttachmentItems] = React.useState<AttachmentSummary[]>([])
  const [stagedAttachmentFiles, setStagedAttachmentFiles] = React.useState<StagedAttachmentFile[]>([])
  const [attachmentError, setAttachmentError] = React.useState('')
  const [attachmentHistoryItem, setAttachmentHistoryItem] = React.useState<MonumentHistorySummary | null>(null)
  const [attachmentPendingDelete, setAttachmentPendingDelete] = React.useState<AttachmentSummary | null>(null)
  const [loadingAttachments, setLoadingAttachments] = React.useState(false)
  const [uploadingAttachments, setUploadingAttachments] = React.useState(false)
  const [deletingAttachment, setDeletingAttachment] = React.useState(false)
  const [projectCsvFile, setProjectCsvFile] = React.useState<File | null>(null)
  const [projectCsvFileName, setProjectCsvFileName] = React.useState('')
  const [newProjectName, setNewProjectName] = React.useState('')
  const [useSelectedProjectForCreate, setUseSelectedProjectForCreate] = React.useState(false)
  const [newSearchPointRows, setNewSearchPointRows] = React.useState<CsvProjectRow[]>([])
  const [existingMonumentRows, setExistingMonumentRows] = React.useState<CsvProjectRow[]>([])
  const [multipleMonumentRows, setMultipleMonumentRows] = React.useState<CsvProjectRow[]>([])
  const [activeNewSearchPointId, setActiveNewSearchPointId] = React.useState('')
  const [loadingProjectCsv, setLoadingProjectCsv] = React.useState(false)
  const [createProjectPlan, setCreateProjectPlan] = React.useState<CreateProjectPlan | null>(null)
  const [createProjectModalOpen, setCreateProjectModalOpen] = React.useState(false)
  const [creatingProject, setCreatingProject] = React.useState(false)
  const [traverseFiles, setTraverseFiles] = React.useState<TraverseFileSummary[]>([])
  const [staticFiles, setStaticFiles] = React.useState<TraverseFileSummary[]>([])
  const [parsedTraverseData, setParsedTraverseData] = React.useState<ParsedTraverseData | null>(null)
  const [parsedStaticData, setParsedStaticData] = React.useState<ParsedStaticFileResult | null>(null)
  const [finalizePlan, setFinalizePlan] = React.useState<FinalizePlan | null>(null)
  const [validationModalOpen, setValidationModalOpen] = React.useState(false)
  const [finalizeConfirmOpen, setFinalizeConfirmOpen] = React.useState(false)
  const [validationTab, setValidationTab] = React.useState<FinalizeValidationTab>('summary')
  const [validationReviewMode, setValidationReviewMode] = React.useState<ValidationReviewMode>('traverse')
  const [basisOfBearing, setBasisOfBearing] = React.useState('')
  const [acceptingBasisOfBearing, setAcceptingBasisOfBearing] = React.useState(false)
  const [loadingTraverseFiles, setLoadingTraverseFiles] = React.useState(false)
  const [finalizingProject, setFinalizingProject] = React.useState(false)
  const [status, setStatus] = React.useState(m.statusReady)
  const searchInitializedRef = React.useRef(false)
  const projectLayerFiltersRef = React.useRef(new Map<string, { layer: any, definitionExpression: string | null | undefined }>())
  const traverseConnectionVisibilityRef = React.useRef(new Map<any, boolean | undefined>())
  const monumentGraphicsLayerRef = React.useRef<any>(null)
  const monumentGraphicsMapRef = React.useRef<any>(null)
  const traversePreviewGraphicsLayerRef = React.useRef<any>(null)
  const traversePreviewGraphicsMapRef = React.useRef<any>(null)
  const csvProjectGraphicsSignatureRef = React.useRef('')
  const traverseConnectionsPreviewSignatureRef = React.useRef('')
  const suppressAssignSurveySelectionSyncRef = React.useRef(false)
  const suppressAssignHistoryLoadedStatusRef = React.useRef(false)
  const monumentProjectsLayerRef = React.useRef<{ url: string, layer: any } | null>(null)
  const surveyMonumentsLayerRef = React.useRef<{ url: string, layer: any } | null>(null)
  const monumentHistoryLayerRef = React.useRef<{ url: string, layer: any } | null>(null)
  const traverseConnectionsLayerRef = React.useRef<{ url: string, layer: any } | null>(null)
  const attachmentFileInputRef = React.useRef<HTMLInputElement | null>(null)
  const projectCsvFileInputRef = React.useRef<HTMLInputElement | null>(null)
  const traverseFileInputRef = React.useRef<HTMLInputElement | null>(null)
  const staticFileInputRef = React.useRef<HTMLInputElement | null>(null)

  const workflowModes: ModeDefinition[] = [
    { id: 'history', label: m.viewHistoryMode, title: m.viewHistoryTitle },
    { id: 'create', label: m.createMode, title: m.assignProjectTitle },
    { id: 'create-project', label: m.createTitle, title: m.createProjectWorkflowTitle },
    { id: 'merge-points', label: m.mergePointsMode, title: m.mergePointsTitle },
    { id: 'remove-monuments', label: m.removeMonumentsMode, title: m.removeMonumentsTitle },
    { id: 'traverse', label: m.traverseMode, title: m.traverseTitle },
    { id: 'update-xy', label: m.updateXyMode, title: m.updateXyTitle }
  ]
  const workflowModeRows: MonumentMode[][] = [
    ['history', 'create', 'merge-points'],
    ['create-project', 'traverse', 'remove-monuments']
  ]

  const activeMode = workflowModes.find((item) => item.id === mode) || workflowModes[0]
  const isSurveyHistoryMode = mode === 'create' || mode === 'merge-points' || mode === 'remove-monuments'
  const configuredSources = [
    { label: m.surveyMonumentsLayer, value: cfg.surveyMonumentsLayerUrl || DEFAULT_SURVEY_MONUMENTS_LAYER_URL },
    { label: m.monumentProjectsLayer, value: cfg.monumentProjectsLayerUrl || DEFAULT_MONUMENT_PROJECTS_LAYER_URL },
    { label: m.traverseConnectionsLayer, value: cfg.traverseConnectionsLayerUrl || DEFAULT_TRAVERSE_CONNECTIONS_LAYER_URL },
    { label: m.monumentHistoryTable, value: cfg.monumentHistoryTableUrl || DEFAULT_MONUMENT_HISTORY_TABLE_URL }
  ]
  const monumentProjectsUrl = cfg.monumentProjectsLayerUrl || DEFAULT_MONUMENT_PROJECTS_LAYER_URL
  const surveyMonumentsUrl = cfg.surveyMonumentsLayerUrl || DEFAULT_SURVEY_MONUMENTS_LAYER_URL
  const monumentHistoryUrl = cfg.monumentHistoryTableUrl || DEFAULT_MONUMENT_HISTORY_TABLE_URL
  const traverseConnectionsUrl = cfg.traverseConnectionsLayerUrl || DEFAULT_TRAVERSE_CONNECTIONS_LAYER_URL
  const projectDisplayField = cfg.projectDisplayField || 'Name'
  const projectGlobalIdField = cfg.projectGlobalIdField || 'GlobalID'
  const monumentGlobalIdField = cfg.monumentGlobalIdField || 'GlobalID'
  const monumentPointNumberField = cfg.monumentPointNumberField || 'PointNumber'
  const historyMonumentGlobalIdField = cfg.historyMonumentGlobalIdField || 'PointGlobalID'
  const historyProjectGlobalIdField = cfg.historyProjectGlobalIdField || 'ProjectGlobalID'
  const traverseProjectGlobalIdField = cfg.traverseProjectGlobalIdField || 'ProjectID'
  const traverseFromPointNumberField = cfg.traverseFromPointNumberField || 'FromPointNum'
  const traverseToPointNumberField = cfg.traverseToPointNumberField || 'ToPointNum'
  const configuredMonumentHistoryDataSourceIds = React.useMemo(
    () => (props.useDataSources || [])
      .map((useDataSource: any) => useDataSource?.dataSourceId)
      .filter(Boolean),
    [props.useDataSources]
  )
  const monumentHistoryDataSourceIdsKey = ReactRedux.useSelector((state: IMState) => {
    const appConfig: any = (state as any).appConfig || (state as any).appStateInBuilder?.appConfig
    return collectMatchingDataSourceIds(appConfig, monumentHistoryUrl, /monument history/i, MONUMENT_HISTORY_LAYER_ID)
  })
  const monumentHistoryDataSourceIds = React.useMemo(
    () => Array.from(new Set([
      ...configuredMonumentHistoryDataSourceIds,
      ...(monumentHistoryDataSourceIdsKey ? monumentHistoryDataSourceIdsKey.split('|') : [])
    ])),
    [configuredMonumentHistoryDataSourceIds, monumentHistoryDataSourceIdsKey]
  )
  const surveyMonumentDataSourceIdsKey = ReactRedux.useSelector((state: IMState) => {
    const appConfig: any = (state as any).appConfig || (state as any).appStateInBuilder?.appConfig
    return collectMatchingDataSourceIds(appConfig, surveyMonumentsUrl, /survey monuments/i, SURVEY_MONUMENTS_LAYER_ID)
  })
  const surveyMonumentDataSourceIds = React.useMemo(
    () => surveyMonumentDataSourceIdsKey ? surveyMonumentDataSourceIdsKey.split('|') : [],
    [surveyMonumentDataSourceIdsKey]
  )
  const monumentProjectDataSourceIdsKey = ReactRedux.useSelector((state: IMState) => {
    const appConfig: any = (state as any).appConfig || (state as any).appStateInBuilder?.appConfig
    return collectMatchingDataSourceIds(appConfig, monumentProjectsUrl, /monument projects?/i, MONUMENT_PROJECTS_LAYER_ID)
  })
  const monumentProjectDataSourceIds = React.useMemo(
    () => monumentProjectDataSourceIdsKey ? monumentProjectDataSourceIdsKey.split('|') : [],
    [monumentProjectDataSourceIdsKey]
  )
  const traverseConnectionDataSourceIdsKey = ReactRedux.useSelector((state: IMState) => {
    const appConfig: any = (state as any).appConfig || (state as any).appStateInBuilder?.appConfig
    return collectMatchingDataSourceIds(appConfig, traverseConnectionsUrl, /traverse connections?/i, TRAVERSE_CONNECTIONS_LAYER_ID)
  })
  const traverseConnectionDataSourceIds = React.useMemo(
    () => traverseConnectionDataSourceIdsKey ? traverseConnectionDataSourceIdsKey.split('|') : [],
    [traverseConnectionDataSourceIdsKey]
  )
  const surveyMonumentSelectionKey = ReactRedux.useSelector((state: IMState) =>
    surveyMonumentDataSourceIds
      .map((dataSourceId) => {
        const selectedIds = (state as any).dataSourcesInfo?.[dataSourceId]?.selectedIds || []
        return `${dataSourceId}:${selectedIds.join(',')}`
      })
      .join('|')
  )

  const modeButtonStyle: React.CSSProperties = {
    flex: '0 0 calc((100% - 0.7rem) / 3)',
    minWidth: 0,
    height: 32,
    padding: '0 6px',
    fontSize: 11,
    lineHeight: '14px',
    whiteSpace: 'normal',
    textAlign: 'center'
  }

  const modeActionButtonStyle: React.CSSProperties = {
    height: 30,
    padding: '0 10px',
    fontSize: 11,
    lineHeight: '14px',
    whiteSpace: 'nowrap',
    textAlign: 'center'
  }

  const metadataRow = (label: string, value?: string) =>
    h('div', { className: 'd-flex justify-content-between', style: { gap: '0.75rem', fontSize: 12 } },
      h('span', { style: { opacity: 0.72 } }, label),
      h('span', { style: { fontWeight: 600, minWidth: 0, overflowWrap: 'anywhere', textAlign: 'right' } }, value || '-')
    )

  const displayOptionalValue = (value: any) =>
    value === null || value === undefined || String(value).trim() === '' ? '-' : String(value)

  const formatFileSize = (size?: number) => {
    if (!size || !Number.isFinite(size)) return '-'
    if (size < 1024) return `${size} B`
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
    return `${(size / 1024 / 1024).toFixed(1)} MB`
  }

  const formatTraverseNumber = (value?: number, precision = 3) =>
    value === undefined || !Number.isFinite(value) ? '-' : value.toFixed(precision)

  const formatDateTime = (value?: number) =>
    value ? new Date(value).toLocaleString() : '-'

  const formatDate = (value?: number) =>
    value ? new Date(value).toLocaleDateString() : '-'

  const getFinalizeEditsByPointId = React.useCallback((pointId: string) =>
    (finalizePlan?.edits || []).filter((edit) => edit.pointId === pointId),
  [finalizePlan?.edits])

  const getFinalizeEditLabel = React.useCallback((pointId: string, kinds: FinalizeEditKind[]) => {
    const match = getFinalizeEditsByPointId(pointId).find((edit) => kinds.includes(edit.kind))
    return match ? match.label.split(':')[0] : '-'
  }, [getFinalizeEditsByPointId])

  const validationErrorCount = finalizePlan?.validations.filter((validation) => validation.severity === 'error').length || 0
  const validationWarningCount = finalizePlan?.validations.filter((validation) => validation.severity === 'warning').length || 0
  const staticValidationErrorCount = parsedStaticData?.validations.filter((validation) => validation.severity === 'error').length || 0
  const staticValidationWarningCount = parsedStaticData?.validations.filter((validation) => validation.severity === 'warning').length || 0

  const toProjectSummary = React.useCallback((attributes: { [key: string]: any }): MonumentProjectSummary => ({
    objectId: attributes.OBJECTID,
    globalId: getStringAttribute(attributes, projectGlobalIdField),
    name: getStringAttribute(attributes, projectDisplayField) || getStringAttribute(attributes, 'Name') || `Project ${attributes.OBJECTID}`,
    jobNo: getStringAttribute(attributes, 'JobNo'),
    fileNo: getStringAttribute(attributes, 'FileNo'),
    surveyYear: attributes.SurveyYear,
    folderUrl: getStringAttribute(attributes, 'Folder'),
    historyCount: 0
  }), [projectDisplayField, projectGlobalIdField])

  const toHistorySummary = React.useCallback((attributes: { [key: string]: any }): MonumentHistorySummary => ({
    objectId: attributes.OBJECTID,
    globalId: getStringAttribute(attributes, 'GlobalID'),
    monumentGlobalId: getStringAttribute(attributes, historyMonumentGlobalIdField),
    projectGlobalId: getStringAttribute(attributes, historyProjectGlobalIdField),
    createdDate: Number(getAttributeValue(attributes, 'created_date')) || undefined,
    pointNumber: displayOptionalValue(attributes.PointNumber),
    status: displayOptionalValue(attributes.Status),
    monumentType: displayOptionalValue(attributes.Type),
    embeddedIn: displayOptionalValue(attributes.EmbeddedIn),
    markerType: displayOptionalValue(attributes.MarkerType ?? attributes.MarkingType),
    markerMaterial: displayOptionalValue(attributes.MarkerMaterial ?? attributes.MarkingMaterial)
  }), [historyMonumentGlobalIdField, historyProjectGlobalIdField])

  const getHistoryKey = (item: MonumentHistorySummary) => String(item.globalId || item.objectId)

  const getRecordAttributes = (record: any) =>
    record?.getDataBeforeMapping?.() || record?.feature?.attributes || record?.getData?.() || {}

  const hasAttribute = (attributes: { [key: string]: any }, key: string) =>
    Object.keys(attributes || {}).some((attributeKey) => attributeKey.toLowerCase() === key.toLowerCase())

  const isSurveyMonumentAttributes = React.useCallback((attributes: { [key: string]: any }) =>
    !hasAttribute(attributes, historyMonumentGlobalIdField) &&
    !hasAttribute(attributes, historyProjectGlobalIdField),
  [historyMonumentGlobalIdField, historyProjectGlobalIdField])

  const toSurveyMonumentSummary = React.useCallback((attributes: { [key: string]: any }): SurveyMonumentSummary => ({
    objectId: getAttributeValue(attributes, 'OBJECTID'),
    globalId: getStringAttribute(attributes, monumentGlobalIdField),
    pointNumber: displayOptionalValue(getAttributeValue(attributes, monumentPointNumberField)),
    monumentType: displayOptionalValue(getAttributeValue(attributes, 'Type')),
    status: displayOptionalValue(getAttributeValue(attributes, 'Status')),
    joeId: getAttributeValue(attributes, 'Joe_ID'),
    denId: getAttributeValue(attributes, 'Den_ID')
  }), [monumentGlobalIdField, monumentPointNumberField])

  const getSurveyMonumentKey = (item: SurveyMonumentSummary) => String(item.objectId)

  const loadHistoryCounts = React.useCallback(async (projectGlobalIds: string[]) => {
    const uniqueIds = Array.from(new Set(projectGlobalIds.filter(Boolean)))
    if (uniqueIds.length === 0) return new Map<string, number>()

    const counts = new Map<string, number>()
    const batchSize = 50
    for (let index = 0; index < uniqueIds.length; index += batchSize) {
      const batch = uniqueIds.slice(index, index + batchSize)
      const query = new URL(`${monumentHistoryUrl}/query`)
      query.search = new URLSearchParams({
        where: `${historyProjectGlobalIdField} IN (${batch.map((id) => `'${escapeSqlString(id)}'`).join(',')})`,
        groupByFieldsForStatistics: historyProjectGlobalIdField,
        outStatistics: JSON.stringify([{
          statisticType: 'count',
          onStatisticField: 'OBJECTID',
          outStatisticFieldName: 'history_count'
        }]),
        returnGeometry: 'false',
        f: 'json'
      }).toString()

      const response = await fetch(query.toString())
      const data = await response.json() as QueryResponse
      if (!response.ok || data.error) throw new Error(data.error?.message || response.statusText)

      ;(data.features || []).forEach((feature) => {
        const attributes = feature.attributes || {}
        const projectId = getStringAttribute(attributes, historyProjectGlobalIdField)
        const countValue = attributes.history_count ?? attributes.HISTORY_COUNT ?? attributes.History_Count ?? 0
        counts.set(projectId, Number(countValue) || 0)
      })
    }

    return counts
  }, [historyProjectGlobalIdField, monumentHistoryUrl])

  const loadProjectNamesByGlobalIds = React.useCallback(async (projectGlobalIds: string[]) => {
    const uniqueIds = Array.from(new Set(projectGlobalIds.filter(Boolean)))
    if (uniqueIds.length === 0) return new Map<string, string>()

    const names = new Map<string, string>()
    const batchSize = 50
    for (let index = 0; index < uniqueIds.length; index += batchSize) {
      const batch = uniqueIds.slice(index, index + batchSize)
      const query = new URL(`${monumentProjectsUrl}/query`)
      query.search = new URLSearchParams({
        where: `${projectGlobalIdField} IN (${batch.map((id) => `'${escapeSqlString(id)}'`).join(',')})`,
        outFields: [
          projectGlobalIdField,
          projectDisplayField
        ].join(','),
        returnGeometry: 'false',
        resultRecordCount: String(PROJECT_QUERY_LIMIT),
        f: 'json'
      }).toString()

      const response = await fetch(query.toString())
      const data = await response.json() as QueryResponse
      if (!response.ok || data.error) throw new Error(data.error?.message || response.statusText)

      ;(data.features || []).forEach((feature) => {
        const attributes = feature.attributes || {}
        const projectId = getStringAttribute(attributes, projectGlobalIdField)
        const projectName = getStringAttribute(attributes, projectDisplayField) || projectId
        if (projectId) names.set(projectId, projectName)
      })
    }

    return names
  }, [monumentProjectsUrl, projectDisplayField, projectGlobalIdField])

  const loadProjectHistory = React.useCallback(async (project: MonumentProjectSummary) => {
    if (!project.globalId) {
      setHistoryItems([])
      setHistoryError(m.historyMissingProjectId)
      setStatus(m.historyMissingProjectId)
      return
    }

    setLoadingHistory(true)
    setHistoryError('')

    try {
      const query = new URL(`${monumentHistoryUrl}/query`)
      query.search = new URLSearchParams({
        where: `${historyProjectGlobalIdField} = '${escapeSqlString(project.globalId)}'`,
        outFields: [
          'OBJECTID',
          'GlobalID',
          historyProjectGlobalIdField,
          historyMonumentGlobalIdField,
          'created_date',
          'PointNumber',
          'Status',
          'Type',
          'EmbeddedIn',
          'MarkingType',
          'MarkingMaterial'
        ].join(','),
        returnGeometry: 'false',
        orderByFields: 'PointNumber ASC',
        resultRecordCount: String(HISTORY_QUERY_LIMIT),
        f: 'json'
      }).toString()

      const response = await fetch(query.toString())
      const data = await response.json() as QueryResponse
      if (!response.ok || data.error) throw new Error(data.error?.message || response.statusText)

      const nextHistoryItems = (data.features || [])
        .map((feature) => toHistorySummary(feature.attributes || {}))
        .filter((item) => item.objectId !== undefined && item.objectId !== null)
        .sort((left, right) => left.pointNumber.localeCompare(right.pointNumber, undefined, { numeric: true, sensitivity: 'base' }))
      setHistoryItems(nextHistoryItems)
      setSelectedHistoryKeys((current) => {
        const nextKeys = new Set(nextHistoryItems.map(getHistoryKey))
        return current.filter((key) => nextKeys.has(key))
      })
      setActiveHistoryKey((current) => {
        const nextKeys = new Set(nextHistoryItems.map(getHistoryKey))
        return nextKeys.has(current) ? current : ''
      })
      setStatus(`${m.historyLoaded} ${nextHistoryItems.length}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : m.historyLoadFailed
      setHistoryError(message)
      setStatus(m.historyLoadFailed)
    } finally {
      setLoadingHistory(false)
    }
  }, [historyMonumentGlobalIdField, historyProjectGlobalIdField, m.historyLoaded, m.historyLoadFailed, m.historyMissingProjectId, monumentHistoryUrl, toHistorySummary])

  const buildProjectWhere = React.useCallback((rawSearchText: string) => {
    const term = rawSearchText.trim()
    const activeWhere = `${PROJECT_COMPLETED_FIELD} = 0`
    if (term.length < PROJECT_SEARCH_MINIMUM_LENGTH) return activeWhere

    const escaped = escapeSqlString(term.toUpperCase())
    const textSearch = [
      `UPPER(${projectDisplayField}) LIKE '%${escaped}%'`,
      `UPPER(JobNo) LIKE '%${escaped}%'`,
      `UPPER(FileNo) LIKE '%${escaped}%'`
    ]
    if (/^\d{4}$/.test(term)) textSearch.push(`SurveyYear = ${term}`)

    return `(${textSearch.join(' OR ')})`
  }, [projectDisplayField])

  const getLayerKey = (layer: any, fallback: string) => String(layer?.uid || layer?.id || fallback)

  const dataSourceMatchesUrl = React.useCallback((dataSource: any, targetUrl: string) => {
    const dataSourceJson = dataSource?.getDataSourceJson?.()
    const dataSourceLayerId = dataSourceJson?.layerId ?? dataSource?.layerId
    const dataSourceUrl = dataSourceJson?.url || dataSource?.url
    const candidates = [
      dataSourceUrl,
      dataSourceUrl && dataSourceLayerId !== undefined ? `${String(dataSourceUrl).replace(/\/+$/, '')}/${dataSourceLayerId}` : ''
    ].filter(Boolean).map(String)
    return urlCandidatesMatch(targetUrl, candidates)
  }, [])

  const getRuntimeDataSources = React.useCallback(async (targetUrl: string, configuredDataSourceIds: string[] = []) => {
    const dataSourceManager = DataSourceManager.getInstance()
    const dataSources: any[] = []
    const addDataSource = (dataSource: any, force = false) => {
      if (!dataSource) return
      if (!force && !dataSourceMatchesUrl(dataSource, targetUrl)) return
      if (!dataSources.some((existing) => existing.id === dataSource.id)) dataSources.push(dataSource)
    }

    for (const dataSourceId of configuredDataSourceIds) {
      try {
        addDataSource(dataSourceManager.getDataSource(dataSourceId) || await dataSourceManager.createDataSource(dataSourceId), true)
      } catch {
        // Keep trying runtime/map-created data sources.
      }
    }

    dataSourceManager.getDataSourcesAsArray?.().forEach((dataSource: any) => {
      addDataSource(dataSource)
    })

    await jimuMapView?.whenAllJimuLayerViewLoaded?.()
    const layerViews = jimuMapView?.getAllLoadedJimuLayerViews?.() || []
    for (const layerView of layerViews) {
      let layerDataSource = layerView.getLayerDataSource?.()
      if (!layerDataSource && layerView.createLayerDataSource) {
        try {
          layerDataSource = await layerView.createLayerDataSource()
        } catch {
          layerDataSource = null
        }
      }
      addDataSource(layerDataSource)
    }

    return dataSources
  }, [dataSourceMatchesUrl, jimuMapView])

  const getMonumentHistoryRuntimeDataSources = React.useCallback(async () =>
    getRuntimeDataSources(monumentHistoryUrl, monumentHistoryDataSourceIds),
  [getRuntimeDataSources, monumentHistoryDataSourceIds, monumentHistoryUrl])

  const getSurveyMonumentRuntimeDataSources = React.useCallback(async () =>
    getRuntimeDataSources(surveyMonumentsUrl, surveyMonumentDataSourceIds),
  [getRuntimeDataSources, surveyMonumentDataSourceIds, surveyMonumentsUrl])

  const refreshDeleteMonumentViews = React.useCallback(async () => {
    const dataSources = [
      ...(await getSurveyMonumentRuntimeDataSources()),
      ...(await getMonumentHistoryRuntimeDataSources())
    ]
    dataSources.forEach((dataSource: any) => {
      try {
        MessageManager.getInstance().publishMessage(
          new DataRecordsSelectionChangeMessage(props.id, [], [dataSource.id])
        )
        dataSource.clearSelection?.()
        dataSource.refresh?.()
      } catch {
        // Refresh is best-effort; delete verification already queried the service.
      }
    })

    await jimuMapView?.whenAllJimuLayerViewLoaded?.()
    const layerViews = jimuMapView?.getAllLoadedJimuLayerViews?.() || []
    for (const layerView of layerViews) {
      const layer = layerView.layer || {}
      const candidates = [
        layer.url,
        layer.parsedUrl?.path,
        layer.layerId !== undefined && layer.url ? `${String(layer.url).replace(/\/+$/, '')}/${layer.layerId}` : ''
      ].filter(Boolean).map(String)
      if (!urlCandidatesMatch(surveyMonumentsUrl, candidates) && !urlCandidatesMatch(monumentHistoryUrl, candidates)) continue
      try {
        layerView.selectFeaturesByIds?.([])
        layer.refresh?.()
      } catch {
        // Keep UI cleanup moving if one map layer view is stale.
      }
    }
  }, [getMonumentHistoryRuntimeDataSources, getSurveyMonumentRuntimeDataSources, jimuMapView, monumentHistoryUrl, props.id, surveyMonumentsUrl])

  const getMonumentProjectsLayer = React.useCallback(async () => {
    if (monumentProjectsLayerRef.current?.url === monumentProjectsUrl) {
      return monumentProjectsLayerRef.current.layer
    }
    const [FeatureLayer] = await loadArcGISJSAPIModules(['esri/layers/FeatureLayer'])
    const layer = new FeatureLayer({ url: monumentProjectsUrl })
    await layer.load()
    monumentProjectsLayerRef.current = { url: monumentProjectsUrl, layer }
    return layer
  }, [monumentProjectsUrl])

  const getMonumentHistoryLayer = React.useCallback(async () => {
    if (monumentHistoryLayerRef.current?.url === monumentHistoryUrl) {
      return monumentHistoryLayerRef.current.layer
    }
    const [FeatureLayer] = await loadArcGISJSAPIModules(['esri/layers/FeatureLayer'])
    const layer = new FeatureLayer({ url: monumentHistoryUrl })
    await layer.load()
    monumentHistoryLayerRef.current = { url: monumentHistoryUrl, layer }
    return layer
  }, [monumentHistoryUrl])

  const getSurveyMonumentsLayer = React.useCallback(async () => {
    if (surveyMonumentsLayerRef.current?.url === surveyMonumentsUrl) {
      return surveyMonumentsLayerRef.current.layer
    }
    const [FeatureLayer] = await loadArcGISJSAPIModules(['esri/layers/FeatureLayer'])
    const layer = new FeatureLayer({ url: surveyMonumentsUrl })
    await layer.load()
    surveyMonumentsLayerRef.current = { url: surveyMonumentsUrl, layer }
    return layer
  }, [surveyMonumentsUrl])

  const getTraverseConnectionsLayer = React.useCallback(async () => {
    if (traverseConnectionsLayerRef.current?.url === traverseConnectionsUrl) {
      return traverseConnectionsLayerRef.current.layer
    }
    const [FeatureLayer] = await loadArcGISJSAPIModules(['esri/layers/FeatureLayer'])
    const layer = new FeatureLayer({ url: traverseConnectionsUrl })
    await layer.load()
    traverseConnectionsLayerRef.current = { url: traverseConnectionsUrl, layer }
    return layer
  }, [traverseConnectionsUrl])

  const getNumericObjectId = (objectId: string | number) => {
    const numericObjectId = typeof objectId === 'number' ? objectId : Number(objectId)
    return Number.isFinite(numericObjectId) ? numericObjectId : null
  }

  const getAttachmentUrl = (historyItem: MonumentHistorySummary, attachment: AttachmentSummary) =>
    attachment.url || `${monumentHistoryUrl.replace(/\/+$/, '')}/${historyItem.objectId}/attachments/${attachment.id}`

  const createAttachmentGlobalId = () =>
    window.crypto?.randomUUID?.() || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
      const value = Math.floor(Math.random() * 16)
      return (char === 'x' ? value : (value & 0x3) | 0x8).toString(16)
    })

  const revokeStagedAttachmentPreviews = (items: StagedAttachmentFile[]) => {
    items.forEach((item) => {
      URL.revokeObjectURL(item.previewUrl)
    })
  }

  const clearStagedAttachmentFiles = React.useCallback(() => {
    setStagedAttachmentFiles((current) => {
      revokeStagedAttachmentPreviews(current)
      return []
    })
  }, [])

  const loadHistoryAttachments = React.useCallback(async (historyItem?: MonumentHistorySummary | null) => {
    if (!historyItem) {
      setAttachmentItems([])
      setAttachmentError('')
      setAttachmentPendingDelete(null)
      return
    }

    const objectId = getNumericObjectId(historyItem.objectId)
    if (objectId === null) {
      setAttachmentItems([])
      setAttachmentError(m.attachmentSelectHistoryFirst)
      return
    }

    setLoadingAttachments(true)
    setAttachmentError('')

    try {
      const layer = await getMonumentHistoryLayer()
      if (!layer.capabilities?.data?.supportsAttachment) {
        setAttachmentItems([])
        setAttachmentError(m.attachmentUnsupported)
        return
      }
      const attachmentsByObjectId = await layer.queryAttachments({ objectIds: [objectId] })
      const nextAttachments = (attachmentsByObjectId?.[String(objectId)] || [])
        .map((attachment: any): AttachmentSummary => ({
          id: Number(attachment.id),
          name: attachment.name || `Attachment ${attachment.id}`,
          contentType: attachment.contentType,
          size: attachment.size,
          url: attachment.url
        }))
        .filter((attachment) => Number.isFinite(attachment.id))
        .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' }))
      setAttachmentItems(nextAttachments)
      setAttachmentPendingDelete((current) =>
        current && nextAttachments.some((attachment) => attachment.id === current.id) ? current : null
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : m.historyLoadFailed
      setAttachmentError(message)
    } finally {
      setLoadingAttachments(false)
    }
  }, [getMonumentHistoryLayer, m.attachmentSelectHistoryFirst, m.attachmentUnsupported, m.historyLoadFailed])

  const stageAttachmentFiles = React.useCallback((files: FileList | File[]) => {
    const incomingFiles = Array.from(files)
    const imageFiles = incomingFiles.filter((file) => file.type.toLowerCase().startsWith('image/'))
    if (imageFiles.length < incomingFiles.length) setStatus(m.attachmentImageOnly)
    if (imageFiles.length === 0) return

    setStagedAttachmentFiles((current) => [
      ...current,
      ...imageFiles.map((file) => ({
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
        file,
        previewUrl: URL.createObjectURL(file)
      }))
    ])
  }, [m.attachmentImageOnly])

  const removeStagedAttachmentFile = (id: string) => {
    setStagedAttachmentFiles((current) => {
      const removed = current.find((item) => item.id === id)
      if (removed) URL.revokeObjectURL(removed.previewUrl)
      return current.filter((item) => item.id !== id)
    })
  }

  const uploadStagedAttachments = React.useCallback(async (historyItem?: MonumentHistorySummary | null) => {
    if (!historyItem || stagedAttachmentFiles.length === 0) return
    const objectId = getNumericObjectId(historyItem.objectId)
    if (objectId === null) {
      setAttachmentError(m.attachmentSelectHistoryFirst)
      return
    }

    setUploadingAttachments(true)
    setAttachmentError('')

    try {
      const layer = await getMonumentHistoryLayer()
      if (!layer.capabilities?.data?.supportsAttachment) throw new Error(m.attachmentUnsupported)
      const [Graphic] = await loadArcGISJSAPIModules(['esri/Graphic'])
      const feature = new Graphic({
        attributes: { OBJECTID: objectId }
      })
      const uploadedAttachmentIds: number[] = []
      try {
        for (const item of stagedAttachmentFiles) {
          const formData = new FormData()
          formData.append('attachment', item.file, item.file.name)
          formData.append('globalId', createAttachmentGlobalId())
          const result = await layer.addAttachment(feature, formData)
          if (result?.error) throw new Error(result.error?.message || m.attachmentUploadFailed)
          const attachmentId = Number(result?.objectId ?? result?.attachmentId)
          if (Number.isFinite(attachmentId)) uploadedAttachmentIds.push(attachmentId)
        }
      } catch (uploadErr) {
        if (uploadedAttachmentIds.length > 0) {
          try {
            await layer.deleteAttachments(feature, uploadedAttachmentIds)
          } catch {
            // Keep the original upload failure visible.
          }
        }
        throw uploadErr
      }
      setStatus(`${m.attachmentUploadSuccess}: ${stagedAttachmentFiles.length}`)
      clearStagedAttachmentFiles()
      await loadHistoryAttachments(historyItem)
    } catch (err) {
      const message = err instanceof Error ? err.message : m.attachmentUploadFailed
      setAttachmentError(message || m.attachmentUploadFailed)
      setStatus(`${m.attachmentUploadFailed} ${message || ''}`.trim())
    } finally {
      setUploadingAttachments(false)
    }
  }, [clearStagedAttachmentFiles, getMonumentHistoryLayer, loadHistoryAttachments, m.attachmentSelectHistoryFirst, m.attachmentUnsupported, m.attachmentUploadFailed, m.attachmentUploadSuccess, stagedAttachmentFiles])

  const deleteHistoryAttachment = React.useCallback(async (historyItem: MonumentHistorySummary, attachment: AttachmentSummary) => {
    const objectId = getNumericObjectId(historyItem.objectId)
    if (objectId === null) return

    setAttachmentError('')
    setDeletingAttachment(true)

    try {
      const [Graphic] = await loadArcGISJSAPIModules(['esri/Graphic'])
      const layer = await getMonumentHistoryLayer()
      const results = await layer.deleteAttachments(new Graphic({
        attributes: { OBJECTID: objectId }
      }), [attachment.id])
      const failedResult = (results || []).find((result: any) => result?.error)
      if (failedResult) throw new Error(failedResult.error?.message || m.attachmentDeleteFailed)
      setStatus(`${m.attachmentDeleted}: ${attachment.name}`)
      await loadHistoryAttachments(historyItem)
    } catch (err) {
      const message = err instanceof Error ? err.message : m.attachmentDeleteFailed
      setAttachmentError(message || m.attachmentDeleteFailed)
      setStatus(`${m.attachmentDeleteFailed} ${message || ''}`.trim())
    } finally {
      setDeletingAttachment(false)
    }
  }, [getMonumentHistoryLayer, loadHistoryAttachments, m.attachmentDeleted, m.attachmentDeleteFailed])

  const openHistoryAttachment = (historyItem: MonumentHistorySummary, attachment: AttachmentSummary) => {
    window.open(getAttachmentUrl(historyItem, attachment), '_blank', 'noopener,noreferrer')
  }

  const openAttachmentModal = (historyItem: MonumentHistorySummary) => {
    const historyKey = getHistoryKey(historyItem)
    if (mode === 'history') {
      setActiveHistoryKey(historyKey)
    } else {
      setActiveAssignHistoryKey(historyKey)
    }
    setAttachmentHistoryItem(historyItem)
    setAttachmentError('')
    setAttachmentPendingDelete(null)
  }

  const closeAttachmentModal = () => {
    setAttachmentHistoryItem(null)
    setAttachmentItems([])
    setAttachmentError('')
    setAttachmentPendingDelete(null)
    clearStagedAttachmentFiles()
  }

  const openValidationModal = () => {
    setValidationTab('summary')
    setValidationModalOpen(true)
  }

  const closeValidationModal = () => {
    setValidationModalOpen(false)
  }

  const reviewTraverseValidation = () => {
    setValidationReviewMode('traverse')
    openValidationModal()
    if (traverseFiles.length > 0) stageProcessTraverseFiles().catch(() => undefined)
  }

  const reviewStaticValidation = () => {
    setValidationReviewMode('static')
    openValidationModal()
    const staticFile = staticFiles[0]
    if (!staticFile) return

    const parsedStaticFile = parseStaticText(staticFile.text, staticFile.id, staticFile.name)
    setParsedStaticData(parsedStaticFile)
    if (parsedStaticFile.basisOfBearing) setBasisOfBearing(parsedStaticFile.basisOfBearing)
    const errorCount = parsedStaticFile.validations.filter((validation) => validation.severity === 'error').length
    const warningCount = parsedStaticFile.validations.filter((validation) => validation.severity === 'warning').length
    setStatus(`${m.staticValidationReady}: ${parsedStaticFile.projectControls.length} ${m.projectControlsLabel}, ${errorCount} ${m.errorsLabel}, ${warningCount} ${m.warningsLabel}`)
  }

  const selectMonumentHistoryRecord = React.useCallback(async (objectId?: string | number | null) => {
    const dataSources = await getMonumentHistoryRuntimeDataSources()
    for (const dataSource of dataSources) {
      try {
        let jimuLayerView: any = null
        try {
          jimuLayerView = jimuMapView?.getJimuLayerViewByDataSourceId?.(dataSource.id) ||
            (dataSource ? await jimuMapView?.whenJimuLayerViewLoadedByDataSource?.(dataSource) : null)
        } catch {
          jimuLayerView = null
        }

        if (objectId === null || objectId === undefined || objectId === '') {
          MessageManager.getInstance().publishMessage(
            new DataRecordsSelectionChangeMessage(props.id, [], [dataSource.id])
          )
          dataSource.clearSelection?.()
          jimuLayerView?.selectFeaturesByIds?.([])
        } else {
          const queryObjectId = typeof objectId === 'number' ? objectId : Number(objectId)
          const queryObjectIds = Number.isFinite(queryObjectId) ? [queryObjectId] : [objectId]
          let records: DataRecord[] = []
          try {
            const queryResult = await dataSource.query?.({
              objectIds: queryObjectIds,
              outFields: ['*'],
              returnGeometry: true
            })
            records = queryResult?.records || []
          } catch {
            records = []
          }
          const selectedIds = records.length > 0 ? records.map((record) => record.getId()) : queryObjectIds
          MessageManager.getInstance().publishMessage(
            new DataRecordsSelectionChangeMessage(props.id, records, [dataSource.id])
          )
          dataSource.selectRecordsByIds?.(selectedIds, records)
          jimuLayerView?.selectFeaturesByIds?.(selectedIds, records)
        }
      } catch {
        // Table selection should not block drawing the active monument graphic.
      }
    }
  }, [getMonumentHistoryRuntimeDataSources, jimuMapView, props.id])

  const loadSurveyMonumentsByObjectIds = React.useCallback(async (objectIds: Array<string | number>) => {
    const numericObjectIds = Array.from(new Set(objectIds
      .map((objectId) => typeof objectId === 'number' ? objectId : Number(objectId))
      .filter((objectId) => Number.isFinite(objectId))))
    if (numericObjectIds.length === 0) return new Map<string, SurveyMonumentSummary>()

    const monuments = new Map<string, SurveyMonumentSummary>()
    for (let offset = 0; offset < numericObjectIds.length; offset += MONUMENT_GLOBAL_ID_QUERY_CHUNK_SIZE) {
      const ids = numericObjectIds.slice(offset, offset + MONUMENT_GLOBAL_ID_QUERY_CHUNK_SIZE)
      const query = new URL(`${surveyMonumentsUrl}/query`)
      query.search = new URLSearchParams({
        objectIds: ids.join(','),
        outFields: '*',
        returnGeometry: 'false',
        f: 'json'
      }).toString()

      const response = await fetch(query.toString())
      const data = await response.json() as QueryResponse
      if (!response.ok || data.error) throw new Error(data.error?.message || response.statusText)

      ;(data.features || []).forEach((feature) => {
        const item = toSurveyMonumentSummary(feature.attributes || {})
        monuments.set(String(item.objectId), item)
      })
    }

    return monuments
  }, [surveyMonumentsUrl, toSurveyMonumentSummary])

  const getCsvPointNumber = React.useCallback((attributes: { [key: string]: string }) => {
    const normalizedCandidates = [
      monumentPointNumberField,
      'PointNumber',
      'Point Number',
      'PointID',
      'Point ID',
      'Point'
    ].map((fieldName) => fieldName.replace(/[^a-z0-9]/gi, '').toLowerCase())
    const matchingKey = Object.keys(attributes).find((key) =>
      normalizedCandidates.includes(key.replace(/[^a-z0-9]/gi, '').toLowerCase())
    )
    return matchingKey ? attributes[matchingKey].trim() : ''
  }, [monumentPointNumberField])

  const querySurveyMonumentsByCsvPoint = React.useCallback(async (item: CsvProjectRow) => {
    const coordinates = getCsvProjectRowCoordinates(item)
    if (!coordinates) return []

    const query = new URL(`${surveyMonumentsUrl}/query`)
    query.search = new URLSearchParams({
      geometry: JSON.stringify({
        x: coordinates.x,
        y: coordinates.y,
        spatialReference: ORANGE_COUNTY_STATE_PLANE_SPATIAL_REFERENCE
      }),
      geometryType: 'esriGeometryPoint',
      inSR: String(ORANGE_COUNTY_STATE_PLANE_SPATIAL_REFERENCE.latestWkid),
      spatialRel: 'esriSpatialRelIntersects',
      distance: String(CSV_SEARCH_POINT_BUFFER_FEET),
      units: 'esriSRUnit_Foot',
      outFields: '*',
      returnGeometry: 'false',
      resultRecordCount: String(HISTORY_QUERY_LIMIT),
      f: 'json'
    }).toString()

    const response = await fetch(query.toString())
    const data = await response.json() as QueryResponse
    if (!response.ok || data.error) throw new Error(data.error?.message || response.statusText)
    return (data.features || []).map((feature) => toSurveyMonumentSummary(feature.attributes || {}))
  }, [surveyMonumentsUrl, toSurveyMonumentSummary])

  const clearProjectCsvRows = React.useCallback(() => {
    setNewSearchPointRows([])
    setExistingMonumentRows([])
    setMultipleMonumentRows([])
    setActiveNewSearchPointId('')
    setCreateProjectPlan(null)
    setCreateProjectModalOpen(false)
  }, [])

  const importProjectCsvFile = React.useCallback(async (file: File, resetProjectName = true) => {
    setLoadingProjectCsv(true)
    setProjectCsvFile(file)
    setProjectCsvFileName(file.name)
    if (resetProjectName) {
      setNewProjectName(projectNameFromCsvFileName(file.name))
      setUseSelectedProjectForCreate(false)
    }
    clearProjectCsvRows()

    try {
      const parsedRows = parseCsvText(await file.text())
      const includedRows = parsedRows.filter((row) => !shouldOmitCsvProjectRow(row.attributes))
      const importedRows = includedRows.map((row) => {
        const pointNumber = getCsvPointNumber(row.attributes)
        const validationMessages = [
          ...(pointNumber ? [] : [m.csvMissingPointNumber]),
          ...(getCsvProjectRowCoordinates({ id: '', rowNumber: row.rowNumber, attributes: row.attributes, pointNumber, validationMessages: [], existingMonuments: [] }) ? [] : [m.searchPointInvalidCoordinates])
        ]
        return {
          id: `${row.rowNumber}-${pointNumber || 'missing'}`,
          rowNumber: row.rowNumber,
          attributes: row.attributes,
          pointNumber: pointNumber || '-',
          validationMessages,
          existingMonuments: []
        }
      })
      const classifiedRows = await mapWithConcurrency(importedRows, CSV_SPATIAL_QUERY_CONCURRENCY, async (item) => ({
        ...item,
        existingMonuments: await querySurveyMonumentsByCsvPoint(item)
      }))

      setNewSearchPointRows(classifiedRows.filter((item) => item.existingMonuments.length === 0))
      setExistingMonumentRows(classifiedRows.filter((item) => item.existingMonuments.length === 1))
      setMultipleMonumentRows(classifiedRows.filter((item) => item.existingMonuments.length > 1))
      setStatus(`${m.csvParsed}: ${includedRows.length}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : m.csvParseFailed
      setStatus(`${m.csvParseFailed} ${message || ''}`.trim())
    } finally {
      setLoadingProjectCsv(false)
    }
  }, [clearProjectCsvRows, getCsvPointNumber, m.csvMissingPointNumber, m.csvParsed, m.csvParseFailed, m.searchPointInvalidCoordinates, querySurveyMonumentsByCsvPoint])

  const loadSelectedSurveyMonuments = React.useCallback(async () => {
    if (suppressAssignSurveySelectionSyncRef.current) return

    const dataSources = await getSurveyMonumentRuntimeDataSources()
    const records: DataRecord[] = []

    for (const dataSource of dataSources) {
      const selectedIds = dataSource.getSelectedRecordIds?.() || []
      if (selectedIds.length === 0) continue

      const selectedRecords = dataSource.getSelectedRecords?.() || []
      records.push(...selectedRecords)

      if (selectedRecords.length < selectedIds.length) {
        try {
          const queryObjectIds = selectedIds
            .map((id) => typeof id === 'number' ? id : Number(id))
            .filter((id) => Number.isFinite(id))
          const queryResult = await dataSource.query?.({
            objectIds: queryObjectIds.length > 0 ? queryObjectIds : selectedIds,
            outFields: ['*'],
            returnGeometry: true
          })
          records.push(...(queryResult?.records || []))
        } catch {
          // Keep any selected records already available from the data source.
        }
      }
    }

    const mapFeatureSurveyMonuments = selectedMapFeatures.flatMap((feature) => {
      const attributes = feature.attributes || {}
      if (!isSurveyMonumentAttributes(attributes)) return []
      const layer = feature?.layer || feature?.sourceLayer || {}
      if (layer.id === `${props.id}-project-monuments`) return []
      const layerId = layer.layerId ?? layer.sourceJSON?.id
      const candidates = [
        layer.url,
        layer.parsedUrl?.path,
        layer.sourceJSON?.url
      ].filter(Boolean).map(String)

      if (layerId !== undefined) {
        candidates.push(...candidates.map((url) => `${url.replace(/\/+$/, '')}/${layerId}`))
      }

      if (!urlCandidatesMatch(surveyMonumentsUrl, candidates)) return []
      return [toSurveyMonumentSummary(attributes)]
    })

    const seenIncomingKeys = new Set<string>()
    const rawIncomingSurveyMonuments = [
      ...records
        .flatMap((record: any) => {
          const attributes = getRecordAttributes(record)
          const sourceDataSource = record?.dataSource
          if (sourceDataSource && !dataSourceMatchesUrl(sourceDataSource, surveyMonumentsUrl)) return []
          if (!isSurveyMonumentAttributes(attributes)) return []
          return [toSurveyMonumentSummary(attributes)]
        }),
      ...mapFeatureSurveyMonuments
    ]
      .filter((item) => item.objectId !== undefined && item.objectId !== null)
      .filter((item) => {
        const key = getSurveyMonumentKey(item)
        if (seenIncomingKeys.has(key)) return false
        seenIncomingKeys.add(key)
        return true
      })

    const missingAutoTargetFieldObjectIds = rawIncomingSurveyMonuments
      .filter((item) =>
        (!item.globalId || item.joeId === undefined || item.denId === undefined) &&
        item.objectId !== undefined &&
        item.objectId !== null
      )
      .map((item) => item.objectId)
    const enrichedMonuments = await loadSurveyMonumentsByObjectIds(missingAutoTargetFieldObjectIds)
    const incomingSurveyMonuments = rawIncomingSurveyMonuments.map((item) =>
      enrichedMonuments.get(String(item.objectId)) || item
    )

    setAssignSurveyMonuments((current) => {
      const knownKeys = new Set(current.map(getSurveyMonumentKey))
      const additions = incomingSurveyMonuments.filter((item) => !knownKeys.has(getSurveyMonumentKey(item)))
      const nextSurveyMonuments = [...current, ...additions]
        .sort((left, right) => left.pointNumber.localeCompare(right.pointNumber, undefined, { numeric: true, sensitivity: 'base' }))
      if (nextSurveyMonuments.length === 0) {
        setAssignHistoryItems([])
        setActiveAssignHistoryKey('')
        setStatus(m.assignSelectSurveyMonuments)
      } else if (additions.length > 0) {
        setStatus(`${m.selectedSurveyMonuments}: ${nextSurveyMonuments.length}`)
      }
      return nextSurveyMonuments
    })
  }, [dataSourceMatchesUrl, getSurveyMonumentRuntimeDataSources, isSurveyMonumentAttributes, loadSurveyMonumentsByObjectIds, m.assignSelectSurveyMonuments, m.selectedSurveyMonuments, props.id, selectedMapFeatures, surveyMonumentsUrl, toSurveyMonumentSummary])

  const loadAssignHistoryForSurveyMonument = React.useCallback(async (monument?: SurveyMonumentSummary) => {
    if (!monument?.globalId) {
      setAssignHistoryItems([])
      setStatus(m.assignSurveyMissingGlobalId)
      return
    }

    setLoadingAssignHistory(true)

    try {
      const query = new URL(`${monumentHistoryUrl}/query`)
      query.search = new URLSearchParams({
        where: `${historyMonumentGlobalIdField} = '${escapeSqlString(monument.globalId)}'`,
        outFields: [
          'OBJECTID',
          'GlobalID',
          historyProjectGlobalIdField,
          historyMonumentGlobalIdField,
          'PointNumber',
          'Status',
          'Type',
          'EmbeddedIn',
          'MarkingType',
          'MarkingMaterial'
        ].join(','),
        returnGeometry: 'false',
        orderByFields: 'PointNumber ASC',
        resultRecordCount: String(HISTORY_QUERY_LIMIT),
        f: 'json'
      }).toString()

      const response = await fetch(query.toString())
      const data = await response.json() as QueryResponse
      if (!response.ok || data.error) throw new Error(data.error?.message || response.statusText)

      const nextHistoryItems = (data.features || [])
        .map((feature) => toHistorySummary(feature.attributes || {}))
        .filter((item) => item.objectId !== undefined && item.objectId !== null)
        .sort((left, right) => left.pointNumber.localeCompare(right.pointNumber, undefined, { numeric: true, sensitivity: 'base' }))
      const projectNames = await loadProjectNamesByGlobalIds(nextHistoryItems.map((item) => item.projectGlobalId || ''))
      const historyItemsWithProjects = nextHistoryItems.map((item) => ({
        ...item,
        projectName: projectNames.get(item.projectGlobalId || '') || item.projectGlobalId || '-'
      }))
      setAssignHistoryItems(historyItemsWithProjects)
      setActiveAssignHistoryKey((current) => {
        const nextKeys = new Set(historyItemsWithProjects.map(getHistoryKey))
        return nextKeys.has(current) ? current : ''
      })
      if (suppressAssignHistoryLoadedStatusRef.current) {
        suppressAssignHistoryLoadedStatusRef.current = false
      } else {
        setStatus(`${m.assignHistoryLoaded} ${historyItemsWithProjects.length}`)
      }
    } catch (err) {
      suppressAssignHistoryLoadedStatusRef.current = false
      const message = err instanceof Error ? err.message : m.historyLoadFailed
      setStatus(message || m.historyLoadFailed)
    } finally {
      setLoadingAssignHistory(false)
    }
  }, [historyMonumentGlobalIdField, historyProjectGlobalIdField, loadProjectNamesByGlobalIds, m.assignHistoryLoaded, m.assignSurveyMissingGlobalId, m.historyLoadFailed, monumentHistoryUrl, toHistorySummary])

  const loadAutoAssignHistoryCandidates = React.useCallback(async (monumentGlobalIds: string[]) => {
    const uniqueGlobalIds = Array.from(new Set(monumentGlobalIds.map((globalId) => globalId.trim()).filter(Boolean)))
    const candidatesByMonumentGlobalId = new Map<string, AutoAssignHistoryCandidate[]>()
    if (uniqueGlobalIds.length === 0) return candidatesByMonumentGlobalId

    for (let offset = 0; offset < uniqueGlobalIds.length; offset += MONUMENT_GLOBAL_ID_QUERY_CHUNK_SIZE) {
      const batch = uniqueGlobalIds.slice(offset, offset + MONUMENT_GLOBAL_ID_QUERY_CHUNK_SIZE)
      const query = new URL(`${monumentHistoryUrl}/query`)
      query.search = new URLSearchParams({
        where: `${historyMonumentGlobalIdField} IN (${batch.map((globalId) => `'${escapeSqlString(globalId)}'`).join(',')})`,
        outFields: [
          'OBJECTID',
          historyMonumentGlobalIdField,
          historyProjectGlobalIdField,
          'PointNumber',
          'created_date'
        ].join(','),
        returnGeometry: 'false',
        orderByFields: 'created_date DESC, OBJECTID DESC',
        resultRecordCount: String(HISTORY_QUERY_LIMIT),
        f: 'json'
      }).toString()

      const response = await fetch(query.toString())
      const data = await response.json() as QueryResponse
      if (!response.ok || data.error) throw new Error(data.error?.message || response.statusText)

      ;(data.features || []).forEach((feature) => {
        const attributes = feature.attributes || {}
        const pointGlobalId = getStringAttribute(attributes, historyMonumentGlobalIdField)
        if (!pointGlobalId) return
        const key = pointGlobalId.trim().toLowerCase()
        candidatesByMonumentGlobalId.set(key, [
          ...(candidatesByMonumentGlobalId.get(key) || []),
          {
            objectId: getAttributeValue(attributes, 'OBJECTID'),
            pointGlobalId,
            pointNumber: getStringAttribute(attributes, 'PointNumber'),
            projectGlobalId: getStringAttribute(attributes, historyProjectGlobalIdField),
            createdDate: Number(getAttributeValue(attributes, 'created_date')) || undefined
          }
        ])
      })
    }

    return candidatesByMonumentGlobalId
  }, [historyMonumentGlobalIdField, historyProjectGlobalIdField, monumentHistoryUrl])

  const buildAutoAssignPlan = React.useCallback(async (): Promise<AutoAssignPlan | null> => {
    if (!selectedProject?.globalId) {
      setStatus(m.historyMissingProjectId)
      return null
    }
    if (assignSurveyMonuments.length === 0) {
      setStatus(m.assignSelectSurveyMonuments)
      return null
    }

    const assignableMonuments = assignSurveyMonuments.filter((monument) => Boolean(monument.globalId))
    if (assignableMonuments.length === 0) {
      setStatus(m.assignSurveyMissingGlobalId)
      return null
    }

    const candidatesByMonumentGlobalId = await loadAutoAssignHistoryCandidates(assignableMonuments.map((monument) => monument.globalId || ''))
    const assignedProjectNames = await loadProjectNamesByGlobalIds(
      Array.from(candidatesByMonumentGlobalId.values())
        .flat()
        .map((candidate) => candidate.projectGlobalId)
        .filter(Boolean)
    )
    const rows = assignSurveyMonuments.map((monument) => {
      const monumentKey = getSurveyMonumentKey(monument)
      if (!monument.globalId) {
        return {
          id: `missing-global-${monumentKey}`,
          monumentKey,
          pointNumber: monument.pointNumber,
          action: 'skip' as AutoAssignPlanAction,
          status: m.assignSurveyMissingGlobalId,
          severity: 'error' as const
        }
      }

      const candidates = candidatesByMonumentGlobalId.get(monument.globalId.trim().toLowerCase()) || []
      const blankCandidates = candidates.filter((candidate) => !candidate.projectGlobalId)
      if (blankCandidates.length > 0) {
        const candidate = blankCandidates[0]
        return {
          id: `assign-${monumentKey}-${candidate.objectId}`,
          monumentKey,
          pointNumber: monument.pointNumber,
          historyObjectId: candidate.objectId,
          historyPointNumber: candidate.pointNumber,
          createdDate: candidate.createdDate,
          action: 'assign' as AutoAssignPlanAction,
          status: blankCandidates.length > 1 ? m.autoAssignMultipleCandidates : m.readyLabel,
          severity: blankCandidates.length > 1 ? 'warning' as const : 'ready' as const
        }
      }

      if (candidates.some((candidate) => Boolean(candidate.projectGlobalId))) {
        return {
          id: `assigned-${monumentKey}`,
          monumentKey,
          pointNumber: monument.pointNumber,
          historyObjectId: candidates[0]?.objectId,
          historyPointNumber: candidates[0]?.pointNumber,
          currentProjectGlobalId: candidates[0]?.projectGlobalId,
          currentProjectName: assignedProjectNames.get(candidates[0]?.projectGlobalId || ''),
          createdDate: candidates[0]?.createdDate,
          action: 'skip' as AutoAssignPlanAction,
          status: m.autoAssignAlreadyAssigned,
          severity: 'info' as const
        }
      }

      return {
        id: `none-${monumentKey}`,
        monumentKey,
        pointNumber: monument.pointNumber,
        action: 'skip' as AutoAssignPlanAction,
        status: m.autoAssignNoEligibleHistory,
        severity: 'warning' as const
      }
    })
    const assignableRows = rows.filter((row) => row.action === 'assign' && row.historyObjectId !== undefined)

    return {
      rows,
      assignableRows,
      readyCount: assignableRows.length,
      alreadyAssignedCount: rows.filter((row) => row.status === m.autoAssignAlreadyAssigned).length,
      noEligibleHistoryCount: rows.filter((row) => row.status === m.autoAssignNoEligibleHistory).length,
      multipleCandidateCount: rows.filter((row) => row.status === m.autoAssignMultipleCandidates).length,
      errorCount: rows.filter((row) => row.severity === 'error').length
    }
  }, [
    assignSurveyMonuments,
    loadAutoAssignHistoryCandidates,
    loadProjectNamesByGlobalIds,
    m.assignSelectSurveyMonuments,
    m.assignSurveyMissingGlobalId,
    m.autoAssignAlreadyAssigned,
    m.autoAssignMultipleCandidates,
    m.autoAssignNoEligibleHistory,
    m.historyMissingProjectId,
    m.readyLabel,
    selectedProject?.globalId
  ])

  const openAutoAssignReview = React.useCallback(async () => {
    setBuildingAutoAssignPlan(true)
    setAutoAssignModalOpen(true)
    try {
      const plan = await buildAutoAssignPlan()
      setAutoAssignPlan(plan)
      if (plan) setStatus(`${m.autoAssignPlanReady}: ${plan.readyCount}. ${m.autoAssignSkipped}: ${plan.rows.length - plan.readyCount}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : m.autoAssignFailed
      setAutoAssignPlan(null)
      setStatus(`${m.autoAssignFailed} ${message || ''}`.trim())
    } finally {
      setBuildingAutoAssignPlan(false)
    }
  }, [buildAutoAssignPlan, m.autoAssignFailed, m.autoAssignPlanReady, m.autoAssignSkipped])

  const applyAutoAssignPlan = React.useCallback(async () => {
    if (!autoAssignPlan || !selectedProject?.globalId) return
    const selectedCandidates = autoAssignPlan.assignableRows.filter((row) => row.historyObjectId !== undefined)
    const projectGlobalId = formatGuidForEdit(selectedProject.globalId)

    setAutoAssigningHistory(true)
    try {
      if (selectedCandidates.length === 0) {
        setStatus(`${m.autoAssignComplete}: 0. ${m.autoAssignNoEligibleHistory}: ${autoAssignPlan.rows.length}`)
        return
      }
      const layer = await getMonumentHistoryLayer()
      const [Graphic] = await loadArcGISJSAPIModules(['esri/Graphic'])
      const objectIdField = layer.objectIdField || 'OBJECTID'
      const results = await layer.applyEdits({
        updateFeatures: selectedCandidates.map((row) => new Graphic({
          attributes: {
            [objectIdField]: row.historyObjectId,
            [historyProjectGlobalIdField]: projectGlobalId
          }
        }))
      }, getApplyEditsOptions(layer))
      const failedResult = (results.updateFeatureResults || []).find((result: any) => result?.error)
      if (failedResult) throw new Error(failedResult.error?.message || m.autoAssignFailed)

      const skippedCount = autoAssignPlan.rows.length - selectedCandidates.length
      setStatus(`${m.autoAssignComplete}: ${selectedCandidates.length}. ${m.autoAssignSkipped}: ${skippedCount}`)
      setAutoAssignModalOpen(false)
      const activeMonument = assignSurveyMonuments.find((monument) => getSurveyMonumentKey(monument) === activeAssignSurveyKey)
      if (activeMonument) await loadAssignHistoryForSurveyMonument(activeMonument)
    } catch (err) {
      const message = err instanceof Error ? err.message : m.autoAssignFailed
      setStatus(`${m.autoAssignFailed} ${message || ''}`.trim())
    } finally {
      setAutoAssigningHistory(false)
    }
  }, [
    activeAssignSurveyKey,
    autoAssignPlan,
    assignSurveyMonuments,
    getMonumentHistoryLayer,
    historyProjectGlobalIdField,
    loadAssignHistoryForSurveyMonument,
    m.autoAssignComplete,
    m.autoAssignFailed,
    m.autoAssignNoEligibleHistory,
    m.autoAssignSkipped,
    selectedProject?.globalId
  ])

  const createAssociatedHistoryForSelectedSurveyMonument = React.useCallback(async () => {
    const monument = assignSurveyMonuments.find((item) => getSurveyMonumentKey(item) === activeAssignSurveyKey)
    if (!monument) {
      setStatus(m.selectSurveyMonumentFirst)
      return
    }
    if (!monument.globalId) {
      setStatus(m.assignSurveyMissingGlobalId)
      return
    }
    if (!selectedProject?.globalId) {
      setStatus(m.historyMissingProjectId)
      return
    }
    const projectGlobalId = formatGuidForEdit(selectedProject.globalId)

    setAddingAssignHistory(true)
    try {
      const layer = await getMonumentHistoryLayer()
      const attributes = {
        [historyMonumentGlobalIdField]: monument.globalId,
        [historyProjectGlobalIdField]: projectGlobalId,
        PointNumber: monument.pointNumber === '-' ? null : monument.pointNumber
      }
      const results = await layer.applyEdits({
        addFeatures: [{ attributes }]
      })
      const addResult = results.addFeatureResults?.[0]
      if (!addResult || addResult.error) throw new Error(addResult?.error?.message || m.addHistoryFailed)

      await loadAssignHistoryForSurveyMonument(monument)
      const newObjectId = addResult.objectId
      if (newObjectId !== undefined && newObjectId !== null) {
        const newHistoryKey = String(newObjectId)
        setActiveAssignHistoryKey(newHistoryKey)
        suppressAssignSurveySelectionSyncRef.current = true
        selectMonumentHistoryRecord(newObjectId)
          .catch(() => undefined)
          .finally(() => {
            window.setTimeout(() => {
              suppressAssignSurveySelectionSyncRef.current = false
            }, 750)
          })
      }
      setStatus(`${m.addHistorySuccess}: ${monument.pointNumber}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : m.addHistoryFailed
      setStatus(message || m.addHistoryFailed)
    } finally {
      setAddingAssignHistory(false)
    }
  }, [activeAssignSurveyKey, assignSurveyMonuments, getMonumentHistoryLayer, historyMonumentGlobalIdField, historyProjectGlobalIdField, loadAssignHistoryForSurveyMonument, m.addHistoryFailed, m.addHistorySuccess, m.assignSurveyMissingGlobalId, m.historyMissingProjectId, m.selectSurveyMonumentFirst, selectMonumentHistoryRecord, selectedProject])

  const createCopiedHistoryFromSelectedRecord = React.useCallback(async () => {
    const historyItem = assignHistoryItems.find((item) => getHistoryKey(item) === activeAssignHistoryKey)
    if (!historyItem) {
      setStatus(m.selectHistoryFirst)
      return
    }

    const objectId = getNumericObjectId(historyItem.objectId)
    if (objectId === null) {
      setStatus(m.createCopyHistoryFailed)
      return
    }
    if (!selectedProject?.globalId) {
      setStatus(m.historyMissingProjectId)
      return
    }

    setAddingAssignHistory(true)
    try {
      const layer = await getMonumentHistoryLayer()
      const projectGlobalId = formatGuidForEdit(selectedProject.globalId)
      const objectIdField = layer.objectIdField || 'OBJECTID'
      const query = layer.createQuery ? layer.createQuery() : {}
      query.where = `${objectIdField} = ${objectId}`
      query.outFields = ['*']
      query.returnGeometry = false
      query.num = 1

      const queryResult = await layer.queryFeatures(query)
      const sourceAttributes = queryResult?.features?.[0]?.attributes || null
      if (!sourceAttributes) throw new Error(m.createCopyHistoryFailed)

      const attributes = {
        ...getCopyableAddAttributes(sourceAttributes, layer),
        [historyProjectGlobalIdField]: projectGlobalId
      }
      const results = await layer.applyEdits({
        addFeatures: [{ attributes }]
      })
      const addResult = results.addFeatureResults?.[0]
      if (!addResult || addResult.error) throw new Error(addResult?.error?.message || m.createCopyHistoryFailed)

      const activeMonument = assignSurveyMonuments.find((item) => getSurveyMonumentKey(item) === activeAssignSurveyKey)
      if (activeMonument) await loadAssignHistoryForSurveyMonument(activeMonument)

      const newObjectId = addResult.objectId
      if (newObjectId !== undefined && newObjectId !== null) {
        const newHistoryKey = String(newObjectId)
        setActiveAssignHistoryKey(newHistoryKey)
        suppressAssignSurveySelectionSyncRef.current = true
        selectMonumentHistoryRecord(newObjectId)
          .catch(() => undefined)
          .finally(() => {
            window.setTimeout(() => {
              suppressAssignSurveySelectionSyncRef.current = false
            }, 750)
          })
      }
      setStatus(`${m.createCopyHistorySuccess}: ${historyItem.pointNumber}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : m.createCopyHistoryFailed
      setStatus(message || m.createCopyHistoryFailed)
    } finally {
      setAddingAssignHistory(false)
    }
  }, [
    activeAssignHistoryKey,
    activeAssignSurveyKey,
    assignHistoryItems,
    assignSurveyMonuments,
    getMonumentHistoryLayer,
    historyProjectGlobalIdField,
    loadAssignHistoryForSurveyMonument,
    m.createCopyHistoryFailed,
    m.createCopyHistorySuccess,
    m.historyMissingProjectId,
    m.selectHistoryFirst,
    selectMonumentHistoryRecord,
    selectedProject?.globalId
  ])

  const refreshAssignHistory = React.useCallback(async () => {
    const monument = assignSurveyMonuments.find((item) => getSurveyMonumentKey(item) === activeAssignSurveyKey)
    if (!monument) {
      setStatus(m.selectSurveyMonumentFirst)
      return
    }
    await loadAssignHistoryForSurveyMonument(monument)
  }, [activeAssignSurveyKey, assignSurveyMonuments, loadAssignHistoryForSurveyMonument, m.selectSurveyMonumentFirst])

  const assignProjectToHistoryItem = React.useCallback(async (item: MonumentHistorySummary) => {
    if (!selectedProject?.globalId) {
      setStatus(m.historyMissingProjectId)
      return
    }
    const projectGlobalId = formatGuidForEdit(selectedProject.globalId)

    const objectId = getNumericObjectId(item.objectId)
    if (objectId === null) {
      setStatus(m.assignProjectValueFailed)
      return
    }

    const itemKey = getHistoryKey(item)
    setAssigningHistoryProjectKey(itemKey)
    try {
      const layer = await getMonumentHistoryLayer()
      const [Graphic] = await loadArcGISJSAPIModules(['esri/Graphic'])
      const objectIdField = layer.objectIdField || 'OBJECTID'
      let updateError: unknown = null
      try {
        const results = await layer.applyEdits({
          updateFeatures: [new Graphic({
            attributes: {
              [objectIdField]: objectId,
              [historyProjectGlobalIdField]: projectGlobalId
            }
          })]
        }, getApplyEditsOptions(layer))
        const failedResult = (results.updateFeatureResults || []).find((result: any) => result?.error)
        if (failedResult) updateError = failedResult
      } catch (err) {
        updateError = err
      }
      if (updateError && item.globalId) {
        try {
          const globalIdResults = await layer.applyEdits({
            updateFeatures: [new Graphic({
              attributes: {
                GlobalID: formatGuidForEdit(item.globalId),
                [historyProjectGlobalIdField]: projectGlobalId
              }
            })]
          }, getApplyEditsOptions(layer, { globalIdUsed: true }))
          updateError = (globalIdResults.updateFeatureResults || []).find((result: any) => result?.error) || null
        } catch (err) {
          updateError = err
        }
      }
      if (updateError) throw new Error(getUnknownErrorMessage(updateError, m.assignProjectValueFailed))

      setPendingAssignHistoryProjectKey('')
      setStatus(`${m.assignProjectValueSuccess}: ${item.pointNumber}`)
      const activeMonument = assignSurveyMonuments.find((monument) => getSurveyMonumentKey(monument) === activeAssignSurveyKey)
      if (activeMonument) await loadAssignHistoryForSurveyMonument(activeMonument)
    } catch (err) {
      const message = getUnknownErrorMessage(err, m.assignProjectValueFailed)
      setStatus(`${m.assignProjectValueFailed} ${message || ''}`.trim())
    } finally {
      setAssigningHistoryProjectKey('')
    }
  }, [
    activeAssignSurveyKey,
    assignSurveyMonuments,
    getMonumentHistoryLayer,
    historyProjectGlobalIdField,
    loadAssignHistoryForSurveyMonument,
    m.assignProjectValueFailed,
    m.assignProjectValueSuccess,
    m.historyMissingProjectId,
    selectedProject?.globalId
  ])

  const ensureMonumentGraphicsLayer = React.useCallback(async () => {
    if (!jimuMapView?.view?.map) return null
    if (monumentGraphicsLayerRef.current && monumentGraphicsMapRef.current !== jimuMapView.view.map) {
      monumentGraphicsMapRef.current?.remove?.(monumentGraphicsLayerRef.current)
      monumentGraphicsLayerRef.current = null
      monumentGraphicsMapRef.current = null
    }
    if (!monumentGraphicsLayerRef.current) {
      const [GraphicsLayer] = await loadArcGISJSAPIModules(['esri/layers/GraphicsLayer'])
      monumentGraphicsLayerRef.current = new GraphicsLayer({
        id: `${props.id}-project-monuments`,
        title: 'Monument Manager project monuments',
        listMode: 'hide'
      })
      jimuMapView.view.map.add(monumentGraphicsLayerRef.current)
      monumentGraphicsMapRef.current = jimuMapView.view.map
    }
    const layerIndex = jimuMapView.view.map.layers?.length
    if (typeof layerIndex === 'number' && layerIndex > 0) {
      jimuMapView.view.map.reorder?.(monumentGraphicsLayerRef.current, layerIndex - 1)
    }
    return monumentGraphicsLayerRef.current
  }, [jimuMapView, props.id])

  const ensureTraversePreviewGraphicsLayer = React.useCallback(async () => {
    if (!jimuMapView?.view?.map) return null
    if (traversePreviewGraphicsLayerRef.current && traversePreviewGraphicsMapRef.current !== jimuMapView.view.map) {
      traversePreviewGraphicsMapRef.current?.remove?.(traversePreviewGraphicsLayerRef.current)
      traversePreviewGraphicsLayerRef.current = null
      traversePreviewGraphicsMapRef.current = null
    }
    if (!traversePreviewGraphicsLayerRef.current) {
      const [GraphicsLayer] = await loadArcGISJSAPIModules(['esri/layers/GraphicsLayer'])
      traversePreviewGraphicsLayerRef.current = new GraphicsLayer({
        id: `${props.id}-generated-traverse-connections`,
        title: 'Generated traverse connection preview',
        listMode: 'hide'
      })
      jimuMapView.view.map.add(traversePreviewGraphicsLayerRef.current)
      traversePreviewGraphicsMapRef.current = jimuMapView.view.map
    }
    const layerIndex = jimuMapView.view.map.layers?.length
    if (typeof layerIndex === 'number' && layerIndex > 0) {
      jimuMapView.view.map.reorder?.(traversePreviewGraphicsLayerRef.current, layerIndex - 1)
    }
    return traversePreviewGraphicsLayerRef.current
  }, [jimuMapView, props.id])

  const getGeometryJson = (geometry: any, geometryType?: string, spatialReference?: any) => {
    const geometryJson = { ...geometry }
    if (geometryType && !geometryJson.type) {
      geometryJson.type = geometryType.replace('esriGeometry', '').toLowerCase()
    }
    if (spatialReference && !geometryJson.spatialReference) {
      geometryJson.spatialReference = spatialReference
    }
    return geometryJson
  }

  const getMonumentGraphicSymbol = (geometry: any, selected = false) => {
    const type = geometry?.type
    const color = selected ? [105, 220, 255, 0.72] : [255, 244, 120, 0.74]
    const lineColor = selected ? [105, 220, 255, 0.86] : [255, 244, 120, 0.8]
    const fillColor = selected ? [105, 220, 255, 0.16] : [255, 244, 120, 0.14]
    const fillOutlineColor = selected ? [105, 220, 255, 0.92] : [255, 255, 255, 0.95]
    if (type === 'point' || type === 'multipoint') {
      return {
        type: 'simple-marker',
        style: 'circle',
        color,
        size: 14,
        outline: { color: [255, 255, 255, 1], width: 2 }
      }
    }
    if (type === 'polyline') {
      return {
        type: 'simple-line',
        color: lineColor,
        width: 5
      }
    }
    return {
      type: 'simple-fill',
      color: fillColor,
      outline: { color: fillOutlineColor, width: 3 }
    }
  }

  const getGeneratedTraverseConnectionSymbol = React.useCallback(() => ({
    type: 'simple-line',
    color: [0, 197, 255, 0.92],
    width: 3,
    style: 'dash'
  }), [])

  const getCsvProjectBoundarySymbol = () => ({
    type: 'simple-fill',
    color: [57, 255, 20, 0.12],
    style: 'solid',
    outline: {
      color: [57, 255, 20, 0.96],
      width: 3,
      style: 'dash'
    }
  })

  const querySurveyMonumentsByGlobalIds = React.useCallback(async (globalIds: string[]): Promise<QueryResponse[]> => {
    const results: QueryResponse[] = []
    const uniqueIds = Array.from(new Set(globalIds.filter(Boolean)))
    for (let offset = 0; offset < uniqueIds.length; offset += MONUMENT_GLOBAL_ID_QUERY_CHUNK_SIZE) {
      const ids = uniqueIds.slice(offset, offset + MONUMENT_GLOBAL_ID_QUERY_CHUNK_SIZE)
      const params: { [key: string]: string } = {
        where: `${monumentGlobalIdField} IN (${ids.map((id) => `'${escapeSqlString(id)}'`).join(',')})`,
        outFields: '*',
        returnGeometry: 'true',
        f: 'json'
      }
      const outWkid = jimuMapView?.view?.spatialReference?.wkid
      if (outWkid) params.outSR = String(outWkid)

      const query = new URL(`${surveyMonumentsUrl}/query`)
      query.search = new URLSearchParams(params).toString()
      const response = await fetch(query.toString())
      const data = await response.json() as QueryResponse
      if (!response.ok || data.error) throw new Error(data.error?.message || response.statusText)
      results.push(data)
    }
    return results
  }, [jimuMapView, monumentGlobalIdField, surveyMonumentsUrl])

  const renderProjectMonumentGraphics = React.useCallback(async (items: MonumentHistorySummary[], activeKey: string) => {
    const layer = await ensureMonumentGraphicsLayer()
    if (!layer) return

    const monumentGlobalIds = items
      .map((item) => item.monumentGlobalId || '')
      .filter((globalId) => globalId.trim() !== '')

    if (monumentGlobalIds.length === 0) {
      layer.removeAll()
      return
    }

    const [Graphic, geometryJsonUtils] = await loadArcGISJSAPIModules([
      'esri/Graphic',
      'esri/geometry/support/jsonUtils'
    ])
    const historyByMonumentGlobalId = new Map(items.map((item) => [String(item.monumentGlobalId || '').toLowerCase(), item]))
    const activeHistoryItem = items.find((item) => getHistoryKey(item) === activeKey)
    const graphics: any[] = []
    const results = await querySurveyMonumentsByGlobalIds(monumentGlobalIds)

    results.forEach((result) => {
      ;(result.features || []).forEach((feature) => {
        if (!feature.geometry) return
        const attributes = feature.attributes || {}
        const globalId = getStringAttribute(attributes, monumentGlobalIdField)
        const historyItem = historyByMonumentGlobalId.get(globalId.toLowerCase())
        const historyKey = historyItem ? getHistoryKey(historyItem) : globalId
        const geometry = geometryJsonUtils.fromJSON(getGeometryJson(
          feature.geometry,
          result.geometryType,
          result.spatialReference
        ))
        graphics.push(new Graphic({
          geometry,
          attributes: {
            ...attributes,
            __monumentManagerHistoryKey: historyKey,
            __monumentManagerMonumentGlobalId: globalId
          },
          symbol: getMonumentGraphicSymbol(geometry, historyKey === activeKey)
        }))
      })
    })

    layer.removeAll()
    if (graphics.length > 0) layer.addMany(graphics)
    await selectMonumentHistoryRecord(activeKey ? activeHistoryItem?.objectId : null)
  }, [ensureMonumentGraphicsLayer, monumentGlobalIdField, querySurveyMonumentsByGlobalIds, selectMonumentHistoryRecord])

  const zoomToHistorySurveyMonument = React.useCallback(async (item: MonumentHistorySummary) => {
    const view = jimuMapView?.view
    if (!view) {
      setStatus(m.mapUnavailable)
      return
    }
    if (!item.monumentGlobalId) {
      setStatus(m.monumentZoomMissingGlobalId)
      return
    }

    const itemKey = getHistoryKey(item)
    setActiveHistoryKey(itemKey)
    await selectMonumentHistoryRecord(item.objectId)

    try {
      const [geometryJsonUtils] = await loadArcGISJSAPIModules([
        'esri/geometry/support/jsonUtils'
      ])
      const results = await querySurveyMonumentsByGlobalIds([item.monumentGlobalId])
      let targetGeometry: any = null

      for (const result of results) {
        const feature = (result.features || []).find((candidate) => !!candidate.geometry)
        if (!feature?.geometry) continue
        targetGeometry = geometryJsonUtils.fromJSON(getGeometryJson(
          feature.geometry,
          result.geometryType,
          result.spatialReference
        ))
        break
      }

      if (!targetGeometry) {
        setStatus(m.monumentZoomNotFound)
        return
      }

      const target = targetGeometry.type === 'point'
        ? { target: targetGeometry, zoom: Math.max(Number(view.zoom) || 0, 18) }
        : targetGeometry.extent?.expand ? targetGeometry.extent.expand(2) : targetGeometry

      await view.goTo(target, {
        duration: 900,
        padding: { top: 80, right: 80, bottom: 80, left: 80 }
      })
      setStatus(`${m.monumentZoomed}: ${item.pointNumber}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : m.monumentZoomFailed
      setStatus(message || m.monumentZoomFailed)
    }
  }, [jimuMapView, m.mapUnavailable, m.monumentZoomed, m.monumentZoomFailed, m.monumentZoomMissingGlobalId, m.monumentZoomNotFound, querySurveyMonumentsByGlobalIds, selectMonumentHistoryRecord])

  const zoomToAssignSurveyMonument = React.useCallback(async (item: SurveyMonumentSummary) => {
    const view = jimuMapView?.view
    if (!view) {
      setStatus(m.mapUnavailable)
      return
    }
    if (!item.globalId) {
      setStatus(m.assignSurveyMissingGlobalId)
      return
    }

    setActiveAssignSurveyKey(getSurveyMonumentKey(item))

    try {
      const [geometryJsonUtils] = await loadArcGISJSAPIModules([
        'esri/geometry/support/jsonUtils'
      ])
      const results = await querySurveyMonumentsByGlobalIds([item.globalId])
      let targetGeometry: any = null

      for (const result of results) {
        const feature = (result.features || []).find((candidate) => !!candidate.geometry)
        if (!feature?.geometry) continue
        targetGeometry = geometryJsonUtils.fromJSON(getGeometryJson(
          feature.geometry,
          result.geometryType,
          result.spatialReference
        ))
        break
      }

      if (!targetGeometry) {
        setStatus(m.monumentZoomNotFound)
        return
      }

      const target = targetGeometry.type === 'point'
        ? { target: targetGeometry, zoom: Math.max(Number(view.zoom) || 0, 18) }
        : targetGeometry.extent?.expand ? targetGeometry.extent.expand(2) : targetGeometry

      await view.goTo(target, {
        duration: 900,
        padding: { top: 80, right: 80, bottom: 80, left: 80 }
      })
      setStatus(`${m.monumentZoomed}: ${item.pointNumber}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : m.monumentZoomFailed
      setStatus(message || m.monumentZoomFailed)
    }
  }, [jimuMapView, m.assignSurveyMissingGlobalId, m.mapUnavailable, m.monumentZoomed, m.monumentZoomFailed, m.monumentZoomNotFound, querySurveyMonumentsByGlobalIds])

  const renderAssignSurveyMonumentGraphics = React.useCallback(async (items: SurveyMonumentSummary[], activeKey: string) => {
    const layer = await ensureMonumentGraphicsLayer()
    if (!layer) return

    const monumentGlobalIds = items
      .map((item) => item.globalId || '')
      .filter((globalId) => globalId.trim() !== '')

    if (monumentGlobalIds.length === 0) {
      layer.removeAll()
      return
    }

    const [Graphic, geometryJsonUtils] = await loadArcGISJSAPIModules([
      'esri/Graphic',
      'esri/geometry/support/jsonUtils'
    ])
    const activeMonument = items.find((item) => getSurveyMonumentKey(item) === activeKey)
    const activeGlobalId = String(activeMonument?.globalId || '').toLowerCase()
    const graphics: any[] = []
    const results = await querySurveyMonumentsByGlobalIds(monumentGlobalIds)

    results.forEach((result) => {
      ;(result.features || []).forEach((feature) => {
        if (!feature.geometry) return
        const attributes = feature.attributes || {}
        const globalId = getStringAttribute(attributes, monumentGlobalIdField)
        const geometry = geometryJsonUtils.fromJSON(getGeometryJson(
          feature.geometry,
          result.geometryType,
          result.spatialReference
        ))
        graphics.push(new Graphic({
          geometry,
          attributes: {
            ...attributes,
            __monumentManagerSurveyGlobalId: globalId
          },
          symbol: getMonumentGraphicSymbol(geometry, globalId.toLowerCase() === activeGlobalId)
        }))
      })
    })

    layer.removeAll()
    if (graphics.length > 0) layer.addMany(graphics)
  }, [ensureMonumentGraphicsLayer, monumentGlobalIdField, querySurveyMonumentsByGlobalIds])

  const getCsvProjectRowPoint = React.useCallback(async (item: CsvProjectRow) => {
    const coordinates = getCsvProjectRowCoordinates(item)
    if (!coordinates) return null

    const [Point] = await loadArcGISJSAPIModules(['esri/geometry/Point'])
    return new Point({
      x: coordinates.x,
      y: coordinates.y,
      z: coordinates.z,
      spatialReference: ORANGE_COUNTY_STATE_PLANE_SPATIAL_REFERENCE
    })
  }, [])

  const getCsvProjectBoundaryPolygon = React.useCallback(async (items: CsvProjectRow[]) => {
    const coordinates = items
      .map(getCsvProjectRowCoordinates)
      .filter((coordinate): coordinate is { x: number, y: number, z?: number } => !!coordinate)
    if (coordinates.length === 0) return null

    const xs = coordinates.map((coordinate) => coordinate.x)
    const ys = coordinates.map((coordinate) => coordinate.y)
    const minX = Math.min(...xs) - CSV_PROJECT_BOUNDARY_PADDING_FEET
    const maxX = Math.max(...xs) + CSV_PROJECT_BOUNDARY_PADDING_FEET
    const minY = Math.min(...ys) - CSV_PROJECT_BOUNDARY_PADDING_FEET
    const maxY = Math.max(...ys) + CSV_PROJECT_BOUNDARY_PADDING_FEET

    const [Polygon] = await loadArcGISJSAPIModules(['esri/geometry/Polygon'])
    return new Polygon({
      rings: [[
        [minX, minY],
        [minX, maxY],
        [maxX, maxY],
        [maxX, minY],
        [minX, minY]
      ]],
      spatialReference: ORANGE_COUNTY_STATE_PLANE_SPATIAL_REFERENCE
    })
  }, [])

  const renderCsvProjectGraphics = React.useCallback(async (items: CsvProjectRow[], activeId: string, zoomToGraphics = false) => {
    const layer = await ensureMonumentGraphicsLayer()
    if (!layer) return

    if (items.length === 0) {
      layer.removeAll()
      return
    }

    const [Graphic] = await loadArcGISJSAPIModules(['esri/Graphic'])
    const graphics: any[] = []
    const boundaryGeometry = await getCsvProjectBoundaryPolygon(items)
    if (boundaryGeometry) {
      graphics.push(new Graphic({
        geometry: boundaryGeometry,
        attributes: {
          __monumentManagerCsvBoundary: true
        },
        symbol: getCsvProjectBoundarySymbol()
      }))
    }

    for (const item of items) {
      const geometry = await getCsvProjectRowPoint(item)
      if (!geometry) continue
      graphics.push(new Graphic({
        geometry,
        attributes: {
          __monumentManagerCsvRowId: item.id,
          PointNumber: item.pointNumber,
          MonumentDescription: item.attributes.MonumentDescription
        },
        symbol: getMonumentGraphicSymbol(geometry, item.id === activeId)
      }))
    }

    layer.removeAll()
    if (graphics.length > 0) {
      layer.addMany(graphics)
      if (zoomToGraphics && jimuMapView?.view) {
        const view = jimuMapView.view
        let target: any = graphics
        if (boundaryGeometry?.extent) {
          target = boundaryGeometry.extent
        } else if (graphics.length === 1) {
          target = { target: graphics[0].geometry, zoom: Math.max(Number(view.zoom) || 0, 18) }
        }
        await view.goTo(target, {
          duration: 900,
          padding: { top: 80, right: 80, bottom: 80, left: 80 }
        })
      }
    }
  }, [ensureMonumentGraphicsLayer, getCsvProjectBoundaryPolygon, getCsvProjectRowPoint, jimuMapView])

  const renderGeneratedTraverseConnectionGraphics = React.useCallback(async (connections: ParsedTraverseConnection[], zoomToGraphics = false) => {
    const layer = await ensureTraversePreviewGraphicsLayer()
    if (!layer) return 0

    const drawableConnections = connections.filter((connection) =>
      connection.fromPointE !== undefined &&
      connection.fromPointN !== undefined &&
      connection.toPointE !== undefined &&
      connection.toPointN !== undefined
    )
    if (drawableConnections.length === 0) {
      layer.removeAll()
      return 0
    }

    const [Graphic, Polyline] = await loadArcGISJSAPIModules([
      'esri/Graphic',
      'esri/geometry/Polyline'
    ])
    const graphics = drawableConnections.map((connection) => new Graphic({
      geometry: new Polyline({
        paths: [[
          [connection.fromPointE, connection.fromPointN],
          [connection.toPointE, connection.toPointN]
        ]],
        spatialReference: ORANGE_COUNTY_STATE_PLANE_SPATIAL_REFERENCE
      }),
      attributes: {
        FromPointNum: connection.fromPointNum,
        ToPointNum: connection.toPointNum,
        Distance: connection.distance,
        Direction: connection.direction,
        sourceFileName: connection.sourceFileName
      },
      symbol: getGeneratedTraverseConnectionSymbol()
    }))

    layer.removeAll()
    layer.addMany(graphics)

    if (zoomToGraphics && jimuMapView?.view) {
      await jimuMapView.view.goTo(graphics, {
        duration: 900,
        padding: { top: 80, right: 80, bottom: 80, left: 80 }
      })
    }

    return graphics.length
  }, [ensureTraversePreviewGraphicsLayer, getGeneratedTraverseConnectionSymbol, jimuMapView])

  const zoomToCsvProjectRow = React.useCallback(async (item: CsvProjectRow) => {
    const view = jimuMapView?.view
    if (!view) {
      setStatus(m.mapUnavailable)
      return
    }

    setActiveNewSearchPointId(item.id)
    const geometry = await getCsvProjectRowPoint(item)
    if (!geometry) {
      setStatus(m.searchPointInvalidCoordinates)
      return
    }

    try {
      await view.goTo({
        target: geometry,
        zoom: Math.max(Number(view.zoom) || 0, 18)
      }, {
        duration: 900,
        padding: { top: 80, right: 80, bottom: 80, left: 80 }
      })
      setStatus(`${m.searchPointZoomed}: ${item.pointNumber}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : m.monumentZoomFailed
      setStatus(message || m.monumentZoomFailed)
    }
  }, [getCsvProjectRowPoint, jimuMapView, m.mapUnavailable, m.monumentZoomFailed, m.searchPointInvalidCoordinates, m.searchPointZoomed])

  const getProjectWhere = React.useCallback((project: MonumentProjectSummary) => {
    if (project.globalId) return `${projectGlobalIdField} = '${escapeSqlString(project.globalId)}'`
    return `OBJECTID = ${project.objectId}`
  }, [projectGlobalIdField])

  const addMatchingProjectLayer = React.useCallback((
    layers: any[],
    layer: any,
    extraCandidates: string[] = []
  ) => {
    if (!layer) return
    const layerId = layer.layerId ?? layer.sourceJSON?.id
    const candidates = [
      layer.url,
      layer.parsedUrl?.path,
      layer.sourceJSON?.url,
      ...extraCandidates
    ].filter(Boolean).map(String)

    if (layerId !== undefined) {
      candidates.push(...candidates.map((url) => `${url.replace(/\/+$/, '')}/${layerId}`))
    }

    if (urlCandidatesMatch(monumentProjectsUrl, candidates) && !layers.includes(layer)) {
      layers.push(layer)
    }
  }, [monumentProjectsUrl])

  const getProjectMapLayers = async () => {
    if (!jimuMapView) return []

    await jimuMapView.whenAllJimuLayerViewLoaded?.()
    const layerViews = jimuMapView.getAllLoadedJimuLayerViews?.() || []
    const layers: any[] = []

    for (const layerView of layerViews) {
      const layer = layerView.layer || {}
      let layerDataSource = layerView.getLayerDataSource?.()
      if (!layerDataSource && layerView.createLayerDataSource) {
        try {
          layerDataSource = await layerView.createLayerDataSource()
        } catch {
          layerDataSource = null
        }
      }
      const dataSourceJson = layerDataSource?.getDataSourceJson?.()
      const dataSourceLayerId = dataSourceJson?.layerId ?? layerDataSource?.layerId
      const dataSourceUrl = dataSourceJson?.url || layerDataSource?.url
      addMatchingProjectLayer(layers, layer, [
        dataSourceUrl,
        dataSourceUrl && dataSourceLayerId !== undefined ? `${String(dataSourceUrl).replace(/\/+$/, '')}/${dataSourceLayerId}` : ''
      ])
    }

    const mapLayers = jimuMapView.view?.map?.allLayers?.toArray?.() || jimuMapView.view?.map?.layers?.toArray?.() || []
    mapLayers.forEach((layer: any) => {
      addMatchingProjectLayer(layers, layer)
      ;(layer.allSublayers?.toArray?.() || layer.sublayers?.toArray?.() || []).forEach((sublayer: any) => {
        addMatchingProjectLayer(layers, sublayer, [layer.url])
      })
    })

    const dataSourceManager = DataSourceManager.getInstance()
    for (const dataSourceId of monumentProjectDataSourceIds) {
      try {
        const dataSource: any = dataSourceManager.getDataSource(dataSourceId) || await dataSourceManager.createDataSource(dataSourceId)
        const layer = dataSource?.layer || dataSource?.getLayer?.()
        if (layer) {
          const dataSourceJson = dataSource?.getDataSourceJson?.()
          addMatchingProjectLayer(layers, layer, [
            dataSourceJson?.url || dataSource?.url,
            dataSourceJson?.sourceLabel,
            dataSourceJson?.label
          ])
        }
      } catch {
        // Keep using any map layers already discovered.
      }
    }

    return layers
  }

  const addMatchingTraverseConnectionLayer = React.useCallback((layers: any[], layer: any, extraCandidates: string[] = []) => {
    const layerId = layer?.layerId ?? layer?.id
    const candidates = [
      layer?.url,
      layer?.source?.url,
      layer?.parent?.url,
      layer?.title,
      layer?.name,
      layerId !== undefined ? String(layerId) : '',
      ...extraCandidates
    ].filter(Boolean).map(String)
    candidates.push(...candidates.map((url) => `${url.replace(/\/+$/, '')}/${layerId}`))

    if (urlCandidatesMatch(traverseConnectionsUrl, candidates) && !layers.includes(layer)) {
      layers.push(layer)
    }
  }, [traverseConnectionsUrl])

  const getTraverseConnectionMapLayers = React.useCallback(async () => {
    if (!jimuMapView) return []

    await jimuMapView.whenAllJimuLayerViewLoaded?.()
    const layerViews = jimuMapView.getAllLoadedJimuLayerViews?.() || []
    const layers: any[] = []

    for (const layerView of layerViews) {
      const layer = layerView.layer || {}
      let layerDataSource = layerView.getLayerDataSource?.()
      if (!layerDataSource && layerView.createLayerDataSource) {
        try {
          layerDataSource = await layerView.createLayerDataSource()
        } catch {
          layerDataSource = null
        }
      }
      const dataSourceJson = layerDataSource?.getDataSourceJson?.()
      const dataSourceLayerId = dataSourceJson?.layerId ?? layerDataSource?.layerId
      const dataSourceUrl = dataSourceJson?.url || layerDataSource?.url
      addMatchingTraverseConnectionLayer(layers, layer, [
        dataSourceUrl,
        dataSourceUrl && dataSourceLayerId !== undefined ? `${String(dataSourceUrl).replace(/\/+$/, '')}/${dataSourceLayerId}` : ''
      ])
    }

    const mapLayers = jimuMapView.view?.map?.allLayers?.toArray?.() || jimuMapView.view?.map?.layers?.toArray?.() || []
    mapLayers.forEach((layer: any) => {
      addMatchingTraverseConnectionLayer(layers, layer)
      ;(layer.allSublayers?.toArray?.() || layer.sublayers?.toArray?.() || []).forEach((sublayer: any) => {
        addMatchingTraverseConnectionLayer(layers, sublayer, [layer.url])
      })
    })

    const dataSourceManager = DataSourceManager.getInstance()
    for (const dataSourceId of traverseConnectionDataSourceIds) {
      try {
        const dataSource: any = dataSourceManager.getDataSource(dataSourceId) || await dataSourceManager.createDataSource(dataSourceId)
        const layer = dataSource?.layer || dataSource?.getLayer?.()
        if (layer) {
          const dataSourceJson = dataSource?.getDataSourceJson?.()
          addMatchingTraverseConnectionLayer(layers, layer, [
            dataSourceJson?.url || dataSource?.url,
            dataSourceJson?.sourceLabel,
            dataSourceJson?.label
          ])
        }
      } catch {
        // Keep using any map layers already discovered.
      }
    }

    return layers
  }, [addMatchingTraverseConnectionLayer, jimuMapView, traverseConnectionDataSourceIds])

  const getTraverseConnectionWhere = React.useCallback((projectGlobalId: string) =>
    `${traverseProjectGlobalIdField} = '${escapeSqlString(projectGlobalId)}'`,
  [traverseProjectGlobalIdField])

  const queryExistingTraverseConnections = React.useCallback(async (projectGlobalId: string) => {
    if (!projectGlobalId) return []

    const query = new URL(`${traverseConnectionsUrl}/query`)
    query.search = new URLSearchParams({
      where: getTraverseConnectionWhere(projectGlobalId),
      outFields: 'OBJECTID',
      returnGeometry: 'true',
      resultRecordCount: String(HISTORY_QUERY_LIMIT),
      f: 'json'
    }).toString()

    const response = await fetch(query.toString())
    const data = await response.json() as QueryResponse
    if (!response.ok || data.error) throw new Error(data.error?.message || response.statusText)

    return (data.features || []).map((feature) => ({
      objectId: getAttributeValue(feature.attributes || {}, 'OBJECTID'),
      geometry: feature.geometry
    })).filter((feature) => feature.objectId !== undefined && feature.objectId !== null)
  }, [getTraverseConnectionWhere, traverseConnectionsUrl])

  const queryTraverseConnectionExtent = React.useCallback(async (projectGlobalId: string) => {
    if (!projectGlobalId) return null

    const query = new URL(`${traverseConnectionsUrl}/query`)
    query.search = new URLSearchParams({
      where: getTraverseConnectionWhere(projectGlobalId),
      returnExtentOnly: 'true',
      f: 'json'
    }).toString()

    const response = await fetch(query.toString())
    const data = await response.json() as QueryResponse & { extent?: any }
    if (!response.ok || data.error) throw new Error(data.error?.message || response.statusText)
    return data.extent || null
  }, [getTraverseConnectionWhere, traverseConnectionsUrl])

  const showTraverseConnectionLayer = React.useCallback((layer: any) => {
    if (!layer) return
    if (!traverseConnectionVisibilityRef.current.has(layer)) {
      traverseConnectionVisibilityRef.current.set(layer, layer.visible)
    }
    layer.visible = true
  }, [])

  const restoreTraverseConnectionLayerVisibility = React.useCallback(() => {
    traverseConnectionVisibilityRef.current.forEach((visible, layer) => {
      layer.visible = visible
    })
    traverseConnectionVisibilityRef.current.clear()
  }, [])

  const revealExistingTraverseConnections = React.useCallback(async (connections: ExistingTraverseConnectionSummary[], projectGlobalId: string) => {
    if (connections.length === 0) return { layerFound: false, zoomed: false }

    const view = jimuMapView?.view
    if (!view) return { layerFound: false, zoomed: false }

    const layers = await getTraverseConnectionMapLayers()
    layers.forEach((layer) => {
      showTraverseConnectionLayer(layer)
      showTraverseConnectionLayer(layer.parent)
    })

    try {
      const dataSources = await getRuntimeDataSources(traverseConnectionsUrl, traverseConnectionDataSourceIds)
      const objectIds = connections.map((connection) => String(connection.objectId))
      for (const dataSource of dataSources) {
        try {
          const jimuLayerView = jimuMapView?.getJimuLayerViewByDataSourceId?.(dataSource.id) ||
            (dataSource ? await jimuMapView?.whenJimuLayerViewLoadedByDataSource?.(dataSource) : null)
          jimuLayerView?.selectFeaturesByIds?.(objectIds)
        } catch {
          // Selection is helpful, but visibility and zoom are enough for preview.
        }
      }
    } catch {
      // Keep the preview path moving if table/map selection is unavailable.
    }

    const rawExtent = await queryTraverseConnectionExtent(projectGlobalId)
    if (!rawExtent) return { layerFound: layers.length > 0, zoomed: false }

    const [Extent] = await loadArcGISJSAPIModules(['esri/geometry/Extent'])
    const extent = new Extent(rawExtent)
    const target = extent.expand ? extent.expand(1.75) : extent
    await view.goTo(target, {
      duration: 1200,
      padding: { top: 80, right: 80, bottom: 80, left: 80 }
    })

    return { layerFound: layers.length > 0, zoomed: true }
  }, [
    getRuntimeDataSources,
    getTraverseConnectionMapLayers,
    jimuMapView,
    queryTraverseConnectionExtent,
    showTraverseConnectionLayer,
    traverseConnectionDataSourceIds,
    traverseConnectionsUrl
  ])

  const restoreProjectLayerFilters = () => {
    projectLayerFiltersRef.current.forEach((entry) => {
      entry.layer.definitionExpression = entry.definitionExpression || null
    })
    projectLayerFiltersRef.current.clear()
  }

  const filterAndZoomToProject = async (project: MonumentProjectSummary) => {
    const view = jimuMapView?.view
    if (!view) {
      setStatus(m.mapUnavailable)
      return false
    }

    const layers = await getProjectMapLayers()
    if (layers.length === 0) {
      setStatus(m.projectLayerNotFound)
      return false
    }

    const where = getProjectWhere(project)
    let targetExtent: any = null

    layers.forEach((layer, index) => {
      const layerKey = getLayerKey(layer, `${monumentProjectsUrl}-${index}`)
      if (!projectLayerFiltersRef.current.has(layerKey)) {
        projectLayerFiltersRef.current.set(layerKey, {
          layer,
          definitionExpression: layer.definitionExpression
        })
      }
      const original = projectLayerFiltersRef.current.get(layerKey)?.definitionExpression
      layer.definitionExpression = original ? `(${original}) AND (${where})` : where
    })

    for (const layer of layers) {
      if (!layer.queryExtent) continue
      const query = layer.createQuery ? layer.createQuery() : {}
      query.where = where
      try {
        const result = await layer.queryExtent(query)
        if (result?.extent) {
          targetExtent = result.extent
          break
        }
      } catch {
        // Keep filtering even when one map layer cannot provide an extent.
      }
    }

    if (!targetExtent) {
      setStatus(m.projectZoomFailed)
      return false
    }

    const expandedExtent = targetExtent.expand ? targetExtent.expand(1.75) : targetExtent
    await view.goTo(expandedExtent, {
      duration: 1200,
      padding: { top: 80, right: 80, bottom: 80, left: 80 }
    })
    setStatus(`${m.projectFiltered}: ${project.name}`)
    return true
  }

  const selectProject = async (project: MonumentProjectSummary, selected: boolean) => {
    if (selected) {
      restoreProjectLayerFilters()
      setSelectedProject(null)
      setStatus(m.projectFilterCleared)
      return
    }

    setSelectedProject(project)
    try {
      await filterAndZoomToProject(project)
    } catch (err) {
      const message = err instanceof Error ? err.message : m.projectZoomFailed
      setStatus(message)
    }
  }

  const loadProjects = React.useCallback(async (rawSearchText = '') => {
    const searchText = rawSearchText.trim()
    if (searchText.length > 0 && searchText.length < PROJECT_SEARCH_MINIMUM_LENGTH) {
      setStatus(m.projectSearchMinimum)
      return
    }

    setLoadingProjects(true)
    setProjectError('')

    try {
      const query = new URL(`${monumentProjectsUrl}/query`)
      query.search = new URLSearchParams({
        where: buildProjectWhere(searchText),
        outFields: [
          'OBJECTID',
          projectGlobalIdField,
          projectDisplayField,
          'JobNo',
          'FileNo',
          'SurveyYear',
          'Folder',
          PROJECT_COMPLETED_FIELD
        ].join(','),
        returnGeometry: 'false',
        orderByFields: `${projectDisplayField} ASC`,
        resultRecordCount: String(PROJECT_QUERY_LIMIT),
        f: 'json'
      }).toString()

      const response = await fetch(query.toString())
      const data = await response.json() as QueryResponse
      if (!response.ok || data.error) throw new Error(data.error?.message || response.statusText)

      const nextProjects = (data.features || [])
        .map((feature) => toProjectSummary(feature.attributes || {}))
        .filter((project) => project.objectId !== undefined && project.objectId !== null)
      const historyCounts = await loadHistoryCounts(nextProjects.map((project) => project.globalId || ''))
      const projectsWithCounts = nextProjects.map((project) => ({
        ...project,
        historyCount: historyCounts.get(project.globalId || '') || 0
      }))

      setProjects(projectsWithCounts)
      setSelectedProject((current) => {
        if (!current) return null
        return projectsWithCounts.find((project) => String(project.objectId) === String(current.objectId)) || null
      })
      setStatus(searchText ? `${m.projectSearchReady} ${projectsWithCounts.length}` : m.projectListReady)
    } catch (err) {
      const message = err instanceof Error ? err.message : m.loadProjectsFailed
      setProjectError(message)
      setStatus(searchText ? m.projectSearchFailed : m.loadProjectsFailed)
    } finally {
      setLoadingProjects(false)
    }
  }, [
    buildProjectWhere,
    loadHistoryCounts,
    m.loadProjectsFailed,
    m.projectListReady,
    m.projectSearchFailed,
    m.projectSearchMinimum,
    m.projectSearchReady,
    monumentProjectsUrl,
    projectDisplayField,
    projectGlobalIdField,
    toProjectSummary
  ])

  React.useEffect(() => {
    if (mode !== 'finder') return
    if (searchInitializedRef.current) return
    searchInitializedRef.current = true
    loadProjects().catch(() => undefined)
  }, [loadProjects, mode, monumentProjectsUrl])

  React.useEffect(() => {
    if (mode !== 'finder') return
    const timeout = window.setTimeout(() => {
      loadProjects(projectSearchTerm).catch(() => undefined)
    }, 450)
    return () => {
      window.clearTimeout(timeout)
    }
  }, [loadProjects, mode, projectSearchTerm, monumentProjectsUrl])

  React.useEffect(() => {
    if (mode !== 'history' || !selectedProject) return
    loadProjectHistory(selectedProject).catch(() => undefined)
  }, [loadProjectHistory, mode, selectedProject, selectedProject?.objectId, selectedProject?.globalId, monumentHistoryUrl])

  React.useEffect(() => {
    let cancelled = false

    const previewExistingTraverseConnections = async () => {
      if (mode !== 'traverse' || !selectedProject?.globalId) {
        traverseConnectionsPreviewSignatureRef.current = ''
        return
      }

      const signature = [
        selectedProject.globalId,
        traverseConnectionsUrl,
        traverseProjectGlobalIdField
      ].join('|')
      if (traverseConnectionsPreviewSignatureRef.current === signature) return
      traverseConnectionsPreviewSignatureRef.current = signature

      try {
        const existingTraverseConnections = await queryExistingTraverseConnections(selectedProject.globalId)
        if (cancelled) return

        if (existingTraverseConnections.length === 0) {
          setStatus(m.existingTraverseConnectionsEmpty)
          return
        }

        const revealResult = await revealExistingTraverseConnections(existingTraverseConnections, selectedProject.globalId)
        if (cancelled) return

        let existingConnectionStatus = `${m.existingTraverseConnectionsFound}: ${existingTraverseConnections.length}.`
        if (!revealResult.layerFound) existingConnectionStatus += ` ${m.existingTraverseConnectionsLayerNotFound}`
        setStatus(existingConnectionStatus)
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : ''
        setStatus(`${m.existingTraverseConnectionsQueryFailed} ${message || ''}`.trim())
      }
    }

    previewExistingTraverseConnections().catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [
    m.existingTraverseConnectionsEmpty,
    m.existingTraverseConnectionsFound,
    m.existingTraverseConnectionsLayerNotFound,
    m.existingTraverseConnectionsQueryFailed,
    mode,
    queryExistingTraverseConnections,
    revealExistingTraverseConnections,
    selectedProject?.globalId,
    traverseConnectionsUrl,
    traverseProjectGlobalIdField
  ])

  React.useEffect(() => {
    let cancelled = false

    const updateSelectedMapFeatures = async () => {
      if (!jimuMapView?.getSelectedFeatures) {
        setSelectedMapFeatures([])
        return
      }
      try {
        const features = await jimuMapView.getSelectedFeatures()
        if (!cancelled) setSelectedMapFeatures(features || [])
      } catch {
        if (!cancelled) setSelectedMapFeatures([])
      }
    }

    updateSelectedMapFeatures().catch(() => undefined)
    jimuMapView?.addJimuLayerViewSelectedFeaturesChangeListener?.(updateSelectedMapFeatures)

    return () => {
      cancelled = true
      jimuMapView?.removeJimuLayerViewSelectedFeaturesChangeListener?.(updateSelectedMapFeatures)
    }
  }, [jimuMapView])

  React.useEffect(() => {
    let cancelled = false

    const syncMonumentGraphics = async () => {
      if (isSurveyHistoryMode) return
      if (mode === 'create-project') return
      if (mode !== 'history' || !selectedProject) {
        monumentGraphicsLayerRef.current?.removeAll?.()
        if (activeHistoryKey || historyItems.length > 0) {
          await selectMonumentHistoryRecord(null)
        }
        return
      }
      await renderProjectMonumentGraphics(historyItems, activeHistoryKey)
    }

    syncMonumentGraphics().catch(() => {
      if (!cancelled) setStatus(m.monumentGraphicsFailed)
    })

    return () => {
      cancelled = true
    }
  }, [activeHistoryKey, historyItems, isSurveyHistoryMode, m.monumentGraphicsFailed, mode, renderProjectMonumentGraphics, selectMonumentHistoryRecord, selectedProject])

  React.useEffect(() => {
    let cancelled = false

    const syncCsvGraphics = async () => {
      if (mode !== 'create-project') {
        csvProjectGraphicsSignatureRef.current = ''
        return
      }
      const csvRows = [...newSearchPointRows, ...existingMonumentRows, ...multipleMonumentRows]
      const rowSignature = csvRows.map((item) => item.id).join('|')
      const shouldZoomToGraphics = rowSignature !== '' && rowSignature !== csvProjectGraphicsSignatureRef.current
      await renderCsvProjectGraphics(csvRows, activeNewSearchPointId, shouldZoomToGraphics)
      csvProjectGraphicsSignatureRef.current = rowSignature
    }

    syncCsvGraphics().catch(() => {
      if (!cancelled) setStatus(m.monumentGraphicsFailed)
    })

    return () => {
      cancelled = true
    }
  }, [activeNewSearchPointId, existingMonumentRows, m.monumentGraphicsFailed, mode, multipleMonumentRows, newSearchPointRows, renderCsvProjectGraphics])

  React.useEffect(() => {
    if (mode === 'traverse') return
    restoreTraverseConnectionLayerVisibility()
    traversePreviewGraphicsLayerRef.current?.removeAll?.()
  }, [mode, restoreTraverseConnectionLayerVisibility])

  React.useEffect(() => {
    if (!isSurveyHistoryMode) return
    loadSelectedSurveyMonuments().catch(() => {
      setStatus(m.assignSurveySelectionFailed)
    })
  }, [isSurveyHistoryMode, loadSelectedSurveyMonuments, m.assignSurveySelectionFailed, surveyMonumentSelectionKey])

  React.useEffect(() => {
    if (!isSurveyHistoryMode) return
    const activeSurveyMonument = assignSurveyMonuments.find((item) => getSurveyMonumentKey(item) === activeAssignSurveyKey)
    if (!activeSurveyMonument) {
      setAssignHistoryItems([])
      setActiveAssignHistoryKey('')
      return
    }
    loadAssignHistoryForSurveyMonument(activeSurveyMonument).catch(() => {
      setStatus(m.historyLoadFailed)
    })
  }, [activeAssignSurveyKey, assignSurveyMonuments, isSurveyHistoryMode, loadAssignHistoryForSurveyMonument, m.historyLoadFailed])

  React.useEffect(() => {
    if ((!isSurveyHistoryMode && mode !== 'history') || !attachmentHistoryItem) {
      setAttachmentItems([])
      setAttachmentError('')
      clearStagedAttachmentFiles()
      return
    }
    clearStagedAttachmentFiles()
    loadHistoryAttachments(attachmentHistoryItem).catch(() => {
      setAttachmentError(m.historyLoadFailed)
    })
  }, [attachmentHistoryItem, clearStagedAttachmentFiles, isSurveyHistoryMode, loadHistoryAttachments, m.historyLoadFailed, mode])

  React.useEffect(() => {
    let cancelled = false

    const syncAssignGraphics = async () => {
      if (!isSurveyHistoryMode) return
      await renderAssignSurveyMonumentGraphics(assignSurveyMonuments, activeAssignSurveyKey)
    }

    syncAssignGraphics().catch(() => {
      if (!cancelled) setStatus(m.monumentGraphicsFailed)
    })

    return () => {
      cancelled = true
    }
  }, [activeAssignSurveyKey, assignSurveyMonuments, isSurveyHistoryMode, m.monumentGraphicsFailed, renderAssignSurveyMonumentGraphics])

  React.useEffect(() => () => {
    restoreTraverseConnectionLayerVisibility()
    monumentGraphicsLayerRef.current?.removeAll?.()
    monumentGraphicsMapRef.current?.remove?.(monumentGraphicsLayerRef.current)
    traversePreviewGraphicsLayerRef.current?.removeAll?.()
    traversePreviewGraphicsMapRef.current?.remove?.(traversePreviewGraphicsLayerRef.current)
  }, [restoreTraverseConnectionLayerVisibility])

  const projectRow = (project: MonumentProjectSummary) => {
    const selected = String(selectedProject?.objectId) === String(project.objectId)
    const toggleProject = () => {
      selectProject(project, selected).catch(() => undefined)
    }

    return h('div', {
      key: project.objectId,
      className: 'd-flex align-items-center justify-content-between py-1',
      style: { gap: '0.5rem', backgroundColor: selected ? 'rgba(0, 121, 193, 0.07)' : 'transparent' }
    },
    h('div', { className: 'd-flex align-items-center', style: { gap: '0.5rem', minWidth: 0 } },
      h(Checkbox, {
        checked: selected,
        onChange: toggleProject
      }),
      h('span', {
        title: project.name,
        style: {
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontSize: 12
        }
      }, project.name),
      h('span', {
        title: `${project.historyCount} ${m.historyCountLabel}`,
        style: {
          flex: '0 0 auto',
          borderRadius: 999,
          padding: '2px 8px',
          fontSize: 11,
          fontWeight: 700,
          lineHeight: '16px',
          color: 'var(--info-600, #0077ac)',
          backgroundColor: 'transparent'
        }
      }, String(project.historyCount))
    ),
    h(Button, {
      size: 'sm',
      type: 'default',
      title: project.folderUrl ? m.openFolder : m.folderUnavailable,
      disabled: !project.folderUrl,
      onClick: () => {
        if (!project.folderUrl) return
        const openedWindow = window.open(project.folderUrl, '_blank', 'noopener,noreferrer')
        setStatus(openedWindow ? `${m.openedFolder}: ${project.name}` : m.folderPopupBlocked)
      },
      style: { width: 32, minWidth: 32, height: 32, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }
    }, '📁')
    )
  }

  const startWorkflowMode = (nextMode: MonumentMode) => {
    const requiresProject = nextMode !== 'merge-points' && nextMode !== 'remove-monuments'
    if (requiresProject && !selectedProject) {
      setStatus(m.selectProjectFirst)
      return
    }
    if (nextMode === 'merge-points' || nextMode === 'remove-monuments') {
      setAssignSurveyMonuments([])
      setActiveAssignSurveyKey('')
      setAssignHistoryItems([])
      setActiveAssignHistoryKey('')
    }
    setMode(nextMode)
    const workflow = workflowModes.find((item) => item.id === nextMode)
    setStatus(requiresProject && selectedProject
      ? `${workflow?.label || m.selectedProject}: ${selectedProject.name}`
      : (workflow?.title || workflow?.label || m.selectedProject))
  }

  const clearAssignLists = () => {
    setAssignSurveyMonuments([])
    setActiveAssignSurveyKey('')
    setAssignHistoryItems([])
    setActiveAssignHistoryKey('')
    monumentGraphicsLayerRef.current?.removeAll?.()
    setStatus(m.historySelectionCleared)
  }

  const removeAssignSurveyMonument = (item: SurveyMonumentSummary) => {
    const itemKey = getSurveyMonumentKey(item)
    setAssignSurveyMonuments((current) => current.filter((surveyMonument) => getSurveyMonumentKey(surveyMonument) !== itemKey))
    if (activeAssignSurveyKey === itemKey) {
      setActiveAssignSurveyKey('')
      setAssignHistoryItems([])
      setActiveAssignHistoryKey('')
    }
    setStatus(`${m.surveyMonumentRemoved}: ${item.pointNumber}`)
  }

  const setActiveSurveyMonumentAsTarget = () => {
    if (!activeAssignSurveyKey || assignSurveyMonuments.length < 2) return
    suppressAssignHistoryLoadedStatusRef.current = true
    setAssignSurveyMonuments((current) => {
      const targetIndex = current.findIndex((item) => getSurveyMonumentKey(item) === activeAssignSurveyKey)
      if (targetIndex <= 0) {
        suppressAssignHistoryLoadedStatusRef.current = false
        return current
      }
      const nextItems = [...current]
      const [targetItem] = nextItems.splice(targetIndex, 1)
      nextItems.unshift(targetItem)
      setStatus(`${m.targetSet}: ${targetItem.pointNumber}`)
      return nextItems
    })
  }

  const canMergeSurveyMonuments = assignSurveyMonuments.length > 1
  const projectCsvRowCount = newSearchPointRows.length + existingMonumentRows.length + multipleMonumentRows.length
  const createProjectSourceLabel = (source: CreateProjectPlanSource) => {
    if (source === 'new-search-point') return m.newSearchPoint
    if (source === 'existing-monument') return m.existingMonument
    return m.multipleMonuments
  }

  const createProjectActionLabel = (row: CreateProjectPlanRow) => {
    if (row.id === 'missing-project-name') return m.projectNamePlaceholder
    if (row.pointNumber === '-') return m.csvMissingPointNumber
    if (row.x === undefined || row.y === undefined) return m.searchPointInvalidCoordinates
    if (row.source === 'multiple-monuments') return m.multipleMonumentsNearby
    if (row.action === 'create-survey-monument') return m.finalizeCreateSurveyMonument
    if (row.action === 'update-survey-monument') return m.finalizeUpdateSurveyMonument
    return m.noSurveyMonumentEdit
  }

  const queryMergeHistoryBySourceGlobalIds = React.useCallback(async (sourceMonuments: SurveyMonumentSummary[]) => {
    const sourceGlobalIds = sourceMonuments
      .map((monument) => monument.globalId)
      .filter((globalId): globalId is string => !!globalId)
    const historyRowsBySourceGlobalId = new Map<string, MergeHistoryReassignment[]>()
    if (sourceGlobalIds.length === 0) return historyRowsBySourceGlobalId

    for (let offset = 0; offset < sourceGlobalIds.length; offset += MONUMENT_GLOBAL_ID_QUERY_CHUNK_SIZE) {
      const batch = sourceGlobalIds.slice(offset, offset + MONUMENT_GLOBAL_ID_QUERY_CHUNK_SIZE)
      const query = new URL(`${monumentHistoryUrl}/query`)
      query.search = new URLSearchParams({
        where: `${historyMonumentGlobalIdField} IN (${batch.map((globalId) => `'${escapeSqlString(formatGuidForEdit(globalId))}'`).join(',')})`,
        outFields: [
          'OBJECTID',
          'PointNumber',
          historyMonumentGlobalIdField
        ].join(','),
        returnGeometry: 'false',
        resultRecordCount: String(HISTORY_QUERY_LIMIT),
        f: 'json'
      }).toString()

      const response = await fetch(query.toString())
      const data = await response.json() as QueryResponse
      if (!response.ok || data.error) throw new Error(data.error?.message || response.statusText)

      ;(data.features || []).forEach((feature) => {
        const attributes = feature.attributes || {}
        const sourceGlobalId = getStringAttribute(attributes, historyMonumentGlobalIdField)
        const sourceKey = normalizeGuidKey(sourceGlobalId)
        const sourceMonument = sourceMonuments.find((monument) => normalizeGuidKey(monument.globalId) === sourceKey)
        if (!sourceMonument) return
        historyRowsBySourceGlobalId.set(sourceKey, [
          ...(historyRowsBySourceGlobalId.get(sourceKey) || []),
          {
            objectId: getAttributeValue(attributes, 'OBJECTID'),
            pointNumber: getStringAttribute(attributes, 'PointNumber') || '-',
            sourceGlobalId,
            sourcePointNumber: sourceMonument.pointNumber,
            sourceObjectId: sourceMonument.objectId
          }
        ])
      })
    }

    return historyRowsBySourceGlobalId
  }, [historyMonumentGlobalIdField, monumentHistoryUrl])

  const autoSetMergeTarget = React.useCallback(() => {
    if (!canMergeSurveyMonuments) {
      setStatus(m.mergeRequiresMultipleMonuments)
      return
    }

    setAutoSettingTarget(true)
    try {
      const denCandidates = assignSurveyMonuments
        .map((monument, index) => ({
          monument,
          index,
          denId: getIntegerAttributeValue(monument.denId)
        }))
        .filter((candidate) => candidate.denId !== null)

      const joeCandidates = assignSurveyMonuments
        .map((monument, index) => ({
          monument,
          index
        }))
        .filter((candidate) => hasUsableAttributeValue(candidate.monument.joeId))

      let targetCandidate: { monument: SurveyMonumentSummary, index: number } | null = null
      let validationLabel = ''

      if (denCandidates.length > 0) {
        const denTarget = [...denCandidates].sort((left, right) =>
          (right.denId ?? Number.NEGATIVE_INFINITY) - (left.denId ?? Number.NEGATIVE_INFINITY) ||
          left.index - right.index
        )[0]
        targetCandidate = denTarget
        validationLabel = `${m.autoTargetSetByDenId}: ${denTarget.monument.pointNumber} (${denTarget.denId})`
      } else if (joeCandidates.length === 1) {
        targetCandidate = joeCandidates[0]
        validationLabel = `${m.autoTargetSetByJoeId}: ${targetCandidate.monument.pointNumber} (${targetCandidate.monument.joeId})`
      } else if (joeCandidates.length > 1) {
        validationLabel = m.autoTargetMultipleJoeIds
      } else {
        validationLabel = m.autoTargetNoIds
      }

      if (!targetCandidate) {
        setStatus(validationLabel)
        return
      }

      const targetKey = getSurveyMonumentKey(targetCandidate.monument)
      suppressAssignHistoryLoadedStatusRef.current = true
      setAssignSurveyMonuments((current) => {
        const target = current.find((item) => getSurveyMonumentKey(item) === targetKey)
        if (!target) return current
        return [
          target,
          ...current.filter((item) => getSurveyMonumentKey(item) !== targetKey)
        ]
      })
      setActiveAssignSurveyKey(targetKey)
      setStatus(validationLabel)
    } catch (err) {
      const message = err instanceof Error ? err.message : m.autoTargetFailed
      const validationLabel = `${m.autoTargetFailed} ${message || ''}`.trim()
      setStatus(validationLabel)
    } finally {
      setAutoSettingTarget(false)
    }
  }, [
    assignSurveyMonuments,
    canMergeSurveyMonuments,
    m.autoTargetFailed,
    m.autoTargetMultipleJoeIds,
    m.autoTargetNoIds,
    m.autoTargetSetByDenId,
    m.autoTargetSetByJoeId,
    m.mergeRequiresMultipleMonuments
  ])

  const buildTargetMergePlan = React.useCallback(async (): Promise<TargetMergePlan | null> => {
    if (!canMergeSurveyMonuments) {
      setStatus(m.mergeRequiresMultipleMonuments)
      return null
    }

    const target = assignSurveyMonuments[0]
    const sources = assignSurveyMonuments.slice(1)
    const validations: FinalizeValidationMessage[] = []
    if (!target.globalId) {
      validations.push({ severity: 'error', pointId: target.pointNumber, message: m.targetMergeMissingTargetGlobalId })
    }

    sources.forEach((source) => {
      if (!source.globalId) {
        validations.push({ severity: 'error', pointId: source.pointNumber, message: m.targetMergeMissingSourceGlobalId })
      }
      if (source.objectId === undefined || source.objectId === null || source.objectId === '') {
        validations.push({ severity: 'error', pointId: source.pointNumber, message: m.targetMergeMissingSourceObjectId })
      }
    })

    const historiesBySourceGlobalId = await queryMergeHistoryBySourceGlobalIds(sources)
    const sourceRows = sources.map((source) => {
      const historyRows = historiesBySourceGlobalId.get(normalizeGuidKey(source.globalId)) || []
      if (historyRows.length === 0) {
        validations.push({ severity: 'warning', pointId: source.pointNumber, message: m.targetMergeZeroHistory })
      }
      return {
        monument: source,
        historyRows
      }
    })

    const historyUpdateCount = sourceRows.reduce((total, row) => total + row.historyRows.length, 0)
    const plan = {
      target,
      sources: sourceRows,
      validations,
      canCommit: validations.every((validation) => validation.severity !== 'error'),
      historyUpdateCount,
      sourceDeleteCount: sources.length,
      zeroHistoryCount: sourceRows.filter((row) => row.historyRows.length === 0).length
    }
    return plan
  }, [
    assignSurveyMonuments,
    canMergeSurveyMonuments,
    m.mergeRequiresMultipleMonuments,
    m.targetMergeMissingSourceGlobalId,
    m.targetMergeMissingSourceObjectId,
    m.targetMergeMissingTargetGlobalId,
    m.targetMergeZeroHistory,
    queryMergeHistoryBySourceGlobalIds
  ])

  const openTargetMergeReview = React.useCallback(async () => {
    setBuildingTargetMergePlan(true)
    setTargetMergeModalOpen(true)
    try {
      const plan = await buildTargetMergePlan()
      setTargetMergePlan(plan)
      if (plan) setStatus(`${m.targetMergePlanReady}: ${plan.sourceDeleteCount} ${m.surveyMonumentsLayer}, ${plan.historyUpdateCount} ${m.historyCountLabel}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : m.targetMergePlanFailed
      setTargetMergePlan(null)
      setStatus(`${m.targetMergePlanFailed} ${message || ''}`.trim())
    } finally {
      setBuildingTargetMergePlan(false)
    }
  }, [buildTargetMergePlan, m.historyCountLabel, m.surveyMonumentsLayer, m.targetMergePlanFailed, m.targetMergePlanReady])

  const applyTargetMergePlan = React.useCallback(async () => {
    if (!targetMergePlan || !targetMergePlan.canCommit) return
    const targetGlobalId = formatGuidForEdit(targetMergePlan.target.globalId)
    const historyRows = targetMergePlan.sources.flatMap((row) => row.historyRows)
    const sourceObjectIds = targetMergePlan.sources.map((row) => row.monument.objectId)

    setApplyingTargetMerge(true)
    try {
      const historyLayer = await getMonumentHistoryLayer()
      const surveyLayer = await getSurveyMonumentsLayer()
      const [Graphic] = await loadArcGISJSAPIModules(['esri/Graphic'])

      if (historyRows.length > 0) {
        setStatus(m.targetMergeApplyingHistory)
        const updateResults = await historyLayer.applyEdits({
          updateFeatures: historyRows.map((row) => ({
            attributes: {
              OBJECTID: row.objectId,
              [historyMonumentGlobalIdField]: targetGlobalId
            }
          }))
        }, getApplyEditsOptions(historyLayer))
        const updateError = getFailedEditResult(updateResults, 'updateFeatureResults', m.targetMergeFailed)
        if (updateError) throw updateError
      }

      setStatus(m.targetMergeDeletingSources)
      const deleteResults = await surveyLayer.applyEdits({
        deleteFeatures: getDeleteGraphics(Graphic, surveyLayer, sourceObjectIds)
      }, getApplyEditsOptions(surveyLayer))
      const deleteError = getFailedEditResult(deleteResults, 'deleteFeatureResults', m.targetMergeFailed)
      if (deleteError) throw deleteError

      setStatus(`${m.targetMergeComplete}: ${targetMergePlan.sourceDeleteCount} ${m.surveyMonumentsLayer}, ${targetMergePlan.historyUpdateCount} ${m.historyCountLabel}`)
      setTargetMergeModalOpen(false)
      setAssignSurveyMonuments([targetMergePlan.target])
      setActiveAssignSurveyKey(getSurveyMonumentKey(targetMergePlan.target))
      setAssignHistoryItems([])
      await renderAssignSurveyMonumentGraphics([targetMergePlan.target], getSurveyMonumentKey(targetMergePlan.target))
    } catch (err) {
      const message = err instanceof Error ? err.message : m.targetMergeFailed
      setStatus(`${m.targetMergeFailed} ${message || ''}`.trim())
    } finally {
      setApplyingTargetMerge(false)
    }
  }, [
    getMonumentHistoryLayer,
    getSurveyMonumentsLayer,
    historyMonumentGlobalIdField,
    m.historyCountLabel,
    m.surveyMonumentsLayer,
    m.targetMergeApplyingHistory,
    m.targetMergeComplete,
    m.targetMergeDeletingSources,
    m.targetMergeFailed,
    renderAssignSurveyMonumentGraphics,
    targetMergePlan
  ])

  const buildRemoveMonumentsPlan = React.useCallback(async (): Promise<RemoveMonumentsPlan | null> => {
    if (assignSurveyMonuments.length === 0) {
      setStatus(m.deleteMonumentsPlanEmpty)
      return null
    }

    const validations: FinalizeValidationMessage[] = []
    assignSurveyMonuments.forEach((monument) => {
      if (!monument.globalId) {
        validations.push({ severity: 'error', pointId: monument.pointNumber, message: m.deleteMonumentsMissingGlobalId })
      }
      if (monument.objectId === undefined || monument.objectId === null || monument.objectId === '') {
        validations.push({ severity: 'error', pointId: monument.pointNumber, message: m.deleteMonumentsMissingObjectId })
      }
    })

    const historiesByGlobalId = await queryMergeHistoryBySourceGlobalIds(assignSurveyMonuments)
    const rows = assignSurveyMonuments.map((monument) => {
      const historyRows = historiesByGlobalId.get(normalizeGuidKey(monument.globalId)) || []
      if (historyRows.length === 0) {
        validations.push({ severity: 'warning', pointId: monument.pointNumber, message: m.deleteMonumentsNoHistory })
      }
      return {
        monument,
        historyRows
      }
    })
    const historyDeleteCount = rows.reduce((total, row) => total + row.historyRows.length, 0)

    return {
      rows,
      validations,
      canCommit: validations.every((validation) => validation.severity !== 'error'),
      surveyDeleteCount: rows.length,
      historyDeleteCount,
      zeroHistoryCount: rows.filter((row) => row.historyRows.length === 0).length
    }
  }, [
    assignSurveyMonuments,
    m.deleteMonumentsMissingGlobalId,
    m.deleteMonumentsMissingObjectId,
    m.deleteMonumentsNoHistory,
    m.deleteMonumentsPlanEmpty,
    queryMergeHistoryBySourceGlobalIds
  ])

  const openRemoveMonumentsReview = React.useCallback(async () => {
    setBuildingRemoveMonumentsPlan(true)
    setRemoveMonumentsModalOpen(true)
    try {
      const plan = await buildRemoveMonumentsPlan()
      setRemoveMonumentsPlan(plan)
      if (plan) setStatus(`${m.deleteMonumentsPlanReady}: ${plan.surveyDeleteCount} ${m.surveyMonumentsLayer}, ${plan.historyDeleteCount} ${m.historyCountLabel}`)
    } catch (err) {
      setRemoveMonumentsPlan(null)
      setStatus(getOperationErrorStatus(m.deleteMonumentsFailed, err))
    } finally {
      setBuildingRemoveMonumentsPlan(false)
    }
  }, [
    buildRemoveMonumentsPlan,
    m.deleteMonumentsFailed,
    m.deleteMonumentsPlanReady,
    m.historyCountLabel,
    m.surveyMonumentsLayer
  ])

  const applyRemoveMonumentsPlan = React.useCallback(async () => {
    if (!removeMonumentsPlan || !removeMonumentsPlan.canCommit) return

    setApplyingRemoveMonuments(true)
    const rollbackSteps: Array<() => Promise<void>> = []
    try {
      const historyLayer = await getMonumentHistoryLayer()
      const surveyLayer = await getSurveyMonumentsLayer()
      const [Graphic] = await loadArcGISJSAPIModules(['esri/Graphic'])
      const historyRows = removeMonumentsPlan.rows.flatMap((row) => row.historyRows)
      const surveyObjectIds = removeMonumentsPlan.rows.map((row) => row.monument.objectId)
      const originalHistoryFeatures = historyRows.length > 0
        ? await queryLayerFeaturesByObjectIds(historyLayer, historyRows.map((row) => row.objectId), false)
        : []
      const originalSurveyFeatures = await queryLayerFeaturesByObjectIds(surveyLayer, surveyObjectIds)
      const getFeatureObjectId = (layer: any, feature: any) =>
        getAttributeValue(feature?.attributes || {}, layer?.objectIdField || 'OBJECTID')
      const getRemainingObjectIds = async (layer: any, objectIds: Array<string | number>) =>
        (await queryLayerFeaturesByObjectIds(layer, objectIds, false))
          .map((feature: any) => getFeatureObjectId(layer, feature))
          .filter((objectId: any) => objectId !== undefined && objectId !== null)
      const getDeletedFeatures = (layer: any, features: any[], remainingObjectIds: Array<string | number>) => {
        const remainingKeys = new Set(remainingObjectIds.map((objectId) => String(objectId)))
        return features.filter((feature: any) => !remainingKeys.has(String(getFeatureObjectId(layer, feature))))
      }

      if (historyRows.length > 0) {
        setStatus(m.deleteMonumentsDeletingHistory)
        const historyObjectIds = historyRows.map((row) => row.objectId)
        const historyDeleteResults = await historyLayer.applyEdits({
          deleteFeatures: getDeleteGraphics(Graphic, historyLayer, historyObjectIds)
        }, getApplyEditsOptions(historyLayer))
        const historyDeleteError = getFailedEditResult(historyDeleteResults, 'deleteFeatureResults', m.deleteMonumentsFailed)
        if (historyDeleteError) throw historyDeleteError
        const remainingHistoryObjectIds = await getRemainingObjectIds(historyLayer, historyObjectIds)
        const deletedHistoryFeatures = getDeletedFeatures(historyLayer, originalHistoryFeatures, remainingHistoryObjectIds)
        rollbackSteps.push(async () => {
          if (deletedHistoryFeatures.length === 0) return
          await historyLayer.applyEdits({
            addFeatures: deletedHistoryFeatures.map((feature: any) => ({
              attributes: getRollbackAddAttributes(feature.attributes || {}, historyLayer)
            }))
          }, getApplyEditsOptions(historyLayer, { globalIdUsed: true }))
        })
        if (remainingHistoryObjectIds.length > 0) {
          throw new Error(`${m.deleteMonumentsVerifyFailed} ${remainingHistoryObjectIds.join(', ')}`)
        }
      }

      setStatus(m.deleteMonumentsDeletingSurvey)
      const surveyDeleteResults = await surveyLayer.applyEdits({
        deleteFeatures: getDeleteGraphics(Graphic, surveyLayer, surveyObjectIds)
      }, getApplyEditsOptions(surveyLayer))
      const surveyDeleteError = getFailedEditResult(surveyDeleteResults, 'deleteFeatureResults', m.deleteMonumentsFailed)
      if (surveyDeleteError) throw surveyDeleteError
      const remainingSurveyObjectIds = await getRemainingObjectIds(surveyLayer, surveyObjectIds)
      const deletedSurveyFeatures = getDeletedFeatures(surveyLayer, originalSurveyFeatures, remainingSurveyObjectIds)
      rollbackSteps.push(async () => {
        if (deletedSurveyFeatures.length === 0) return
        await surveyLayer.applyEdits({
          addFeatures: deletedSurveyFeatures.map((feature: any) => ({
            geometry: feature.geometry,
            attributes: getRollbackAddAttributes(feature.attributes || {}, surveyLayer)
          }))
        }, getApplyEditsOptions(surveyLayer, { globalIdUsed: true }))
      })
      if (remainingSurveyObjectIds.length > 0) {
        throw new Error(`${m.deleteMonumentsVerifyFailed} ${remainingSurveyObjectIds.join(', ')}`)
      }

      await refreshDeleteMonumentViews()
      setStatus(`${m.deleteMonumentsComplete}: ${removeMonumentsPlan.surveyDeleteCount} ${m.surveyMonumentsLayer}, ${removeMonumentsPlan.historyDeleteCount} ${m.historyCountLabel}`)
      setRemoveMonumentsModalOpen(false)
      setRemoveMonumentsPlan(null)
      setAssignSurveyMonuments([])
      setActiveAssignSurveyKey('')
      setAssignHistoryItems([])
      setActiveAssignHistoryKey('')
      monumentGraphicsLayerRef.current?.removeAll?.()
    } catch (err) {
      try {
        for (const rollbackStep of [...rollbackSteps].reverse()) {
          await rollbackStep()
        }
      } catch (rollbackErr) {
        setStatus(getOperationErrorStatus(m.deleteMonumentsRollbackFailed, rollbackErr))
        return
      }
      const rollbackStatus = rollbackSteps.length > 0 ? ` ${m.deleteMonumentsRollbackComplete}` : ''
      setStatus(`${getOperationErrorStatus(m.deleteMonumentsFailed, err)}${rollbackStatus}`.trim())
    } finally {
      setApplyingRemoveMonuments(false)
    }
  }, [
    getMonumentHistoryLayer,
    getSurveyMonumentsLayer,
    m.deleteMonumentsComplete,
    m.deleteMonumentsDeletingHistory,
    m.deleteMonumentsDeletingSurvey,
    m.deleteMonumentsFailed,
    m.deleteMonumentsRollbackComplete,
    m.deleteMonumentsRollbackFailed,
    m.deleteMonumentsVerifyFailed,
    m.historyCountLabel,
    m.surveyMonumentsLayer,
    refreshDeleteMonumentViews,
    removeMonumentsPlan
  ])

  const queryMergeSurveyGeometriesByObjectIds = React.useCallback(async (monuments: SurveyMonumentSummary[]) => {
    const objectIds = Array.from(new Set(monuments
      .map((monument) => typeof monument.objectId === 'number' ? monument.objectId : Number(monument.objectId))
      .filter((objectId) => Number.isFinite(objectId))))
    const featuresByObjectId = new Map<string, { attributes: { [key: string]: any }, geometry?: any, spatialReference?: any }>()
    if (objectIds.length === 0) return featuresByObjectId

    for (let offset = 0; offset < objectIds.length; offset += MONUMENT_GLOBAL_ID_QUERY_CHUNK_SIZE) {
      const ids = objectIds.slice(offset, offset + MONUMENT_GLOBAL_ID_QUERY_CHUNK_SIZE)
      const query = new URL(`${surveyMonumentsUrl}/query`)
      query.search = new URLSearchParams({
        objectIds: ids.join(','),
        outFields: 'OBJECTID',
        returnGeometry: 'true',
        f: 'json'
      }).toString()

      const response = await fetch(query.toString())
      const data = await response.json() as QueryResponse
      if (!response.ok || data.error) throw new Error(data.error?.message || response.statusText)

      ;(data.features || []).forEach((feature) => {
        const attributes = feature.attributes || {}
        const objectId = getAttributeValue(attributes, 'OBJECTID')
        if (objectId === undefined || objectId === null) return
        featuresByObjectId.set(String(objectId), {
          attributes,
          geometry: feature.geometry,
          spatialReference: data.spatialReference
        })
      })
    }

    return featuresByObjectId
  }, [surveyMonumentsUrl])

  const buildMeanMergePlan = React.useCallback(async (): Promise<MeanMergePlan | null> => {
    const targetPlan = await buildTargetMergePlan()
    if (!targetPlan) return null

    const selectedMonuments = [targetPlan.target, ...targetPlan.sources.map((row) => row.monument)]
    const featuresByObjectId = await queryMergeSurveyGeometriesByObjectIds(selectedMonuments)
    const pointGeometries = selectedMonuments.map((monument) => {
      const feature = featuresByObjectId.get(String(monument.objectId))
      const geometry = feature?.geometry
      if (!geometry) {
        targetPlan.validations.push({ severity: 'error', pointId: monument.pointNumber, message: m.meanMergeMissingGeometry })
        return null
      }
      const x = Number(geometry.x)
      const y = Number(geometry.y)
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        targetPlan.validations.push({ severity: 'error', pointId: monument.pointNumber, message: m.meanMergeInvalidGeometry })
        return null
      }
      return {
        monument,
        geometry,
        x,
        y,
        spatialReference: geometry.spatialReference || feature?.spatialReference
      }
    })

    const usableGeometries = pointGeometries.filter((item): item is NonNullable<typeof item> => !!item)
    const targetGeometry = pointGeometries[0]
    const meanX = usableGeometries.reduce((total, item) => total + item.x, 0) / Math.max(usableGeometries.length, 1)
    const meanY = usableGeometries.reduce((total, item) => total + item.y, 0) / Math.max(usableGeometries.length, 1)
    const meanGeometry = targetGeometry
      ? {
          ...targetGeometry.geometry,
          x: meanX,
          y: meanY,
          spatialReference: targetGeometry.spatialReference || targetGeometry.geometry.spatialReference
        }
      : null

    return {
      ...targetPlan,
      canCommit: targetPlan.validations.every((validation) => validation.severity !== 'error') && !!targetGeometry && !!meanGeometry,
      targetOriginalGeometry: targetGeometry?.geometry,
      meanGeometry,
      meanX,
      meanY,
      targetOriginalX: targetGeometry?.x ?? Number.NaN,
      targetOriginalY: targetGeometry?.y ?? Number.NaN
    }
  }, [
    buildTargetMergePlan,
    m.meanMergeInvalidGeometry,
    m.meanMergeMissingGeometry,
    queryMergeSurveyGeometriesByObjectIds
  ])

  const openMeanMergeReview = React.useCallback(async () => {
    setBuildingMeanMergePlan(true)
    setMeanMergeModalOpen(true)
    try {
      const plan = await buildMeanMergePlan()
      setMeanMergePlan(plan)
      if (plan) setStatus(`${m.meanMergePlanReady}: ${plan.sourceDeleteCount + 1} ${m.surveyMonumentsLayer}, ${plan.historyUpdateCount} ${m.historyCountLabel}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : m.meanMergePlanFailed
      setMeanMergePlan(null)
      setStatus(`${m.meanMergePlanFailed} ${message || ''}`.trim())
    } finally {
      setBuildingMeanMergePlan(false)
    }
  }, [buildMeanMergePlan, m.historyCountLabel, m.meanMergePlanFailed, m.meanMergePlanReady, m.surveyMonumentsLayer])

  const applyMeanMergePlan = React.useCallback(async () => {
    if (!meanMergePlan || !meanMergePlan.canCommit) return
    const targetGlobalId = formatGuidForEdit(meanMergePlan.target.globalId)
    const historyRows = meanMergePlan.sources.flatMap((row) => row.historyRows)
    const sourceObjectIds = meanMergePlan.sources.map((row) => row.monument.objectId)

    setApplyingMeanMerge(true)
    let targetMoved = false
    let historyUpdated = false
    try {
      const historyLayer = await getMonumentHistoryLayer()
      const surveyLayer = await getSurveyMonumentsLayer()
      const [Graphic] = await loadArcGISJSAPIModules(['esri/Graphic'])

      setStatus(m.meanMergeApplyingTarget)
      const targetUpdateResults = await surveyLayer.applyEdits({
        updateFeatures: [{
          attributes: { OBJECTID: meanMergePlan.target.objectId },
          geometry: meanMergePlan.meanGeometry
        }]
      }, getApplyEditsOptions(surveyLayer))
      const targetUpdateError = getFailedEditResult(targetUpdateResults, 'updateFeatureResults', m.meanMergeFailed)
      if (targetUpdateError) throw targetUpdateError
      targetMoved = true

      if (historyRows.length > 0) {
        setStatus(m.targetMergeApplyingHistory)
        const updateResults = await historyLayer.applyEdits({
          updateFeatures: historyRows.map((row) => ({
            attributes: {
              OBJECTID: row.objectId,
              [historyMonumentGlobalIdField]: targetGlobalId
            }
          }))
        }, getApplyEditsOptions(historyLayer))
        const updateError = getFailedEditResult(updateResults, 'updateFeatureResults', m.meanMergeFailed)
        if (updateError) throw updateError
        historyUpdated = true
      }

      setStatus(m.targetMergeDeletingSources)
      const deleteResults = await surveyLayer.applyEdits({
        deleteFeatures: getDeleteGraphics(Graphic, surveyLayer, sourceObjectIds)
      }, getApplyEditsOptions(surveyLayer))
      const deleteError = getFailedEditResult(deleteResults, 'deleteFeatureResults', m.meanMergeFailed)
      if (deleteError) throw deleteError

      const mergedTarget = { ...meanMergePlan.target }
      setStatus(`${m.meanMergeComplete}: ${meanMergePlan.sourceDeleteCount} ${m.surveyMonumentsLayer}, ${meanMergePlan.historyUpdateCount} ${m.historyCountLabel}`)
      setMeanMergeModalOpen(false)
      setAssignSurveyMonuments([mergedTarget])
      setActiveAssignSurveyKey(getSurveyMonumentKey(mergedTarget))
      setAssignHistoryItems([])
      await renderAssignSurveyMonumentGraphics([mergedTarget], getSurveyMonumentKey(mergedTarget))
    } catch (err) {
      if (targetMoved && !historyUpdated) {
        try {
          const surveyLayer = await getSurveyMonumentsLayer()
          const rollbackResults = await surveyLayer.applyEdits({
            updateFeatures: [{
              attributes: { OBJECTID: meanMergePlan.target.objectId },
              geometry: meanMergePlan.targetOriginalGeometry
            }]
          }, getApplyEditsOptions(surveyLayer))
          const rollbackError = getFailedEditResult(rollbackResults, 'updateFeatureResults', m.meanMergeTargetRollbackFailed)
          if (rollbackError) throw rollbackError
        } catch (rollbackErr) {
          const message = rollbackErr instanceof Error ? rollbackErr.message : m.meanMergeTargetRollbackFailed
          setStatus(`${m.meanMergeTargetRollbackFailed} ${message || ''}`.trim())
          return
        }
      }

      const message = err instanceof Error ? err.message : m.meanMergeFailed
      setStatus(`${m.meanMergeFailed} ${message || ''}`.trim())
    } finally {
      setApplyingMeanMerge(false)
    }
  }, [
    getMonumentHistoryLayer,
    getSurveyMonumentsLayer,
    historyMonumentGlobalIdField,
    m.historyCountLabel,
    m.meanMergeApplyingTarget,
    m.meanMergeComplete,
    m.meanMergeFailed,
    m.meanMergeTargetRollbackFailed,
    m.surveyMonumentsLayer,
    m.targetMergeApplyingHistory,
    m.targetMergeDeletingSources,
    meanMergePlan,
    renderAssignSurveyMonumentGraphics
  ])

  const stageMergeAction = async (mergeType: MergeOperationType) => {
    if (mergeType === 'target') {
      await openTargetMergeReview()
      return
    }
    await openMeanMergeReview()
  }

  const resetProjectCsvImport = () => {
    setProjectCsvFile(null)
    setProjectCsvFileName('')
    setNewProjectName('')
    setUseSelectedProjectForCreate(false)
    clearProjectCsvRows()
    if (projectCsvFileInputRef.current) projectCsvFileInputRef.current.value = ''
    setStatus(m.csvImportReset)
  }

  const reprocessProjectCsvImport = () => {
    if (!projectCsvFile) return
    clearProjectCsvRows()
    importProjectCsvFile(projectCsvFile, false).catch(() => undefined)
  }

  const removeCsvProjectRow = (item: CsvProjectRow) => {
    setNewSearchPointRows((current) => current.filter((row) => row.id !== item.id))
    setExistingMonumentRows((current) => current.filter((row) => row.id !== item.id))
    setMultipleMonumentRows((current) => current.filter((row) => row.id !== item.id))
    if (activeNewSearchPointId === item.id) setActiveNewSearchPointId('')
    setStatus(`${m.searchPointRemoved}: ${item.pointNumber}`)
  }

  const buildCreateProjectPlan = React.useCallback((): CreateProjectPlan | null => {
    const projectName = useSelectedProjectForCreate && selectedProject
      ? selectedProject.name
      : newProjectName.trim()
    const sourceRows: Array<{ source: CreateProjectPlanSource, items: CsvProjectRow[] }> = [
      { source: 'new-search-point', items: newSearchPointRows },
      { source: 'existing-monument', items: existingMonumentRows },
      { source: 'multiple-monuments', items: multipleMonumentRows }
    ]
    const rows: CreateProjectPlanRow[] = sourceRows.flatMap(({ source, items }) =>
      items.map((item) => {
        const coordinates = getCsvProjectRowCoordinates(item)
        const display = getCsvProjectRowDisplay(item)
        const missingPointNumber = item.pointNumber === '-'
        const missingCoordinates = !coordinates
        const existingMonument = item.existingMonuments[0]
        const existingPointNumber = existingMonument?.pointNumber === '-' ? '' : existingMonument?.pointNumber.trim()
        const existingPointNumberMatches = source === 'existing-monument' && !!existingMonument && existingPointNumber === item.pointNumber
        const canUpdateExistingPointNumber = source === 'existing-monument' && !!existingMonument && !missingPointNumber && !existingPointNumberMatches
        const action: CreateProjectPlanAction = source === 'existing-monument'
          ? canUpdateExistingPointNumber ? 'update-survey-monument' : 'none'
          : 'create-survey-monument'
        const severity: CreateProjectPlanRow['severity'] = missingPointNumber || missingCoordinates
          ? 'error'
            : source === 'multiple-monuments'
              ? 'warning'
              : action === 'update-survey-monument' || action === 'create-survey-monument'
                ? 'ready'
                : 'info'

        return {
          id: item.id,
          source,
          pointNumber: item.pointNumber,
          description: display.description,
          x: coordinates?.x,
          y: coordinates?.y,
          z: coordinates?.z,
          surveyObjectId: existingMonument?.objectId,
          currentPointNumber: existingPointNumber || undefined,
          action,
          severity,
          validationLabel: item.validationMessages.join(' | ') || undefined
        }
      })
    )
    if (rows.length === 0) {
      setStatus(m.createProjectPlanEmpty)
      return null
    }
    if (!projectName) {
      rows.unshift({
        id: 'missing-project-name',
        source: 'new-search-point',
        pointNumber: '-',
        description: '-',
        action: 'none',
        severity: 'error'
      })
    }

    const createRows = rows.filter((row) => row.action === 'create-survey-monument' && row.severity !== 'error')
    const updateRows = rows.filter((row) => row.action === 'update-survey-monument' && row.severity !== 'error')
    const errorCount = rows.filter((row) => row.severity === 'error').length
    const warningCount = rows.filter((row) => row.severity === 'warning').length
    return {
      rows,
      createRows,
      updateRows,
      projectName: projectName || '-',
      useSelectedProject: useSelectedProjectForCreate,
      canCommit: errorCount === 0,
      errorCount,
      warningCount
    }
  }, [
    existingMonumentRows,
    m.createProjectPlanEmpty,
    multipleMonumentRows,
    newProjectName,
    newSearchPointRows,
    selectedProject,
    useSelectedProjectForCreate
  ])

  const updateCreateProjectPlanCounts = (plan: CreateProjectPlan): CreateProjectPlan => {
    const createRows = plan.rows.filter((row) => row.action === 'create-survey-monument' && row.severity !== 'error')
    const updateRows = plan.rows.filter((row) => row.action === 'update-survey-monument' && row.severity !== 'error')
    const errorCount = plan.rows.filter((row) => row.severity === 'error').length
    const warningCount = plan.rows.filter((row) => row.severity === 'warning').length
    return {
      ...plan,
      createRows,
      updateRows,
      canCommit: errorCount === 0,
      errorCount,
      warningCount
    }
  }

  const analyzeSelectedProjectBoundary = React.useCallback(async (plan: CreateProjectPlan): Promise<CreateProjectPlan> => {
    if (!plan.useSelectedProject) return plan
    if (!selectedProject) {
      return updateCreateProjectPlanCounts({
        ...plan,
        rows: [{
          id: 'missing-selected-project',
          source: 'new-search-point',
          pointNumber: '-',
          description: '-',
          action: 'none',
          severity: 'error',
          validationLabel: m.selectProjectFirst
        }, ...plan.rows]
      })
    }

    try {
      const projectLayer = await getMonumentProjectsLayer()
      const query = projectLayer.createQuery ? projectLayer.createQuery() : {}
      query.where = getProjectWhere(selectedProject)
      query.outFields = ['OBJECTID']
      query.returnGeometry = true
      query.num = 1
      const result = await projectLayer.queryFeatures(query)
      const projectGeometry = result?.features?.[0]?.geometry
      if (!projectGeometry) throw new Error(m.selectedProjectBoundaryFailed)

      const [Point, geometryEngine] = await loadArcGISJSAPIModules([
        'esri/geometry/Point',
        'esri/geometry/geometryEngine'
      ])

      return updateCreateProjectPlanCounts({
        ...plan,
        rows: plan.rows.map((row) => {
          if (row.severity === 'error' || row.x === undefined || row.y === undefined) return row
          const point = new Point({
            x: row.x,
            y: row.y,
            spatialReference: ORANGE_COUNTY_STATE_PLANE_SPATIAL_REFERENCE
          })
          const insideProject = geometryEngine.contains(projectGeometry, point) || geometryEngine.intersects(projectGeometry, point)
          return {
            ...row,
            severity: insideProject || row.severity === 'warning' ? row.severity : 'warning',
            validationLabel: insideProject ? m.selectedProjectBoundaryInside : m.selectedProjectBoundaryOutside
          }
        })
      })
    } catch {
      return updateCreateProjectPlanCounts({
        ...plan,
        rows: plan.rows.map((row) => ({
          ...row,
          severity: row.severity === 'error' ? row.severity : 'warning',
          validationLabel: row.validationLabel || m.selectedProjectBoundaryFailed
        }))
      })
    }
  }, [getMonumentProjectsLayer, getProjectWhere, m.selectProjectFirst, m.selectedProjectBoundaryFailed, m.selectedProjectBoundaryInside, m.selectedProjectBoundaryOutside, selectedProject])

  const analyzeProjectCsvResults = () => {
    const basePlan = buildCreateProjectPlan()
    setCreateProjectPlan(basePlan)
    const analyzePlan = async () => {
      const plan = basePlan ? await analyzeSelectedProjectBoundary(basePlan) : null
      setCreateProjectPlan(plan)
      if (!plan) return
      setCreateProjectModalOpen(true)
      setStatus(`${m.createProjectPlanReady}: ${plan.createRows.length + plan.updateRows.length}. ${m.errorsLabel}: ${plan.errorCount}. ${m.warningsLabel}: ${plan.warningCount}`)
    }
    analyzePlan().catch((err) => {
      const message = err instanceof Error ? err.message : m.createProjectFailed
      setStatus(message || m.createProjectFailed)
    })
  }

  const getCreateProjectCsvRows = React.useCallback(() => [
    ...newSearchPointRows,
    ...existingMonumentRows,
    ...multipleMonumentRows
  ], [existingMonumentRows, multipleMonumentRows, newSearchPointRows])

  const getFailedEditResult = (results: any, resultKey: string, fallbackMessage: string) => {
    const failedResult = (results?.[resultKey] || []).find((result: any) => result?.error)
    return failedResult ? new Error(getEditErrorMessage(failedResult, fallbackMessage)) : null
  }

  const getEditResultObjectIds = (results: any, resultKey: string) =>
    (results?.[resultKey] || [])
      .map((result: any) => result?.objectId)
      .filter((objectId: any) => objectId !== undefined && objectId !== null)

  const getLayerEditCapabilityIssues = React.useCallback((layer: any, label: string, requirements: { add?: boolean, update?: boolean, delete?: boolean }) => {
    const operations = layer?.capabilities?.operations || {}
    const issues: FinalizeValidationMessage[] = []
    const addIssue = (operationLabel?: string) => {
      issues.push({
        severity: 'error',
        message: `${m.finalizeProjectLayerNotEditable}: ${label}${operationLabel ? ` (${operationLabel})` : ''}`
      })
    }

    if (!layer?.loaded) addIssue('not loaded')
    if (layer?.editingEnabled === false || operations.supportsEditing === false) addIssue()
    if (requirements.add && operations.supportsAdd === false) addIssue('add')
    if (requirements.update && operations.supportsUpdate === false) addIssue('update')
    if (requirements.delete && operations.supportsDelete === false) addIssue('delete')
    return issues
  }, [m.finalizeProjectLayerNotEditable])

  const stageCreateProjectFromCsv = async () => {
    const plan = createProjectPlan || buildCreateProjectPlan()
    if (!plan || !plan.canCommit) {
      setCreateProjectPlan(plan)
      return
    }

    setCreatingProject(true)
    setStatus(m.createProjectApplying)

    const rollbackSteps: Array<() => Promise<void>> = []

    try {
      const surveyLayer = await getSurveyMonumentsLayer()
      const [Graphic] = await loadArcGISJSAPIModules(['esri/Graphic'])
      if (!plan.useSelectedProject) {
        const projectLayer = await getMonumentProjectsLayer()
        const projectGeometry = await getCsvProjectBoundaryPolygon(getCreateProjectCsvRows())
        if (!projectGeometry) throw new Error(m.searchPointInvalidCoordinates)

        const projectResults = await projectLayer.applyEdits({
          addFeatures: [{
            geometry: projectGeometry,
            attributes: {
              [projectDisplayField]: plan.projectName
            }
          }]
        })
        const projectError = getFailedEditResult(projectResults, 'addFeatureResults', m.createProjectFailed)
        if (projectError) throw projectError
        const projectObjectId = projectResults.addFeatureResults?.[0]?.objectId
        if (projectObjectId === undefined || projectObjectId === null) throw new Error(m.createProjectFailed)
        rollbackSteps.push(async () => {
          await projectLayer.applyEdits({
            deleteFeatures: getDeleteGraphics(Graphic, projectLayer, [projectObjectId])
          }, getApplyEditsOptions(projectLayer))
        })
      }

      if (plan.createRows.length > 0) {
        const createFeatures = plan.createRows.map((row) => ({
          geometry: {
            type: 'point',
            x: row.x,
            y: row.y,
            z: row.z,
            spatialReference: ORANGE_COUNTY_STATE_PLANE_SPATIAL_REFERENCE
          },
          attributes: {
            [monumentPointNumberField]: row.pointNumber === '-' ? null : row.pointNumber,
            Description: row.description === '-' ? null : row.description
          }
        }))
        const surveyCreateResults = await surveyLayer.applyEdits({ addFeatures: createFeatures })
        const createdSurveyObjectIds = (surveyCreateResults.addFeatureResults || [])
          .map((result: any) => result?.objectId)
          .filter((objectId: any) => objectId !== undefined && objectId !== null)
        rollbackSteps.push(async () => {
          if (createdSurveyObjectIds.length === 0) return
          await surveyLayer.applyEdits({
            deleteFeatures: getDeleteGraphics(Graphic, surveyLayer, createdSurveyObjectIds)
          }, getApplyEditsOptions(surveyLayer))
        })
        const surveyCreateError = getFailedEditResult(surveyCreateResults, 'addFeatureResults', m.createProjectFailed)
        if (surveyCreateError) throw surveyCreateError
      }

      if (plan.updateRows.length > 0) {
        const updateRows = plan.updateRows.filter((row) => row.surveyObjectId !== undefined && row.surveyObjectId !== null)
        const surveyUpdateResults = await surveyLayer.applyEdits({
          updateFeatures: updateRows.map((row) => ({
            attributes: {
              OBJECTID: row.surveyObjectId,
              [monumentPointNumberField]: row.pointNumber === '-' ? null : row.pointNumber
            }
          }))
        }, getApplyEditsOptions(surveyLayer))
        rollbackSteps.push(async () => {
          if (updateRows.length === 0) return
          await surveyLayer.applyEdits({
            updateFeatures: updateRows.map((row) => ({
              attributes: {
                OBJECTID: row.surveyObjectId,
                [monumentPointNumberField]: row.currentPointNumber || null
              }
            }))
          }, getApplyEditsOptions(surveyLayer))
        })
        const surveyUpdateError = getFailedEditResult(surveyUpdateResults, 'updateFeatureResults', m.createProjectFailed)
        if (surveyUpdateError) throw surveyUpdateError
      }

      setCreateProjectModalOpen(false)
      setStatus(`${plan.useSelectedProject ? m.selectedProjectSearchPointsSuccess : m.createProjectSuccess}: ${plan.projectName}. ${m.surveyMonumentsToCreate}: ${plan.createRows.length}. ${m.surveyMonumentsToUpdate}: ${plan.updateRows.length}`)
      loadProjects().catch(() => undefined)
    } catch (err) {
      try {
        for (const rollbackStep of [...rollbackSteps].reverse()) {
          await rollbackStep()
        }
      } catch (rollbackErr) {
        const message = rollbackErr instanceof Error ? rollbackErr.message : m.createProjectRollbackFailed
        setStatus(`${m.createProjectRollbackFailed} ${message || ''}`.trim())
        return
      }
      const message = err instanceof Error ? err.message : m.createProjectFailed
      setStatus(`${m.createProjectFailed} ${message || ''}`.trim())
    } finally {
      setCreatingProject(false)
    }
  }

  const queryFinalizeHistoryByPointNumbers = React.useCallback(async (
    projectGlobalId: string,
    pointNumbers: string[]
  ) => {
    const uniquePointNumbers = Array.from(new Set(pointNumbers.map((pointNumber) => pointNumber.trim()).filter(Boolean)))
    const historiesByPointNumber = new Map<string, FinalizeHistoryRecord[]>()
    if (!projectGlobalId || uniquePointNumbers.length === 0) return historiesByPointNumber

    for (let offset = 0; offset < uniquePointNumbers.length; offset += MONUMENT_GLOBAL_ID_QUERY_CHUNK_SIZE) {
      const batch = uniquePointNumbers.slice(offset, offset + MONUMENT_GLOBAL_ID_QUERY_CHUNK_SIZE)
      const query = new URL(`${monumentHistoryUrl}/query`)
      query.search = new URLSearchParams({
        where: `${historyProjectGlobalIdField} = '${escapeSqlString(projectGlobalId)}' AND PointNumber IN (${batch.map((pointNumber) => `'${escapeSqlString(pointNumber)}'`).join(',')})`,
        outFields: [
          'OBJECTID',
          'GlobalID',
          historyMonumentGlobalIdField,
          'PointNumber',
          'Remarks'
        ].join(','),
        returnGeometry: 'false',
        resultRecordCount: String(HISTORY_QUERY_LIMIT),
        f: 'json'
      }).toString()

      const response = await fetch(query.toString())
      const data = await response.json() as QueryResponse
      if (!response.ok || data.error) throw new Error(data.error?.message || response.statusText)

      ;(data.features || []).forEach((feature) => {
        const attributes = feature.attributes || {}
        const pointNumber = getStringAttribute(attributes, 'PointNumber')
        if (!pointNumber) return
        const key = pointNumber.trim().toLowerCase()
        historiesByPointNumber.set(key, [
          ...(historiesByPointNumber.get(key) || []),
          {
            objectId: getAttributeValue(attributes, 'OBJECTID'),
            globalId: getStringAttribute(attributes, 'GlobalID'),
            pointGlobalId: getStringAttribute(attributes, historyMonumentGlobalIdField),
            pointNumber,
            remarks: getStringAttribute(attributes, 'Remarks')
          }
        ])
      })
    }

    return historiesByPointNumber
  }, [historyMonumentGlobalIdField, historyProjectGlobalIdField, monumentHistoryUrl])

  const queryFinalizeSurveyMonumentsByGlobalIds = React.useCallback(async (globalIds: string[]) => {
    const uniqueGlobalIds = Array.from(new Set(globalIds.map((globalId) => globalId.trim()).filter(Boolean)))
    const monumentsByGlobalId = new Map<string, FinalizeSurveyMonumentRecord>()
    if (uniqueGlobalIds.length === 0) return monumentsByGlobalId

    for (let offset = 0; offset < uniqueGlobalIds.length; offset += MONUMENT_GLOBAL_ID_QUERY_CHUNK_SIZE) {
      const batch = uniqueGlobalIds.slice(offset, offset + MONUMENT_GLOBAL_ID_QUERY_CHUNK_SIZE)
      const query = new URL(`${surveyMonumentsUrl}/query`)
      query.search = new URLSearchParams({
        where: `${monumentGlobalIdField} IN (${batch.map((globalId) => `'${escapeSqlString(globalId)}'`).join(',')})`,
        outFields: [
          'OBJECTID',
          monumentGlobalIdField,
          monumentPointNumberField
        ].join(','),
        returnGeometry: 'false',
        resultRecordCount: String(HISTORY_QUERY_LIMIT),
        f: 'json'
      }).toString()

      const response = await fetch(query.toString())
      const data = await response.json() as QueryResponse
      if (!response.ok || data.error) throw new Error(data.error?.message || response.statusText)

      ;(data.features || []).forEach((feature) => {
        const attributes = feature.attributes || {}
        const globalId = getStringAttribute(attributes, monumentGlobalIdField)
        if (!globalId) return
        monumentsByGlobalId.set(globalId.trim().toLowerCase(), {
          objectId: getAttributeValue(attributes, 'OBJECTID'),
          globalId,
          pointNumber: getStringAttribute(attributes, monumentPointNumberField)
        })
      })
    }

    return monumentsByGlobalId
  }, [monumentGlobalIdField, monumentPointNumberField, surveyMonumentsUrl])

  const buildFinalizePlan = React.useCallback(async (traverseData: ParsedTraverseData): Promise<FinalizePlan> => {
    const counts = emptyFinalizeCounts()
    const edits: PlannedFinalizeEdit[] = []
    const validations: FinalizeValidationMessage[] = []
    const projectGlobalId = selectedProject?.globalId || ''

    if (!projectGlobalId) {
      validations.push({ severity: 'error', message: m.selectProjectFirst })
      return { edits, validations, counts, canCommit: false, existingTraverseConnections: [] }
    }

    try {
      const [traverseLayer, surveyLayer, historyLayer] = await Promise.all([
        getTraverseConnectionsLayer(),
        getSurveyMonumentsLayer(),
        getMonumentHistoryLayer()
      ])
      validations.push(
        ...getLayerEditCapabilityIssues(traverseLayer, m.traverseConnectionsLayer, { add: true, delete: true }),
        ...getLayerEditCapabilityIssues(surveyLayer, m.surveyMonumentsLayer, { add: true, update: true }),
        ...getLayerEditCapabilityIssues(historyLayer, m.monumentHistoryTable, { add: true, update: true })
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : m.finalizeProjectPreflightFailed
      validations.push({ severity: 'error', message: `${m.finalizeProjectPreflightFailed} ${message || ''}`.trim() })
    }

    traverseData.monuments.forEach((monument) => {
      if (!hasCoordinatePair(monument)) {
        validations.push({
          severity: 'error',
          pointId: monument.pointId,
          message: m.traverseMissingCoordinates
        })
      }
    })
    traverseData.connections.forEach((connection) => {
      if (connection.distance === undefined || connection.direction === undefined) {
        validations.push({
          severity: 'warning',
          pointId: `${connection.fromPointNum}-${connection.toPointNum}`,
          message: m.traverseConnectionMissingCoordinates
        })
      }
    })

    const historiesByPointNumber = await queryFinalizeHistoryByPointNumbers(
      projectGlobalId,
      traverseData.monuments.map((monument) => monument.pointId)
    )
    const historyPointGlobalIds = Array.from(historiesByPointNumber.values())
      .flat()
      .map((history) => history.pointGlobalId)
      .filter(Boolean)
    const surveyMonumentsByGlobalId = await queryFinalizeSurveyMonumentsByGlobalIds(historyPointGlobalIds)
    const existingTraverseConnections = await queryExistingTraverseConnections(projectGlobalId)

    existingTraverseConnections.forEach((connection) => {
      edits.push({
        kind: 'delete-traverse-connection',
        label: `${m.finalizeDeleteTraverseConnection}: ${connection.objectId}`,
        objectId: connection.objectId
      })
      countFinalizeEdit(counts, 'delete-traverse-connection')
    })

    traverseData.monuments.forEach((monument) => {
      const historyRecords = historiesByPointNumber.get(monument.pointId.trim().toLowerCase()) || []
      if (historyRecords.length > 1) {
        validations.push({
          severity: 'warning',
          pointId: monument.pointId,
          message: m.finalizeDuplicateHistory
        })
      }

      const historyUpdateAttributes = {
        StdDevN: monument.stdDevN,
        StdDevE: monument.stdDevE,
        StdDevElev: monument.stdDevElev,
        FixedStation: monument.fixedStation ? 1 : 0,
        XCoordinate: monument.easting,
        YCoordinate: monument.northing,
        ProjectGlobalID: projectGlobalId
      }
      const historyCreateAttributes = {
        ...historyUpdateAttributes,
        PointNumber: monument.pointId,
        Remarks: monument.description
      }
      const geometry = hasCoordinatePair(monument)
        ? {
            type: 'point',
            x: monument.easting,
            y: monument.northing,
            spatialReference: ORANGE_COUNTY_STATE_PLANE_SPATIAL_REFERENCE
          }
        : undefined

      if (historyRecords.length > 0) {
        historyRecords.forEach((history) => {
          edits.push({
            kind: 'update-history',
            label: `${m.finalizeUpdateHistory}: ${monument.pointId}`,
            pointId: monument.pointId,
            objectId: history.objectId,
            globalId: history.globalId,
            attributes: {
              ...historyUpdateAttributes,
              Remarks: appendDelimitedText(history.remarks, monument.description)
            }
          })
          countFinalizeEdit(counts, 'update-history')
        })
        const relatedHistory = historyRecords.find((history) => history.pointGlobalId) || historyRecords[0]
        const relatedSurveyMonument = relatedHistory.pointGlobalId
          ? surveyMonumentsByGlobalId.get(relatedHistory.pointGlobalId.trim().toLowerCase())
          : null
        if (relatedSurveyMonument && geometry) {
          edits.push({
            kind: 'update-survey-monument',
            label: `${m.finalizeUpdateSurveyMonument}: ${monument.pointId}`,
            pointId: monument.pointId,
            objectId: relatedSurveyMonument.objectId,
            globalId: relatedSurveyMonument.globalId,
            geometry
          })
          countFinalizeEdit(counts, 'update-survey-monument')
        } else if (geometry) {
          edits.push({
            kind: 'create-survey-monument',
            label: `${m.finalizeCreateSurveyMonument}: ${monument.pointId}`,
            pointId: monument.pointId,
            attributes: { [monumentPointNumberField]: monument.pointId },
            geometry
          })
          edits.push({
            kind: 'backfill-history-relationship',
            label: `${m.finalizeBackfillHistory}: ${monument.pointId}`,
            pointId: monument.pointId,
            objectId: relatedHistory.objectId
          })
          countFinalizeEdit(counts, 'create-survey-monument')
          countFinalizeEdit(counts, 'backfill-history-relationship')
        }
      } else {
        edits.push({
          kind: 'create-history',
          label: `${m.finalizeCreateHistory}: ${monument.pointId}`,
          pointId: monument.pointId,
          attributes: historyCreateAttributes
        })
        countFinalizeEdit(counts, 'create-history')
        if (geometry) {
          edits.push({
            kind: 'create-survey-monument',
            label: `${m.finalizeCreateSurveyMonument}: ${monument.pointId}`,
            pointId: monument.pointId,
            attributes: { [monumentPointNumberField]: monument.pointId },
            geometry
          })
          edits.push({
            kind: 'backfill-history-relationship',
            label: `${m.finalizeBackfillHistory}: ${monument.pointId}`,
            pointId: monument.pointId
          })
          countFinalizeEdit(counts, 'create-survey-monument')
          countFinalizeEdit(counts, 'backfill-history-relationship')
        }
      }
    })

    traverseData.connections.forEach((connection) => {
      edits.push({
        kind: 'create-traverse-connection',
        label: `${m.finalizeCreateTraverseConnection}: ${connection.fromPointNum}-${connection.toPointNum}`,
        pointId: `${connection.fromPointNum}-${connection.toPointNum}`,
        geometry: connection.fromPointE !== undefined &&
          connection.fromPointN !== undefined &&
          connection.toPointE !== undefined &&
          connection.toPointN !== undefined
          ? {
              type: 'polyline',
              paths: [[
                [connection.fromPointE, connection.fromPointN],
                [connection.toPointE, connection.toPointN]
              ]],
              spatialReference: ORANGE_COUNTY_STATE_PLANE_SPATIAL_REFERENCE
            }
          : undefined,
        attributes: {
          [traverseProjectGlobalIdField]: projectGlobalId,
          [traverseFromPointNumberField]: connection.fromPointNum,
          [traverseToPointNumberField]: connection.toPointNum,
          FromPointN: connection.fromPointN,
          FromPointE: connection.fromPointE,
          ToPointN: connection.toPointN,
          ToPointE: connection.toPointE,
          Distance: connection.distance,
          Direction: connection.direction
        }
      })
      countFinalizeEdit(counts, 'create-traverse-connection')
    })

    validations.push({
      severity: 'info',
      message: `${m.finalizeDryRunOnly}: ${traverseConnectionsUrl}`
    })

    return {
      edits,
      validations,
      counts,
      canCommit: validations.every((validation) => validation.severity !== 'error'),
      existingTraverseConnections
    }
  }, [
    m.finalizeBackfillHistory,
    m.finalizeCreateHistory,
    m.finalizeCreateSurveyMonument,
    m.finalizeCreateTraverseConnection,
    m.finalizeDeleteTraverseConnection,
    m.finalizeDryRunOnly,
    m.finalizeDuplicateHistory,
    m.finalizeProjectPreflightFailed,
    m.finalizeUpdateHistory,
    m.finalizeUpdateSurveyMonument,
    m.monumentHistoryTable,
    m.selectProjectFirst,
    m.surveyMonumentsLayer,
    m.traverseConnectionsLayer,
    m.traverseConnectionMissingCoordinates,
    m.traverseMissingCoordinates,
    getLayerEditCapabilityIssues,
    getMonumentHistoryLayer,
    getSurveyMonumentsLayer,
    getTraverseConnectionsLayer,
    monumentPointNumberField,
    queryExistingTraverseConnections,
    queryFinalizeHistoryByPointNumbers,
    queryFinalizeSurveyMonumentsByGlobalIds,
    selectedProject?.globalId,
    traverseFromPointNumberField,
    traverseProjectGlobalIdField,
    traverseToPointNumberField,
    traverseConnectionsUrl
  ])

  const applyFinalizeProjectEdits = React.useCallback(async () => {
    if (!finalizePlan || !finalizePlan.canCommit || !selectedProject) {
      setStatus(m.finalizePlanEmpty)
      return
    }

    const traverseRollbackSteps: Array<() => Promise<void>> = []
    const surveyRollbackSteps: Array<() => Promise<void>> = []
    let historyTableTouched = false
    let finalizePhase: 'traverse' | 'survey' | 'history' = 'traverse'

    setFinalizingProject(true)
    setStatus(m.finalizeProjectApplying)
    setFinalizeConfirmOpen(false)

    try {
      const traverseLayer = await getTraverseConnectionsLayer()
      const surveyLayer = await getSurveyMonumentsLayer()
      const historyLayer = await getMonumentHistoryLayer()
      const [Graphic] = await loadArcGISJSAPIModules(['esri/Graphic'])

      const deleteTraverseEdits = finalizePlan.edits.filter((edit) => edit.kind === 'delete-traverse-connection' && edit.objectId !== undefined)
      const createTraverseEdits = finalizePlan.edits.filter((edit) => edit.kind === 'create-traverse-connection' && edit.geometry)
      const updateSurveyEdits = finalizePlan.edits.filter((edit) => edit.kind === 'update-survey-monument' && edit.objectId !== undefined && edit.geometry)
      const createSurveyEdits = finalizePlan.edits.filter((edit) => edit.kind === 'create-survey-monument' && edit.geometry)
      const updateHistoryEdits = finalizePlan.edits.filter((edit) => edit.kind === 'update-history' && edit.objectId !== undefined)
      const createHistoryEdits = finalizePlan.edits.filter((edit) => edit.kind === 'create-history')
      const backfillHistoryEdits = finalizePlan.edits.filter((edit) => edit.kind === 'backfill-history-relationship')

      if (deleteTraverseEdits.length > 0 || createTraverseEdits.length > 0) {
        setStatus(m.finalizeProjectReplacingTraverse)
      }

      if (deleteTraverseEdits.length > 0) {
        const deleteObjectIds = deleteTraverseEdits.map((edit) => edit.objectId as string | number)
        const originalTraverseFeatures = await queryLayerFeaturesByObjectIds(traverseLayer, deleteObjectIds)
        const deleteResults = await traverseLayer.applyEdits({
          deleteFeatures: getDeleteGraphics(Graphic, traverseLayer, deleteObjectIds)
        }, getApplyEditsOptions(traverseLayer))
        const deleteError = getFailedEditResult(deleteResults, 'deleteFeatureResults', m.finalizeProjectFailed)
        if (deleteError) throw deleteError
        traverseRollbackSteps.push(async () => {
          if (originalTraverseFeatures.length === 0) return
          await traverseLayer.applyEdits({
            addFeatures: originalTraverseFeatures.map((feature: any) => ({
              geometry: feature.geometry,
              attributes: stripSystemEditAttributes(feature.attributes || {}, traverseLayer)
            }))
          }, getApplyEditsOptions(traverseLayer))
        })
      }

      if (createTraverseEdits.length > 0) {
        const createResults = await traverseLayer.applyEdits({
          addFeatures: createTraverseEdits.map((edit) => ({
            geometry: edit.geometry,
            attributes: edit.attributes || {}
          }))
        }, getApplyEditsOptions(traverseLayer))
        const createError = getFailedEditResult(createResults, 'addFeatureResults', m.finalizeProjectFailed)
        if (createError) throw createError
        const createdObjectIds = getEditResultObjectIds(createResults, 'addFeatureResults')
        traverseRollbackSteps.push(async () => {
          if (createdObjectIds.length === 0) return
          await traverseLayer.applyEdits({
            deleteFeatures: getDeleteGraphics(Graphic, traverseLayer, createdObjectIds)
          }, getApplyEditsOptions(traverseLayer))
        })
      }

      finalizePhase = 'survey'

      if (updateSurveyEdits.length > 0 || createSurveyEdits.length > 0) {
        setStatus(m.finalizeProjectUpdatingSurvey)
      }

      if (updateSurveyEdits.length > 0) {
        const updateObjectIds = updateSurveyEdits.map((edit) => edit.objectId as string | number)
        const originalSurveyFeatures = await queryLayerFeaturesByObjectIds(surveyLayer, updateObjectIds)
        const updateResults = await surveyLayer.applyEdits({
          updateFeatures: updateSurveyEdits.map((edit) => ({
            geometry: edit.geometry,
            attributes: { OBJECTID: edit.objectId }
          }))
        }, getApplyEditsOptions(surveyLayer))
        const updateError = getFailedEditResult(updateResults, 'updateFeatureResults', m.finalizeProjectFailed)
        if (updateError) throw updateError
        surveyRollbackSteps.push(async () => {
          if (originalSurveyFeatures.length === 0) return
          await surveyLayer.applyEdits({
            updateFeatures: originalSurveyFeatures.map((feature: any) => ({
              geometry: feature.geometry,
              attributes: {
                ...(feature.attributes || {}),
                OBJECTID: getAttributeValue(feature.attributes || {}, 'OBJECTID')
              }
            }))
          }, getApplyEditsOptions(surveyLayer))
        })
      }

      const createdSurveyGlobalIdsByPointId = new Map<string, string>()
      if (createSurveyEdits.length > 0) {
        const createResults = await surveyLayer.applyEdits({
          addFeatures: createSurveyEdits.map((edit) => ({
            geometry: edit.geometry,
            attributes: edit.attributes || {}
          }))
        }, getApplyEditsOptions(surveyLayer))
        const createError = getFailedEditResult(createResults, 'addFeatureResults', m.finalizeProjectFailed)
        if (createError) throw createError
        const createdObjectIds = getEditResultObjectIds(createResults, 'addFeatureResults')
        surveyRollbackSteps.push(async () => {
          if (createdObjectIds.length === 0) return
          await surveyLayer.applyEdits({
            deleteFeatures: getDeleteGraphics(Graphic, surveyLayer, createdObjectIds)
          }, getApplyEditsOptions(surveyLayer))
        })

        const createdSurveyFeatures = await queryLayerFeaturesByObjectIds(surveyLayer, createdObjectIds, false)
        createdSurveyFeatures.forEach((feature: any) => {
          const attributes = feature.attributes || {}
          const pointNumber = getStringAttribute(attributes, monumentPointNumberField)
          const globalId = getStringAttribute(attributes, monumentGlobalIdField)
          if (pointNumber && globalId) createdSurveyGlobalIdsByPointId.set(pointNumber.trim().toLowerCase(), globalId)
        })
      }

      finalizePhase = 'history'

      if (updateHistoryEdits.length > 0 || createHistoryEdits.length > 0 || backfillHistoryEdits.length > 0) {
        setStatus(m.finalizeProjectUpdatingHistory)
      }

      const createdHistoryObjectIdsByPointId = new Map<string, number | string>()
      if (updateHistoryEdits.length > 0) {
        historyTableTouched = true
        const updateResults = await historyLayer.applyEdits({
          updateFeatures: updateHistoryEdits.map((edit) => ({
            attributes: {
              ...(edit.attributes || {}),
              OBJECTID: edit.objectId
            }
          }))
        }, getApplyEditsOptions(historyLayer))
        const updateError = getFailedEditResult(updateResults, 'updateFeatureResults', m.finalizeProjectFailed)
        if (updateError) throw updateError
      }

      if (createHistoryEdits.length > 0) {
        historyTableTouched = true
        const createResults = await historyLayer.applyEdits({
          addFeatures: createHistoryEdits.map((edit) => ({
            attributes: edit.attributes || {}
          }))
        }, getApplyEditsOptions(historyLayer))
        const createError = getFailedEditResult(createResults, 'addFeatureResults', m.finalizeProjectFailed)
        if (createError) throw createError
        ;(createResults.addFeatureResults || []).forEach((result: any, index: number) => {
          const pointId = createHistoryEdits[index]?.pointId
          if (pointId && result?.objectId !== undefined && result?.objectId !== null) {
            createdHistoryObjectIdsByPointId.set(pointId.trim().toLowerCase(), result.objectId)
          }
        })
      }

      const backfillUpdates = backfillHistoryEdits.map((edit) => {
        const pointKey = (edit.pointId || '').trim().toLowerCase()
        const historyObjectId = edit.objectId ?? createdHistoryObjectIdsByPointId.get(pointKey)
        const surveyGlobalId = createdSurveyGlobalIdsByPointId.get(pointKey)
        if (historyObjectId === undefined || historyObjectId === null || !surveyGlobalId) return null
        return {
          attributes: {
            OBJECTID: historyObjectId,
            [historyMonumentGlobalIdField]: formatGuidForEdit(surveyGlobalId)
          }
        }
      }).filter(Boolean)

      if (backfillUpdates.length > 0) {
        historyTableTouched = true
        const backfillResults = await historyLayer.applyEdits({
          updateFeatures: backfillUpdates
        }, getApplyEditsOptions(historyLayer))
        const backfillError = getFailedEditResult(backfillResults, 'updateFeatureResults', m.finalizeProjectFailed)
        if (backfillError) throw backfillError
      }

      setStatus(`${m.finalizeProjectComplete}: ${finalizePlan.edits.length} ${m.plannedEditsLabel}`)
      traversePreviewGraphicsLayerRef.current?.removeAll?.()
      setValidationModalOpen(false)
      setFinalizeConfirmOpen(false)
      if (selectedProject) loadProjectHistory(selectedProject).catch(() => undefined)
      if (selectedProject.globalId) {
        const refreshedConnections = await queryExistingTraverseConnections(selectedProject.globalId)
        await revealExistingTraverseConnections(refreshedConnections, selectedProject.globalId)
      }
      if (parsedTraverseData) {
        const refreshedPlan = await buildFinalizePlan(parsedTraverseData)
        setFinalizePlan(refreshedPlan)
      }
    } catch (err) {
      try {
        const rollbackSteps = finalizePhase === 'traverse'
          ? traverseRollbackSteps
          : finalizePhase === 'survey'
            ? surveyRollbackSteps
            : []
        for (const rollbackStep of [...rollbackSteps].reverse()) {
          await rollbackStep()
        }
      } catch (rollbackErr) {
        const message = rollbackErr instanceof Error ? rollbackErr.message : m.finalizeProjectRollbackFailed
        setStatus(`${m.finalizeProjectRollbackFailed} ${message || ''}`.trim())
        return
      }

      const message = err instanceof Error ? err.message : m.finalizeProjectFailed
      const tableWarning = historyTableTouched ? ` ${m.finalizeProjectTableRollbackLimited}` : ''
      setStatus(`${m.finalizeProjectFailed} ${message || ''}${tableWarning}`.trim())
    } finally {
      setFinalizingProject(false)
    }
  }, [
    finalizePlan,
    getMonumentHistoryLayer,
    getSurveyMonumentsLayer,
    getTraverseConnectionsLayer,
    historyMonumentGlobalIdField,
    loadProjectHistory,
    m.finalizePlanEmpty,
    m.finalizeProjectApplying,
    m.finalizeProjectComplete,
    m.finalizeProjectFailed,
    m.finalizeProjectRollbackFailed,
    m.finalizeProjectTableRollbackLimited,
    m.finalizeProjectReplacingTraverse,
    m.finalizeProjectUpdatingHistory,
    m.finalizeProjectUpdatingSurvey,
    m.plannedEditsLabel,
    monumentGlobalIdField,
    monumentPointNumberField,
    queryExistingTraverseConnections,
    revealExistingTraverseConnections,
    selectedProject,
    parsedTraverseData,
    buildFinalizePlan
  ])

  const buildPointNumberPlan = React.useCallback(async (): Promise<PointNumberPlan | null> => {
    const selectedHistoryItems = historyItems.filter((item) => selectedHistoryKeys.includes(getHistoryKey(item)))
    if (selectedHistoryItems.length === 0) {
      setStatus(m.selectHistoryFirst)
      return null
    }

    const pointNumbersByGlobalId = selectedHistoryItems.reduce<Map<string, Set<string>>>((result, item) => {
      const pointGlobalId = (item.monumentGlobalId || '').trim().toLowerCase()
      const pointNumber = item.pointNumber === '-' ? '' : item.pointNumber.trim()
      if (!pointGlobalId || !pointNumber) return result
      result.set(pointGlobalId, new Set([...(result.get(pointGlobalId) || []), pointNumber]))
      return result
    }, new Map())
    const conflictingGlobalIds = new Set(Array.from(pointNumbersByGlobalId.entries())
      .filter(([, pointNumbers]) => pointNumbers.size > 1)
      .map(([pointGlobalId]) => pointGlobalId))
    const surveyMonumentsByGlobalId = await queryFinalizeSurveyMonumentsByGlobalIds(
      selectedHistoryItems.map((item) => item.monumentGlobalId || '')
    )

    const rows: PointNumberPlanRow[] = selectedHistoryItems.map((item) => {
      const pointGlobalId = (item.monumentGlobalId || '').trim()
      const pointGlobalIdKey = pointGlobalId.toLowerCase()
      const historyPointNumber = item.pointNumber === '-' ? '' : item.pointNumber.trim()
      const baseRow = {
        id: `point-number-${getHistoryKey(item)}`,
        historyObjectId: item.objectId,
        historyPointNumber: item.pointNumber,
        pointGlobalId
      }

      if (!pointGlobalId) {
        return {
          ...baseRow,
          action: 'skip' as PointNumberPlanAction,
          status: m.pointNumberMissingRelationship,
          severity: 'error' as const
        }
      }
      if (!historyPointNumber) {
        return {
          ...baseRow,
          action: 'skip' as PointNumberPlanAction,
          status: m.pointNumberMissingHistoryValue,
          severity: 'error' as const
        }
      }
      if (conflictingGlobalIds.has(pointGlobalIdKey)) {
        return {
          ...baseRow,
          newPointNumber: historyPointNumber,
          action: 'skip' as PointNumberPlanAction,
          status: m.pointNumberConflict,
          severity: 'error' as const
        }
      }

      const surveyMonument = surveyMonumentsByGlobalId.get(pointGlobalIdKey)
      if (!surveyMonument) {
        return {
          ...baseRow,
          newPointNumber: historyPointNumber,
          action: 'skip' as PointNumberPlanAction,
          status: m.monumentZoomNotFound,
          severity: 'error' as const
        }
      }

      const currentPointNumber = surveyMonument.pointNumber === '-' ? '' : surveyMonument.pointNumber.trim()
      if (currentPointNumber === historyPointNumber) {
        return {
          ...baseRow,
          surveyObjectId: surveyMonument.objectId,
          currentPointNumber,
          newPointNumber: historyPointNumber,
          action: 'skip' as PointNumberPlanAction,
          status: m.pointNumberAlreadyMatches,
          severity: 'info' as const
        }
      }

      return {
        ...baseRow,
        surveyObjectId: surveyMonument.objectId,
        currentPointNumber,
        newPointNumber: historyPointNumber,
        action: 'update' as PointNumberPlanAction,
        status: currentPointNumber ? m.pointNumberWillOverwrite : m.readyLabel,
        severity: currentPointNumber ? 'warning' as const : 'ready' as const
      }
    })
    const assignableRows = rows.filter((row) => row.action === 'update' && row.surveyObjectId !== undefined)

    return {
      rows,
      assignableRows,
      selectedCount: selectedHistoryItems.length,
      readyCount: assignableRows.length,
      missingPointGlobalIdCount: rows.filter((row) => row.status === m.pointNumberMissingRelationship).length,
      missingPointNumberCount: rows.filter((row) => row.status === m.pointNumberMissingHistoryValue).length,
      notFoundCount: rows.filter((row) => row.status === m.monumentZoomNotFound).length,
      conflictCount: rows.filter((row) => row.status === m.pointNumberConflict).length,
      alreadyMatchedCount: rows.filter((row) => row.status === m.pointNumberAlreadyMatches).length,
      overwriteCount: rows.filter((row) => row.status === m.pointNumberWillOverwrite).length,
      errorCount: rows.filter((row) => row.severity === 'error').length
    }
  }, [
    historyItems,
    m.monumentZoomNotFound,
    m.pointNumberAlreadyMatches,
    m.pointNumberConflict,
    m.pointNumberMissingHistoryValue,
    m.pointNumberMissingRelationship,
    m.pointNumberWillOverwrite,
    m.readyLabel,
    m.selectHistoryFirst,
    queryFinalizeSurveyMonumentsByGlobalIds,
    selectedHistoryKeys
  ])

  const openPointNumberReview = React.useCallback(async () => {
    setBuildingPointNumberPlan(true)
    setPointNumberModalOpen(true)
    try {
      const plan = await buildPointNumberPlan()
      setPointNumberPlan(plan)
      if (plan) setStatus(`${m.pointNumberPlanReady}: ${plan.readyCount}. ${m.pointNumberSkipped}: ${plan.rows.length - plan.readyCount}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : m.pointNumberPlanFailed
      setPointNumberPlan(null)
      setStatus(`${m.pointNumberPlanFailed} ${message || ''}`.trim())
    } finally {
      setBuildingPointNumberPlan(false)
    }
  }, [buildPointNumberPlan, m.pointNumberPlanFailed, m.pointNumberPlanReady, m.pointNumberSkipped])

  const applyPointNumberPlan = React.useCallback(async () => {
    if (!pointNumberPlan) return
    const updateRows = pointNumberPlan.assignableRows.filter((row) => row.surveyObjectId !== undefined && row.newPointNumber)
    if (updateRows.length === 0) {
      setStatus(`${m.applyPointNumbers}: 0`)
      return
    }

    setApplyingPointNumbers(true)
    let layer: any = null
    const rollbackRows = updateRows.filter((row) => row.surveyObjectId !== undefined)
    try {
      layer = await getSurveyMonumentsLayer()
      const results = await layer.applyEdits({
        updateFeatures: updateRows.map((row) => ({
          attributes: {
            OBJECTID: row.surveyObjectId,
            [monumentPointNumberField]: row.newPointNumber
          }
        }))
      }, getApplyEditsOptions(layer))
      const failedResult = (results.updateFeatureResults || []).find((result: any) => result?.error)
      if (failedResult) throw new Error(failedResult.error?.message || m.pointNumberApplyFailed)

      setStatus(`${m.pointNumberApplyComplete}: ${updateRows.length}`)
      setPointNumberModalOpen(false)
      if (selectedProject) await loadProjectHistory(selectedProject)
    } catch (err) {
      if (layer && rollbackRows.length > 0) {
        try {
          await layer.applyEdits({
            updateFeatures: rollbackRows.map((row) => ({
              attributes: {
                OBJECTID: row.surveyObjectId,
                [monumentPointNumberField]: row.currentPointNumber || null
              }
            }))
          }, getApplyEditsOptions(layer))
        } catch (rollbackErr) {
          const rollbackMessage = rollbackErr instanceof Error ? rollbackErr.message : m.pointNumberRollbackFailed
          setStatus(`${m.pointNumberRollbackFailed} ${rollbackMessage || ''}`.trim())
          return
        }
      }
      const message = err instanceof Error ? err.message : m.pointNumberApplyFailed
      setStatus(`${m.pointNumberApplyFailed} ${message || ''}`.trim())
    } finally {
      setApplyingPointNumbers(false)
    }
  }, [
    getSurveyMonumentsLayer,
    loadProjectHistory,
    m.applyPointNumbers,
    m.pointNumberApplyComplete,
    m.pointNumberApplyFailed,
    m.pointNumberRollbackFailed,
    monumentPointNumberField,
    pointNumberPlan,
    selectedProject
  ])

  const parseTraverseFile = async (file: File): Promise<TraverseFileSummary> => {
    const text = await file.text()
    const lines = text.split(/\r?\n/)
    return {
      id: `${file.name}-${file.size}-${file.lastModified}`,
      name: file.name,
      size: file.size,
      lineCount: lines.length,
      nonEmptyLineCount: lines.filter((line) => line.trim().length > 0).length,
      text,
      basisOfBearing: extractBasisOfBearing(text)
    }
  }

  const getProjectFileNameValidationStatus = React.useCallback((files: TraverseFileSummary[]) => {
    const projectName = selectedProject?.name || ''
    if (!projectName || files.length === 0) return ''

    const mismatchedFiles = files.filter((file) => !namesLookSimilar(projectName, file.name))
    if (mismatchedFiles.length === 0) return `${m.projectFileNameValidated}: ${projectName}`
    return m.projectFileNameMismatch
  }, [m.projectFileNameMismatch, m.projectFileNameValidated, selectedProject?.name])

  const importTraverseFiles = React.useCallback(async (files: FileList | File[]) => {
    const incomingFiles = Array.from(files).filter((file) => file.name.toLowerCase().endsWith('.lst'))
    if (incomingFiles.length === 0) return

    setLoadingTraverseFiles(true)
    try {
      const parsedFiles = await Promise.all(incomingFiles.map(parseTraverseFile))
      const previewData = buildParsedTraverseDataFromFiles(parsedFiles, staticFiles.length === 0)
      const generatedPreviewCount = await renderGeneratedTraverseConnectionGraphics(previewData.connections, true)
      setTraverseFiles(parsedFiles)
      setParsedTraverseData(previewData)
      setParsedStaticData(null)
      setFinalizePlan(null)
      setValidationModalOpen(false)
      const fileStatus = getProjectFileNameValidationStatus(parsedFiles) || `${m.traverseParsed}: ${parsedFiles.length}`
      const previewStatus = generatedPreviewCount > 0 ? ` ${m.generatedTraversePreviewDrawn}: ${generatedPreviewCount}.` : ''
      setStatus(`${fileStatus}. ${m.traversePreviewReady}: ${previewData.connections.length}.${previewStatus}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : m.traverseParseFailed
      setStatus(`${m.traverseParseFailed} ${message || ''}`.trim())
    } finally {
      setLoadingTraverseFiles(false)
    }
  }, [
    getProjectFileNameValidationStatus,
    m.generatedTraversePreviewDrawn,
    m.traverseParsed,
    m.traverseParseFailed,
    m.traversePreviewReady,
    renderGeneratedTraverseConnectionGraphics,
    staticFiles.length
  ])

  const importStaticFile = React.useCallback(async (file?: File) => {
    if (!file) return

    setLoadingTraverseFiles(true)
    try {
      const parsedFile = await parseTraverseFile(file)
      const parsedStaticFile = parseStaticText(parsedFile.text, parsedFile.id, parsedFile.name)
      setStaticFiles([parsedFile])
      setBasisOfBearing(parsedStaticFile.basisOfBearing || parsedFile.basisOfBearing || '')
      setParsedTraverseData(null)
      setParsedStaticData(parsedStaticFile)
      setFinalizePlan(null)
      traversePreviewGraphicsLayerRef.current?.removeAll?.()
      setValidationModalOpen(false)
      setStatus(getProjectFileNameValidationStatus([parsedFile]) || `${m.traverseParsed}: 1`)
    } catch (err) {
      const message = err instanceof Error ? err.message : m.traverseParseFailed
      setStatus(`${m.traverseParseFailed} ${message || ''}`.trim())
    } finally {
      setLoadingTraverseFiles(false)
    }
  }, [getProjectFileNameValidationStatus, m.traverseParsed, m.traverseParseFailed])

  const resetTraverseFiles = () => {
    setTraverseFiles([])
    setParsedTraverseData(null)
    setParsedStaticData(null)
    setFinalizePlan(null)
    traversePreviewGraphicsLayerRef.current?.removeAll?.()
    setValidationModalOpen(false)
    setStatus(m.traverseFilesReset)
  }

  const stageProcessTraverseFiles = async () => {
    setLoadingTraverseFiles(true)
    const parsedData = buildParsedTraverseDataFromFiles(traverseFiles, staticFiles.length === 0)
    const calculatedConnectionCount = parsedData.connections.filter((connection) =>
      connection.distance !== undefined && connection.direction !== undefined
    ).length
    try {
      const plan = await buildFinalizePlan(parsedData)
      await createFinalizeStepRunner([{
        label: m.finalizeDryRunOnly,
        execute: () => Promise.resolve(),
        rollback: () => Promise.resolve()
      }])
      setParsedTraverseData(parsedData)
      setFinalizePlan(plan)
      let existingConnectionStatus = ''
      if (selectedProject?.globalId && plan.existingTraverseConnections.length > 0) {
        const revealResult = await revealExistingTraverseConnections(plan.existingTraverseConnections, selectedProject.globalId)
        existingConnectionStatus = ` ${m.existingTraverseConnectionsFound}: ${plan.existingTraverseConnections.length}.`
        if (!revealResult.layerFound) existingConnectionStatus += ` ${m.existingTraverseConnectionsLayerNotFound}`
      }
      const generatedPreviewCount = await renderGeneratedTraverseConnectionGraphics(parsedData.connections, true)
      const generatedPreviewStatus = generatedPreviewCount > 0 ? ` ${m.generatedTraversePreviewDrawn}: ${generatedPreviewCount}.` : ''
      setStatus(`${m.traverseProcessed}: ${parsedData.monuments.length} ${m.traverseMonumentsLabel}, ${parsedData.connections.length} ${m.traverseConnectionsLabel}, ${calculatedConnectionCount} ${m.traverseCalculatedLabel}, ${parsedData.fixedStations.length} ${m.fixedStationsLabel}.${existingConnectionStatus}${generatedPreviewStatus} ${m.finalizePlanReady}: ${plan.edits.length}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : m.finalizePlanFailed
      setFinalizePlan(null)
      setStatus(`${m.finalizePlanFailed} ${message || ''}`.trim())
    } finally {
      setLoadingTraverseFiles(false)
    }
  }

  const resetStaticFile = () => {
    setStaticFiles([])
    setBasisOfBearing('')
    setParsedTraverseData(null)
    setParsedStaticData(null)
    setFinalizePlan(null)
    traversePreviewGraphicsLayerRef.current?.removeAll?.()
    setValidationModalOpen(false)
    setStatus(m.staticFileReset)
  }

  const acceptBasisOfBearing = async () => {
    const value = basisOfBearing.trim()
    if (!value) return
    if (!selectedProject) {
      setStatus(m.selectProjectFirst)
      return
    }

    const objectId = getNumericObjectId(selectedProject.objectId)
    if (objectId === null) {
      setStatus(m.basisOfBearingUpdateFailed)
      return
    }

    setAcceptingBasisOfBearing(true)
    try {
      const layer = await getMonumentProjectsLayer()
      const results = await layer.applyEdits({
        updateFeatures: [{
          attributes: {
            OBJECTID: objectId,
            [PROJECT_BASIS_OF_BEARING_FIELD]: value
          }
        }]
      }, getApplyEditsOptions(layer))
      const failedResult = (results.updateFeatureResults || []).find((result: any) => result?.error)
      if (failedResult) throw new Error(failedResult.error?.message || m.basisOfBearingUpdateFailed)
      setStatus(`${m.basisOfBearingAccepted} ${value}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : m.basisOfBearingUpdateFailed
      setStatus(`${m.basisOfBearingUpdateFailed} ${message || ''}`.trim())
    } finally {
      setAcceptingBasisOfBearing(false)
    }
  }

  const toggleUseSelectedProjectForCreate = () => {
    if (!selectedProject) {
      setUseSelectedProjectForCreate(false)
      setStatus(m.selectProjectFirst)
      return
    }
    setUseSelectedProjectForCreate((current) => {
      const nextValue = !current
      if (nextValue) setNewProjectName(selectedProject.name)
      return nextValue
    })
  }

  const historyRow = (item: MonumentHistorySummary) => {
    const itemKey = getHistoryKey(item)
    const checked = selectedHistoryKeys.includes(itemKey)
    const active = activeHistoryKey === itemKey
    const toggleHistorySelection = () => {
      setSelectedHistoryKeys((current) => {
        const isChecked = current.includes(itemKey)
        const nextKeys = isChecked ? current.filter((key) => key !== itemKey) : [...current, itemKey]
        setStatus(`${m.selectedHistoryCount}: ${nextKeys.length}`)
        return nextKeys
      })
    }
    const activateHistoryItem = () => {
      setActiveHistoryKey(itemKey)
      setStatus(`${m.selectedHistoryItem}: ${item.pointNumber}`)
    }
    const primaryText = `${item.pointNumber} | ${item.status} | ${item.monumentType}`
    const secondaryParts = [
      { label: m.embeddedInLabel, value: item.embeddedIn },
      { label: m.markerTypeLabel, value: item.markerType },
      { label: m.markerMaterialLabel, value: item.markerMaterial },
      { label: m.createdDateLabel, value: formatDate(item.createdDate) }
    ]
    const secondaryText = secondaryParts.map((part) => `${part.label}: ${part.value}`).join(' | ')

    return h('div', {
      key: item.objectId,
      className: 'd-flex align-items-center justify-content-between py-1',
      onClick: activateHistoryItem,
      style: {
        gap: '0.5rem',
        paddingLeft: '0.5rem',
        paddingRight: '0.5rem',
        cursor: 'pointer',
        backgroundColor: active ? 'rgba(105, 220, 255, 0.18)' : undefined
      }
    },
    h('div', { className: 'd-flex align-items-center', style: { gap: '0.5rem', minWidth: 0, overflow: 'hidden' } },
      h(Checkbox, {
        checked,
        onClick: (evt) => {
          evt.stopPropagation()
        },
        onChange: (evt) => {
          evt.stopPropagation()
          toggleHistorySelection()
        }
      }),
      h('div', { style: { minWidth: 0, overflow: 'hidden' } },
      h('div', {
        title: primaryText,
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '0.35rem',
          minWidth: 0,
          overflow: 'hidden',
          fontSize: 12,
          whiteSpace: 'nowrap'
        }
      },
      h('span', { style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 } }, item.pointNumber),
      h('span', { style: { opacity: 0.48 } }, '|'),
      h('span', {
        style: {
          flex: '0 1 auto',
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          padding: '1px 6px',
          borderRadius: 4,
          backgroundColor: 'rgba(105, 220, 255, 0.16)',
          color: 'var(--sys-color-primary-dark)'
        }
      }, item.status),
      h('span', { style: { opacity: 0.48 } }, '|'),
      h('span', { style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', opacity: 0.78 } }, item.monumentType)
      ),
      h('div', {
        title: secondaryText,
        style: {
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.2rem 0.65rem',
          minWidth: 0,
          overflow: 'hidden',
          fontSize: 10,
          lineHeight: '14px'
        }
      },
      secondaryParts.map((part, index) =>
        h(React.Fragment, { key: part.label },
          index > 0 && h('span', { style: { opacity: 0.42 } }, '|'),
          h('span', { style: { minWidth: 0, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
            h('span', { style: { opacity: 0.58, fontWeight: 600 } }, `${part.label}: `),
            h('span', { style: { opacity: 0.78 } }, part.value)
          )
        )
      ))
      )
    ),
    h('div', { className: 'd-flex align-items-center', style: { gap: '0.25rem', flex: '0 0 auto' } },
      h(Button, {
        size: 'sm',
        type: 'default',
        title: m.attachmentsTitle,
        onClick: (evt) => {
          evt.stopPropagation()
          openAttachmentModal(item)
        },
        style: { width: 32, minWidth: 32, height: 32, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }
      }, '📎'),
      h(Button, {
        size: 'sm',
        type: 'default',
        title: m.monumentZoom,
        onClick: (evt) => {
          evt.stopPropagation()
          zoomToHistorySurveyMonument(item).catch(() => {
            setStatus(m.monumentZoomFailed)
          })
        },
        style: { width: 32, minWidth: 32, height: 32, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }
      }, '🔍')
    )
    )
  }

  const assignSurveyMonumentRow = (item: SurveyMonumentSummary) => {
    const itemKey = getSurveyMonumentKey(item)
    const active = activeAssignSurveyKey === itemKey
    const primaryText = `PointID: ${item.pointNumber} | ObjectID: ${item.objectId}`

    return h('div', {
      key: item.objectId,
      className: 'd-flex align-items-center justify-content-between py-1',
      onClick: () => {
        setActiveAssignSurveyKey(itemKey)
        setStatus(`${m.selectedSurveyMonument}: ${item.pointNumber}`)
      },
      style: {
        gap: '0.5rem',
        paddingLeft: '0.5rem',
        paddingRight: '0.5rem',
        cursor: 'pointer',
        backgroundColor: active ? 'rgba(105, 220, 255, 0.18)' : undefined
      }
    },
    h('div', {
      title: primaryText,
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: '0.35rem',
        minWidth: 0,
        overflow: 'hidden',
        fontSize: 12,
        whiteSpace: 'nowrap'
      }
    },
    h('span', { style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 } }, `PointID: ${item.pointNumber}`),
    h('span', { style: { opacity: 0.48 } }, '|'),
    h('span', { style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', opacity: 0.78 } }, `ObjectID: ${item.objectId}`)
    ),
    h('div', { className: 'd-flex align-items-center', style: { gap: '0.25rem', flex: '0 0 auto' } },
      h(Button, {
        size: 'sm',
        type: 'default',
        title: m.removeSurveyMonument,
        onClick: (evt) => {
          evt.stopPropagation()
          removeAssignSurveyMonument(item)
        },
        style: { width: 32, minWidth: 32, height: 32, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }
      }, '×'),
      h(Button, {
        size: 'sm',
        type: 'default',
        title: m.monumentZoom,
        onClick: (evt) => {
          evt.stopPropagation()
          zoomToAssignSurveyMonument(item).catch(() => {
            setStatus(m.monumentZoomFailed)
          })
        },
        style: { width: 32, minWidth: 32, height: 32, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }
      }, '🔍')
    )
    )
  }

  const assignHistoryRow = (item: MonumentHistorySummary) => {
    const itemKey = getHistoryKey(item)
    const active = activeAssignHistoryKey === itemKey
    const pendingAssign = pendingAssignHistoryProjectKey === itemKey
    const hasCurrentProject = Boolean(item.projectGlobalId)
    const activateHistoryItem = () => {
      setActiveAssignHistoryKey(itemKey)
      suppressAssignSurveySelectionSyncRef.current = true
      selectMonumentHistoryRecord(item.objectId)
        .catch(() => undefined)
        .finally(() => {
          window.setTimeout(() => {
            suppressAssignSurveySelectionSyncRef.current = false
          }, 750)
        })
      setStatus(`${m.selectedHistoryItem}: ${item.pointNumber}`)
    }
    const primaryText = `${item.pointNumber} | ${item.status} | ${item.monumentType}`
    const projectText = item.projectName || '-'
    const assignValidationText = hasCurrentProject
      ? m.assignProjectOverwriteConfirm
      : m.assignProjectConfirm

    return h('div', {
      key: item.objectId,
      className: 'py-1',
      onClick: activateHistoryItem,
      style: {
        paddingLeft: '0.5rem',
        paddingRight: '0.5rem',
        cursor: 'pointer',
        backgroundColor: active ? 'rgba(105, 220, 255, 0.18)' : undefined
      }
    },
    h('div', { className: 'd-flex align-items-center justify-content-between', style: { gap: '0.5rem' } },
      h('div', { className: 'd-flex align-items-center', style: { gap: '0.5rem', minWidth: 0, overflow: 'hidden' } },
        h('div', { style: { minWidth: 0, overflow: 'hidden' } },
          h('div', {
            title: primaryText,
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              minWidth: 0,
              overflow: 'hidden',
              fontSize: 12,
              whiteSpace: 'nowrap'
            }
          },
          h('span', { style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 } }, item.pointNumber),
          h('span', { style: { opacity: 0.48 } }, '|'),
          h('span', {
            style: {
              flex: '0 1 auto',
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              padding: '1px 6px',
              borderRadius: 4,
              backgroundColor: 'rgba(105, 220, 255, 0.16)',
              color: 'var(--sys-color-primary-dark)'
            }
          }, item.status),
          h('span', { style: { opacity: 0.48 } }, '|'),
          h('span', { style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', opacity: 0.78 } }, item.monumentType)
          ),
          h('div', {
            title: projectText,
            style: {
              minWidth: 0,
              overflow: 'hidden',
              fontSize: 10,
              lineHeight: '14px',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }
          },
          h('span', { style: { opacity: 0.78 } }, projectText)
          )
        )
      ),
      mode === 'create' && h('div', { className: 'd-flex align-items-center', style: { gap: '0.25rem', flex: '0 0 auto' } },
        h(Button, {
          size: 'sm',
          type: 'default',
          title: m.attachmentsTitle,
          onClick: (evt) => {
            evt.stopPropagation()
            openAttachmentModal(item)
          },
          style: { width: 32, minWidth: 32, height: 32, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }
        }, '📎'),
        h(Button, {
          size: 'sm',
          type: 'default',
          title: m.assignProjectValue,
          disabled: assigningHistoryProjectKey === itemKey || !selectedProject,
          onClick: (evt) => {
            evt.stopPropagation()
            setPendingAssignHistoryProjectKey((current) => current === itemKey ? '' : itemKey)
            setActiveAssignHistoryKey(itemKey)
          },
          style: { width: 32, minWidth: 32, height: 32, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }
        }, '↗')
      )
    ),
    mode === 'create' && pendingAssign && h('div', {
      className: 'd-flex align-items-center mt-1',
      onClick: (evt) => {
        evt.stopPropagation()
      },
      style: { gap: '0.35rem' }
    } as any,
      h('div', {
        role: 'status',
        style: {
          flex: '0 1 auto',
          minWidth: 0,
          maxWidth: '100%',
          overflow: 'hidden',
          padding: '3px 8px',
          borderRadius: 3,
          border: hasCurrentProject ? '1px solid rgba(194, 111, 0, 0.32)' : '1px solid rgba(0, 105, 170, 0.28)',
          backgroundColor: hasCurrentProject ? 'rgba(255, 248, 232, 0.96)' : 'rgba(235, 248, 255, 0.96)',
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.08)',
          color: hasCurrentProject ? '#6f4300' : '#073f63',
          fontWeight: 600,
          fontSize: 10,
          lineHeight: '14px',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis'
        }
      },
      assignValidationText
      ),
      h(Button, {
        size: 'sm',
        type: hasCurrentProject ? 'default' : 'primary',
        disabled: assigningHistoryProjectKey === itemKey,
        style: { height: 28, padding: '0 8px', fontSize: 11 },
        onClick: () => {
          assignProjectToHistoryItem(item).catch(() => undefined)
        }
      }, m.confirm),
      h(Button, {
        size: 'sm',
        type: 'tertiary',
        disabled: assigningHistoryProjectKey === itemKey,
        style: { height: 28, padding: '0 8px', fontSize: 11 },
        onClick: () => {
          setPendingAssignHistoryProjectKey('')
        }
      }, m.cancel)
    )
    )
  }

  const attachmentPanel = (historyItem?: MonumentHistorySummary | null, showTitle = true) =>
    h('div', { className: 'border rounded p-2 d-flex flex-column', style: { minHeight: 160, gap: '0.5rem' } },
      showTitle && h('div', { className: 'd-flex align-items-center justify-content-between', style: { gap: '0.5rem' } },
        h('div', { className: 'font-weight-bold', style: { fontSize: 12 } },
          historyItem
            ? `${m.attachmentsTitle}: ${historyItem.pointNumber}`
            : m.attachmentsTitle
        ),
        historyItem && h('div', { style: { fontSize: 11, opacity: 0.75 } }, `${attachmentItems.length} ${m.attachmentCountLabel}`)
      ),
      !historyItem
        ? h('div', { style: { fontSize: 12, opacity: 0.75 } }, m.attachmentSelectHistoryFirst)
        : h(React.Fragment, null,
          attachmentError && h(Alert, { form: 'basic', type: 'warning', text: attachmentError }),
          h('input', {
            ref: attachmentFileInputRef,
            type: 'file',
            accept: 'image/*',
            multiple: true,
            style: { display: 'none' },
            onChange: (evt) => {
              const files = evt.target.files
              if (files) stageAttachmentFiles(files)
              evt.target.value = ''
            }
          }),
          h('div', {
            role: 'button',
            tabIndex: 0,
            onClick: () => {
              attachmentFileInputRef.current?.click()
            },
            onKeyDown: (evt) => {
              if (evt.key === 'Enter' || evt.key === ' ') {
                evt.preventDefault()
                attachmentFileInputRef.current?.click()
              }
            },
            onDragOver: (evt) => {
              evt.preventDefault()
            },
            onDrop: (evt) => {
              evt.preventDefault()
              stageAttachmentFiles(evt.dataTransfer.files)
            },
            style: {
              border: '1px dashed rgba(0, 0, 0, 0.28)',
              borderRadius: 4,
              padding: '0.75rem',
              textAlign: 'center',
              cursor: 'pointer',
              backgroundColor: 'rgba(0, 0, 0, 0.02)'
            }
          } as any,
          h('div', { style: { fontSize: 12, fontWeight: 700 } }, m.attachmentDropPrompt),
          h('div', { style: { fontSize: 10, opacity: 0.68, marginTop: 2 } }, m.attachmentDropHint)
          ),
          stagedAttachmentFiles.length > 0 && h('div', null,
            h('div', { className: 'd-flex align-items-center justify-content-between mb-1', style: { gap: '0.5rem' } },
              h('div', { className: 'font-weight-bold', style: { fontSize: 11 } }, m.attachmentPendingUploads),
              h(Button, {
                type: 'primary',
                size: 'sm',
                disabled: uploadingAttachments,
                style: { height: 24, padding: '0 8px', fontSize: 11 },
                onClick: () => {
                  uploadStagedAttachments(historyItem).catch(() => undefined)
                }
              }, `${m.attachmentUpload} ${stagedAttachmentFiles.length}`)
            ),
            h('div', { className: 'd-flex flex-column', style: { gap: '0.25rem' } },
              ...stagedAttachmentFiles.map((item) =>
                h('div', {
                  key: item.id,
                  className: 'd-flex align-items-center justify-content-between',
                  style: { gap: '0.5rem', fontSize: 11, minWidth: 0 }
                },
                h('div', { className: 'd-flex align-items-center', style: { gap: '0.4rem', minWidth: 0, overflow: 'hidden' } },
                  h('img', {
                    src: item.previewUrl,
                    alt: '',
                    style: { width: 28, height: 28, objectFit: 'cover', borderRadius: 4, flex: '0 0 auto' }
                  }),
                  h('span', { title: item.file.name, style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 } }, item.file.name),
                  h('span', { style: { opacity: 0.58, flex: '0 0 auto' } }, formatFileSize(item.file.size))
                ),
                h(Button, {
                  size: 'sm',
                  type: 'tertiary',
                  title: m.attachmentRemovePending,
                  disabled: uploadingAttachments,
                  style: { height: 24, padding: '0 6px', fontSize: 11 },
                  onClick: () => {
                    removeStagedAttachmentFile(item.id)
                  }
                }, m.attachmentDeleteLabel)
                )
              )
            )
          ),
          h('div', null,
            h('div', { className: 'font-weight-bold mb-1', style: { fontSize: 11 } }, m.attachmentExisting),
            loadingAttachments
              ? h('div', { style: { fontSize: 12, opacity: 0.75 } }, m.attachmentLoading)
              : attachmentItems.length === 0
                ? h('div', { style: { fontSize: 12, opacity: 0.75 } }, m.attachmentEmpty)
                : h('div', { className: 'd-flex flex-column', style: { gap: '0.25rem' } },
                  ...attachmentItems.map((attachment) =>
                    h('div', {
                      key: attachment.id,
                      className: 'd-flex align-items-center justify-content-between',
                      style: { gap: '0.5rem', fontSize: 11, minWidth: 0 }
                    },
                    h('div', { style: { minWidth: 0, overflow: 'hidden' } },
                      h('div', { title: attachment.name, style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 } }, attachment.name),
                      h('div', { style: { opacity: 0.6 } }, `${attachment.contentType || '-'} | ${formatFileSize(attachment.size)}`)
                    ),
                    h('div', { className: 'd-flex align-items-center', style: { gap: '0.25rem', flex: '0 0 auto' } },
                      h(Button, {
                        size: 'sm',
                        type: 'tertiary',
                        title: m.attachmentOpen,
                        style: { height: 24, padding: '0 6px', fontSize: 11 },
                        onClick: () => {
                          openHistoryAttachment(historyItem, attachment)
                        }
                      }, 'View'),
                      h(Button, {
                        size: 'sm',
                        type: 'tertiary',
                        title: m.attachmentDelete,
                        disabled: deletingAttachment || attachmentPendingDelete?.id === attachment.id,
                        style: { height: 24, padding: '0 6px', fontSize: 11 },
                        onClick: () => {
                          setAttachmentPendingDelete(attachment)
                          setAttachmentError('')
                        }
                      }, m.attachmentDeleteLabel)
                    )
                    )
                  )
                )
          )
        )
    )

  const attachmentModal = () =>
    h(Modal, {
      isOpen: Boolean(attachmentHistoryItem),
      toggle: closeAttachmentModal,
      centered: true,
      backdrop: 'static',
      style: { width: 560, maxWidth: 'calc(100vw - 2rem)' }
    },
    h(ModalHeader, { toggle: closeAttachmentModal },
      attachmentHistoryItem
        ? `${m.attachmentsTitle}: ${attachmentHistoryItem.pointNumber}`
        : m.attachmentsTitle
    ),
    h(ModalBody, null,
      attachmentPanel(attachmentHistoryItem, false)
    ),
    h(ModalFooter, {
      className: 'd-flex align-items-center justify-content-between',
      style: { gap: '0.75rem' }
    },
    h('div', { style: { flex: '1 1 auto', minWidth: 0 } },
      attachmentPendingDelete && h(Alert, {
        form: 'basic',
        type: 'warning',
        text: `${m.attachmentDeletePending}: ${attachmentPendingDelete.name}`,
        style: { marginBottom: 0 }
      } as any)
    ),
    h('div', { className: 'd-flex align-items-center', style: { gap: '0.35rem', flex: '0 0 auto' } },
        attachmentHistoryItem && attachmentPendingDelete && h(Button, {
          type: 'danger',
          disabled: deletingAttachment,
          onClick: () => {
            deleteHistoryAttachment(attachmentHistoryItem, attachmentPendingDelete).catch(() => undefined)
          }
        }, m.attachmentConfirmDelete),
        h(Button, {
          type: 'default',
          onClick: closeAttachmentModal
        }, m.cancel)
      )
    ))

  const viewHistoryPanel = () =>
    h('div', { className: 'd-flex flex-column flex-grow-1', style: { gap: '0.75rem', minHeight: 0 } },
      h('div', { className: 'd-flex align-items-center justify-content-between', style: { gap: '0.5rem' } },
        h('div', { className: 'font-weight-bold' }, m.viewingProjectMonuments),
        h('div', { className: 'd-flex align-items-center', style: { gap: '0.35rem', flex: '0 0 auto' } },
          h(Button, {
            size: 'sm',
            type: 'default',
            disabled: loadingHistory || !selectedProject,
            onClick: () => {
              if (!selectedProject) return
              loadProjectHistory(selectedProject).catch(() => undefined)
            }
          }, m.refreshList),
          h(Button, {
            size: 'sm',
            type: 'tertiary',
            onClick: () => {
              setMode('finder')
            }
          }, m.cancel)
        )
      ),
      selectedProject && h('div', { style: { fontSize: 14, fontWeight: 700, lineHeight: '18px', overflowWrap: 'anywhere' } }, selectedProject.name),
      h('div', { className: 'border rounded p-2 d-flex flex-column flex-grow-1', style: { minHeight: 0 } },
        h('div', { className: 'd-flex align-items-center justify-content-between mb-2', style: { gap: '0.5rem' } },
          h('div', { className: 'font-weight-bold', style: { fontSize: 12 } }, m.monumentHistoryTitle),
          h('div', { className: 'd-flex align-items-center', style: { gap: '0.35rem', flex: '0 0 auto' } },
            h('div', { style: { fontSize: 11, opacity: 0.75 } }, `${historyItems.length} ${m.featureCountLabel}`),
            h(Button, {
              size: 'sm',
              type: 'tertiary',
              disabled: loadingHistory || historyItems.length === 0,
              style: { height: 24, padding: '0 6px', fontSize: 11 },
              onClick: () => {
                const allKeys = historyItems.map(getHistoryKey)
                setSelectedHistoryKeys(allKeys)
                setStatus(`${m.selectedHistoryCount}: ${allKeys.length}`)
              }
            }, m.selectAll),
            h(Button, {
              size: 'sm',
              type: 'tertiary',
              disabled: loadingHistory || selectedHistoryKeys.length === 0,
              style: { height: 24, padding: '0 6px', fontSize: 11 },
              onClick: () => {
                setSelectedHistoryKeys([])
                setStatus(m.historySelectionCleared)
              }
            }, m.clear)
          )
        ),
        historyError && h(Alert, { form: 'basic', type: 'warning', text: historyError }),
        h('div', { className: 'flex-grow-1', style: { minHeight: 0, overflowY: 'auto', overflowX: 'hidden' } },
          loadingHistory
            ? h('div', { style: { fontSize: 12, opacity: 0.75 } }, m.loadingHistory)
            : historyItems.length === 0
              ? h('div', { style: { fontSize: 12, opacity: 0.75 } }, m.historyEmpty)
              : historyItems.map(historyRow)
        ),
        h('div', { className: 'd-flex mt-2', style: { gap: '0.35rem' } },
          h(Button, {
            type: 'primary',
            size: 'sm',
            style: modeActionButtonStyle,
            disabled: buildingPointNumberPlan || applyingPointNumbers || loadingHistory || selectedHistoryKeys.length === 0,
            onClick: () => {
              openPointNumberReview().catch(() => undefined)
            }
          }, m.updatePointNumber)
        )
      )
    )

  const surveyHistoryPanel = () =>
    h('div', { className: 'd-flex flex-column flex-grow-1', style: { gap: '0.75rem', minHeight: 0 } },
      h('div', { className: 'd-flex align-items-center justify-content-between', style: { gap: '0.5rem' } },
        h('div', { className: 'font-weight-bold' }, activeMode.title),
        h(Button, {
          size: 'sm',
          type: 'tertiary',
          onClick: () => {
            setMode('finder')
          }
        }, m.cancel)
      ),
      mode === 'create' && selectedProject && h('div', { style: { fontSize: 14, fontWeight: 700, lineHeight: '18px', overflowWrap: 'anywhere' } }, selectedProject.name),
      h('div', {
        className: 'border rounded p-2 d-flex flex-column',
        style: { minHeight: 120, flex: mode === 'remove-monuments' ? '0 0 50%' : '0 0 38%' }
      },
        h('div', { className: 'd-flex align-items-center justify-content-between mb-2', style: { gap: '0.5rem' } },
          h('div', { className: 'font-weight-bold', style: { fontSize: 12 } }, m.surveyMonumentsTitle),
          h('div', { className: 'd-flex align-items-center', style: { gap: '0.35rem', flex: '0 0 auto' } },
            h('div', { style: { fontSize: 11, opacity: 0.75 } }, `${assignSurveyMonuments.length} ${m.featureCountLabel}`),
            h(Button, {
              size: 'sm',
              type: 'tertiary',
              disabled: assignSurveyMonuments.length === 0 && assignHistoryItems.length === 0,
              onClick: clearAssignLists,
              style: { height: 24, padding: '0 6px', fontSize: 11 }
            }, m.clear)
          )
        ),
        h('div', { className: 'flex-grow-1', style: { minHeight: 0, overflowY: 'auto', overflowX: 'hidden' } },
          assignSurveyMonuments.length === 0
            ? h('div', { style: { fontSize: 12, opacity: 0.75 } }, m.assignSelectSurveyMonuments)
            : assignSurveyMonuments.map(assignSurveyMonumentRow)
        ),
        h('div', { className: 'd-flex mt-2', style: { gap: '0.35rem' } },
          mode === 'merge-points' && h(Button, {
            type: 'primary',
            size: 'sm',
            style: modeActionButtonStyle,
            disabled: assignSurveyMonuments.length < 2 || !activeAssignSurveyKey || autoSettingTarget,
            onClick: setActiveSurveyMonumentAsTarget
          }, m.setTarget),
          mode === 'merge-points' && h(Button, {
            type: 'default',
            size: 'sm',
            style: modeActionButtonStyle,
            disabled: assignSurveyMonuments.length < 2 || autoSettingTarget,
            onClick: () => {
              autoSetMergeTarget()
            }
          }, m.autoSetTarget),
          mode === 'create' && h(Button, {
            type: 'primary',
            size: 'sm',
            style: modeActionButtonStyle,
            disabled: buildingAutoAssignPlan || autoAssigningHistory || assignSurveyMonuments.length === 0 || !selectedProject,
            onClick: () => {
              openAutoAssignReview().catch(() => undefined)
            }
          }, m.assignAll)
        )
      ),
      h('div', { className: 'border rounded p-2 d-flex flex-column flex-grow-1', style: { minHeight: 0 } },
        h('div', { className: 'd-flex align-items-center justify-content-between mb-2', style: { gap: '0.5rem' } },
          h('div', { className: 'font-weight-bold', style: { fontSize: 12 } }, m.monumentHistoryTitle),
          h('div', { className: 'd-flex align-items-center', style: { gap: '0.35rem', flex: '0 0 auto' } },
            h('div', { style: { fontSize: 11, opacity: 0.75 } }, `${assignHistoryItems.length} ${m.featureCountLabel}`),
            h(Button, {
              size: 'sm',
              type: 'tertiary',
              title: m.refreshHistory,
              disabled: !activeAssignSurveyKey || loadingAssignHistory,
              onClick: () => {
                refreshAssignHistory().catch((err) => {
                  const message = getUnknownErrorMessage(err, m.historyLoadFailed)
                  setStatus(message || m.historyLoadFailed)
                })
              },
              style: { height: 24, padding: '0 6px', fontSize: 11 }
            }, m.refreshHistory)
          )
        ),
        h('div', { className: 'flex-grow-1', style: { minHeight: 0, overflowY: 'auto', overflowX: 'hidden' } },
          loadingAssignHistory
            ? h('div', { style: { fontSize: 12, opacity: 0.75 } }, m.loadingHistory)
            : assignHistoryItems.length === 0
              ? h('div', { style: { fontSize: 12, opacity: 0.75 } }, m.assignHistoryEmpty)
              : assignHistoryItems.map(assignHistoryRow)
        ),
        mode === 'create' && h('div', { className: 'd-flex mt-2', style: { gap: '0.35rem' } },
          h(Button, {
            type: 'primary',
            size: 'sm',
            style: modeActionButtonStyle,
            disabled: !activeAssignSurveyKey || addingAssignHistory,
            onClick: () => {
              createAssociatedHistoryForSelectedSurveyMonument().catch(() => undefined)
            }
          }, m.addHistory),
          h(Button, {
            type: 'default',
            size: 'sm',
            style: modeActionButtonStyle,
            disabled: !activeAssignHistoryKey || addingAssignHistory || loadingAssignHistory || !selectedProject,
            onClick: () => {
              createCopiedHistoryFromSelectedRecord().catch(() => undefined)
            }
          }, m.createCopyHistory)
        ),
        mode === 'merge-points' && h('div', { className: 'd-flex mt-2', style: { gap: '0.35rem' } },
          h(Button, {
            type: 'primary',
            size: 'sm',
            style: modeActionButtonStyle,
            disabled: buildingTargetMergePlan || applyingTargetMerge || buildingMeanMergePlan || applyingMeanMerge || !canMergeSurveyMonuments,
            onClick: () => {
              stageMergeAction('target').catch((err) => {
                const message = err instanceof Error ? err.message : m.mergeRollbackFailed
                setStatus(message || m.mergeRollbackFailed)
              })
            }
          }, m.targetMerge),
          h(Button, {
            type: 'primary',
            size: 'sm',
            style: modeActionButtonStyle,
            disabled: buildingTargetMergePlan || applyingTargetMerge || buildingMeanMergePlan || applyingMeanMerge || !canMergeSurveyMonuments,
            onClick: () => {
              stageMergeAction('mean').catch((err) => {
                const message = err instanceof Error ? err.message : m.mergeRollbackFailed
                setStatus(message || m.mergeRollbackFailed)
              })
            }
          }, m.meanMerge)
        )
      ),
      mode === 'remove-monuments' && h('div', { className: 'd-flex', style: { gap: '0.35rem' } },
        h(Button, {
          type: 'primary',
          size: 'sm',
          style: modeActionButtonStyle,
          disabled: assignSurveyMonuments.length === 0 || buildingRemoveMonumentsPlan || applyingRemoveMonuments,
          onClick: () => {
            openRemoveMonumentsReview().catch(() => undefined)
          }
        }, m.deleteMonuments)
      )
    )

  const monumentProjectFinder = () =>
    h('div', { className: 'border rounded p-2 d-flex flex-column flex-grow-1', style: { minHeight: 0 } },
      h('div', { className: 'd-flex align-items-center justify-content-between mb-2', style: { gap: '0.5rem' } },
        h('div', { className: 'font-weight-bold' }, m.monumentProjectFinderTitle),
        h('div', { className: 'd-flex align-items-center', style: { gap: '0.35rem', flex: '0 0 auto' } },
          h(Button, {
            size: 'sm',
            type: 'default',
            onClick: () => {
              loadProjects(projectSearchTerm).catch(() => undefined)
            },
            disabled: loadingProjects
          }, m.refreshList)
        )
      ),
      h('div', { className: 'mb-2' },
        h(TextInput, {
          value: projectSearchTerm,
          placeholder: m.projectSearchPlaceholder,
          onChange: (evt) => {
            setProjectSearchTerm(evt.target.value)
          }
        }),
        (loadingProjects || (projectSearchTerm.trim().length > 0 && projectSearchTerm.trim().length < PROJECT_SEARCH_MINIMUM_LENGTH)) &&
          h('div', { className: 'mt-1', style: { fontSize: 10, opacity: 0.7 } },
            loadingProjects ? m.searchingProjects : m.projectSearchMinimum
          )
      ),
      projectError && h(Alert, { form: 'basic', type: 'warning', text: projectError }),
      h('div', { className: 'flex-grow-1', style: { minHeight: 0, overflowY: 'auto', overflowX: 'hidden' } },
        !loadingProjects && !projectError && projects.length === 0 && h('div', { style: { fontSize: 12, opacity: 0.72 } }, m.noProjects),
        ...projects.map(projectRow)
      ),
      h('div', { className: 'd-flex flex-column mt-2', style: { gap: '0.35rem' } },
        ...workflowModeRows.map((row, rowIndex) =>
          h('div', { key: `workflow-row-${rowIndex}`, className: 'd-flex', style: { gap: '0.35rem' } },
            ...row.map((modeId) => {
              const item = workflowModes.find((modeDefinition) => modeDefinition.id === modeId)
              if (!item) return null
              return h(Button, {
                key: item.id,
                size: 'sm',
                type: item.id === 'history' || item.id === 'create' ? 'primary' : 'default',
                style: modeButtonStyle,
                onClick: () => {
                  if (item.id === 'create-project') {
                    setMode('create-project')
                    setStatus(m.createProjectWorkflowTitle)
                    return
                  }
                  startWorkflowMode(item.id)
                }
              }, item.label)
            })
          )
        )
      )
    )

  const csvProjectRow = (item: CsvProjectRow) => {
    const active = activeNewSearchPointId === item.id
    const validationText = item.validationMessages.join(' | ')
    const existingText = item.existingMonuments.length > 0
      ? `${item.existingMonuments.length} ${m.surveyMonumentsTitle}`
      : ''
    const display = getCsvProjectRowDisplay(item)
    const primaryText = `${display.pointNumber} | ${display.description}`
    const rowIconButtonStyle = {
      width: 32,
      minWidth: 32,
      height: 32,
      padding: 0,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
    return h('div', {
      key: item.id,
      className: 'd-flex align-items-center justify-content-between py-1',
      onClick: () => {
        setActiveNewSearchPointId(item.id)
        setStatus(`${m.selectedSearchPoint}: ${item.pointNumber}`)
      },
      style: {
        gap: '0.5rem',
        paddingLeft: '0.5rem',
        paddingRight: '0.5rem',
        cursor: 'pointer',
        backgroundColor: active ? 'rgba(105, 220, 255, 0.18)' : undefined,
        borderBottom: '1px solid rgba(0, 0, 0, 0.06)'
      }
    },
    h('div', { style: { flex: '1 1 auto', minWidth: 0, overflow: 'hidden' } },
      h('div', {
        title: primaryText,
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '0.35rem',
          minWidth: 0,
          overflow: 'hidden',
          fontSize: 12,
          whiteSpace: 'nowrap'
        }
      },
      h('span', { style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 } }, display.pointNumber),
      h('span', { style: { opacity: 0.48 } }, '|'),
      h('span', {
        style: {
          flex: '0 1 auto',
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          padding: '1px 6px',
          borderRadius: 4,
          backgroundColor: 'rgba(105, 220, 255, 0.16)',
          color: 'var(--sys-color-primary-dark)'
        }
      }, display.description)
      ),
      h('div', {
        title: display.coordinateText,
        style: {
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.2rem 0.65rem',
          minWidth: 0,
          overflow: 'hidden',
          fontSize: 10,
          lineHeight: '14px'
        }
      },
      display.coordinateText.split(' | ').map((part, index) =>
        h(React.Fragment, { key: part },
          index > 0 && h('span', { style: { opacity: 0.42 } }, '|'),
          h('span', { style: { minWidth: 0, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.78 } }, part)
        )
      )),
      validationText && h('div', {
        style: { marginTop: 2, fontSize: 10, lineHeight: '14px', color: 'var(--danger-600, #c92a2a)' }
      }, validationText)
    ),
    h('div', { className: 'd-flex align-items-center', style: { gap: '0.25rem', flex: '0 0 auto' } },
      existingText && h('div', { style: { flex: '0 0 auto', fontSize: 10, opacity: 0.7 } }, existingText),
      h(Button, {
        size: 'sm',
        type: 'default',
        title: m.removeSearchPoint,
        onClick: (evt) => {
          evt.stopPropagation()
          removeCsvProjectRow(item)
        },
        style: rowIconButtonStyle
      }, '×'),
      h(Button, {
        size: 'sm',
        type: 'default',
        title: m.zoomSearchPoint,
        onClick: (evt) => {
          evt.stopPropagation()
          zoomToCsvProjectRow(item).catch(() => {
            setStatus(m.monumentZoomFailed)
          })
        },
        style: rowIconButtonStyle
      }, '🔍')
    )
    )
  }

  const csvProjectList = (title: string, rows: CsvProjectRow[]) =>
    h('div', { className: 'border rounded p-2 d-flex flex-column', style: { minHeight: 0, flex: '1 1 0' } },
      h('div', { className: 'd-flex align-items-center justify-content-between mb-2', style: { gap: '0.5rem' } },
        h('div', { className: 'font-weight-bold', style: { fontSize: 12 } }, title),
        h('div', { style: { fontSize: 11, opacity: 0.75 } }, `${rows.length} ${m.featureCountLabel}`)
      ),
      h('div', { className: 'flex-grow-1', style: { minHeight: 0, overflowY: 'auto', overflowX: 'hidden' } },
        rows.length === 0
          ? h('div', { style: { fontSize: 12, opacity: 0.72 } }, '-')
          : rows.map(csvProjectRow)
      )
    )

  const createProjectPanel = () =>
    h('div', { className: 'd-flex flex-column flex-grow-1', style: { gap: '0.75rem', minHeight: 0 } },
      h('div', { className: 'd-flex align-items-center justify-content-between', style: { gap: '0.5rem' } },
        h('div', { className: 'font-weight-bold' }, activeMode.title),
        h(Button, {
          size: 'sm',
          type: 'tertiary',
          onClick: () => {
            setMode('finder')
          }
        }, m.cancel)
      ),
      h('div', { className: 'border rounded p-2', style: { flex: '0 0 auto' } },
        h('div', { className: 'mb-2' },
          h('div', { className: 'd-flex align-items-center justify-content-between mb-1', style: { gap: '0.5rem' } },
            h('div', { style: { fontSize: 11, fontWeight: 700 } }, m.projectNameLabel),
            h('label', { className: 'd-flex align-items-center mb-0', style: { gap: '0.35rem', fontSize: 11, opacity: selectedProject ? 0.85 : 0.55 } },
              h(Checkbox, {
                checked: useSelectedProjectForCreate,
                disabled: !selectedProject,
                onChange: toggleUseSelectedProjectForCreate
              }),
              h('span', null, m.useSelectedProject)
            )
          ),
          h(TextInput, {
            value: newProjectName,
            placeholder: m.projectNamePlaceholder,
            disabled: useSelectedProjectForCreate,
            onChange: (evt) => {
              if (useSelectedProjectForCreate) setUseSelectedProjectForCreate(false)
              setNewProjectName(evt.target.value)
            }
          })
        ),
        h('div', { className: 'd-flex align-items-center justify-content-between', style: { gap: '0.5rem' } },
          h('div', { className: 'font-weight-bold', style: { fontSize: 12 } }, m.csvImportTitle),
          h(Button, {
            type: 'primary',
            size: 'sm',
            disabled: loadingProjectCsv,
            style: modeActionButtonStyle,
            onClick: () => {
              projectCsvFileInputRef.current?.click()
            }
          }, m.chooseCsv)
        ),
        h('input', {
          ref: projectCsvFileInputRef,
          type: 'file',
          accept: '.csv,text/csv',
          style: { display: 'none' },
          onChange: (evt) => {
            const file = evt.target.files?.[0]
            if (file) importProjectCsvFile(file).catch(() => undefined)
            evt.target.value = ''
          }
        }),
        h('div', { className: 'mt-1', style: { fontSize: 11, opacity: 0.75, overflowWrap: 'anywhere' } },
          loadingProjectCsv ? m.searchingProjects : (projectCsvFileName || m.chooseCsv)
        )
      ),
      h('div', { className: 'd-flex flex-column flex-grow-1', style: { gap: '0.5rem', minHeight: 0 } },
        csvProjectList(m.newSearchPoint, newSearchPointRows),
        csvProjectList(m.existingMonument, existingMonumentRows),
        csvProjectList(m.multipleMonuments, multipleMonumentRows)
      ),
      h('div', { className: 'd-flex', style: { gap: '0.35rem', flex: '0 0 auto' } },
        h(Button, {
          type: 'primary',
          size: 'sm',
          style: modeActionButtonStyle,
          disabled: loadingProjectCsv || projectCsvRowCount === 0,
          onClick: analyzeProjectCsvResults
        }, m.analyzeResults),
        h(Button, {
          type: 'default',
          size: 'sm',
          style: modeActionButtonStyle,
          disabled: loadingProjectCsv || !projectCsvFile,
          onClick: reprocessProjectCsvImport
        }, m.reprocessCsv),
        h(Button, {
          type: 'default',
          size: 'sm',
          style: modeActionButtonStyle,
          disabled: loadingProjectCsv || (projectCsvRowCount === 0 && !projectCsvFile && !projectCsvFileName && !newProjectName.trim() && !useSelectedProjectForCreate),
          onClick: resetProjectCsvImport
        }, m.reset)
      )
    )

  const shouldShowStatusAlert = () => {
    if (mode !== 'create-project') return true
    return [
      m.csvParsed,
      m.csvParseFailed,
      m.createProjectPlanReady,
      m.createProjectPlanEmpty,
      m.createProjectApplying,
      m.createProjectSuccess,
      m.createProjectFailed,
      m.createProjectRollbackFailed,
      m.csvImportReset,
      m.createTitle
    ].some((messagePrefix) => status.startsWith(messagePrefix))
  }

  const getStatusAlertType = () =>
    status === m.projectFileNameMismatch || status.startsWith(m.assignProjectValueFailed)
      ? 'warning'
      : 'info'

  const traverseFileRow = (file: TraverseFileSummary) =>
    h('div', {
      key: file.id,
      className: 'd-flex align-items-center justify-content-between py-1',
      style: { gap: '0.5rem', fontSize: 12, borderBottom: '1px solid rgba(0, 0, 0, 0.06)' }
    },
    h('div', { style: { minWidth: 0, overflow: 'hidden' } },
      h('div', { title: file.name, style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 } }, file.name),
      h('div', { style: { fontSize: 10, opacity: 0.68 } }, `${file.nonEmptyLineCount}/${file.lineCount} lines`)
    ),
    h('div', { style: { flex: '0 0 auto', fontSize: 10, opacity: 0.68 } }, formatFileSize(file.size))
    )

  const validationTabButton = (tab: FinalizeValidationTab, label: string) =>
    h(Button, {
      key: tab,
      size: 'sm',
      type: validationTab === tab ? 'primary' : 'default',
      style: { height: 28, padding: '0 8px', fontSize: 11 },
      onClick: () => {
        setValidationTab(tab)
      }
    }, label)

  const validationCountTile = (label: string, value: number | string) =>
    h('div', {
      className: 'border rounded p-2',
      style: { minWidth: 100, flex: '1 1 120px', backgroundColor: 'rgba(0, 0, 0, 0.02)' }
    },
    h('div', { style: { fontSize: 10, opacity: 0.68 } }, label),
    h('div', { style: { fontSize: 17, fontWeight: 700, lineHeight: '22px' } }, String(value))
    )

  const validationDataRow = (cells: Array<string | number | undefined>, key: string) =>
    h('div', {
      key,
      className: 'd-grid py-1',
      style: {
        display: 'grid',
        gridTemplateColumns: `repeat(${cells.length}, minmax(82px, 1fr))`,
        gap: '0.45rem',
        fontSize: 11,
        borderBottom: '1px solid rgba(0, 0, 0, 0.06)'
      }
    },
    ...cells.map((cell, index) =>
      h('div', {
        key: `${key}-${index}`,
        title: cell === undefined ? '-' : String(cell),
        style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
      }, cell === undefined || cell === '' ? '-' : String(cell))
    )
    )

  const validationHeaderRow = (cells: string[]) =>
    h('div', {
      className: 'd-grid pb-1',
      style: {
        display: 'grid',
        gridTemplateColumns: `repeat(${cells.length}, minmax(82px, 1fr))`,
        gap: '0.45rem',
        fontSize: 10,
        fontWeight: 700,
        opacity: 0.72,
        borderBottom: '1px solid rgba(0, 0, 0, 0.12)'
      }
    },
    ...cells.map((cell) => h('div', { key: cell }, cell))
    )

  const autoAssignModal = () =>
    h(Modal, {
      isOpen: autoAssignModalOpen,
      toggle: () => {
        setAutoAssignModalOpen(false)
      },
      centered: true,
      backdrop: 'static',
      style: { width: 760, maxWidth: 'calc(100vw - 2rem)' }
    },
    h(ModalHeader, {
      toggle: () => {
        setAutoAssignModalOpen(false)
      }
    }, m.reviewAutoAssignTitle),
    h(ModalBody, null,
      h('div', { className: 'd-flex flex-column', style: { gap: '0.75rem', maxHeight: '68vh', minHeight: 320 } },
        buildingAutoAssignPlan
          ? h('div', { style: { fontSize: 12, opacity: 0.75 } }, m.loadingAutoAssignPlan)
          : !autoAssignPlan
            ? h('div', { style: { fontSize: 12, opacity: 0.75 } }, m.autoAssignPlanEmpty)
            : h(React.Fragment, null,
              h('div', { className: 'd-flex flex-wrap', style: { gap: '0.5rem' } },
                validationCountTile(m.selectedSurveyMonuments, autoAssignPlan.rows.length),
                validationCountTile(m.readyToAssignLabel, autoAssignPlan.readyCount),
                validationCountTile(m.autoAssignAlreadyAssigned, autoAssignPlan.alreadyAssignedCount),
                validationCountTile(m.autoAssignNoEligibleHistory, autoAssignPlan.noEligibleHistoryCount),
                validationCountTile(m.autoAssignMultipleCandidates, autoAssignPlan.multipleCandidateCount)
              ),
              h('div', { className: 'flex-grow-1', style: { minHeight: 0, overflowY: 'auto', overflowX: 'auto' } },
                validationHeaderRow([m.pointNumberLabel, m.selectedHistoryLabel, m.createdDateLabel, m.currentProjectLabel, m.actionLabel, m.statusLabel]),
                ...autoAssignPlan.rows.map((row) =>
                  validationDataRow([
                    row.pointNumber,
                    row.historyObjectId ? `${m.objectIdLabel} ${row.historyObjectId}` : '-',
                    formatDateTime(row.createdDate),
                    row.currentProjectName || row.currentProjectGlobalId || '-',
                    row.action === 'assign' ? m.assignProjectValue : m.autoAssignSkipAction,
                    row.status
                  ], row.id)
                )
              )
            )
      )
    ),
    h(ModalFooter, null,
      h(Button, {
        type: 'default',
        disabled: autoAssigningHistory,
        onClick: () => {
          setAutoAssignModalOpen(false)
        }
      }, m.close),
      h(Button, {
        type: 'primary',
        disabled: buildingAutoAssignPlan || autoAssigningHistory || !autoAssignPlan || autoAssignPlan.readyCount === 0 || autoAssignPlan.errorCount > 0,
        onClick: () => {
          applyAutoAssignPlan().catch(() => undefined)
        }
      }, autoAssigningHistory ? m.assignAll : m.applyAssignments)
    ))

  const pointNumberModal = () =>
    h(Modal, {
      isOpen: pointNumberModalOpen,
      toggle: () => {
        setPointNumberModalOpen(false)
      },
      centered: true,
      backdrop: 'static',
      style: { width: 800, maxWidth: 'calc(100vw - 2rem)' }
    },
    h(ModalHeader, {
      toggle: () => {
        setPointNumberModalOpen(false)
      }
    }, m.reviewPointNumberTitle),
    h(ModalBody, null,
      h('div', { className: 'd-flex flex-column', style: { gap: '0.75rem', maxHeight: '68vh', minHeight: 320 } },
        buildingPointNumberPlan
          ? h('div', { style: { fontSize: 12, opacity: 0.75 } }, m.loadingPointNumberPlan)
          : !pointNumberPlan
            ? h('div', { style: { fontSize: 12, opacity: 0.75 } }, m.pointNumberPlanEmpty)
            : h(React.Fragment, null,
              h('div', { className: 'd-flex flex-wrap', style: { gap: '0.5rem' } },
                validationCountTile(m.selectedHistoryCount, pointNumberPlan.selectedCount),
                validationCountTile(m.readyLabel, pointNumberPlan.readyCount),
                validationCountTile(m.pointNumberWillOverwrite, pointNumberPlan.overwriteCount),
                validationCountTile(m.pointNumberAlreadyMatches, pointNumberPlan.alreadyMatchedCount),
                validationCountTile(m.errorsLabel, pointNumberPlan.errorCount)
              ),
              h('div', { className: 'flex-grow-1', style: { minHeight: 0, overflowY: 'auto', overflowX: 'auto' } },
                validationHeaderRow([m.historyPointNumberLabel, m.surveyMonumentLabel, m.currentSurveyPointNumberLabel, m.newSurveyPointNumberLabel, m.actionLabel, m.statusLabel]),
                ...pointNumberPlan.rows.map((row) =>
                  validationDataRow([
                    row.historyPointNumber,
                    row.surveyObjectId ? `${m.objectIdLabel} ${row.surveyObjectId}` : '-',
                    row.currentPointNumber || '-',
                    row.newPointNumber || '-',
                    row.action === 'update' ? m.updateLabel : m.autoAssignSkipAction,
                    row.status
                  ], row.id)
                )
              )
            )
      )
    ),
    h(ModalFooter, null,
      h(Button, {
        type: 'default',
        disabled: applyingPointNumbers,
        onClick: () => {
          setPointNumberModalOpen(false)
        }
      }, m.close),
      h(Button, {
        type: 'primary',
        disabled: buildingPointNumberPlan || applyingPointNumbers || !pointNumberPlan || pointNumberPlan.readyCount === 0 || pointNumberPlan.errorCount > 0,
        onClick: () => {
          applyPointNumberPlan().catch(() => undefined)
        }
      }, applyingPointNumbers ? m.updatePointNumber : m.applyPointNumbers)
    ))

  const removeMonumentsModal = () =>
    h(Modal, {
      isOpen: removeMonumentsModalOpen,
      toggle: () => {
        if (!applyingRemoveMonuments) setRemoveMonumentsModalOpen(false)
      },
      centered: true,
      backdrop: 'static',
      style: { width: 860, maxWidth: 'calc(100vw - 2rem)' }
    },
    h(ModalHeader, {
      toggle: applyingRemoveMonuments
        ? undefined
        : () => {
            setRemoveMonumentsModalOpen(false)
          }
    }, m.deleteMonumentsReviewTitle),
    h(ModalBody, null,
      h('div', { className: 'd-flex flex-column', style: { gap: '0.75rem', maxHeight: '68vh', minHeight: 360 } },
        h('div', { style: { fontSize: 12, lineHeight: '17px' } }, m.deleteMonumentsConfirmMessage),
        buildingRemoveMonumentsPlan
          ? h('div', { style: { fontSize: 12, opacity: 0.75 } }, m.deleteMonumentsPlanBuilding)
          : !removeMonumentsPlan
            ? h('div', { style: { fontSize: 12, opacity: 0.75 } }, m.deleteMonumentsPlanEmpty)
            : h(React.Fragment, null,
              h('div', { className: 'd-flex flex-wrap', style: { gap: '0.5rem' } },
                validationCountTile(m.selectedSurveyMonuments, removeMonumentsPlan.surveyDeleteCount),
                validationCountTile(m.monumentHistoryTitle, removeMonumentsPlan.historyDeleteCount),
                validationCountTile(m.errorsLabel, removeMonumentsPlan.validations.filter((validation) => validation.severity === 'error').length),
                validationCountTile(m.warningsLabel, removeMonumentsPlan.validations.filter((validation) => validation.severity === 'warning').length)
              ),
              h('div', null,
                h('div', { className: 'font-weight-bold mb-1', style: { fontSize: 12 } }, m.surveyMonumentsTitle),
                validationHeaderRow([m.objectIdLabel, m.pointNumberLabel, 'GlobalID', m.targetMergeHistoryRecordsLabel, m.actionLabel]),
                ...removeMonumentsPlan.rows.map((row) =>
                  validationDataRow([
                    row.monument.objectId,
                    row.monument.pointNumber,
                    row.monument.globalId || '-',
                    row.historyRows.length,
                    m.deleteMonuments
                  ], `remove-monument-${row.monument.objectId}`)
                )
              ),
              h('div', null,
                h('div', { className: 'font-weight-bold mb-1', style: { fontSize: 12 } }, m.monumentHistoryTitle),
                removeMonumentsPlan.historyDeleteCount === 0
                  ? h('div', { style: { fontSize: 12, opacity: 0.75 } }, m.assignHistoryEmpty)
                  : h(React.Fragment, null,
                    validationHeaderRow([m.objectIdLabel, m.historyPointNumberLabel, m.sourceListLabel, m.actionLabel]),
                    ...removeMonumentsPlan.rows.flatMap((planRow) =>
                      planRow.historyRows.map((historyRow) =>
                        validationDataRow([
                          historyRow.objectId,
                          historyRow.pointNumber,
                          `${historyRow.sourcePointNumber} (${m.objectIdLabel} ${historyRow.sourceObjectId})`,
                          m.deleteMonuments
                        ], `remove-history-${historyRow.objectId}`)
                      )
                    )
                  )
              ),
              h('div', null,
                h('div', { className: 'font-weight-bold mb-1', style: { fontSize: 12 } }, m.validationLabel),
                removeMonumentsPlan.validations.length === 0
                  ? h('div', { style: { fontSize: 12, opacity: 0.75 } }, m.noValidationIssues)
                  : removeMonumentsPlan.validations.map((validation, index) =>
                    h('div', {
                      key: `${validation.severity}-${validation.pointId || index}`,
                      className: 'py-1',
                      style: {
                        fontSize: 12,
                        borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
                        color: validation.severity === 'error' ? 'var(--danger-600, #c92a2a)' : validation.severity === 'warning' ? 'var(--warning-700, #8a5a00)' : undefined
                      }
                    },
                    h('div', { style: { fontWeight: 700 } }, validation.severity.toUpperCase()),
                    h('div', null, `${validation.pointId ? `${validation.pointId} - ` : ''}${validation.message}`)
                    )
                  )
              )
            )
      )
    ),
    h(ModalFooter, null,
      h(Button, {
        type: 'default',
        disabled: applyingRemoveMonuments,
        onClick: () => {
          setRemoveMonumentsModalOpen(false)
        }
      }, m.cancel),
      h(Button, {
        type: 'primary',
        disabled: buildingRemoveMonumentsPlan || applyingRemoveMonuments || !removeMonumentsPlan || !removeMonumentsPlan.canCommit,
        onClick: () => {
          applyRemoveMonumentsPlan().catch(() => undefined)
        }
      }, m.deleteMonuments)
    ))

  const targetMergeModal = () =>
    h(Modal, {
      isOpen: targetMergeModalOpen,
      toggle: () => {
        if (!applyingTargetMerge) setTargetMergeModalOpen(false)
      },
      centered: true,
      backdrop: 'static',
      style: { width: 860, maxWidth: 'calc(100vw - 2rem)' }
    },
    h(ModalHeader, {
      toggle: applyingTargetMerge
        ? undefined
        : () => {
            setTargetMergeModalOpen(false)
          }
    }, m.targetMergeReviewTitle),
    h(ModalBody, null,
      h('div', { className: 'd-flex flex-column', style: { gap: '0.75rem', maxHeight: '68vh', minHeight: 360 } },
        buildingTargetMergePlan
          ? h('div', { style: { fontSize: 12, opacity: 0.75 } }, m.targetMergePlanBuilding)
          : !targetMergePlan
            ? h('div', { style: { fontSize: 12, opacity: 0.75 } }, m.targetMergePlanEmpty)
            : h(React.Fragment, null,
              h('div', { className: 'd-flex flex-wrap', style: { gap: '0.5rem' } },
                validationCountTile(m.targetMergeTotalSurveyMonuments, targetMergePlan.sourceDeleteCount + 1),
                validationCountTile(m.targetMergeSourcesTitle, targetMergePlan.sourceDeleteCount),
                validationCountTile(m.targetMergeHistoryTitle, targetMergePlan.historyUpdateCount),
                validationCountTile(m.errorsLabel, targetMergePlan.validations.filter((validation) => validation.severity === 'error').length),
                validationCountTile(m.warningsLabel, targetMergePlan.validations.filter((validation) => validation.severity === 'warning').length)
              ),
              h('div', null,
                h('div', { className: 'font-weight-bold mb-1', style: { fontSize: 12 } }, m.targetMergeTargetTitle),
                validationHeaderRow([m.objectIdLabel, m.pointNumberLabel, 'GlobalID', m.statusLabel]),
                validationDataRow([
                  targetMergePlan.target.objectId,
                  targetMergePlan.target.pointNumber,
                  targetMergePlan.target.globalId || '-',
                  m.readyLabel
                ], 'target-merge-target')
              ),
              h('div', null,
                h('div', { className: 'font-weight-bold mb-1', style: { fontSize: 12 } }, m.targetMergeSourcesTitle),
                validationHeaderRow([m.objectIdLabel, m.pointNumberLabel, 'GlobalID', m.targetMergeHistoryRecordsLabel, m.actionLabel]),
                ...targetMergePlan.sources.map((row) =>
                  validationDataRow([
                    row.monument.objectId,
                    row.monument.pointNumber,
                    row.monument.globalId || '-',
                    row.historyRows.length,
                    m.removeSurveyMonument
                  ], `target-merge-source-${row.monument.objectId}`)
                )
              ),
              h('div', null,
                h('div', { className: 'font-weight-bold mb-1', style: { fontSize: 12 } }, m.targetMergeHistoryTitle),
                targetMergePlan.historyUpdateCount === 0
                  ? h('div', { style: { fontSize: 12, opacity: 0.75 } }, m.assignHistoryEmpty)
                  : h(React.Fragment, null,
                    validationHeaderRow([m.objectIdLabel, m.historyPointNumberLabel, m.sourceListLabel, m.actionLabel]),
                    ...targetMergePlan.sources.flatMap((sourceRow) =>
                      sourceRow.historyRows.map((historyRow) =>
                        validationDataRow([
                          historyRow.objectId,
                          historyRow.pointNumber,
                          `${historyRow.sourcePointNumber} (${m.objectIdLabel} ${historyRow.sourceObjectId})`,
                          `${historyMonumentGlobalIdField} -> ${targetMergePlan.target.pointNumber}`
                        ], `target-merge-history-${historyRow.objectId}`)
                      )
                    )
                  )
              ),
              h('div', null,
                h('div', { className: 'font-weight-bold mb-1', style: { fontSize: 12 } }, m.validationLabel),
                targetMergePlan.validations.length === 0
                  ? h('div', { style: { fontSize: 12, opacity: 0.75 } }, m.noValidationIssues)
                  : targetMergePlan.validations.map((validation, index) =>
                    h('div', {
                      key: `${validation.severity}-${validation.pointId || index}`,
                      className: 'py-1',
                      style: {
                        fontSize: 12,
                        borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
                        color: validation.severity === 'error' ? 'var(--danger-600, #c92a2a)' : validation.severity === 'warning' ? 'var(--warning-700, #8a5a00)' : undefined
                      }
                    },
                    h('div', { style: { fontWeight: 700 } }, validation.severity.toUpperCase()),
                    h('div', null, `${validation.pointId ? `${validation.pointId} - ` : ''}${validation.message}`)
                    )
                  )
              )
            )
      )
    ),
    h(ModalFooter, null,
      h(Button, {
        type: 'default',
        disabled: applyingTargetMerge,
        onClick: () => {
          setTargetMergeModalOpen(false)
        }
      }, m.cancel),
      h(Button, {
        type: 'primary',
        disabled: buildingTargetMergePlan || applyingTargetMerge || !targetMergePlan || !targetMergePlan.canCommit,
        onClick: () => {
          applyTargetMergePlan().catch(() => undefined)
        }
      }, applyingTargetMerge ? m.targetMerge : m.applyTargetMerge)
    ))

  const meanMergeModal = () =>
    h(Modal, {
      isOpen: meanMergeModalOpen,
      toggle: () => {
        if (!applyingMeanMerge) setMeanMergeModalOpen(false)
      },
      centered: true,
      backdrop: 'static',
      style: { width: 900, maxWidth: 'calc(100vw - 2rem)' }
    },
    h(ModalHeader, {
      toggle: applyingMeanMerge
        ? undefined
        : () => {
            setMeanMergeModalOpen(false)
          }
    }, m.meanMergeReviewTitle),
    h(ModalBody, null,
      h('div', { className: 'd-flex flex-column', style: { gap: '0.75rem', maxHeight: '68vh', minHeight: 380 } },
        buildingMeanMergePlan
          ? h('div', { style: { fontSize: 12, opacity: 0.75 } }, m.meanMergePlanBuilding)
          : !meanMergePlan
            ? h('div', { style: { fontSize: 12, opacity: 0.75 } }, m.meanMergePlanEmpty)
            : h(React.Fragment, null,
              h('div', { className: 'd-flex flex-wrap', style: { gap: '0.5rem' } },
                validationCountTile(m.targetMergeTotalSurveyMonuments, meanMergePlan.sourceDeleteCount + 1),
                validationCountTile(m.targetMergeSourcesTitle, meanMergePlan.sourceDeleteCount),
                validationCountTile(m.targetMergeHistoryTitle, meanMergePlan.historyUpdateCount),
                validationCountTile(m.errorsLabel, meanMergePlan.validations.filter((validation) => validation.severity === 'error').length),
                validationCountTile(m.warningsLabel, meanMergePlan.validations.filter((validation) => validation.severity === 'warning').length)
              ),
              h('div', null,
                h('div', { className: 'font-weight-bold mb-1', style: { fontSize: 12 } }, m.meanMergeCoordinatesTitle),
                validationHeaderRow([m.workflowStepLabel, m.xCoordinateLabel, m.yCoordinateLabel, m.actionLabel]),
                validationDataRow([
                  m.meanMergeTargetCurrentTitle,
                  formatTraverseNumber(meanMergePlan.targetOriginalX, 4),
                  formatTraverseNumber(meanMergePlan.targetOriginalY, 4),
                  m.selectedSurveyMonument
                ], 'mean-merge-current-coordinate'),
                validationDataRow([
                  m.meanMergeCoordinatesTitle,
                  formatTraverseNumber(meanMergePlan.meanX, 4),
                  formatTraverseNumber(meanMergePlan.meanY, 4),
                  m.meanMergeMoveTarget
                ], 'mean-merge-new-coordinate')
              ),
              h('div', null,
                h('div', { className: 'font-weight-bold mb-1', style: { fontSize: 12 } }, m.targetMergeTargetTitle),
                validationHeaderRow([m.objectIdLabel, m.pointNumberLabel, 'GlobalID', m.statusLabel]),
                validationDataRow([
                  meanMergePlan.target.objectId,
                  meanMergePlan.target.pointNumber,
                  meanMergePlan.target.globalId || '-',
                  m.readyLabel
                ], 'mean-merge-target')
              ),
              h('div', null,
                h('div', { className: 'font-weight-bold mb-1', style: { fontSize: 12 } }, m.targetMergeSourcesTitle),
                validationHeaderRow([m.objectIdLabel, m.pointNumberLabel, 'GlobalID', m.targetMergeHistoryRecordsLabel, m.actionLabel]),
                ...meanMergePlan.sources.map((row) =>
                  validationDataRow([
                    row.monument.objectId,
                    row.monument.pointNumber,
                    row.monument.globalId || '-',
                    row.historyRows.length,
                    m.removeSurveyMonument
                  ], `mean-merge-source-${row.monument.objectId}`)
                )
              ),
              h('div', null,
                h('div', { className: 'font-weight-bold mb-1', style: { fontSize: 12 } }, m.targetMergeHistoryTitle),
                meanMergePlan.historyUpdateCount === 0
                  ? h('div', { style: { fontSize: 12, opacity: 0.75 } }, m.assignHistoryEmpty)
                  : h(React.Fragment, null,
                    validationHeaderRow([m.objectIdLabel, m.historyPointNumberLabel, m.sourceListLabel, m.actionLabel]),
                    ...meanMergePlan.sources.flatMap((sourceRow) =>
                      sourceRow.historyRows.map((historyRow) =>
                        validationDataRow([
                          historyRow.objectId,
                          historyRow.pointNumber,
                          `${historyRow.sourcePointNumber} (${m.objectIdLabel} ${historyRow.sourceObjectId})`,
                          `${historyMonumentGlobalIdField} -> ${meanMergePlan.target.pointNumber}`
                        ], `mean-merge-history-${historyRow.objectId}`)
                      )
                    )
                  )
              ),
              h('div', null,
                h('div', { className: 'font-weight-bold mb-1', style: { fontSize: 12 } }, m.validationLabel),
                meanMergePlan.validations.length === 0
                  ? h('div', { style: { fontSize: 12, opacity: 0.75 } }, m.noValidationIssues)
                  : meanMergePlan.validations.map((validation, index) =>
                    h('div', {
                      key: `${validation.severity}-${validation.pointId || index}`,
                      className: 'py-1',
                      style: {
                        fontSize: 12,
                        borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
                        color: validation.severity === 'error' ? 'var(--danger-600, #c92a2a)' : validation.severity === 'warning' ? 'var(--warning-700, #8a5a00)' : undefined
                      }
                    },
                    h('div', { style: { fontWeight: 700 } }, validation.severity.toUpperCase()),
                    h('div', null, `${validation.pointId ? `${validation.pointId} - ` : ''}${validation.message}`)
                    )
                  )
              )
            )
      )
    ),
    h(ModalFooter, null,
      h(Button, {
        type: 'default',
        disabled: applyingMeanMerge,
        onClick: () => {
          setMeanMergeModalOpen(false)
        }
      }, m.cancel),
      h(Button, {
        type: 'primary',
        disabled: buildingMeanMergePlan || applyingMeanMerge || !meanMergePlan || !meanMergePlan.canCommit,
        onClick: () => {
          applyMeanMergePlan().catch(() => undefined)
        }
      }, applyingMeanMerge ? m.meanMerge : m.applyMeanMerge)
    ))

  const createProjectValidationModal = () =>
    h(Modal, {
      isOpen: createProjectModalOpen,
      toggle: () => {
        if (creatingProject) return
        setCreateProjectModalOpen(false)
      },
      centered: true,
      backdrop: 'static',
      style: { width: 900, maxWidth: 'calc(100vw - 2rem)' }
    },
    h(ModalHeader, {
      toggle: () => {
        if (creatingProject) return
        setCreateProjectModalOpen(false)
      }
    }, m.reviewCreateProjectTitle),
    h(ModalBody, null,
      h('div', { className: 'd-flex flex-column', style: { gap: '0.75rem', maxHeight: '68vh', minHeight: 360 } },
        !createProjectPlan
          ? h('div', { style: { fontSize: 12, opacity: 0.75 } }, m.createProjectPlanEmpty)
          : h(React.Fragment, null,
            h('div', { className: 'd-flex flex-wrap', style: { gap: '0.5rem' } },
              validationCountTile(m.projectNameLabel, createProjectPlan.projectName),
              validationCountTile(m.projectEditModeLabel, createProjectPlan.useSelectedProject ? m.projectEditUseSelected : m.projectEditCreate),
              validationCountTile(m.newSearchPoint, newSearchPointRows.length),
              validationCountTile(m.existingMonument, existingMonumentRows.length),
              validationCountTile(m.multipleMonuments, multipleMonumentRows.length),
              validationCountTile(m.surveyMonumentsToCreate, createProjectPlan.createRows.length),
              validationCountTile(m.surveyMonumentsToUpdate, createProjectPlan.updateRows.length),
              validationCountTile(m.errorsLabel, createProjectPlan.errorCount),
              validationCountTile(m.warningsLabel, createProjectPlan.warningCount)
            ),
            h('div', { className: 'flex-grow-1', style: { minHeight: 0, overflowY: 'auto', overflowX: 'auto' } },
              validationHeaderRow([m.sourceListLabel, m.pointNumberLabel, m.descriptionLabel, 'x', 'y', 'z', m.actionLabel, m.validationLabel]),
              ...createProjectPlan.rows.map((row) =>
                validationDataRow([
                  createProjectSourceLabel(row.source),
                  row.pointNumber,
                  row.description,
                  row.x,
                  row.y,
                  row.z,
                  createProjectActionLabel(row),
                  row.validationLabel || '-'
                ], row.id)
              )
            )
          )
      )
    ),
    h(ModalFooter, null,
      h(Button, {
        type: 'default',
        disabled: creatingProject,
        onClick: () => {
          setCreateProjectModalOpen(false)
        }
      }, m.close),
      h(Button, {
        type: 'primary',
        disabled: creatingProject || !createProjectPlan || !createProjectPlan.canCommit,
        onClick: () => {
          stageCreateProjectFromCsv().catch(() => undefined)
        }
      }, creatingProject ? m.createProjectApplying : m.createTitle)
    ))

  const validationModalBody = () => {
    if (validationReviewMode === 'static') {
      if (!parsedStaticData) {
        return h('div', { style: { fontSize: 12, opacity: 0.75 } }, m.staticValidationEmpty)
      }

      if (validationTab === 'summary') {
        return h('div', { className: 'd-flex flex-column', style: { gap: '0.75rem' } },
          h('div', { className: 'd-flex flex-wrap', style: { gap: '0.5rem' } },
            validationCountTile(m.projectControlsLabel, parsedStaticData.projectControls.length),
            validationCountTile(m.fixedStationsLabel, parsedStaticData.projectControls.filter((control) => control.fixedStation).length),
            validationCountTile(m.nonControlStationsLabel, parsedStaticData.projectControls.filter((control) => control.nonControlStation).length),
            validationCountTile(m.errorsLabel, staticValidationErrorCount),
            validationCountTile(m.warningsLabel, staticValidationWarningCount),
            validationCountTile(m.basisOfBearingTitle, parsedStaticData.basisOfBearing || '-')
          ),
          h('div', null,
            validationHeaderRow([m.workflowStepLabel, m.countLabel, m.statusLabel]),
            validationDataRow([m.adjustedStationInformationLabel, parsedStaticData.projectControls.filter((control) => !control.nonControlStation).length, m.readyLabel], 'static-adjusted-station-info'),
            validationDataRow([m.adjustedCoordinatesLabel, parsedStaticData.projectControls.filter((control) => control.northing !== undefined && control.easting !== undefined).length, staticValidationErrorCount > 0 ? m.needsReviewLabel : m.readyLabel], 'static-adjusted-coordinates')
          )
        )
      }

      if (validationTab === 'monuments') {
        return h('div', null,
          validationHeaderRow([m.stationLabel, m.resNLabel, m.resELabel, m.fixedStationLabel, m.northingLabel, m.eastingLabel, m.elevationLabel, m.controlTypeLabel]),
          ...parsedStaticData.projectControls.map((control) =>
            validationDataRow([
              control.name,
              formatTraverseNumber(control.resN, 4),
              formatTraverseNumber(control.resE, 4),
              control.fixedStation ? m.yesLabel : m.noLabel,
              formatTraverseNumber(control.northing),
              formatTraverseNumber(control.easting),
              formatTraverseNumber(control.elevation),
              control.nonControlStation ? m.nonControlStationLabel : m.controlStationLabel
            ], `static-control-${control.name}`)
          )
        )
      }

      if (validationTab === 'issues') {
        return h('div', null,
          parsedStaticData.validations.length === 0
            ? h('div', { style: { fontSize: 12, opacity: 0.75 } }, m.noValidationIssues)
            : parsedStaticData.validations.map((validation, index) =>
              h('div', {
                key: `${validation.severity}-${validation.pointId || index}`,
                className: 'py-1',
                style: {
                  fontSize: 12,
                  borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
                  color: validation.severity === 'error' ? 'var(--danger-600, #c92a2a)' : validation.severity === 'warning' ? 'var(--warning-700, #8a5a00)' : undefined
                }
              },
              h('div', { style: { fontWeight: 700 } }, validation.severity.toUpperCase()),
              h('div', null, `${validation.pointId ? `${validation.pointId} - ` : ''}${validation.message}`)
              )
            )
        )
      }

      return h('div', { style: { fontSize: 12, opacity: 0.75 } }, m.staticValidationTabUnavailable)
    }

    if (!finalizePlan || !parsedTraverseData) {
      return h('div', { style: { fontSize: 12, opacity: 0.75 } }, m.finalizePlanEmpty)
    }

    if (validationTab === 'summary') {
      const workflowRows: Array<[string, number]> = [
        [m.finalizeUpdateHistory, finalizePlan.counts['update-history']],
        [m.finalizeCreateHistory, finalizePlan.counts['create-history']],
        [m.finalizeUpdateSurveyMonument, finalizePlan.counts['update-survey-monument']],
        [m.finalizeCreateSurveyMonument, finalizePlan.counts['create-survey-monument']],
        [m.finalizeBackfillHistory, finalizePlan.counts['backfill-history-relationship']],
        [m.finalizeDeleteTraverseConnection, finalizePlan.counts['delete-traverse-connection']],
        [m.finalizeCreateTraverseConnection, finalizePlan.counts['create-traverse-connection']]
      ]
      return h('div', { className: 'd-flex flex-column', style: { gap: '0.75rem' } },
        h('div', { className: 'd-flex flex-wrap', style: { gap: '0.5rem' } },
          validationCountTile(m.traverseMonumentsLabel, parsedTraverseData.monuments.length),
          validationCountTile(m.traverseConnectionsLabel, parsedTraverseData.connections.length),
          validationCountTile(m.fixedStationsLabel, parsedTraverseData.fixedStations.length),
          validationCountTile(m.errorsLabel, validationErrorCount),
          validationCountTile(m.warningsLabel, validationWarningCount)
        ),
        h('div', null,
          validationHeaderRow([m.workflowStepLabel, m.countLabel, m.statusLabel]),
          ...workflowRows.map(([label, count]) =>
            validationDataRow([label, count, count > 0 ? m.readyLabel : '-'], `workflow-${label}`)
          )
        )
      )
    }

    if (validationTab === 'monuments') {
      return h('div', null,
        validationHeaderRow([m.pointLabel, m.northingLabel, m.eastingLabel, m.fixedStationLabel, m.stdDevNLabel, m.stdDevELabel, m.actionLabel]),
        ...parsedTraverseData.monuments.map((monument) =>
          validationDataRow([
            monument.pointId,
            formatTraverseNumber(monument.northing),
            formatTraverseNumber(monument.easting),
            monument.fixedStation ? m.yesLabel : m.noLabel,
            formatTraverseNumber(monument.stdDevN, 4),
            formatTraverseNumber(monument.stdDevE, 4),
            getFinalizeEditLabel(monument.pointId, ['update-survey-monument', 'create-survey-monument'])
          ], `monument-${monument.pointId}`)
        )
      )
    }

    if (validationTab === 'connections') {
      return h('div', null,
        validationHeaderRow([m.fromLabel, m.toLabel, m.distanceLabel, m.directionLabel, m.statusLabel]),
        ...parsedTraverseData.connections.map((connection, index) =>
          validationDataRow([
            connection.fromPointNum,
            connection.toPointNum,
            formatTraverseNumber(connection.distance),
            formatTraverseNumber(connection.direction, 4),
            connection.distance !== undefined && connection.direction !== undefined ? m.readyLabel : m.needsReviewLabel
          ], `connection-${connection.fromPointNum}-${connection.toPointNum}-${index}`)
        )
      )
    }

    if (validationTab === 'history') {
      return h('div', null,
        validationHeaderRow([m.pointLabel, m.historyActionLabel, m.surveyActionLabel, m.relationshipActionLabel]),
        ...parsedTraverseData.monuments.map((monument) =>
          validationDataRow([
            monument.pointId,
            getFinalizeEditLabel(monument.pointId, ['update-history', 'create-history']),
            getFinalizeEditLabel(monument.pointId, ['update-survey-monument', 'create-survey-monument']),
            getFinalizeEditLabel(monument.pointId, ['backfill-history-relationship'])
          ], `history-${monument.pointId}`)
        )
      )
    }

    return h('div', null,
      finalizePlan.validations.length === 0
        ? h('div', { style: { fontSize: 12, opacity: 0.75 } }, m.noValidationIssues)
        : finalizePlan.validations.map((validation, index) =>
          h('div', {
            key: `${validation.severity}-${validation.pointId || index}`,
            className: 'py-1',
            style: {
              fontSize: 12,
              borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
              color: validation.severity === 'error' ? 'var(--danger-600, #c92a2a)' : validation.severity === 'warning' ? 'var(--warning-700, #8a5a00)' : undefined
            }
          },
          h('div', { style: { fontWeight: 700 } }, validation.severity.toUpperCase()),
          h('div', null, `${validation.pointId ? `${validation.pointId} - ` : ''}${validation.message}`)
          )
        )
    )
  }

  const finalizeConfirmationRows = () => {
    if (!finalizePlan) return []
    return [
      [m.finalizeDeleteTraverseConnection, finalizePlan.counts['delete-traverse-connection']],
      [m.finalizeCreateTraverseConnection, finalizePlan.counts['create-traverse-connection']],
      [m.finalizeUpdateSurveyMonument, finalizePlan.counts['update-survey-monument']],
      [m.finalizeCreateSurveyMonument, finalizePlan.counts['create-survey-monument']],
      [m.finalizeUpdateHistory, finalizePlan.counts['update-history']],
      [m.finalizeCreateHistory, finalizePlan.counts['create-history']],
      [m.finalizeBackfillHistory, finalizePlan.counts['backfill-history-relationship']]
    ].filter(([, count]) => Number(count) > 0)
  }

  const finalizeConfirmModal = () =>
    h(Modal, {
      isOpen: finalizeConfirmOpen,
      toggle: () => {
        if (!finalizingProject) setFinalizeConfirmOpen(false)
      },
      centered: true,
      backdrop: 'static',
      style: { width: 520, maxWidth: 'calc(100vw - 2rem)' }
    },
    h(ModalHeader, {
      toggle: finalizingProject
        ? undefined
        : () => {
            setFinalizeConfirmOpen(false)
          }
    }, m.finalizeProjectConfirmTitle),
    h(ModalBody, null,
      h('div', { className: 'd-flex flex-column', style: { gap: '0.75rem' } },
        h('div', { style: { fontSize: 12, lineHeight: '17px' } }, m.finalizeProjectConfirmMessage),
        h('div', null,
          validationHeaderRow([m.workflowStepLabel, m.countLabel, m.statusLabel]),
          ...finalizeConfirmationRows().map(([label, count]) =>
            validationDataRow([label, count, m.readyLabel], `finalize-confirm-${label}`)
          )
        )
      )
    ),
    h(ModalFooter, null,
      h(Button, {
        type: 'default',
        disabled: finalizingProject,
        onClick: () => {
          setFinalizeConfirmOpen(false)
        }
      }, m.cancel),
      h(Button, {
        type: 'primary',
        disabled: finalizingProject || !finalizePlan || !finalizePlan.canCommit,
        onClick: () => {
          applyFinalizeProjectEdits().catch(() => undefined)
        }
      }, m.finalizeProjectConfirmAction)
    ))

  const validationModal = () =>
    h(Modal, {
      isOpen: validationModalOpen,
      toggle: closeValidationModal,
      centered: true,
      backdrop: 'static',
      style: { width: 760, maxWidth: 'calc(100vw - 2rem)' }
    },
    h(ModalHeader, { toggle: closeValidationModal }, m.finalizeValidationTitle),
    h(ModalBody, null,
      h('div', { className: 'd-flex flex-column', style: { gap: '0.75rem', maxHeight: '68vh', minHeight: 360 } },
        validationReviewMode === 'traverse' && finalizePlan && h('div', {
          className: 'border rounded p-2',
          style: {
            fontSize: 12,
            fontWeight: 700,
            color: validationErrorCount > 0 ? 'var(--danger-600, #c92a2a)' : undefined,
            backgroundColor: 'rgba(0, 0, 0, 0.02)'
          }
        }, validationErrorCount > 0
          ? `${m.cannotFinalizeLabel}: ${validationErrorCount} ${m.errorsLabel}`
          : `${m.readyToFinalizeLabel}: ${finalizePlan.edits.length} ${m.plannedEditsLabel}`
        ),
        validationReviewMode === 'static' && parsedStaticData && h('div', {
          className: 'border rounded p-2',
          style: {
            fontSize: 12,
            fontWeight: 700,
            color: staticValidationErrorCount > 0 ? 'var(--danger-600, #c92a2a)' : undefined,
            backgroundColor: 'rgba(0, 0, 0, 0.02)'
          }
        }, staticValidationErrorCount > 0
          ? `${m.needsReviewLabel}: ${staticValidationErrorCount} ${m.errorsLabel}`
          : `${m.staticValidationReady}: ${parsedStaticData.projectControls.length} ${m.projectControlsLabel}`
        ),
        h('div', { className: 'd-flex flex-wrap', style: { gap: '0.35rem' } },
          validationTabButton('summary', m.summaryTab),
          validationTabButton('monuments', m.monumentsTab),
          validationReviewMode === 'traverse' && validationTabButton('connections', m.connectionsTab),
          validationReviewMode === 'traverse' && validationTabButton('history', m.historyTab),
          validationTabButton('issues', m.issuesTab)
        ),
        h('div', { className: 'flex-grow-1', style: { minHeight: 0, overflowY: 'auto', overflowX: 'auto' } },
          validationModalBody()
        )
      )
    ),
    h(ModalFooter, null,
      h(Button, {
        type: 'default',
        onClick: closeValidationModal
      }, m.close),
      validationReviewMode === 'traverse' && h(Button, {
        type: 'primary',
        disabled: loadingTraverseFiles || finalizingProject || !finalizePlan || !finalizePlan.canCommit,
        onClick: () => {
          setFinalizeConfirmOpen(true)
        }
      }, m.traverseMode)
    ))

  const traversePanel = () =>
    h('div', { className: 'd-flex flex-column flex-grow-1', style: { gap: '0.75rem', minHeight: 0 } },
      h('div', { className: 'd-flex align-items-center justify-content-between', style: { gap: '0.5rem' } },
        h('div', { className: 'font-weight-bold' }, activeMode.title),
        h(Button, {
          size: 'sm',
          type: 'tertiary',
          onClick: () => {
            setMode('finder')
          }
        }, m.cancel)
      ),
      selectedProject && h('div', { style: { fontSize: 14, fontWeight: 700, lineHeight: '18px', overflowWrap: 'anywhere' } }, selectedProject.name),
      h('div', { className: 'border rounded p-2 d-flex flex-column', style: { minHeight: 150, flex: '1 1 0' } },
        h('div', { className: 'd-flex align-items-center justify-content-between mb-2', style: { gap: '0.5rem' } },
          h('div', { className: 'font-weight-bold', style: { fontSize: 12 } }, m.traverseFilesTitle),
          h(Button, {
            size: 'sm',
            type: 'tertiary',
            disabled: loadingTraverseFiles || traverseFiles.length === 0,
            onClick: resetTraverseFiles,
            style: { height: 24, padding: '0 6px', fontSize: 11 }
          }, m.clear)
        ),
        h('input', {
          ref: traverseFileInputRef,
          type: 'file',
          accept: '.lst',
          multiple: true,
          style: { display: 'none' },
          onChange: (evt) => {
            const files = evt.target.files
            if (files) importTraverseFiles(files).catch(() => undefined)
            evt.target.value = ''
          }
        }),
        h('div', { className: 'flex-grow-1', style: { minHeight: 0, overflowY: 'auto', overflowX: 'hidden' } },
          loadingTraverseFiles
            ? h('div', { style: { fontSize: 12, opacity: 0.75 } }, m.loadingTraverseFiles)
            : traverseFiles.length === 0
              ? h('div', { style: { fontSize: 12, opacity: 0.72 } }, m.traverseFilesEmpty)
              : traverseFiles.map(traverseFileRow)
        ),
        h('div', { className: 'd-flex mt-2', style: { gap: '0.35rem' } },
          h(Button, {
            type: 'primary',
            size: 'sm',
            disabled: loadingTraverseFiles,
            style: modeActionButtonStyle,
            onClick: () => {
              traverseFileInputRef.current?.click()
            }
          }, m.chooseLstFiles),
          h(Button, {
            type: 'default',
            size: 'sm',
            disabled: loadingTraverseFiles || traverseFiles.length === 0,
            style: modeActionButtonStyle,
            onClick: reviewTraverseValidation
          }, m.reviewValidation)
        )
      ),
      h('div', { className: 'border rounded p-2 d-flex flex-column', style: { minHeight: 150, flex: '1 1 0' } },
        h('div', { className: 'd-flex align-items-center justify-content-between mb-2', style: { gap: '0.5rem' } },
          h('div', { className: 'font-weight-bold', style: { fontSize: 12 } }, m.calculateBasisOfBearingTitle),
          h(Button, {
            size: 'sm',
            type: 'tertiary',
            disabled: loadingTraverseFiles || (staticFiles.length === 0 && basisOfBearing.trim().length === 0),
            onClick: resetStaticFile,
            style: { height: 24, padding: '0 6px', fontSize: 11 }
          }, m.clear)
        ),
        h('input', {
          ref: staticFileInputRef,
          type: 'file',
          accept: '.lst',
          style: { display: 'none' },
          onChange: (evt) => {
            importStaticFile(evt.target.files?.[0]).catch(() => undefined)
            evt.target.value = ''
          }
        }),
        h('div', { className: 'mb-3', style: { minHeight: 44, maxHeight: 72, overflowY: 'auto', overflowX: 'hidden' } },
          h('div', { className: 'font-weight-bold mb-1', style: { fontSize: 11, opacity: 0.78 } }, m.staticFileLabel),
          staticFiles.length === 0
            ? h('div', { style: { fontSize: 12, opacity: 0.72 } }, m.staticFilesEmpty)
            : staticFiles.map(traverseFileRow)
        ),
        h('div', { className: 'font-weight-bold mb-1', style: { fontSize: 11, opacity: 0.78 } }, m.basisOfBearingTitle),
        h(TextInput, {
          value: basisOfBearing,
          placeholder: m.basisOfBearingPlaceholder,
          onChange: (evt) => {
            setBasisOfBearing(evt.target.value)
          }
        }),
        h('div', { className: 'd-flex', style: { gap: '0.35rem', marginTop: 'auto', paddingTop: '0.5rem' } },
          h(Button, {
            type: 'primary',
            size: 'sm',
            disabled: loadingTraverseFiles,
            style: modeActionButtonStyle,
            onClick: () => {
              staticFileInputRef.current?.click()
            }
          }, m.chooseStaticFile),
          h(Button, {
            type: 'default',
            size: 'sm',
            disabled: loadingTraverseFiles || staticFiles.length === 0,
            style: modeActionButtonStyle,
            onClick: reviewStaticValidation
          }, m.reviewValidation),
          h(Button, {
            type: 'primary',
            size: 'sm',
            style: modeActionButtonStyle,
            disabled: acceptingBasisOfBearing || basisOfBearing.trim().length === 0 || !selectedProject,
            onClick: () => {
              acceptBasisOfBearing().catch(() => undefined)
            }
          }, m.acceptBoB)
        )
      )
    )

  const modePanel = () =>
    h('div', { className: 'border rounded p-2 d-flex flex-column', style: { gap: '0.5rem', minHeight: 160 } },
      h('div', { className: 'd-flex align-items-center justify-content-between', style: { gap: '0.5rem' } },
        h('div', { className: 'font-weight-bold' }, activeMode.title),
        h(Button, {
          size: 'sm',
          type: 'tertiary',
          onClick: () => {
            setMode('finder')
          }
        }, m.projectFinderTitle)
      ),
      selectedProject && h('div', { style: { fontSize: 12, fontWeight: 600, overflowWrap: 'anywhere' } }, selectedProject.name),
      h('div', { style: { fontSize: 12, lineHeight: '17px', opacity: 0.82 } }, m.nextStep),
      h('div', { className: 'border rounded p-2', style: { backgroundColor: 'rgba(0, 0, 0, 0.02)' } },
        h('div', { className: 'font-weight-bold mb-2', style: { fontSize: 12 } }, m.configuredSources),
        ...configuredSources.map((source) => metadataRow(source.label, source.value || m.notConfigured))
      ),
      h('div', { className: 'border rounded p-2', style: { backgroundColor: 'rgba(0, 0, 0, 0.02)' } },
        h('div', { className: 'font-weight-bold mb-2', style: { fontSize: 12 } }, m.relationshipFields),
        metadataRow(m.projectGlobalIdField, cfg.projectGlobalIdField || 'GlobalID'),
        metadataRow(m.projectDisplayField, cfg.projectDisplayField || 'Name'),
        metadataRow(m.monumentGlobalIdField, cfg.monumentGlobalIdField || 'GlobalID'),
        metadataRow(m.monumentPointNumberField, cfg.monumentPointNumberField || 'PointNumber'),
        metadataRow(m.historyMonumentGlobalIdField, cfg.historyMonumentGlobalIdField || 'PointGlobalID'),
        metadataRow(m.historyProjectGlobalIdField, cfg.historyProjectGlobalIdField || 'ProjectGlobalID'),
        metadataRow(m.traverseProjectGlobalIdField, cfg.traverseProjectGlobalIdField || 'ProjectID'),
        metadataRow(m.traverseFromPointNumberField, cfg.traverseFromPointNumberField || 'FromPointNum'),
        metadataRow(m.traverseToPointNumberField, cfg.traverseToPointNumberField || 'ToPointNum')
      )
    )

  return h(React.Fragment, null,
    props.useMapWidgetIds?.[0] && h(JimuMapViewComponent, {
      useMapWidgetId: props.useMapWidgetIds[0],
      onActiveViewChange: setJimuMapView
    }),
    h(Card, { className: 'widget-monument-manager h-100 w-100' },
      h(CardHeader, null, m.widgetTitle),
      h(CardBody, { className: 'd-flex flex-column', style: { gap: '0.75rem', minHeight: 0 } },
        mode === 'finder' ? monumentProjectFinder() : mode === 'history' ? viewHistoryPanel() : isSurveyHistoryMode ? surveyHistoryPanel() : mode === 'create-project' ? createProjectPanel() : mode === 'traverse' ? traversePanel() : modePanel(),
        mode !== 'finder' && mode !== 'history' && !isSurveyHistoryMode && mode !== 'create-project' && mode !== 'traverse' && h('div', { className: 'border rounded p-2 flex-grow-1', style: { minHeight: 110 } },
          h('div', { className: 'font-weight-bold mb-2', style: { fontSize: 12 } }, m.selectedFeatures),
          h('div', { style: { fontSize: 12, opacity: 0.72 } }, m.selectedFeaturesEmpty)
        ),
        shouldShowStatusAlert() && h(Alert, {
          form: 'basic',
          type: getStatusAlertType(),
          text: status
        })
      )
    ),
    attachmentModal(),
    autoAssignModal(),
    pointNumberModal(),
    removeMonumentsModal(),
    targetMergeModal(),
    meanMergeModal(),
    createProjectValidationModal(),
    finalizeConfirmModal(),
    validationModal()
  )
}

export default Widget
