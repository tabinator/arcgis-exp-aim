import type { ImmutableObject } from 'seamless-immutable'

export interface Config {
  targetDataSourceIds: string[]
  targetLayerIds?: string[]
  keepActiveAfterSelect: boolean
}

export type IMConfig = ImmutableObject<Config>
