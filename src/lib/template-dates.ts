// Dates d'un modèle publié : floutées à la semaine près, avant tout stockage.
//
// Un modèle est souvent publié avant le départ (spec §2 : l'auteur « a fait
// ce voyage, ou l'a préparé »). Ses dates exactes diraient alors à n'importe
// qui, lien en main, quand son logement est vide, nuit par nuit et vol par
// vol. Le repreneur, lui, n'en a pas besoin : il recale tout à ses propres
// dates (`retimeTemplate`), et les pages publiques n'affichent que le mois et
// l'année.
//
// Le voyage entier recule donc d'un nombre entier de semaines, jusqu'à ce que
// sa première journée datée tombe entre le 1er et le 7 du mois. Restent vrais
// le jour de la semaine (un départ le samedi reste un samedi), le mois et
// l'année (prix « relevés en 2027 », `tripYear` inchangé), et chaque écart
// entre deux dates (durées, nuits d'hôtel, horaires). Seul le quantième
// disparaît : un voyage publié au samedi 3 avril a pu commencer le 3, le 10,
// le 17 ou le 24. Un jour 1 sans date n'y change rien : la journée qui sert
// de repère est la première datée, comme pour `tripYear` et le recalage.
//
// Module pur, sans dépendance au serveur. Conception :
// `docs/itineraire-modele-technique.md` §4.

import type { DayItinerary } from '@/lib/itinerary-data'
import { isIsoDate, shiftDatesDeep, splitIsoDateValue } from '@/lib/iso-date'

const DAYS_PER_WEEK = 7

/**
 * Écart (en jours, négatif ou nul) qui ramène la date `day1` (`AAAA-MM-JJ`)
 * dans les 7 premiers jours de son mois, par semaines entières : 0 du 1er au
 * 7, −7 du 8 au 14, −14 du 15 au 21, −21 du 22 au 28, −28 du 29 au 31.
 * `day1` est la date repère du voyage (`templateDateAnchor`).
 */
export function templateDateOffset(day1: string): number {
  const weeks = Math.floor((Number(day1.slice(8, 10)) - 1) / DAYS_PER_WEEK)
  // Pas de `-0` : `Object.is(-0, 0)` est faux.
  return weeks === 0 ? 0 : -DAYS_PER_WEEK * weeks
}

/**
 * `shiftDatesDeep`, qui lève `RangeError` si une date sort du calendrier
 * `AAAA-MM-JJ`. En reculant de 4 semaines au plus, seule une date des
 * premières semaines de l'an 0000 le peut : aucun vrai voyage n'en a. Une
 * telle valeur reste alors telle quelle, et le reste de la structure glisse
 * quand même : on redescend d'un niveau seulement là où l'erreur est née.
 */
function shiftWithinCalendar<T>(value: T, offset: number): T {
  try {
    return shiftDatesDeep(value, offset)
  } catch (error) {
    if (!(error instanceof RangeError)) throw error
  }
  if (Array.isArray(value)) {
    return value.map((item) => shiftWithinCalendar(item, offset)) as T
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        shiftWithinCalendar(item, offset),
      ]),
    ) as T
  }
  return value
}

function sameId<T extends { id: string }>(moved: T, original: T): T {
  return { ...moved, id: original.id }
}

/**
 * Une journée décalée. Les ids sont recopiés tels quels, comme au recalage
 * (`template-redate.ts`) : un import a pu prendre une date comme id, et le
 * repreneur désigne ses journées gardées par ces ids.
 */
function blurDay(day: DayItinerary, offset: number): DayItinerary {
  const moved = shiftWithinCalendar(day, offset)
  const result: DayItinerary = {
    ...moved,
    id: day.id,
    activities: moved.activities.map((activity, index) =>
      sameId(activity, day.activities[index]),
    ),
  }
  if (moved.accommodation && day.accommodation) {
    result.accommodation = sameId(moved.accommodation, day.accommodation)
  }
  if (moved.transport && day.transport) {
    result.transport = sameId(moved.transport, day.transport)
  }
  return result
}

/**
 * La date (`AAAA-MM-JJ`) qui situe le voyage : celle de la première journée
 * datée `AAAA-MM-JJ`, la règle de `tripYear` et du recalage ; à défaut, la
 * partie date de la première journée datée d'une date-heure
 * (`2027-04-17T00:00`). `null` si aucune journée n'a de date : il n'y a rien
 * à situer. Une journée sans date (« à définir », date impossible) est sautée.
 */
export function templateDateAnchor(
  itinerary: readonly DayItinerary[],
): string | null {
  const dated = itinerary.find((day) => isIsoDate(day.date))
  if (dated) return dated.date
  for (const day of itinerary) {
    const parts =
      typeof day.date === 'string' ? splitIsoDateValue(day.date) : null
    if (parts) return parts.date
  }
  return null
}

/**
 * Le modèle, toutes ses dates et dates-heures reculées d'un même nombre de
 * semaines entières pour que sa date repère (`templateDateAnchor` : la
 * première journée datée) tombe entre le 1er et le 7 de son mois : même jour
 * de la semaine, même mois, même année, quantième caché. Les heures, les ids
 * et les textes libres ne bougent pas (une date écrite en toutes lettres dans
 * un texte part telle quelle).
 *
 * Sans aucune date de journée, rien ne bouge : il n'y a rien à situer. Un
 * jour 1 sans date ne bloque pas le flou : les journées datées qui suivent
 * reculent quand même. Idempotente : la journée repère reste la même et,
 * déjà dans la première semaine, ne recule plus. Pure : l'entrée n'est
 * jamais modifiée ; le résultat est un nouveau tableau, dont les journées
 * sont recopiées dès qu'elles bougent.
 */
export function blurTemplateDates(
  itinerary: readonly DayItinerary[],
): DayItinerary[] {
  const anchor = templateDateAnchor(itinerary)
  if (anchor === null) return [...itinerary]
  const offset = templateDateOffset(anchor)
  if (offset === 0) return [...itinerary]
  return itinerary.map((day) => blurDay(day, offset))
}
