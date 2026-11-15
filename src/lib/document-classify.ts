/**
 * Rangement automatique d'un document qu'on vient d'ajouter.
 *
 * L'utilisateur dit seulement ce que c'est (un billet, un logement…). L'app
 * lit le nom du fichier et, pour un PDF, son texte, puis cherche dans
 * l'itinéraire le trajet, l'hébergement ou l'activité qui colle : dates,
 * villes, nom de l'hôtel, numéro de réservation. Sûre d'elle, elle range sans
 * rien demander ; sinon elle propose les deux ou trois choix les plus
 * probables.
 *
 * Tout est pur et local : rien ne quitte le téléphone.
 */

import type { DayItinerary } from '@/lib/itinerary-data'
import type { DocumentCategory, StoredFile } from '@/lib/documents-db'
import {
  categoryFromName,
  normalizeText,
  sameLink,
  type DocumentLink,
} from '@/lib/document-organize'

/** Ce que l'utilisateur dit ajouter, au premier écran. */
export type AddKind = 'ticket' | 'hotel' | 'identity' | 'activity' | 'unknown'

/** Famille enregistrée pour un choix du premier écran (`null` : à deviner). */
export function categoryOfKind(kind: AddKind): DocumentCategory | null {
  switch (kind) {
    case 'ticket':
    case 'activity':
      return 'ticket'
    case 'hotel':
      return 'hotel'
    case 'identity':
      return 'identity'
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Lecture du texte
// ---------------------------------------------------------------------------

/** Texte à plat : minuscules sans accents, un espace entre les mots, bordé d'espaces. */
export function flattenText(text: string): string {
  const words = normalizeText(text)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  return words ? ` ${words} ` : ' '
}

/**
 * Le texte cite-t-il ce lieu ? « Pékin (PKX) » est trouvé par « pekin pkx »,
 * « pekin » ou « pkx » ; « PKX Beijing Daxing Intl. » par son code ou par
 * « Beijing Daxing ». Moins de trois lettres : trop ambigu, ignoré.
 */
export function mentionsPlace(flat: string, place: string | undefined) {
  if (!place) return false
  const parts = [place, ...place.split(/[(),/]/)]
  const phrase = parts.some((part) => {
    const words = flattenText(part).trim()
    return words.length >= 3 && flat.includes(` ${words} `)
  })
  if (phrase) return true
  // Code d'aéroport ou de gare écrit en capitales : « PKX », « CDG ».
  const codes = place.match(/\b[A-Z]{3}\b/g) ?? []
  if (codes.some((code) => flat.includes(` ${code.toLowerCase()} `))) {
    return true
  }
  return mentionsName(flat, place)
}

/** Mots qui ne disent rien du lieu : « Hôtel », « The », « Visite »… */
const NAME_STOPWORDS = new Set([
  'hotel',
  'hotels',
  'the',
  'and',
  'des',
  'les',
  'aux',
  'une',
  'resort',
  'inn',
  'house',
  'guest',
  'guesthouse',
  'hostel',
  'auberge',
  'residence',
  'appartement',
  'apartment',
  'suites',
  'suite',
  'visite',
  'visit',
  'tour',
  'balade',
  'diner',
  'dejeuner',
  'dinner',
  'lunch',
  'avec',
  'dans',
  'pour',
  'with',
  'intl',
  'international',
  'airport',
  'aeroport',
  'station',
  'gare',
  'railway',
])

/**
 * Le texte cite-t-il ce nom (hôtel, activité) ? Il suffit de deux de ses mots
 * marquants (ou du seul qu'il a), car les confirmations l'écrivent rarement
 * à l'identique.
 */
export function mentionsName(flat: string, name: string | undefined) {
  if (!name) return false
  const words = flattenText(name)
    .trim()
    .split(' ')
    .filter((word) => word.length >= 4 && !NAME_STOPWORDS.has(word))
  if (words.length === 0) return false
  const found = words.filter((word) => flat.includes(` ${word} `)).length
  return found >= Math.min(2, words.length)
}

/** Numéro de réservation présent tel quel (sans tenir compte des espaces). */
function mentionsReference(flat: string, reference: string | undefined) {
  if (!reference) return false
  const compact = flattenText(reference).replace(/ /g, '')
  return compact.length >= 5 && flat.replace(/ /g, '').includes(compact)
}

const MONTHS: Record<string, number> = {
  janvier: 1,
  january: 1,
  janv: 1,
  jan: 1,
  fevrier: 2,
  february: 2,
  fevr: 2,
  fev: 2,
  feb: 2,
  mars: 3,
  march: 3,
  mar: 3,
  avril: 4,
  april: 4,
  avr: 4,
  apr: 4,
  mai: 5,
  may: 5,
  juin: 6,
  june: 6,
  jun: 6,
  juillet: 7,
  july: 7,
  juil: 7,
  jul: 7,
  aout: 8,
  august: 8,
  aou: 8,
  aug: 8,
  septembre: 9,
  september: 9,
  sept: 9,
  sep: 9,
  octobre: 10,
  october: 10,
  oct: 10,
  novembre: 11,
  november: 11,
  nov: 11,
  decembre: 12,
  december: 12,
  dec: 12,
}

const MONTH_ALT = Object.keys(MONTHS)
  .sort((a, b) => b.length - a.length)
  .join('|')

const pad = (value: number) => String(value).padStart(2, '0')

/**
 * Dates citées par le texte, au format de l'itinéraire (`2026-05-10`) :
 * « 2026-05-10 », « 10/05/2026 », « 10 mai 2026 », « 10MAY », « May 10, 2026 ».
 * Sans année, chacune des années du voyage est retenue.
 */
export function extractDates(text: string, years: number[]): Set<string> {
  const source = normalizeText(text)
  const found = new Set<string>()
  const add = (year: number | null, month: number, day: number) => {
    if (month < 1 || month > 12 || day < 1 || day > 31) return
    const targets = year === null ? years : [year < 100 ? 2000 + year : year]
    for (const target of targets)
      found.add(`${target}-${pad(month)}-${pad(day)}`)
  }
  const year = (raw: string | undefined) => (raw ? Number(raw) : null)

  for (const m of source.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g)) {
    add(Number(m[1]), Number(m[2]), Number(m[3]))
  }
  for (const m of source.matchAll(
    /\b(\d{1,2})[/.](\d{1,2})[/.](\d{4}|\d{2})\b/g,
  )) {
    add(Number(m[3]), Number(m[2]), Number(m[1]))
  }
  const dayFirst = new RegExp(
    `\\b(\\d{1,2})(?:er)?\\s*(${MONTH_ALT})(?![a-z])\\.?(?:\\s*,?\\s*(\\d{4}))?`,
    'g',
  )
  for (const m of source.matchAll(dayFirst)) {
    add(year(m[3]), MONTHS[m[2]], Number(m[1]))
  }
  const monthFirst = new RegExp(
    `\\b(${MONTH_ALT})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s*(\\d{4}))?`,
    'g',
  )
  for (const m of source.matchAll(monthFirst)) {
    add(year(m[3]), MONTHS[m[1]], Number(m[2]))
  }
  return found
}

const CONTENT_WORDS: Record<Exclude<DocumentCategory, 'other'>, string[]> = {
  identity: [
    'passeport',
    'passport',
    'visa',
    'evisa',
    'assurance',
    'insurance',
    'esta',
  ],
  hotel: [
    'hotel',
    'hebergement',
    'logement',
    'nuit',
    'nuits',
    'night',
    'nights',
    'chambre',
    'room',
    'checkin',
    'check in',
    'airbnb',
    'booking com',
    'sejour',
    'hote',
    'host',
  ],
  ticket: [
    'billet',
    'ticket',
    'eticket',
    'e ticket',
    'boarding',
    'embarquement',
    'vol',
    'flight',
    'train',
    'gare',
    'seat',
    'siege',
    'place',
    'voiture',
    'coach',
    'gate',
    'terminal',
    'pnr',
    'airline',
    'bus',
    'ferry',
  ],
}

/**
 * Famille devinée d'après le texte d'un document : celle dont les mots
 * reviennent le plus, à condition d'en trouver au moins deux et d'être seule
 * en tête.
 */
export function categoryFromContent(text: string): DocumentCategory {
  const flat = flattenText(text)
  const scores = (
    Object.entries(CONTENT_WORDS) as [DocumentCategory, string[]][]
  ).map(([category, words]) => ({
    category,
    score: words.filter((word) => flat.includes(` ${word} `)).length,
  }))
  scores.sort((a, b) => b.score - a.score)
  const [first, second] = scores
  if (first.score < 2 || first.score === second.score) return 'other'
  return first.category
}

// ---------------------------------------------------------------------------
// Rattachement
// ---------------------------------------------------------------------------

export interface Classification {
  /** Famille à enregistrer. */
  category: DocumentCategory
  /** Rattachement retenu (le plus probable quand on hésite). */
  link: DocumentLink
  /** Sûre d'elle : l'app range sans poser de question. */
  confident: boolean
  /** Choix à proposer quand on hésite, du plus probable au moins probable. */
  choices: DocumentLink[]
}

export interface ClassifyInput {
  kind: AddKind
  /** Noms des fichiers ajoutés. */
  names: string[]
  /** Texte lu dans les fichiers (vide pour une photo). */
  text: string
  itinerary: DayItinerary[]
  /** Journée d'où l'on vient (fiche d'un trajet, suggestion…). */
  focusDayIndex?: number
  /** Documents déjà rangés dans le voyage : un trajet sans billet est plus probable. */
  existing?: Pick<StoredFile, 'dayId' | 'linkedTo' | 'activityId'>[]
}

interface Candidate {
  link: DocumentLink
  score: number
  covered: boolean
  order: number
}

/** Écart minimal avec le second pour ranger sans demander. */
const CONFIDENT_SCORE = 3
const CONFIDENT_GAP = 2

function tripYears(itinerary: DayItinerary[]): number[] {
  const years = new Set<number>()
  for (const day of itinerary) {
    const year = Number(day.date?.slice(0, 4))
    if (year) years.add(year)
  }
  if (years.size === 0) years.add(new Date().getFullYear())
  return [...years]
}

function transportCandidates(
  input: ClassifyInput,
  flat: string,
  dates: Set<string>,
): Candidate[] {
  const list: Candidate[] = []
  input.itinerary.forEach((day, index) => {
    const transport = day.transport
    if (!transport) return
    const covered = (input.existing ?? []).some(
      (file) => file.dayId === day.id && file.linkedTo === 'transport',
    )
    let score = 0
    if (dates.has(day.date)) score += 3
    const from = mentionsPlace(flat, transport.from)
    const to = mentionsPlace(flat, transport.to)
    if (from) score += 2
    if (to) score += 2
    // Les deux bouts : c'est ce trajet-là, pas le précédent ou le suivant
    // qui partagent une de ses villes.
    if (from && to) score += 2
    if (mentionsPlace(flat, transport.provider)) score += 1
    if (mentionsReference(flat, transport.bookingReference)) score += 4
    if (input.focusDayIndex === index) score += 3
    if (!covered) score += 1
    list.push({
      link: { dayId: day.id, linkedTo: 'transport' },
      score,
      covered,
      order: index,
    })
  })
  return list
}

function accommodationCandidates(
  input: ClassifyInput,
  flat: string,
  dates: Set<string>,
): Candidate[] {
  // Un séjour de plusieurs nuits n'est proposé qu'une fois, à sa première journée.
  const stays = new Map<string, number[]>()
  input.itinerary.forEach((day, index) => {
    if (!day.accommodation) return
    const key = day.accommodation.id || `${day.accommodation.name}-${index}`
    const list = stays.get(key) ?? []
    list.push(index)
    stays.set(key, list)
  })
  return [...stays.values()].map((indices) => {
    const first = input.itinerary[indices[0]]
    const stay = first.accommodation!
    const covered = indices.some((index) =>
      (input.existing ?? []).some(
        (file) =>
          file.dayId === input.itinerary[index].id &&
          file.linkedTo === 'accommodation',
      ),
    )
    const checkIn = /^\d{4}-\d{2}-\d{2}/.test(stay.checkIn)
      ? stay.checkIn.slice(0, 10)
      : first.date
    let score = 0
    if (mentionsName(flat, stay.name)) score += 4
    if (mentionsReference(flat, stay.bookingReference)) score += 4
    if (dates.has(checkIn)) score += 3
    else if (indices.some((index) => dates.has(input.itinerary[index].date))) {
      score += 1
    }
    if (mentionsPlace(flat, first.city)) score += 1
    if (
      input.focusDayIndex !== undefined &&
      indices.includes(input.focusDayIndex)
    ) {
      score += 3
    }
    if (!covered) score += 1
    return {
      link: { dayId: first.id, linkedTo: 'accommodation' as const },
      score,
      covered,
      order: indices[0],
    }
  })
}

function activityCandidates(
  input: ClassifyInput,
  flat: string,
  dates: Set<string>,
): Candidate[] {
  const list: Candidate[] = []
  input.itinerary.forEach((day, index) => {
    day.activities.forEach((activity, position) => {
      const covered = (input.existing ?? []).some(
        (file) =>
          file.linkedTo === 'activity' && file.activityId === activity.id,
      )
      let score = 0
      if (mentionsName(flat, activity.name)) score += 4
      if (dates.has(day.date)) score += 2
      if (input.focusDayIndex === index) score += 3
      // Une activité à réserver a plus de chances d'avoir un billet.
      if (activity.reservationRequired || activity.bookingUrl) score += 1
      list.push({
        link: { dayId: day.id, linkedTo: 'activity', activityId: activity.id },
        score,
        covered,
        order: index * 1000 + position,
      })
    })
  })
  return list
}

function decide(
  category: DocumentCategory,
  candidates: Candidate[],
): Classification {
  const tripWide: DocumentLink = {}
  if (candidates.length === 0) {
    return { category, link: tripWide, confident: true, choices: [] }
  }
  const sorted = [...candidates].sort(
    (a, b) =>
      b.score - a.score ||
      Number(a.covered) - Number(b.covered) ||
      a.order - b.order,
  )
  const [top, second] = sorted
  const confident =
    sorted.length === 1 ||
    (top.score >= CONFIDENT_SCORE && top.score - second.score >= CONFIDENT_GAP)
  const choices = sorted.slice(0, 3).map((candidate) => candidate.link)
  if (!choices.some((link) => sameLink(link, tripWide))) choices.push(tripWide)
  return { category, link: top.link, confident, choices }
}

/** Journée d'un document sans famille précise : celle d'où l'on vient, ou la seule datée. */
function otherLink(input: ClassifyInput, dates: Set<string>): DocumentLink {
  const focus =
    input.focusDayIndex !== undefined
      ? input.itinerary[input.focusDayIndex]
      : undefined
  if (focus) return { dayId: focus.id }
  const dated = input.itinerary.filter((day) => dates.has(day.date))
  return dated.length === 1 ? { dayId: dated[0].id } : {}
}

/** Famille et rattachement d'un document qu'on ajoute. */
export function classifyDocument(input: ClassifyInput): Classification {
  const raw = `${input.names.join(' ')} ${input.text}`
  const flat = flattenText(raw)
  const dates = extractDates(raw, tripYears(input.itinerary))

  let kind = input.kind
  if (kind === 'unknown') {
    const fromName = input.names
      .map(categoryFromName)
      .find((category) => category !== 'other')
    const guessed = fromName ?? categoryFromContent(input.text)
    kind = guessed === 'other' ? 'unknown' : guessed
  }

  switch (kind) {
    case 'identity':
      return { category: 'identity', link: {}, confident: true, choices: [] }
    case 'ticket':
      return decide('ticket', transportCandidates(input, flat, dates))
    case 'hotel':
      return decide('hotel', accommodationCandidates(input, flat, dates))
    case 'activity':
      return decide('ticket', activityCandidates(input, flat, dates))
    default:
      return {
        category: 'other',
        link: otherLink(input, dates),
        confident: true,
        choices: [],
      }
  }
}
