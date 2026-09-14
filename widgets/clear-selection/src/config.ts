import type { ImmutableObject } from 'seamless-immutable'

export interface Config {
  [key: string]: never
}

export type IMConfig = ImmutableObject<Config>
