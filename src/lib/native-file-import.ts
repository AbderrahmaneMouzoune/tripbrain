/**
 * Fichier ouvert « avec TripBrain » depuis une autre app (Mail, Fichiers,
 * AirDrop) : que faire de lui, d'après son nom et son type.
 *
 * Logique pure, testée dans `src/lib/__tests__/native-file-import.test.ts`.
 */

/** Au-delà, le fichier a traversé le bridge en base64 et pèse trop pour la page. */
export const NATIVE_IMPORT_MAX_BYTES = 15 * 1024 * 1024

export type NativeImportRoute =
  /** Itinéraire (.json, .xlsx, .csv) : aperçu puis ajout ou remplacement. */
  | { kind: 'itinerary' }
  /** Archive de documents exportée par TripBrain. */
  | { kind: 'documents-zip' }
  /** Billet, réservation, photo : rangé dans les documents du voyage. */
  | { kind: 'document' }
  | { kind: 'too-large' }
  | { kind: 'unsupported' }

const IMAGE_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'heic',
  'heif',
])

const extensionOf = (name: string) =>
  name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? ''

export function routeNativeImport(file: {
  name: string
  type: string
  size: number
}): NativeImportRoute {
  if (file.size > NATIVE_IMPORT_MAX_BYTES) return { kind: 'too-large' }

  const extension = extensionOf(file.name)
  const type = file.type.toLowerCase()

  if (
    extension === 'json' ||
    extension === 'xlsx' ||
    extension === 'csv' ||
    (!extension &&
      (type === 'application/json' ||
        type === 'text/csv' ||
        type ===
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))
  ) {
    return { kind: 'itinerary' }
  }
  if (
    extension === 'zip' ||
    (!extension &&
      (type === 'application/zip' || type === 'application/x-zip-compressed'))
  ) {
    return { kind: 'documents-zip' }
  }
  if (
    extension === 'pdf' ||
    IMAGE_EXTENSIONS.has(extension) ||
    type === 'application/pdf' ||
    type.startsWith('image/')
  ) {
    return { kind: 'document' }
  }
  return { kind: 'unsupported' }
}

/**
 * Le nom sous lequel lire un itinéraire : le natif peut remettre un fichier
 * sans extension, que la lecture (qui se fie à l'extension) refuserait.
 */
export function itineraryFileName(name: string, type: string): string {
  if (extensionOf(name)) return name
  const lower = type.toLowerCase()
  if (lower === 'application/json') return `${name}.json`
  if (lower === 'text/csv') return `${name}.csv`
  if (lower.includes('spreadsheetml')) return `${name}.xlsx`
  return name
}
