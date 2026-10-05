/**
 * Rangement des documents : à quel voyage ils appartiennent, dans quelle
 * famille ils tombent (billets, hôtels, visas…), sous quelle journée ils
 * s'affichent, et ce qu'il manque encore pour le voyage.
 *
 * Tout est pur (aucun accès à IndexedDB ni au DOM) : l'onglet Documents, la
 * feuille d'ajout et l'aperçu s'en servent, et les tests le vérifient.
 */

import type { DayItinerary } from '@/lib/itinerary-data'
import type { DocumentCategory, StoredFile } from '@/lib/documents-db'
import { DEMO_DOCUMENT_ID_PREFIX } from '@/lib/demo-documents'

// ---------------------------------------------------------------------------
// Rattachement
// ---------------------------------------------------------------------------

/** Ce à quoi un document est rattaché dans le voyage. Vide : tout le voyage. */
export interface DocumentLink {
  dayId?: string
  linkedTo?: StoredFile['linkedTo']
  activityId?: string
}

/**
 * Un document est-il visible dans le voyage consulté ?
 *
 * - Les documents d'exemple n'appartiennent qu'au voyage de démonstration :
 *   ils sont écrits avant que le voyage démo n'ait d'identifiant, d'où le
 *   repérage par préfixe plutôt que par `tripId`.
 * - Les documents enregistrés avant les voyages multiples n'ont pas de
 *   `tripId` : on ne sait pas à quel voyage ils servent, ils restent partout.
 */
export function isDocumentInTrip(
  file: Pick<StoredFile, 'id' | 'tripId'>,
  tripId: string | null,
  isDemoTrip: boolean,
): boolean {
  if (file.id.startsWith(DEMO_DOCUMENT_ID_PREFIX)) return isDemoTrip
  if (!file.tripId) return true
  return file.tripId === tripId
}

/** Index de la journée à laquelle le document est rattaché, ou -1. */
export function linkedDayIndex(
  file: Pick<StoredFile, 'dayId'>,
  itinerary: DayItinerary[],
): number {
  if (!file.dayId) return -1
  return itinerary.findIndex((day) => day.id === file.dayId)
}

/**
 * Rattachement réellement applicable dans l'itinéraire : un trajet ou un
 * hébergement disparu de la journée retombe sur la journée elle-même.
 */
export function normalizeLink(
  link: DocumentLink,
  itinerary: DayItinerary[],
): DocumentLink {
  if (!link.dayId) return {}
  const day = itinerary.find((item) => item.id === link.dayId)
  if (!day) return {}
  if (link.linkedTo === 'transport' && day.transport) {
    return { dayId: day.id, linkedTo: 'transport' }
  }
  if (link.linkedTo === 'accommodation' && day.accommodation) {
    return { dayId: day.id, linkedTo: 'accommodation' }
  }
  if (
    link.linkedTo === 'activity' &&
    link.activityId &&
    day.activities.some((activity) => activity.id === link.activityId)
  ) {
    return { dayId: day.id, linkedTo: 'activity', activityId: link.activityId }
  }
  return { dayId: day.id }
}

/** Deux rattachements désignent-ils la même chose ? */
export function sameLink(a: DocumentLink, b: DocumentLink): boolean {
  return (
    (a.dayId ?? null) === (b.dayId ?? null) &&
    (a.linkedTo ?? null) === (b.linkedTo ?? null) &&
    (a.activityId ?? null) === (b.activityId ?? null)
  )
}

const TRANSPORT_LABELS: Record<
  NonNullable<DayItinerary['transport']>['type'],
  string
> = {
  plane: 'Vol',
  train: 'Train',
  bus: 'Bus',
  car: 'Route',
}

/** « Vol Pékin → Xi’an », ou « Vol » quand l'itinéraire ne dit pas d'où à où. */
export function transportLabel(
  transport: NonNullable<DayItinerary['transport']>,
): string {
  const kind = TRANSPORT_LABELS[transport.type] ?? 'Trajet'
  if (transport.from && transport.to) {
    return `${kind} ${transport.from} → ${transport.to}`
  }
  return kind
}

/**
 * Libellé court du rattachement, pour une ligne de liste ou l'aperçu :
 * « J7 · Vol PKX → XIY », « J4 · Hôtel », « J5 · Pékin », « Tout le voyage ».
 */
export function describeLink(
  link: DocumentLink,
  itinerary: DayItinerary[],
): { dayIndex: number; short: string; long: string } {
  const normalized = normalizeLink(link, itinerary)
  const dayIndex = linkedDayIndex(normalized, itinerary)
  if (dayIndex < 0) {
    return { dayIndex, short: 'Tout le voyage', long: 'Tout le voyage' }
  }
  const day = itinerary[dayIndex]
  const prefix = `J${dayIndex + 1}`
  if (normalized.linkedTo === 'transport' && day.transport) {
    const label = transportLabel(day.transport)
    return { dayIndex, short: prefix, long: `${prefix} · ${label}` }
  }
  if (normalized.linkedTo === 'accommodation' && day.accommodation) {
    return {
      dayIndex,
      short: prefix,
      long: `${prefix} · ${day.accommodation.name}`,
    }
  }
  if (normalized.linkedTo === 'activity') {
    const activity = day.activities.find(
      (item) => item.id === normalized.activityId,
    )
    if (activity) {
      return { dayIndex, short: prefix, long: `${prefix} · ${activity.name}` }
    }
  }
  return {
    dayIndex,
    short: prefix,
    long: `${prefix} · ${day.title || day.city}`,
  }
}

// ---------------------------------------------------------------------------
// Familles de documents
// ---------------------------------------------------------------------------

export type { DocumentCategory }

export const DOCUMENT_CATEGORIES: readonly {
  id: DocumentCategory
  label: string
}[] = [
  { id: 'ticket', label: 'Billets' },
  { id: 'hotel', label: 'Hôtels' },
  { id: 'identity', label: 'Visas & passeports' },
  { id: 'other', label: 'Autres' },
]

/** Libellés au singulier, pour choisir le type d'un document. */
export const DOCUMENT_CATEGORY_CHOICES: readonly {
  id: DocumentCategory
  label: string
}[] = [
  { id: 'ticket', label: 'Billet' },
  { id: 'hotel', label: 'Hôtel' },
  { id: 'identity', label: 'Visa & passeport' },
  { id: 'other', label: 'Autre' },
]

/** Type proposé d'office selon ce à quoi on rattache le document. */
export function suggestedCategory(
  link: Pick<StoredFile, 'linkedTo'>,
): DocumentCategory | null {
  if (link.linkedTo === 'transport' || link.linkedTo === 'activity') {
    return 'ticket'
  }
  if (link.linkedTo === 'accommodation') return 'hotel'
  return null
}

/** Minuscules sans accents : « Hôtel » et « hotel » se valent. */
export function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Mots du nom de fichier, extension comprise (« e-ticket_CA934.pdf »). */
function nameTokens(name: string): Set<string> {
  return new Set(
    normalizeText(name)
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  )
}

const IDENTITY_WORDS = [
  'visa',
  'visas',
  'evisa',
  'passeport',
  'passeports',
  'passport',
  'passports',
  'identite',
  'cni',
  'esta',
]
const PASSPORT_WORDS = ['passeport', 'passeports', 'passport', 'passports']
const HOTEL_WORDS = [
  'hotel',
  'hotels',
  'hebergement',
  'logement',
  'auberge',
  'hostel',
  'guesthouse',
  'bnb',
  'airbnb',
  'booking',
  'appartement',
  'apartment',
  'ryokan',
  'gite',
]
const TICKET_WORDS = [
  'billet',
  'billets',
  'ticket',
  'tickets',
  'eticket',
  'boarding',
  'boardingpass',
  'embarquement',
  'vol',
  'flight',
  'avion',
  'train',
  'tgv',
  'sncf',
  'bus',
  'ferry',
  'navette',
]

/**
 * Famille d'un document. Le choix de l'utilisateur prime ; à défaut, le
 * rattachement fait foi (un document lié à un trajet est un billet) ; sans lui,
 * quelques mots du nom suffisent dans la plupart des cas. Les pièces
 * d'identité passent en premier : « visa-billet » reste un visa.
 */
export function documentCategory(
  file: Pick<StoredFile, 'name' | 'linkedTo' | 'category'>,
): DocumentCategory {
  if (file.category) return file.category
  if (file.linkedTo === 'transport' || file.linkedTo === 'activity') {
    return 'ticket'
  }
  if (file.linkedTo === 'accommodation') return 'hotel'
  const tokens = nameTokens(file.name)
  const has = (words: string[]) => words.some((word) => tokens.has(word))
  if (has(IDENTITY_WORDS)) return 'identity'
  if (has(HOTEL_WORDS)) return 'hotel'
  if (has(TICKET_WORDS)) return 'ticket'
  return 'other'
}

/** Libellé au singulier pour la ligne d'un document (« Billet · PDF »). */
export function documentCategoryLabel(
  file: Pick<StoredFile, 'name' | 'linkedTo' | 'category'>,
): string {
  switch (documentCategory(file)) {
    case 'ticket':
      return 'Billet'
    case 'hotel':
      return 'Hôtel'
    case 'identity': {
      const tokens = nameTokens(file.name)
      return PASSPORT_WORDS.some((word) => tokens.has(word))
        ? 'Passeport'
        : 'Visa'
    }
    default:
      return 'Autre'
  }
}

/** Format affiché sur la vignette : « PDF », « PNG »… */
export function fileFormatLabel(file: Pick<StoredFile, 'name' | 'type'>) {
  const dot = file.name.lastIndexOf('.')
  if (dot > 0 && dot < file.name.length - 1) {
    return file.name
      .slice(dot + 1)
      .toUpperCase()
      .slice(0, 4)
  }
  if (file.type === 'application/pdf') return 'PDF'
  const subtype = file.type.split('/')[1]
  return subtype ? subtype.toUpperCase().slice(0, 4) : 'FICHIER'
}

/** Taille lisible à la française : « 214 Ko », « 1,2 Mo ». */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  const units = ['Ko', 'Mo', 'Go']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10
  return `${String(rounded).replace('.', ',')} ${units[unit]}`
}

// ---------------------------------------------------------------------------
// Recherche, tri, groupement
// ---------------------------------------------------------------------------

export type DocumentSort = 'day' | 'added' | 'name' | 'size'

export const DOCUMENT_SORTS: readonly { id: DocumentSort; label: string }[] = [
  { id: 'day', label: 'par jour du voyage' },
  { id: 'added', label: 'par date d’ajout' },
  { id: 'name', label: 'par nom' },
  { id: 'size', label: 'par taille' },
]

/** Filtre par famille et par texte (sans tenir compte des accents). */
export function filterDocuments<
  T extends Pick<StoredFile, 'name' | 'linkedTo'>,
>(
  files: T[],
  { query, category }: { query?: string; category?: DocumentCategory | null },
): T[] {
  const needle = normalizeText(query?.trim() ?? '')
  return files.filter((file) => {
    if (category && documentCategory(file) !== category) return false
    if (needle && !normalizeText(file.name).includes(needle)) return false
    return true
  })
}

/** Tri hors groupement : récent d'abord, A → Z, ou plus lourd d'abord. */
export function sortDocuments<
  T extends Pick<StoredFile, 'name' | 'size' | 'addedAt'>,
>(files: T[], sort: Exclude<DocumentSort, 'day'>): T[] {
  const sorted = [...files]
  if (sort === 'name') {
    sorted.sort((a, b) =>
      a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }),
    )
  } else if (sort === 'size') {
    sorted.sort((a, b) => b.size - a.size)
  } else {
    sorted.sort((a, b) => b.addedAt - a.addedAt)
  }
  return sorted
}

export interface DocumentGroup<T> {
  /** Identifiant de la journée, ou `trip` pour « Tout le voyage ». */
  key: string
  /** Index de la journée, `null` pour « Tout le voyage ». */
  dayIndex: number | null
  files: T[]
}

/**
 * Groupement par journée, dans l'ordre du voyage, puis « Tout le voyage » pour
 * les documents sans journée (ou rattachés à une journée qui n'existe plus).
 * Dans chaque groupe, le plus récent d'abord.
 */
export function groupDocumentsByDay<
  T extends Pick<StoredFile, 'dayId' | 'addedAt'>,
>(files: T[], itinerary: DayItinerary[]): DocumentGroup<T>[] {
  const byDay = new Map<number, T[]>()
  const tripWide: T[] = []
  for (const file of files) {
    const index = linkedDayIndex(file, itinerary)
    if (index < 0) {
      tripWide.push(file)
      continue
    }
    const list = byDay.get(index) ?? []
    list.push(file)
    byDay.set(index, list)
  }
  const newestFirst = (a: T, b: T) => b.addedAt - a.addedAt
  const groups: DocumentGroup<T>[] = [...byDay.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, list]) => ({
      key: itinerary[index].id,
      dayIndex: index,
      files: list.sort(newestFirst),
    }))
  if (tripWide.length > 0) {
    groups.push({
      key: 'trip',
      dayIndex: null,
      files: tripWide.sort(newestFirst),
    })
  }
  return groups
}

// ---------------------------------------------------------------------------
// Ce qu'il reste à ajouter
// ---------------------------------------------------------------------------

export interface MissingDocuments {
  transports: { total: number; missing: number; firstDayIndex: number }
  accommodations: { total: number; missing: number; firstDayIndex: number }
}

/**
 * Trajets et hébergements de l'itinéraire qui n'ont encore aucun document
 * rattaché. Un hébergement de plusieurs nuits n'est compté qu'une fois ; il
 * est couvert dès qu'un document est rattaché à l'une de ses journées.
 */
export function missingDocuments(
  itinerary: DayItinerary[],
  files: Pick<StoredFile, 'dayId' | 'linkedTo'>[],
): MissingDocuments {
  const linked = (dayId: string, kind: 'transport' | 'accommodation') =>
    files.some((file) => file.dayId === dayId && file.linkedTo === kind)

  const transports = { total: 0, missing: 0, firstDayIndex: -1 }
  itinerary.forEach((day, index) => {
    if (!day.transport) return
    transports.total++
    if (!linked(day.id, 'transport')) {
      transports.missing++
      if (transports.firstDayIndex < 0) transports.firstDayIndex = index
    }
  })

  const accommodationDays = new Map<string, number[]>()
  itinerary.forEach((day, index) => {
    if (!day.accommodation) return
    const key = day.accommodation.id || `${day.accommodation.name}-${index}`
    const list = accommodationDays.get(key) ?? []
    list.push(index)
    accommodationDays.set(key, list)
  })
  const accommodations = {
    total: accommodationDays.size,
    missing: 0,
    firstDayIndex: -1,
  }
  for (const indices of accommodationDays.values()) {
    const covered = indices.some((index) =>
      linked(itinerary[index].id, 'accommodation'),
    )
    if (!covered) {
      accommodations.missing++
      if (
        accommodations.firstDayIndex < 0 ||
        indices[0] < accommodations.firstDayIndex
      ) {
        accommodations.firstDayIndex = indices[0]
      }
    }
  }

  return { transports, accommodations }
}
