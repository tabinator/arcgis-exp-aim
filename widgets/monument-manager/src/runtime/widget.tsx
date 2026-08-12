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

type MonumentMode = 'finder' | 'history' | 'create' | 'create-project' | 'merge-points' | 'traverse' | 'update-xy'

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

type FinalizeEditKind =
  'update-history'
  | 'create-history'
  | 'update-survey-monument'
  | 'create-survey-monument'
  | 'backfill-history-relationship'
  | 'create-traverse-connection'

interface PlannedFinalizeEdit {
  kind: FinalizeEditKind
  label: string
  pointId?: string
  objectId?: string | number
  globalId?: string
  attributes?: { [key: string]: any }
  geometry?: { x: number, y: number }
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
}

interface CreateProjectPlan {
  rows: CreateProjectPlanRow[]
  createRows: CreateProjectPlanRow[]
  updateRows: CreateProjectPlanRow[]
  projectName: string
  canCommit: boolean
  errorCount: number
  warningCount: number
}

interface MergeRollbackAction {
  label: string
  run: () => Promise<void>
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
const MONUMENT_HISTORY_LAYER_ID = '999069'
const STANDARD_PROJECT_CSV_FIELDS = ['PointNumber', 'YCoordinate', 'XCoordinate', 'Elevation', 'MonumentDescription'] as const
const ORANGE_COUNTY_STATE_PLANE_SPATIAL_REFERENCE = { wkid: 102646, latestWkid: 2230 }
const CSV_SEARCH_POINT_BUFFER_FEET = 0.03
const CSV_PROJECT_BOUNDARY_PADDING_FEET = 25
const CSV_SPATIAL_QUERY_CONCURRENCY = 8

const escapeSqlString = (value: string) => value.replace(/'/g, "''")

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

const getCsvProjectRowCoordinates = (item: CsvProjectRow) => {
  const x = parseCsvCoordinate(getCsvAttribute(item.attributes, ['XCoordinate', 'Longitude', 'Easting']))
  const y = parseCsvCoordinate(getCsvAttribute(item.attributes, ['YCoordinate', 'Latitude', 'Northing']))
  if (x === undefined || y === undefined) return null
  return {
    x,
    y,
    z: parseCsvCoordinate(item.attributes.Elevation)
  }
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

const emptyFinalizeCounts = (): { [key in FinalizeEditKind]: number } => ({
  'update-history': 0,
  'create-history': 0,
  'update-survey-monument': 0,
  'create-survey-monument': 0,
  'backfill-history-relationship': 0,
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
  const [buildingAutoAssignPlan, setBuildingAutoAssignPlan] = React.useState(false)
  const [autoAssigningHistory, setAutoAssigningHistory] = React.useState(false)
  const [autoAssignPlan, setAutoAssignPlan] = React.useState<AutoAssignPlan | null>(null)
  const [autoAssignModalOpen, setAutoAssignModalOpen] = React.useState(false)
  const [buildingPointNumberPlan, setBuildingPointNumberPlan] = React.useState(false)
  const [applyingPointNumbers, setApplyingPointNumbers] = React.useState(false)
  const [pointNumberPlan, setPointNumberPlan] = React.useState<PointNumberPlan | null>(null)
  const [pointNumberModalOpen, setPointNumberModalOpen] = React.useState(false)
  const [attachmentItems, setAttachmentItems] = React.useState<AttachmentSummary[]>([])
  const [stagedAttachmentFiles, setStagedAttachmentFiles] = React.useState<StagedAttachmentFile[]>([])
  const [attachmentError, setAttachmentError] = React.useState('')
  const [attachmentHistoryItem, setAttachmentHistoryItem] = React.useState<MonumentHistorySummary | null>(null)
  const [loadingAttachments, setLoadingAttachments] = React.useState(false)
  const [uploadingAttachments, setUploadingAttachments] = React.useState(false)
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
  const [validationTab, setValidationTab] = React.useState<FinalizeValidationTab>('summary')
  const [validationReviewMode, setValidationReviewMode] = React.useState<ValidationReviewMode>('traverse')
  const [basisOfBearing, setBasisOfBearing] = React.useState('')
  const [acceptingBasisOfBearing, setAcceptingBasisOfBearing] = React.useState(false)
  const [loadingTraverseFiles, setLoadingTraverseFiles] = React.useState(false)
  const [status, setStatus] = React.useState(m.statusReady)
  const searchInitializedRef = React.useRef(false)
  const projectLayerFiltersRef = React.useRef(new Map<string, { layer: any, definitionExpression: string | null | undefined }>())
  const monumentGraphicsLayerRef = React.useRef<any>(null)
  const monumentGraphicsMapRef = React.useRef<any>(null)
  const csvProjectGraphicsSignatureRef = React.useRef('')
  const suppressAssignSurveySelectionSyncRef = React.useRef(false)
  const monumentProjectsLayerRef = React.useRef<{ url: string, layer: any } | null>(null)
  const surveyMonumentsLayerRef = React.useRef<{ url: string, layer: any } | null>(null)
  const monumentHistoryLayerRef = React.useRef<{ url: string, layer: any } | null>(null)
  const attachmentFileInputRef = React.useRef<HTMLInputElement | null>(null)
  const projectCsvFileInputRef = React.useRef<HTMLInputElement | null>(null)
  const traverseFileInputRef = React.useRef<HTMLInputElement | null>(null)
  const staticFileInputRef = React.useRef<HTMLInputElement | null>(null)

  const workflowModes: ModeDefinition[] = [
    { id: 'history', label: m.viewHistoryMode, title: m.viewHistoryTitle },
    { id: 'create', label: m.createMode, title: m.assignProjectTitle },
    { id: 'create-project', label: m.createTitle, title: m.createProjectWorkflowTitle },
    { id: 'merge-points', label: m.mergePointsMode, title: m.mergePointsTitle },
    { id: 'traverse', label: m.traverseMode, title: m.traverseTitle },
    { id: 'update-xy', label: m.updateXyMode, title: m.updateXyTitle }
  ]
  const workflowModeRows: MonumentMode[][] = [
    ['history', 'create'],
    ['create-project', 'traverse', 'merge-points']
  ]

  const activeMode = workflowModes.find((item) => item.id === mode) || workflowModes[0]
  const isSurveyHistoryMode = mode === 'create' || mode === 'merge-points'
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
    status: displayOptionalValue(getAttributeValue(attributes, 'Status'))
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

    return `${activeWhere} AND (${textSearch.join(' OR ')})`
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

    dataSourceManager.getDataSourcesAsArray?.().forEach(addDataSource)

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
      const results = await layer.applyEdits({
        addAttachments: stagedAttachmentFiles.map((item) => ({
          feature: { objectId },
          attachment: {
            globalId: createAttachmentGlobalId(),
            name: item.file.name,
            contentType: item.file.type || 'application/octet-stream',
            data: item.file
          }
        }))
      }, {
        globalIdUsed: true,
        rollbackOnFailureEnabled: true
      })
      const failedResult = (results.addAttachmentResults || []).find((result: any) => result?.error)
      if (failedResult) throw new Error(failedResult.error?.message || m.attachmentUploadFailed)
      setStatus(`${m.attachmentUploadSuccess}: ${stagedAttachmentFiles.length}`)
      clearStagedAttachmentFiles()
      await loadHistoryAttachments(historyItem)
    } catch (err) {
      const message = err instanceof Error ? err.message : m.attachmentUploadFailed
      setAttachmentError(message || m.attachmentUploadFailed)
      setStatus(m.attachmentUploadFailed)
    } finally {
      setUploadingAttachments(false)
    }
  }, [clearStagedAttachmentFiles, getMonumentHistoryLayer, loadHistoryAttachments, m.attachmentSelectHistoryFirst, m.attachmentUnsupported, m.attachmentUploadFailed, m.attachmentUploadSuccess, stagedAttachmentFiles])

  const deleteHistoryAttachment = React.useCallback(async (historyItem: MonumentHistorySummary, attachment: AttachmentSummary) => {
    const objectId = getNumericObjectId(historyItem.objectId)
    if (objectId === null) return

    setAttachmentError('')

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
      setStatus(m.attachmentDeleteFailed)
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
  }

  const closeAttachmentModal = () => {
    setAttachmentHistoryItem(null)
    setAttachmentItems([])
    setAttachmentError('')
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

  const stageFinalizeProjectEdits = () => {
    if (!finalizePlan) return
    setStatus(`${m.traverseMode}: ${finalizePlan.edits.length} ${m.plannedEditsLabel}. ${m.finalizeProjectPending}`)
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

    const missingGlobalIdObjectIds = rawIncomingSurveyMonuments
      .filter((item) => !item.globalId && item.objectId !== undefined && item.objectId !== null)
      .map((item) => item.objectId)
    const enrichedMonuments = await loadSurveyMonumentsByObjectIds(missingGlobalIdObjectIds)
    const incomingSurveyMonuments = rawIncomingSurveyMonuments.map((item) =>
      item.globalId ? item : enrichedMonuments.get(String(item.objectId)) || item
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
      setStatus(`${m.assignHistoryLoaded} ${historyItemsWithProjects.length}`)
    } catch (err) {
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

    setAutoAssigningHistory(true)
    try {
      if (selectedCandidates.length === 0) {
        setStatus(`${m.autoAssignComplete}: 0. ${m.autoAssignNoEligibleHistory}: ${autoAssignPlan.rows.length}`)
        return
      }
      const layer = await getMonumentHistoryLayer()
      const results = await layer.applyEdits({
        updateFeatures: selectedCandidates.map((row) => ({
          attributes: {
            OBJECTID: row.historyObjectId,
            [historyProjectGlobalIdField]: selectedProject.globalId
          }
        }))
      }, {
        rollbackOnFailureEnabled: true
      })
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

    setAddingAssignHistory(true)
    try {
      const layer = await getMonumentHistoryLayer()
      const attributes = {
        [historyMonumentGlobalIdField]: monument.globalId,
        [historyProjectGlobalIdField]: selectedProject.globalId,
        PointNumber: monument.pointNumber === '-' ? null : monument.pointNumber,
        Status: monument.status === '-' ? null : monument.status,
        Type: monument.monumentType === '-' ? null : monument.monumentType
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

  const assignProjectToHistoryItem = React.useCallback(async (item: MonumentHistorySummary) => {
    if (!selectedProject?.globalId) {
      setStatus(m.historyMissingProjectId)
      return
    }

    const objectId = getNumericObjectId(item.objectId)
    if (objectId === null) {
      setStatus(m.assignProjectValueFailed)
      return
    }

    const itemKey = getHistoryKey(item)
    setAssigningHistoryProjectKey(itemKey)
    try {
      const layer = await getMonumentHistoryLayer()
      const results = await layer.applyEdits({
        updateFeatures: [{
          attributes: {
            OBJECTID: objectId,
            [historyProjectGlobalIdField]: selectedProject.globalId
          }
        }]
      }, {
        rollbackOnFailureEnabled: true
      })
      const failedResult = (results.updateFeatureResults || []).find((result: any) => result?.error)
      if (failedResult) throw new Error(failedResult.error?.message || m.assignProjectValueFailed)

      setStatus(`${m.assignProjectValueSuccess}: ${item.pointNumber}`)
      const activeMonument = assignSurveyMonuments.find((monument) => getSurveyMonumentKey(monument) === activeAssignSurveyKey)
      if (activeMonument) await loadAssignHistoryForSurveyMonument(activeMonument)
    } catch (err) {
      const message = err instanceof Error ? err.message : m.assignProjectValueFailed
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

  const getProjectWhere = (project: MonumentProjectSummary) => {
    if (project.globalId) return `${projectGlobalIdField} = '${escapeSqlString(project.globalId)}'`
    return `OBJECTID = ${project.objectId}`
  }

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
      const layerId = layerDataSource?.layerId ?? layer.layerId
      const candidates = [
        layer.url,
        layer.parsedUrl?.path,
        layer.sourceJSON?.url,
        layerDataSource?.url,
        layerDataSource?.getDataSourceJson?.()?.url
      ].filter(Boolean).map(String)

      if (layerId !== undefined) {
        candidates.push(...candidates.map((url) => `${url.replace(/\/+$/, '')}/${layerId}`))
      }

      if (urlCandidatesMatch(monumentProjectsUrl, candidates) && !layers.includes(layer)) {
        layers.push(layer)
      }
    }

    return layers
  }

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
    monumentGraphicsLayerRef.current?.removeAll?.()
    monumentGraphicsMapRef.current?.remove?.(monumentGraphicsLayerRef.current)
  }, [])

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
    const requiresProject = nextMode !== 'merge-points'
    if (requiresProject && !selectedProject) {
      setStatus(m.selectProjectFirst)
      return
    }
    if (nextMode === 'merge-points') {
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
    setAssignSurveyMonuments((current) => {
      const targetIndex = current.findIndex((item) => getSurveyMonumentKey(item) === activeAssignSurveyKey)
      if (targetIndex <= 0) return current
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

  const executeMergeWithRollback = React.useCallback(async (
    runOperation: (registerRollback: (action: MergeRollbackAction) => void) => void | Promise<void>
  ) => {
    const rollbackActions: MergeRollbackAction[] = []
    const registerRollback = (action: MergeRollbackAction) => {
      rollbackActions.push(action)
    }

    try {
      await runOperation(registerRollback)
    } catch (err) {
      for (const action of [...rollbackActions].reverse()) {
        try {
          await action.run()
        } catch (rollbackErr) {
          const message = rollbackErr instanceof Error ? rollbackErr.message : m.mergeRollbackFailed
          throw new Error(`${m.mergeRollbackFailed} ${action.label}: ${message}`)
        }
      }
      throw err
    }
  }, [m.mergeRollbackFailed])

  const stageMergeAction = async (mergeType: MergeOperationType) => {
    if (!canMergeSurveyMonuments) {
      setStatus(m.mergeRequiresMultipleMonuments)
      return
    }
    const targetMonument = assignSurveyMonuments[0]
    const sourceMonuments = assignSurveyMonuments.slice(1)
    const actionLabel = mergeType === 'target' ? m.targetMerge : m.meanMerge
    await executeMergeWithRollback(() => {
      setStatus(`${actionLabel}: ${targetMonument.pointNumber} <- ${sourceMonuments.length} monuments. ${m.mergeActionPending}`)
    })
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
    const projectName = newProjectName.trim()
    const sourceRows: Array<{ source: CreateProjectPlanSource, items: CsvProjectRow[] }> = [
      { source: 'new-search-point', items: newSearchPointRows },
      { source: 'existing-monument', items: existingMonumentRows },
      { source: 'multiple-monuments', items: multipleMonumentRows }
    ]
    const rows = sourceRows.flatMap(({ source, items }) =>
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
        const severity = missingPointNumber || missingCoordinates
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
          severity
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
      canCommit: errorCount === 0,
      errorCount,
      warningCount
    }
  }, [
    existingMonumentRows,
    m.createProjectPlanEmpty,
    multipleMonumentRows,
    newProjectName,
    newSearchPointRows
  ])

  const analyzeProjectCsvResults = () => {
    const plan = buildCreateProjectPlan()
    setCreateProjectPlan(plan)
    if (!plan) return
    setCreateProjectModalOpen(true)
    setStatus(`${m.createProjectPlanReady}: ${plan.createRows.length + plan.updateRows.length}. ${m.errorsLabel}: ${plan.errorCount}. ${m.warningsLabel}: ${plan.warningCount}`)
  }

  const getCreateProjectCsvRows = React.useCallback(() => [
    ...newSearchPointRows,
    ...existingMonumentRows,
    ...multipleMonumentRows
  ], [existingMonumentRows, multipleMonumentRows, newSearchPointRows])

  const getFailedEditResult = (results: any, resultKey: string, fallbackMessage: string) => {
    const failedResult = (results?.[resultKey] || []).find((result: any) => result?.error)
    return failedResult ? new Error(failedResult.error?.message || fallbackMessage) : null
  }

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
      const projectLayer = await getMonumentProjectsLayer()
      const surveyLayer = await getSurveyMonumentsLayer()
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
          deleteFeatures: [{ attributes: { OBJECTID: projectObjectId } }]
        })
      })

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
            deleteFeatures: createdSurveyObjectIds.map((objectId: number | string) => ({ attributes: { OBJECTID: objectId } }))
          })
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
        }, {
          rollbackOnFailureEnabled: true
        })
        rollbackSteps.push(async () => {
          if (updateRows.length === 0) return
          await surveyLayer.applyEdits({
            updateFeatures: updateRows.map((row) => ({
              attributes: {
                OBJECTID: row.surveyObjectId,
                [monumentPointNumberField]: row.currentPointNumber || null
              }
            }))
          }, {
            rollbackOnFailureEnabled: true
          })
        })
        const surveyUpdateError = getFailedEditResult(surveyUpdateResults, 'updateFeatureResults', m.createProjectFailed)
        if (surveyUpdateError) throw surveyUpdateError
      }

      setCreateProjectModalOpen(false)
      setStatus(`${m.createProjectSuccess}: ${plan.projectName}. ${m.surveyMonumentsToCreate}: ${plan.createRows.length}. ${m.surveyMonumentsToUpdate}: ${plan.updateRows.length}`)
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
          'PointNumber'
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
            pointNumber
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
      return { edits, validations, counts, canCommit: false }
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

    traverseData.monuments.forEach((monument) => {
      const historyRecords = historiesByPointNumber.get(monument.pointId.trim().toLowerCase()) || []
      if (historyRecords.length > 1) {
        validations.push({
          severity: 'warning',
          pointId: monument.pointId,
          message: m.finalizeDuplicateHistory
        })
      }

      const historyAttributes = {
        PointNumber: monument.pointId,
        StdDevN: monument.stdDevN,
        StdDevE: monument.stdDevE,
        StdDevElev: monument.stdDevElev,
        FixedStation: monument.fixedStation ? 1 : 0,
        XCoordinate: monument.easting,
        YCoordinate: monument.northing,
        ProjectGlobalID: projectGlobalId,
        Remarks: monument.description
      }
      const geometry = hasCoordinatePair(monument)
        ? { x: monument.easting, y: monument.northing }
        : undefined

      if (historyRecords.length > 0) {
        historyRecords.forEach((history) => {
          edits.push({
            kind: 'update-history',
            label: `${m.finalizeUpdateHistory}: ${monument.pointId}`,
            pointId: monument.pointId,
            objectId: history.objectId,
            globalId: history.globalId,
            attributes: historyAttributes
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
          attributes: historyAttributes
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
        attributes: {
          ProjectID: projectGlobalId,
          FromPointNum: connection.fromPointNum,
          ToPointNum: connection.toPointNum,
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
      canCommit: validations.every((validation) => validation.severity !== 'error')
    }
  }, [
    m.finalizeBackfillHistory,
    m.finalizeCreateHistory,
    m.finalizeCreateSurveyMonument,
    m.finalizeCreateTraverseConnection,
    m.finalizeDryRunOnly,
    m.finalizeDuplicateHistory,
    m.finalizeUpdateHistory,
    m.finalizeUpdateSurveyMonument,
    m.selectProjectFirst,
    m.traverseConnectionMissingCoordinates,
    m.traverseMissingCoordinates,
    monumentPointNumberField,
    queryFinalizeHistoryByPointNumbers,
    queryFinalizeSurveyMonumentsByGlobalIds,
    selectedProject?.globalId,
    traverseConnectionsUrl
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

    const rows = selectedHistoryItems.map((item) => {
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
    try {
      const layer = await getSurveyMonumentsLayer()
      const results = await layer.applyEdits({
        updateFeatures: updateRows.map((row) => ({
          attributes: {
            OBJECTID: row.surveyObjectId,
            [monumentPointNumberField]: row.newPointNumber
          }
        }))
      }, {
        rollbackOnFailureEnabled: true
      })
      const failedResult = (results.updateFeatureResults || []).find((result: any) => result?.error)
      if (failedResult) throw new Error(failedResult.error?.message || m.pointNumberApplyFailed)

      setStatus(`${m.pointNumberApplyComplete}: ${updateRows.length}`)
      setPointNumberModalOpen(false)
      if (selectedProject) await loadProjectHistory(selectedProject)
    } catch (err) {
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
      setTraverseFiles(parsedFiles)
      setParsedTraverseData(null)
      setParsedStaticData(null)
      setFinalizePlan(null)
      setValidationModalOpen(false)
      setStatus(getProjectFileNameValidationStatus(parsedFiles) || `${m.traverseParsed}: ${parsedFiles.length}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : m.traverseParseFailed
      setStatus(`${m.traverseParseFailed} ${message || ''}`.trim())
    } finally {
      setLoadingTraverseFiles(false)
    }
  }, [getProjectFileNameValidationStatus, m.traverseParsed, m.traverseParseFailed])

  const importStaticFile = React.useCallback(async (file?: File) => {
    if (!file) return

    setLoadingTraverseFiles(true)
    try {
      const parsedFile = await parseTraverseFile(file)
      setStaticFiles([parsedFile])
      setBasisOfBearing(parsedFile.basisOfBearing || '')
      setParsedTraverseData(null)
      setParsedStaticData(null)
      setFinalizePlan(null)
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
    setValidationModalOpen(false)
    setStatus(m.traverseFilesReset)
  }

  const stageProcessTraverseFiles = async () => {
    setLoadingTraverseFiles(true)
    const fileResults = traverseFiles.map((file) => parseTraverseText(file.text, file.id, file.name, staticFiles.length === 0))
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
    const connections = enrichedFileResults.flatMap((result) => result.connections)
    const calculatedConnectionCount = connections.filter((connection) =>
      connection.distance !== undefined && connection.direction !== undefined
    ).length

    const parsedData = {
      monuments: Array.from(monumentsByPointId.values()),
      connections,
      fixedStations: Array.from(fixedStations),
      files: enrichedFileResults
    }
    try {
      const plan = await buildFinalizePlan(parsedData)
      await createFinalizeStepRunner([{
        label: m.finalizeDryRunOnly,
        execute: () => Promise.resolve(),
        rollback: () => Promise.resolve()
      }])
      setParsedTraverseData(parsedData)
      setFinalizePlan(plan)
      setStatus(`${m.traverseProcessed}: ${parsedData.monuments.length} ${m.traverseMonumentsLabel}, ${parsedData.connections.length} ${m.traverseConnectionsLabel}, ${calculatedConnectionCount} ${m.traverseCalculatedLabel}, ${parsedData.fixedStations.length} ${m.fixedStationsLabel}. ${m.finalizePlanReady}: ${plan.edits.length}`)
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
      }, {
        rollbackOnFailureEnabled: true
      })
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
      { label: m.markerMaterialLabel, value: item.markerMaterial }
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
          assignProjectToHistoryItem(item).catch(() => undefined)
        },
        style: { width: 32, minWidth: 32, height: 32, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }
      }, '↗')
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
          },
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
                        style: { height: 24, padding: '0 6px', fontSize: 11 },
                        onClick: () => {
                          deleteHistoryAttachment(historyItem, attachment).catch(() => undefined)
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
    h(ModalFooter, null,
      h(Button, {
        type: 'default',
        onClick: closeAttachmentModal
      }, m.cancel)
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
      h('div', { className: 'border rounded p-2 d-flex flex-column', style: { minHeight: 120, flex: '0 0 38%' } },
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
            disabled: assignSurveyMonuments.length < 2 || !activeAssignSurveyKey,
            onClick: setActiveSurveyMonumentAsTarget
          }, m.setTarget),
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
          h('div', { style: { fontSize: 11, opacity: 0.75 } }, `${assignHistoryItems.length} ${m.featureCountLabel}`)
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
          }, m.addHistory)
        ),
        mode === 'merge-points' && h('div', { className: 'd-flex mt-2', style: { gap: '0.35rem' } },
          h(Button, {
            type: 'primary',
            size: 'sm',
            style: modeActionButtonStyle,
            disabled: !canMergeSurveyMonuments,
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
            disabled: !canMergeSurveyMonuments,
            onClick: () => {
              stageMergeAction('mean').catch((err) => {
                const message = err instanceof Error ? err.message : m.mergeRollbackFailed
                setStatus(message || m.mergeRollbackFailed)
              })
            }
          }, m.meanMerge)
        )
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
              validationCountTile(m.newSearchPoint, newSearchPointRows.length),
              validationCountTile(m.existingMonument, existingMonumentRows.length),
              validationCountTile(m.multipleMonuments, multipleMonumentRows.length),
              validationCountTile(m.surveyMonumentsToCreate, createProjectPlan.createRows.length),
              validationCountTile(m.surveyMonumentsToUpdate, createProjectPlan.updateRows.length),
              validationCountTile(m.errorsLabel, createProjectPlan.errorCount),
              validationCountTile(m.warningsLabel, createProjectPlan.warningCount)
            ),
            h('div', { className: 'flex-grow-1', style: { minHeight: 0, overflowY: 'auto', overflowX: 'auto' } },
              validationHeaderRow([m.sourceListLabel, m.pointNumberLabel, m.descriptionLabel, 'x', 'y', 'z', m.actionLabel]),
              ...createProjectPlan.rows.map((row) =>
                validationDataRow([
                  createProjectSourceLabel(row.source),
                  row.pointNumber,
                  row.description,
                  row.x,
                  row.y,
                  row.z,
                  createProjectActionLabel(row)
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
        disabled: loadingTraverseFiles || !finalizePlan || !finalizePlan.canCommit,
        onClick: stageFinalizeProjectEdits
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
          type: status === m.projectFileNameMismatch ? 'warning' : 'info',
          text: status
        })
      )
    ),
    attachmentModal(),
    autoAssignModal(),
    pointNumberModal(),
    createProjectValidationModal(),
    validationModal()
  )
}

export default Widget
