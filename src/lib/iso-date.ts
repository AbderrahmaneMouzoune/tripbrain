/**
 * Calcul sur les dates de calendrier `AAAA-MM-JJ`, sans fuseau horaire.
 *
 * Une journée de voyage est une date de calendrier, pas un instant : passer par
 * `new Date('2026-05-10')` (minuit UTC) puis `toISOString()` décale d'un jour
 * selon le fuseau de l'appareil. Tout passe donc par un numéro de jour entier,
 * compté depuis l'époque en UTC, où l'heure d'été ne peut pas s'inviter.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
/** Date-heure dont la partie date peut glisser : `2026-05-10T15:00`, `…:00Z`… */
const ISO_DATE_TIME = /^(\d{4}-\d{2}-\d{2})(T.*)$/
const DAY_MS = 24 * 60 * 60 * 1000

/** Vrai pour une date `AAAA-MM-JJ` qui existe au calendrier (pas de 31 février). */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = ISO_DATE.exec(value)
  if (!match) return false
  const [, year, month, day] = match.map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

/** Date ISO → jours depuis l'époque, sans fuseau horaire. */
export function toDayNumber(iso: string): number {
  const [year, month, day] = iso.split('-').map(Number)
  return Math.round(Date.UTC(year, month - 1, day) / DAY_MS)
}

/** Jours depuis l'époque → date ISO. */
export function fromDayNumber(dayNumber: number): string {
  return new Date(dayNumber * DAY_MS).toISOString().slice(0, 10)
}

/** `addDays('2026-05-30', 3)` → `'2026-06-02'`. */
export function addDays(iso: string, days: number): string {
  return fromDayNumber(toDayNumber(iso) + days)
}

/** Nombre de jours de `from` à `to` (négatif si `to` est avant). */
export function daysBetween(from: string, to: string): number {
  return toDayNumber(to) - toDayNumber(from)
}

/** Date du jour sur l'appareil, en `AAAA-MM-JJ` local. */
export function localIsoDate(date: Date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * Décale la partie date d'une date (`AAAA-MM-JJ`) ou d'une date-heure
 * (`AAAA-MM-JJTHH:MM…`) ; l'heure ne bouge pas. Toute autre valeur — une heure
 * seule (`08:30`), un texte, une date invalide — revient telle quelle.
 */
export function shiftIsoDateValue(value: string, offset: number): string {
  if (offset === 0) return value
  if (isIsoDate(value)) return addDays(value, offset)
  const match = ISO_DATE_TIME.exec(value)
  if (match && isIsoDate(match[1])) return addDays(match[1], offset) + match[2]
  return value
}

/**
 * Décale toutes les dates d'une structure, où qu'elles soient (journée, hôtel,
 * horaires de transport…). Les objets sont recopiés, jamais modifiés en place.
 */
export function shiftDatesDeep<T>(value: T, offset: number): T {
  if (typeof value === 'string') {
    return shiftIsoDateValue(value, offset) as T
  }
  if (Array.isArray(value)) {
    return value.map((item) => shiftDatesDeep(item, offset)) as T
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        shiftDatesDeep(item, offset),
      ]),
    ) as T
  }
  return value
}
