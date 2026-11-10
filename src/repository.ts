import type { DatasetMode, Snapshot } from './domain.ts';

export interface SnapshotRepository {
  load(mode: DatasetMode, signal?: AbortSignal): Promise<Snapshot>;
}

const DATASET_VERSION = 'v1';

async function readJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Could not load ${url} (HTTP ${response.status}).`);
  }
  return response.json() as Promise<T>;
}

export const snapshotRepository: SnapshotRepository = {
  async load(mode, signal) {
    const folder = `${import.meta.env.BASE_URL}data/${DATASET_VERSION}/${mode}`;
    const [records, features] = await Promise.all([
      readJson<Omit<Snapshot, 'features'>>(`${folder}/records.json`, signal),
      readJson<Snapshot['features']>(`${folder}/features.geojson`, signal),
    ]);

    if (
      records?.mode !== mode ||
      records.version !== DATASET_VERSION ||
      !Array.isArray(records.rules) ||
      !Array.isArray(records.sources) ||
      !Array.isArray(records.issues) ||
      features?.type !== 'FeatureCollection' ||
      !Array.isArray(features.features)
    ) {
      throw new Error(`The ${mode} dataset has an invalid or incompatible snapshot.`);
    }

    return { ...records, features };
  },
};
