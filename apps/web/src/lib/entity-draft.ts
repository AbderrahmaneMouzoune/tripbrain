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
