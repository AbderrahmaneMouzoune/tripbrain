/**
 * Récapitulatif lisible des modifications d'un itinéraire.
 *
 * Sert la double validation du mode édition : avant d'enregistrer ou de tout
 * annuler, on montre ce qui a bougé depuis l'ouverture de la session, avec la
 * valeur d'avant et celle d'après pour chaque champ touché.
 *
 * Fonctions pures, sans React : les libellés et le formatage des valeurs
 * viennent des schémas de formulaire (`edit-fields.ts`), donc un champ ajouté
 * au formulaire apparaît automatiquement dans le récapitulatif.
 */

import {
  accommodationForm,
  activityForm,
  dayForm,
  transportForm,
  type EditField,
  type EditFormSchema,
} from './edit-fields'
import type { Activity, DayItinerary } from './itinerary-data'

/** Nature d'une modification, qui décide de son icône et de sa couleur. */
export type ChangeKind = 'added' | 'removed' | 'updated' | 'moved'

/** Un champ modifié, avec ses deux valeurs déjà mises en forme. */
export interface FieldChange {
  label: string
  /** Valeur d'avant, chaîne vide si le champ n'était pas renseigné */
  before: string
  /** Valeur d'après, chaîne vide si le champ a été vidé */
  after: string
}

/** Une entité touchée pendant la session (journée, activité, transport…). */
export interface EntityChange {
  /** Clé de rendu, unique dans la journée */
  id: string
  kind: ChangeKind
  /** Nature de l'entité : « Journée », « Activité », « Transport »… */
  scope: string
  /** Nom de l'entité quand elle en porte un */
  name?: string
  /** Champs modifiés, renseignés pour `updated` uniquement */
  fields: FieldChange[]
}

/** Modifications d'une journée, prêtes à être listées dans le récapitulatif. */
export interface DayChangeSummary {
  dayId: string
  /** En-tête de la journée, ex. « Jour 3 · Pékin » */
  title: string
  changes: EntityChange[]
}

/**
 * Compare deux états de l'itinéraire et décrit les journées qui ont changé.
 * Une journée sans modification est absente du résultat ; un tableau vide
 * signifie donc « rien n'a bougé ».
 */
export function summarizeItineraryChanges(
  before: readonly DayItinerary[],
  after: readonly DayItinerary[],
): DayChangeSummary[] {
  const previousById = new Map(before.map((day) => [day.id, day]))
  const nextById = new Map(after.map((day) => [day.id, day]))
  const summaries: DayChangeSummary[] = []

  for (const day of after) {
    const previous = previousById.get(day.id)
    const changes = previous
      ? describeDayChanges(previous, day)
      : [entityChange('day', 'added', 'Journée', day.title)]

    if (changes.length > 0) {
      summaries.push({ dayId: day.id, title: dayTitle(day), changes })
    }
  }

  for (const day of before) {
    if (!nextById.has(day.id)) {
      summaries.push({
        dayId: day.id,
        title: dayTitle(day),
        changes: [entityChange('day', 'removed', 'Journée', day.title)],
      })
    }
  }

  return summaries
}

/**
 * Nombre de modifications annoncé en tête du récapitulatif. Il compte les
 * lignes réellement affichées : un champ retouché en vaut une, un ajout ou une
 * suppression aussi.
 */
export function countChanges(summaries: readonly DayChangeSummary[]): number {
  return summaries.reduce(
    (total, summary) =>
      total +
      summary.changes.reduce(
        (count, change) => count + Math.max(1, change.fields.length),
        0,
      ),
    0,
  )
}

function dayTitle(day: DayItinerary): string {
  return `Jour ${day.dayNumber} · ${day.city}`
}

function entityChange(
  id: string,
  kind: ChangeKind,
  scope: string,
  name?: string,
  fields: FieldChange[] = [],
): EntityChange {
  return { id, kind, scope, name, fields }
}

function describeDayChanges(
  before: DayItinerary,
  after: DayItinerary,
): EntityChange[] {
  const changes: EntityChange[] = []

  const dayFields = changedFields(dayForm, before, after)
  if (dayFields.length > 0) {
    changes.push(
      entityChange('day', 'updated', 'Journée', undefined, dayFields),
    )
  }

  changes.push(...describeActivityChanges(before, after))
  changes.push(
    ...describeEntityChange(
      'transport',
      'Transport',
      transportForm,
      before.transport,
      after.transport,
    ),
  )
  changes.push(
    ...describeEntityChange(
      'accommodation',
      'Hébergement',
      accommodationForm,
      before.accommodation,
      after.accommodation,
    ),
  )

  return changes
}

function describeActivityChanges(
  before: DayItinerary,
  after: DayItinerary,
): EntityChange[] {
  const previousById = new Map(before.activities.map((item) => [item.id, item]))
  const nextById = new Map(after.activities.map((item) => [item.id, item]))
  const changes: EntityChange[] = []

  for (const activity of after.activities) {
    const previous = previousById.get(activity.id)

    if (!previous) {
      changes.push(
        entityChange(activity.id, 'added', 'Activité', activityName(activity)),
      )
      continue
    }

    const fields = changedFields(activityForm, previous, activity)
    if (fields.length > 0) {
      changes.push(
        entityChange(
          activity.id,
          'updated',
          'Activité',
          activityName(activity),
          fields,
        ),
      )
    }
  }

  for (const activity of before.activities) {
    if (!nextById.has(activity.id)) {
      changes.push(
        entityChange(
          activity.id,
          'removed',
          'Activité',
          activityName(activity),
        ),
      )
    }
  }

  if (isReordered(before.activities, after.activities)) {
    changes.push(entityChange('order', 'moved', 'Programme réordonné'))
  }

  return changes
}

/** Ordre des activités communes aux deux états, ajouts et retraits exclus. */
function isReordered(
  before: readonly Activity[],
  after: readonly Activity[],
): boolean {
  const nextIds = new Set(after.map((item) => item.id))
  const previousIds = new Set(before.map((item) => item.id))

  const previousOrder = before
    .filter((item) => nextIds.has(item.id))
    .map((item) => item.id)
  const nextOrder = after
    .filter((item) => previousIds.has(item.id))
    .map((item) => item.id)

  return previousOrder.some((id, index) => nextOrder[index] !== id)
}

function describeEntityChange(
  id: string,
  scope: string,
  schema: EditFormSchema,
  before: object | undefined,
  after: object | undefined,
): EntityChange[] {
  if (!before && !after) return []
  if (!before) return [entityChange(id, 'added', scope)]
  if (!after) return [entityChange(id, 'removed', scope)]

  const fields = changedFields(schema, before, after)
  return fields.length > 0
    ? [entityChange(id, 'updated', scope, undefined, fields)]
    : []
}

function activityName(activity: Activity): string {
  return activity.name.trim() || 'Activité sans nom'
}

/** Champs du schéma dont la valeur diffère, avec leurs deux valeurs formatées. */
function changedFields(
  schema: EditFormSchema,
  before: object,
  after: object,
): FieldChange[] {
  const previous = toRecord(before)
  const next = toRecord(after)

  return schema.fields
    .filter((field) => hasFieldChanged(field, previous, next))
    .map((field) => ({
      label: field.label,
      before: formatFieldValue(field, previous),
      after: formatFieldValue(field, next),
    }))
}

function hasFieldChanged(
  field: EditField,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): boolean {
  if (!isSameValue(before[field.key], after[field.key])) return true

  // Un prix se lit avec sa devise : les deux propriétés vont de pair.
  return field.currencyKey
    ? !isSameValue(before[field.currencyKey], after[field.currencyKey])
    : false
}

/**
 * Met en forme la valeur d'un champ pour l'affichage du récapitulatif.
 * Une valeur absente devient la chaîne vide, à l'appelant de la présenter.
 */
export function formatFieldValue(
  field: EditField,
  record: Record<string, unknown>,
): string {
  const value = record[field.key]

  if (field.type === 'switch') return value === true ? 'Oui' : 'Non'

  if (field.type === 'lines' || field.type === 'chips') {
    return Array.isArray(value) ? value.join(' · ') : ''
  }

  if (field.type === 'coordinates') {
    return Array.isArray(value) && value.length === 2 ? value.join(', ') : ''
  }

  if (field.type === 'price') {
    if (typeof value !== 'number') return ''
    const currency = field.currencyKey ? record[field.currencyKey] : undefined
    return [
      value.toLocaleString('fr-FR'),
      typeof currency === 'string' ? currency : '',
    ]
      .filter(Boolean)
      .join(' ')
  }

  if (field.type === 'rating') {
    return typeof value === 'number' ? `${value}/5` : ''
  }

  const option = field.options?.find((item) => item.value === value)
  if (option) return option.label

  return isEmptyValue(value) ? '' : String(value)
}

function toRecord(entity: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(entity))
}

/**
 * Égalité suffisante pour les valeurs du modèle (scalaires et tableaux).
 * `undefined`, chaîne vide et tableau vide sont équivalents : le formulaire
 * supprime les clés vidées, ce qui ne constitue pas une modification.
 */
function isSameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (isEmptyValue(a) && isEmptyValue(b)) return true

  if (Array.isArray(a) && Array.isArray(b)) {
    return (
      a.length === b.length &&
      a.every((item, index) => isSameValue(item, b[index]))
    )
  }

  return false
}

function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true
  return Array.isArray(value) && value.length === 0
}
