import type { ImmutableObject } from 'seamless-immutable'

export interface Config {
  message: string
}

export type IMConfig = ImmutableObject<Config>
