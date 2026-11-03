/**
 * Calcul sur les dates de calendrier `AAAA-MM-JJ`, sans fuseau horaire.
 *
 * Une journée de voyage est une date de calendrier, pas un instant : passer par
 * `new Date('2026-05-10')` (minuit UTC) puis `toISOString()` décale d'un jour
 * selon le fuseau de l'appareil. Tout passe donc par un numéro de jour entier,
 * compté depuis l'époque en UTC, où l'heure d'été ne peut pas s'inviter.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
/**
 * Date-heure dont la partie date peut glisser : `2026-05-10T15:00`, `…:00Z`,
 * `…+09:00`, et la forme à espace des tableurs (`2026-05-10 15:00`). Avec une
 * espace, on exige une heure derrière : « 2026-05-10 au matin » est un texte.
 */
const ISO_DATE_TIME = /^(\d{4}-\d{2}-\d{2})(T.*| \d{2}:\d{2}.*)$/
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Instant UTC de minuit pour une date du calendrier. `Date.UTC` lit les années
 * 0 à 99 comme 1900 à 1999 (`0050-01-01` devenait 1950) ; `setUTCFullYear`,
 * lui, prend l'année telle quelle.
 */
function utcMidnight(year: number, month: number, day: number): number {
  return new Date(0).setUTCFullYear(year, month - 1, day)
}

/** Vrai pour une date `AAAA-MM-JJ` qui existe au calendrier (pas de 31 février). */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = ISO_DATE.exec(value)
  if (!match) return false
  const [, year, month, day] = match.map(Number)
  const date = new Date(utcMidnight(year, month, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

/** Date ISO → jours depuis l'époque, sans fuseau horaire. */
export function toDayNumber(iso: string): number {
  const [year, month, day] = iso.split('-').map(Number)
  return Math.round(utcMidnight(year, month, day) / DAY_MS)
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
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Sépare une date ou une date-heure en sa date et le reste :
 * `2026-05-10T15:00:00` → `{ date: '2026-05-10', time: 'T15:00:00' }`,
 * `2026-05-10` → `{ date: '2026-05-10', time: '' }`. `null` pour tout le
 * reste (heure seule, texte, date qui n'existe pas). Sert à redater une valeur
 * sans perdre son heure : `nouvelleDate + time`.
 */
export function splitIsoDateValue(
  value: string,
): { date: string; time: string } | null {
  if (isIsoDate(value)) return { date: value, time: '' }
  const match = ISO_DATE_TIME.exec(value)
  if (match && isIsoDate(match[1])) return { date: match[1], time: match[2] }
  return null
}

/**
 * Décale la partie date d'une date (`AAAA-MM-JJ`) ou d'une date-heure
 * (`AAAA-MM-JJTHH:MM…`) ; l'heure ne bouge pas. Toute autre valeur — une heure
 * seule (`08:30`), un texte, une date invalide — revient telle quelle.
 */
export function shiftIsoDateValue(value: string, offset: number): string {
  if (offset === 0) return value
  const parts = splitIsoDateValue(value)
  return parts ? addDays(parts.date, offset) + parts.time : value
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
