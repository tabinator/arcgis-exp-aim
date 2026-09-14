import type { ImmutableObject } from 'seamless-immutable'

export type CategorySelectionMode = 'single' | 'multiple'

export interface LibraryLayer {
  id: string
  jimuLayerViewId?: string
  layerDataSourceId?: string
  arcgisLayerId?: string
  title?: string
  type?: string
  defaultVisible: boolean
  allowFiltering: boolean
  allowOpacity: boolean
  allowZoom: boolean
  filterFields?: string[]
}

export interface LayerCategory {
  id: string
  name: string
  description?: string
  icon?: string
  layers: LibraryLayer[]
}

export interface Config {
  categories: LayerCategory[]
  selectionMode: CategorySelectionMode
  showSearch: boolean
  showLayerFilters: boolean
  showZoomToLayer: boolean
  showVisibilityToggle: boolean
  showLegend: boolean
}

export type IMConfig = ImmutableObject<Config>
