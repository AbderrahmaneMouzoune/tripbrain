/**
 * Récapitulatif lisible des modifications d'un itinéraire.
 *
 * Sert la double validation du mode édition : avant d'enregistrer ou de tout
 * annuler, on montre ce qui a bougé depuis l'ouverture de la session.
 *
 * Fonctions pures, sans React : les libellés viennent des schémas de
 * formulaire (`edit-fields.ts`), donc un champ ajouté au formulaire apparaît
 * automatiquement dans le récapitulatif.
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

/** Modifications d'une journée, prêtes à être listées dans le récapitulatif. */
export interface DayChangeSummary {
  dayId: string
  /** En-tête de la journée, ex. « Jour 3 · Pékin » */
  title: string
  changes: string[]
}

/** Libellés des statuts d'activité, repris de la pastille du programme. */
const ACTIVITY_STATUS_LABELS: Record<string, string> = {
  planned: 'À faire',
  done: 'Fait',
  skipped: 'Annulé',
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
      : ['Journée ajoutée']

    if (changes.length > 0) {
      summaries.push({ dayId: day.id, title: dayTitle(day), changes })
    }
  }

  for (const day of before) {
    if (!nextById.has(day.id)) {
      summaries.push({
        dayId: day.id,
        title: dayTitle(day),
        changes: ['Journée supprimée'],
      })
    }
  }

  return summaries
}

/** Nombre total de lignes de modification, pour l'accroche du récapitulatif. */
export function countChanges(summaries: readonly DayChangeSummary[]): number {
  return summaries.reduce((total, summary) => total + summary.changes.length, 0)
}

function dayTitle(day: DayItinerary): string {
  return `Jour ${day.dayNumber} · ${day.city}`
}

function describeDayChanges(
  before: DayItinerary,
  after: DayItinerary,
): string[] {
  const changes: string[] = []

  const dayFields = changedFieldLabels(dayForm, before, after)
  if (dayFields.length > 0) {
    changes.push(`Journée modifiée : ${dayFields.join(', ')}`)
  }

  changes.push(...describeActivityChanges(before, after))
  changes.push(
    ...describeEntityChange(
      'Transport',
      transportForm,
      before.transport,
      after.transport,
    ),
  )
  changes.push(
    ...describeEntityChange(
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
): string[] {
  const previousById = new Map(before.activities.map((item) => [item.id, item]))
  const nextById = new Map(after.activities.map((item) => [item.id, item]))
  const changes: string[] = []

  for (const activity of after.activities) {
    const previous = previousById.get(activity.id)

    if (!previous) {
      changes.push(`Activité ajoutée : ${activityName(activity)}`)
      continue
    }

    const fields = changedFieldLabels(activityForm, previous, activity)
    if (fields.length === 0) continue

    // Le cas le plus courant — la bascule du programme — mérite sa phrase.
    if (fields.length === 1 && previous.status !== activity.status) {
      const label = ACTIVITY_STATUS_LABELS[activity.status ?? 'planned']
      changes.push(`${activityName(activity)} : marquée « ${label} »`)
      continue
    }

    changes.push(
      `Activité modifiée : ${activityName(activity)} (${fields.join(', ')})`,
    )
  }

  for (const activity of before.activities) {
    if (!nextById.has(activity.id)) {
      changes.push(`Activité supprimée : ${activityName(activity)}`)
    }
  }

  if (isReordered(before.activities, after.activities)) {
    changes.push('Programme réordonné')
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
  label: string,
  schema: EditFormSchema,
  before: object | undefined,
  after: object | undefined,
): string[] {
  if (!before && !after) return []
  if (!before) return [`${label} ajouté`]
  if (!after) return [`${label} supprimé`]

  const fields = changedFieldLabels(schema, before, after)
  return fields.length > 0 ? [`${label} modifié : ${fields.join(', ')}`] : []
}

function activityName(activity: Activity): string {
  return activity.name.trim() || 'Activité sans nom'
}

/** Libellés des champs du schéma dont la valeur diffère entre deux entités. */
function changedFieldLabels(
  schema: EditFormSchema,
  before: object,
  after: object,
): string[] {
  const previous = toRecord(before)
  const next = toRecord(after)

  return schema.fields
    .filter((field) => hasFieldChanged(field, previous, next))
    .map((field) => field.label)
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
