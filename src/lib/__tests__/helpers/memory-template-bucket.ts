// Faux bucket s3nd en mémoire, pour tester le store des modèles et ses routes
// sans R2. Il reproduit ce dont le store dépend :
// - `ifAbsent` échoue si la clé existe, `ifMatch` si l'ETag a changé, avec une
//   vraie `S3ndError('PRECONDITION_FAILED')` reconnue par `isS3ndError` ;
// - chaque écriture change l'ETag ;
// - les données font l'aller-retour en JSON, comme dans l'enveloppe s3nd ;
// - `maxVersion` lève `SNAPSHOT_TOO_NEW`, `maxSize` lève `FILE_TOO_LARGE`.

import {
  S3ndError,
  type GetSnapshotOptions,
  type PutSnapshotOptions,
  type Snapshot,
  type SnapshotResult,
} from '@s3nd/core'
import type { TemplateBucket } from '@/lib/template-store'

interface StoredObject {
  json: string
  etag: string
  createdAt: Date
  app?: string
  version?: number
}

export interface MemoryTemplateBucket extends TemplateBucket {
  /** Clés présentes, triées. */
  keys(): string[]
  /** Contenu d'une clé (copie), ou `undefined`. */
  peek(key: string): unknown
  /** Écrit directement, comme le ferait un autre serveur : l'ETag change. */
  poke(key: string, data: unknown, options?: { version?: number }): void
  /** Toutes les écritures réussies ou refusées, dans l'ordre. */
  readonly puts: { key: string; options: PutSnapshotOptions }[]
  /** Appelé avant chaque écriture : de quoi glisser un écrivain concurrent. */
  beforePut: ((key: string) => void) | null
  /** Taille maximale du JSON écrit, en octets. */
  maxSize: number | null
  reset(): void
}

export function createMemoryTemplateBucket(): MemoryTemplateBucket {
  const objects = new Map<string, StoredObject>()
  let counter = 0

  function store(key: string, json: string, version?: number, app?: string) {
    counter += 1
    const stored: StoredObject = {
      json,
      etag: `etag-${counter}`,
      createdAt: new Date(),
      app,
      version,
    }
    objects.set(key, stored)
    return stored
  }

  const bucket: MemoryTemplateBucket = {
    puts: [],
    beforePut: null,
    maxSize: null,

    async putSnapshot(
      key: string,
      data: unknown,
      options: PutSnapshotOptions = {},
    ): Promise<SnapshotResult> {
      bucket.puts.push({ key, options })
      bucket.beforePut?.(key)
      const json = JSON.stringify(data)
      if (bucket.maxSize !== null && json.length > bucket.maxSize) {
        throw new S3ndError('FILE_TOO_LARGE', `${key} dépasse maxSize.`)
      }
      const existing = objects.get(key)
      if (options.ifAbsent && existing) {
        throw new S3ndError('PRECONDITION_FAILED', `${key} existe déjà.`)
      }
      if (
        options.ifMatch !== undefined &&
        (!existing || existing.etag !== options.ifMatch)
      ) {
        throw new S3ndError('PRECONDITION_FAILED', `${key} a changé.`)
      }
      const stored = store(key, json, options.version, options.app)
      return {
        bucket: 'memoire',
        key,
        path: `templates/${key}`,
        etag: stored.etag,
        size: json.length,
        compressed: true,
        createdAt: stored.createdAt,
      }
    },

    async getSnapshot(
      key: string,
      options: GetSnapshotOptions = {},
    ): Promise<Snapshot<unknown> | null> {
      const stored = objects.get(key)
      if (!stored) return null
      if (
        options.maxVersion !== undefined &&
        stored.version !== undefined &&
        stored.version > options.maxVersion
      ) {
        throw new S3ndError('SNAPSHOT_TOO_NEW', `${key} est trop récent.`)
      }
      return {
        bucket: 'memoire',
        key,
        path: `templates/${key}`,
        data: JSON.parse(stored.json),
        app: stored.app,
        version: stored.version,
        createdAt: stored.createdAt,
        etag: stored.etag,
        size: stored.json.length,
      }
    },

    async delete(key: string | string[]): Promise<void> {
      for (const one of Array.isArray(key) ? key : [key]) objects.delete(one)
    },

    keys() {
      return [...objects.keys()].sort()
    },

    peek(key: string) {
      const stored = objects.get(key)
      return stored ? JSON.parse(stored.json) : undefined
    },

    poke(key: string, data: unknown, options = {}) {
      store(key, JSON.stringify(data), options.version ?? 1, 'tripbrain')
    },

    reset() {
      objects.clear()
      bucket.puts.length = 0
      bucket.beforePut = null
      bucket.maxSize = null
      counter = 0
    },
  }
  return bucket
}
