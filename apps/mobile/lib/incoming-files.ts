import { EncodingType, readAsStringAsync } from 'expo-file-system/legacy'

import type { ShareFilePayload } from './bridge-protocol'

// ─── « Ouvrir avec TripBrain » ────────────────────────────────────────────────
//
// Un fichier .json, .xlsx, .csv ou .zip ouvert depuis Mail, Fichiers ou
// AirDrop arrive à l'app sous forme d'URL (`file://` sur iOS, `content://` sur
// Android). Il est lu ici puis remis à la webapp, qui l'importe comme si on
// l'avait choisi dans « Importer un fichier ».

const MIME_BY_EXTENSION: Record<string, string> = {
  json: 'application/json',
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ics: 'text/calendar',
  zip: 'application/zip',
}

/** Une URL désigne-t-elle un fichier à ouvrir, plutôt qu'un lien ? */
export function isIncomingFileUrl(url: string): boolean {
  return url.startsWith('file://') || url.startsWith('content://')
}

/** Nom lisible d'un fichier, tiré de la fin de son URL. */
export function fileNameFromUrl(url: string): string {
  const withoutQuery = url.split('?')[0] ?? url
  const last = withoutQuery.split('/').filter(Boolean).pop() ?? ''
  let name = last
  try {
    name = decodeURIComponent(last)
  } catch {
    // Encodage douteux : le nom brut fera l'affaire.
  }
  return name || 'import'
}

export function mimeTypeFromName(name: string): string | undefined {
  const extension = name.split('.').pop()?.toLowerCase() ?? ''
  return MIME_BY_EXTENSION[extension]
}

/** Lit le fichier désigné par l'URL ; `null` s'il est illisible. */
export async function readIncomingFile(
  url: string,
): Promise<ShareFilePayload | null> {
  try {
    const base64 = await readAsStringAsync(url, {
      encoding: EncodingType.Base64,
    })
    const name = fileNameFromUrl(url)
    return { name, mimeType: mimeTypeFromName(name), base64 }
  } catch (error) {
    console.warn('[Import] lecture du fichier impossible', url, error)
    return null
  }
}
