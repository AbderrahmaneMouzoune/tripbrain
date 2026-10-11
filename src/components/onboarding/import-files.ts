/**
 * Reconnaissance et lecture des fichiers d'itinéraire, sans rien enregistrer.
 *
 * L'ancien écran d'accueil importait dès la sélection ; le nouveau parcours
 * montre d'abord un aperçu du voyage. La lecture est donc séparée de
 * l'enregistrement : `readItineraryFiles` rend les journées, l'écran décide
 * ensuite de les ajouter ou non.
 */

import type { DayItinerary } from '@/lib/itinerary-data'
import type { TripSource } from '@/lib/trips'

/** Formats acceptés par le sélecteur de fichiers (identique à l'ancien accueil). */
export const ITINERARY_FILE_ACCEPT =
  '.json,.xlsx,.csv,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv'

/** Les trois fichiers d'un import CSV, sous ces noms exacts (casse ignorée). */
export const REQUIRED_CSV_FILES = [
  'days.csv',
  'activities.csv',
  'transports.csv',
] as const

export type FileFormat = 'json' | 'xlsx' | 'csv'

export interface CsvChecklistItem {
  name: (typeof REQUIRED_CSV_FILES)[number]
  found: boolean
}

export type FileClassification =
  | { ok: true; format: FileFormat }
  | {
      ok: false
      message: string
      /** Pour un import CSV incomplet : ce qui est reconnu, ce qui manque. */
      csvChecklist?: CsvChecklistItem[]
    }

const extensionOf = (name: string) =>
  name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? ''

/**
 * Quel import lancer pour cette sélection — mêmes règles que l'ancien accueil,
 * avec en plus la liste des fichiers CSV reconnus et manquants.
 */
export function classifyFiles(names: readonly string[]): FileClassification {
  if (names.length === 0) {
    return { ok: false, message: 'Aucun fichier sélectionné.' }
  }

  const allCsv = names.every((name) => extensionOf(name) === 'csv')
  if (allCsv) {
    const lower = new Set(names.map((name) => name.toLowerCase()))
    const csvChecklist = REQUIRED_CSV_FILES.map((name) => ({
      name,
      found: lower.has(name),
    }))
    if (csvChecklist.every((item) => item.found)) {
      return { ok: true, format: 'csv' }
    }
    return {
      ok: false,
      message:
        names.length < REQUIRED_CSV_FILES.length
          ? 'Pour importer en CSV, sélectionnez les 3 fichiers en même temps'
          : 'Les fichiers CSV doivent s’appeler days.csv, activities.csv et transports.csv',
      csvChecklist,
    }
  }

  if (names.length > 1) {
    return {
      ok: false,
      message:
        'En cas de sélection multiple, tous les fichiers doivent être des .csv',
    }
  }

  const extension = extensionOf(names[0])
  if (extension === 'json') return { ok: true, format: 'json' }
  if (extension === 'xlsx') return { ok: true, format: 'xlsx' }
  return {
    ok: false,
    message:
      'Format non supporté. Utilisez un fichier .json, .xlsx, ou 3 fichiers .csv',
  }
}

/** Lit un export JSON : `{ title?, itinerary: [...] }`, comme `exportData` le produit. */
export function parseItineraryJson(text: string): {
  itinerary: DayItinerary[]
  title?: string
} {
  const parsed = JSON.parse(text) as {
    itinerary?: unknown
    title?: unknown
  } | null
  if (!parsed || !Array.isArray(parsed.itinerary)) {
    throw new Error('Format invalide : tableau itinerary manquant')
  }
  if (parsed.itinerary.length === 0) {
    throw new Error('Le fichier ne contient aucune journée.')
  }
  return {
    itinerary: parsed.itinerary as DayItinerary[],
    title:
      typeof parsed.title === 'string' && parsed.title.trim()
        ? parsed.title.trim()
        : undefined,
  }
}

export interface ParsedFiles {
  itinerary: DayItinerary[]
  title?: string
  source: Extract<TripSource, FileFormat>
}

/** Lit les fichiers choisis, sans rien enregistrer. */
export async function readItineraryFiles(
  files: File[],
  format: FileFormat,
): Promise<ParsedFiles> {
  if (format === 'json') {
    const parsed = parseItineraryJson(await files[0].text())
    return { ...parsed, source: 'json' }
  }
  const { importFromXlsx, importFromCsv } =
    await import('@/lib/importItinerary')
  const result =
    format === 'xlsx'
      ? await importFromXlsx(files[0])
      : await importFromCsv(files)
  if (result.itinerary.length === 0) {
    throw new Error('Le fichier ne contient aucune journée.')
  }
  return { itinerary: result.itinerary, source: format }
}
