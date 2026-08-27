/**
 * Conversion entre une entité de l'itinéraire et le brouillon manipulé par le
 * formulaire d'édition.
 *
 * Le brouillon ne contient que des chaînes, des booléens et des tableaux de
 * chaînes : c'est ce que les `<input>` produisent. La reconstruction se charge
 * de reparser les nombres, les coordonnées, et surtout de **supprimer** les
 * clés vidées par l'utilisateur plutôt que de stocker des valeurs vides.
 */

import type { EditField } from './edit-fields'

export type DraftValue = string | boolean | string[]
export type EntityDraft = Record<string, DraftValue>

type UnknownRecord = Record<string, unknown>

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

    switch (field.type) {
      case 'switch':
        draft[field.key] = value === true
        break
      case 'list':
        draft[field.key] = Array.isArray(value) ? value.map(String) : []
        break
      case 'coordinates':
        draft[field.key] =
          Array.isArray(value) && value.length === 2
            ? [String(value[0]), String(value[1])]
            : ['', '']
        break
      case 'number':
        draft[field.key] = typeof value === 'number' ? String(value) : ''
        break
      default:
        draft[field.key] = typeof value === 'string' ? value : ''
    }
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

    switch (field.type) {
      case 'switch': {
        if (value === true) next[field.key] = true
        else delete next[field.key]
        break
      }
      case 'list': {
        const items = Array.isArray(value)
          ? value.map((item) => item.trim()).filter(Boolean)
          : []
        if (items.length > 0) next[field.key] = items
        else if (field.allowEmpty) next[field.key] = []
        else delete next[field.key]
        break
      }
      case 'coordinates': {
        const parsed = parseCoordinates(value)
        if (parsed) next[field.key] = parsed
        else if (field.required) next[field.key] = [0, 0]
        else delete next[field.key]
        break
      }
      case 'number': {
        const parsed = Number(typeof value === 'string' ? value.trim() : '')
        if (
          typeof value === 'string' &&
          value.trim() &&
          Number.isFinite(parsed)
        )
          next[field.key] = parsed
        else delete next[field.key]
        break
      }
      default: {
        const text = typeof value === 'string' ? value.trim() : ''
        if (text) next[field.key] = text
        else if (field.allowEmpty || field.required) next[field.key] = text
        else delete next[field.key]
      }
    }
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

    if (field.type === 'number') {
      const text = typeof value === 'string' ? value.trim() : ''
      if (text && !Number.isFinite(Number(text))) {
        errors[field.key] = 'Valeur numérique attendue'
      }
      continue
    }

    if (field.required) {
      const filled =
        typeof value === 'string'
          ? value.trim() !== ''
          : Array.isArray(value)
            ? value.some((item) => item.trim() !== '')
            : value === true
      if (!filled) errors[field.key] = 'Ce champ est obligatoire'
    }
  }

  return errors
}

function parseCoordinates(value: DraftValue): [number, number] | null {
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
