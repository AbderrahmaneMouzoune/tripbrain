/**
 * Conversion entre une entité de l'itinéraire et le brouillon manipulé par le
 * formulaire d'édition.
 *
 * Le brouillon ne contient que des chaînes, des booléens et des tableaux de
 * chaînes : c'est ce que les contrôles de saisie produisent. La reconstruction
 * se charge de reparser les nombres, les coordonnées, et surtout de
 * **supprimer** les clés vidées par l'utilisateur plutôt que de stocker des
 * valeurs vides.
 */

import type { EditField } from './edit-fields'

export type DraftValue = string | boolean | string[]
export type EntityDraft = Record<string, DraftValue>

type UnknownRecord = Record<string, unknown>

/** Types dont la valeur se saisit comme un nombre. */
const NUMERIC_TYPES: ReadonlySet<EditField['type']> = new Set([
  'number',
  'rating',
  'price',
])

/**
 * Vue indexable d'une entité : les interfaces du modèle n'ont pas de signature
 * d'index, alors que le formulaire lit et écrit des clés dynamiques.
 */
function toRecord(entity: object): UnknownRecord {
  return Object.fromEntries(Object.entries(entity))
}

/** Construit le brouillon initial du formulaire à partir de l'entité. */
export function toDraft(
  entity: object,
  fields: readonly EditField[],
): EntityDraft {
  const draft: EntityDraft = {}
  const record = toRecord(entity)

  for (const field of fields) {
    const value = record[field.key]

    if (field.type === 'switch') {
      draft[field.key] = value === true
      continue
    }

    if (field.type === 'lines' || field.type === 'chips') {
      draft[field.key] = Array.isArray(value) ? value.map(String) : []
      continue
    }

    if (field.type === 'coordinates') {
      draft[field.key] =
        Array.isArray(value) && value.length === 2
          ? [String(value[0]), String(value[1])]
          : ['', '']
      continue
    }

    if (NUMERIC_TYPES.has(field.type)) {
      draft[field.key] = typeof value === 'number' ? String(value) : ''
      if (field.currencyKey) {
        const currency = record[field.currencyKey]
        draft[field.currencyKey] = typeof currency === 'string' ? currency : ''
      }
      continue
    }

    draft[field.key] = typeof value === 'string' ? value : ''
  }

  return draft
}

/**
 * Reconstruit l'entité à partir du brouillon.
 *
 * Les propriétés absentes des champs (id, images, activités…) sont conservées
 * telles quelles ; les champs vidés sont retirés de l'objet, sauf `allowEmpty`.
 */
export function fromDraft<T extends object>(
  entity: T,
  fields: readonly EditField[],
  draft: EntityDraft,
): T {
  const next = toRecord(entity)

  for (const field of fields) {
    const value = draft[field.key]

    if (field.type === 'switch') {
      if (value === true) next[field.key] = true
      else delete next[field.key]
      continue
    }

    if (field.type === 'lines' || field.type === 'chips') {
      const items = Array.isArray(value)
        ? value.map((item) => item.trim()).filter(Boolean)
        : []
      if (items.length > 0) next[field.key] = items
      else if (field.allowEmpty) next[field.key] = []
      else delete next[field.key]
      continue
    }

    if (field.type === 'coordinates') {
      const parsed = parseCoordinates(value)
      if (parsed) next[field.key] = parsed
      else if (field.required) next[field.key] = [0, 0]
      else delete next[field.key]
      continue
    }

    if (NUMERIC_TYPES.has(field.type)) {
      const amount = parseNumber(value)
      if (amount === null) delete next[field.key]
      else next[field.key] = amount

      if (field.currencyKey) {
        const currency = readText(draft[field.currencyKey]).toUpperCase()
        // Une devise sans montant n'a rien à dire : les deux vont de pair.
        if (amount === null || !currency) delete next[field.currencyKey]
        else next[field.currencyKey] = currency
      }
      continue
    }

    const text = readText(value)
    if (text) next[field.key] = text
    else if (field.allowEmpty || field.required) next[field.key] = text
    else delete next[field.key]
  }

  // Les clés hors formulaire sont recopiées telles quelles : la forme de
  // l'entité d'origine est préservée, d'où cette conversion de retour.
  return next as T
}

/**
 * Valide le brouillon et retourne les messages d'erreur par clé de champ.
 * Un objet vide signifie que le formulaire est enregistrable.
 */
export function validateDraft(
  fields: readonly EditField[],
  draft: EntityDraft,
): Record<string, string> {
  const errors: Record<string, string> = {}

  for (const field of fields) {
    const value = draft[field.key]

    if (field.type === 'coordinates') {
      const filled =
        Array.isArray(value) && value.some((part) => part.trim() !== '')
      if ((field.required || filled) && !parseCoordinates(value)) {
        errors[field.key] = 'Latitude et longitude doivent être des nombres'
      }
      continue
    }

    if (NUMERIC_TYPES.has(field.type)) {
      const text = readText(value)
      const amount = parseNumber(value)

      if (text && amount === null) {
        errors[field.key] = 'Valeur numérique attendue'
      } else if (field.type === 'rating' && amount !== null) {
        if (amount < 0 || amount > 5) errors[field.key] = 'Note entre 0 et 5'
      } else if (field.type === 'price' && amount !== null && amount < 0) {
        errors[field.key] = 'Montant positif attendu'
      } else if (field.required && !text) {
        errors[field.key] = 'Ce champ est obligatoire'
      }
      continue
    }

    if (field.required && !isFilled(value)) {
      errors[field.key] = 'Ce champ est obligatoire'
      continue
    }

    // Un séjour qui se termine avant d'avoir commencé est une faute de frappe.
    if (field.type === 'date' && field.pairWith) {
      const nights = countNights(value, draft[field.pairWith])
      if (nights !== null && nights < 0) {
        errors[field.pairWith] = `La date doit suivre « ${field.label} »`
      }
    }
  }

  return errors
}

/** Nombre de champs renseignés dans une section, pour son résumé replié. */
export function countFilledFields(
  fields: readonly EditField[],
  draft: EntityDraft,
): number {
  return fields.filter((field) => isFilled(draft[field.key])).length
}

function isFilled(value: DraftValue | undefined): boolean {
  if (typeof value === 'string') return value.trim() !== ''
  if (Array.isArray(value)) return value.some((item) => item.trim() !== '')
  return value === true
}

function readText(value: DraftValue | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

function parseNumber(value: DraftValue | undefined): number | null {
  const text = readText(value).replace(',', '.')
  if (!text) return null

  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : null
}

function parseCoordinates(
  value: DraftValue | undefined,
): [number, number] | null {
  if (!Array.isArray(value) || value.length !== 2) return null

  const [latitude, longitude] = value.map((part) => Number(part.trim()))
  if (
    value.some((part) => part.trim() === '') ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return null
  }

  return [latitude, longitude]
}

/** Nombre maximal d'éléments dans le résumé d'une section repliée. */
const SUMMARY_LIMIT = 4
/** Au-delà, un texte libre est tronqué dans le résumé. */
const SUMMARY_TEXT_LENGTH = 32

/**
 * Résumé d'une section repliée, élément par élément (« 60 CNY », « 4.9 ★ »,
 * « réservation requise »). Il dit ce que la section contient sans l'ouvrir ;
 * un tableau vide laisse place au texte d'appel de la section.
 */
export function summarizeSection(
  fields: readonly EditField[],
  draft: EntityDraft,
): string[] {
  const parts: string[] = []
  const pairedEnds = new Set(
    fields.flatMap((field) => (field.pairWith ? [field.pairWith] : [])),
  )

  for (const field of fields) {
    if (pairedEnds.has(field.key)) continue

    const part = summarizeField(field, draft)
    if (part) parts.push(part)
    if (parts.length === SUMMARY_LIMIT) break
  }

  return parts
}

function summarizeField(field: EditField, draft: EntityDraft): string | null {
  const value = draft[field.key]

  if (field.pairWith) {
    const start = readText(value)
    const end = readText(draft[field.pairWith])
    const format =
      field.type === 'date' ? formatShortDate : (text: string) => text
    if (start && end) return `${format(start)} → ${format(end)}`
    if (start || end) return format(start || end)
    return null
  }

  switch (field.type) {
    case 'switch':
      return value === true ? lowerFirst(field.label) : null

    case 'lines':
    case 'chips': {
      const count = Array.isArray(value)
        ? value.filter((item) => item.trim()).length
        : 0
      return count > 0 ? `${count} ${lowerFirst(field.label)}` : null
    }

    case 'coordinates':
      return Array.isArray(value) && value.every((part) => part.trim())
        ? value.map((part) => part.trim()).join(', ')
        : null

    case 'price': {
      const amount = readText(value)
      if (!amount) return null
      const currency = field.currencyKey
        ? readText(draft[field.currencyKey]).toUpperCase()
        : ''
      return [amount, currency].filter(Boolean).join(' ')
    }

    case 'rating': {
      const rating = readText(value)
      return rating ? `${rating} ★` : null
    }

    case 'date': {
      const text = readText(value)
      return text ? formatShortDate(text) : null
    }

    case 'url': {
      const text = readText(value)
      return text ? truncate(hostnameOf(text) ?? text) : null
    }

    default: {
      const text = readText(value)
      if (!text) return null
      const option = field.options?.find((item) => item.value === text)
      return truncate(option?.label ?? text)
    }
  }
}

/**
 * Nuits entre deux dates ISO (`YYYY-MM-DD`). `null` tant que l'une des deux
 * manque ou ne se lit pas ; négatif si le départ précède l'arrivée.
 */
export function countNights(
  checkIn: DraftValue | undefined,
  checkOut: DraftValue | undefined,
): number | null {
  const start = parseIsoDate(readText(checkIn))
  const end = parseIsoDate(readText(checkOut))
  if (start === null || end === null) return null

  return Math.round((end - start) / 86_400_000)
}

/**
 * Minutes entre deux heures `HH:MM`. Une arrivée « avant » le départ est
 * comprise comme le lendemain (train de nuit, vol tardif).
 */
export function minutesBetween(
  departure: DraftValue | undefined,
  arrival: DraftValue | undefined,
): number | null {
  const start = parseClock(readText(departure))
  const end = parseClock(readText(arrival))
  if (start === null || end === null) return null

  return end >= start ? end - start : end + 24 * 60 - start
}

/** Durée au format court du roadbook : « 45m », « 3h », « 2h10 ». */
export function formatMinutes(total: number): string {
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  if (hours === 0) return `${minutes}m`
  if (minutes === 0) return `${hours}h`
  return `${hours}h${String(minutes).padStart(2, '0')}`
}

/**
 * Prix d'une nuit, arrondi à l'unité, pour situer le coût d'un séjour.
 * `null` sans montant lisible ou sans nuit.
 */
export function pricePerNight(
  amount: DraftValue | undefined,
  nights: number | null,
): number | null {
  const total = parseNumber(amount)
  if (total === null || nights === null || nights <= 0) return null
  return Math.round(total / nights)
}

/** Date ISO en clair et courte, ex. « 13 mai ». */
export function formatShortDate(iso: string): string {
  const time = parseIsoDate(iso)
  if (time === null) return iso
  return new Date(time).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

/** Domaine d'un lien, sans « www. », pour dire où il mène. */
export function hostnameOf(url: string): string | null {
  try {
    return new URL(url.trim()).hostname.replace(/^www\./, '') || null
  } catch {
    return null
  }
}

function parseIsoDate(text: string): number | null {
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const time = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  )
  return Number.isFinite(time) ? time : null
}

function parseClock(text: string): number | null {
  const match = text.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLocaleLowerCase('fr-FR') + text.slice(1)
}

function truncate(text: string): string {
  return text.length > SUMMARY_TEXT_LENGTH
    ? `${text.slice(0, SUMMARY_TEXT_LENGTH - 1).trimEnd()}…`
    : text
}
