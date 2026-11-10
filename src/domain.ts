import type { Feature, FeatureCollection, Geometry } from 'geojson'

export const DEVICES = ['bicycle', 'ebike-1', 'ebike-2', 'ebike-3', 'escooter'] as const
export type Device = (typeof DEVICES)[number]

export const DEVICE_LABELS: Record<Device, string> = {
  bicycle: 'Bicycle',
  'ebike-1': 'Class 1 e-bike',
  'ebike-2': 'Class 2 e-bike',
  'ebike-3': 'Class 3 e-bike',
  escooter: 'Electric scooter',
}

export type Access = 'allowed' | 'walk-device' | 'prohibited' | 'unverified'
export const ACCESS_LABELS: Record<Access, string> = {
  allowed: 'Allowed',
  'walk-device': 'Walk device',
  prohibited: 'Prohibited',
  unverified: 'Unverified',
}

export type DatasetMode = 'irvine' | 'demo'
export type ModeOfTravel = 'ride' | 'walk'
export type Direction = 'forward' | 'reverse'
export type FeatureKind = 'facility' | 'restriction' | 'dismount' | 'closure' | 'destination' | 'parking'

export interface Topology {
  from: string
  to: string
  grade: number
  direction: Direction | 'both'
}

export interface RideFeatureProperties {
  id: string
  name: string
  kind: FeatureKind
  provenance: { method: string; sourceId?: string; details?: string }
  roadwaySpeedMph?: number | null
  expectedSpeedMph?: number | null
  topology?: Topology
}

export type RideFeature = Feature<Geometry, RideFeatureProperties>
export type RideFeatureCollection = FeatureCollection<Geometry, RideFeatureProperties>

export interface Source {
  id: string
  title: string
  authority: string
  url: string | null
  verifiedOn: string | null
}

export interface Issue {
  id: string
  title: string
  detail: string
  status: 'missing' | 'conflict' | 'review'
  sourceIds: string[]
}

// Local Pacific time. Weekdays are indexed Sunday=0 to Saturday=6.
export interface WeeklyWindow {
  weekdays: number[]
  start: string
  end: string
}

export interface Rule {
  id: string
  featureId: string
  devices: Device[]
  sourceIds: string[]
  status: 'verified' | 'demo' | 'unverified' | 'conflict'
  explanation: string
  access?: Exclude<Access, 'unverified'>
  riderSpeedMph?: number
  totalClosure?: true
  appliesTo: ModeOfTravel | 'both'
  schedule?: WeeklyWindow
  effective?: { from?: string; to?: string }
  exceptions?: WeeklyWindow[]
}

export interface Snapshot {
  version: string
  mode: DatasetMode
  features: RideFeatureCollection
  rules: Rule[]
  sources: Source[]
  issues: Issue[]
}
