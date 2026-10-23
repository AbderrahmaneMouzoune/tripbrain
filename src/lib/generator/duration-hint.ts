import { MAX_DURATION_DAYS, MIN_DURATION_DAYS } from '@/lib/generator/requests'

/**
 * Durée lue dans la description express : « 4 jours à Paris » doit donner un
 * voyage de 4 jours, même si le sélecteur est resté sur 7. Sans cette lecture,
 * la durée du sélecteur, imposée au modèle, l'emporte sans que le voyageur
 * s'en rende compte.
 *
 * Une seule mention claire suffit ; deux durées différentes (« 4 jours à
 * Paris puis 3 à Lyon ») restent au sélecteur, plutôt que de deviner.
 */

const NUMBER_WORDS: Record<string, number> = {
  un: 1,
  une: 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
  six: 6,
  sept: 7,
  huit: 8,
  neuf: 9,
  dix: 10,
  onze: 11,
  douze: 12,
  treize: 13,
  quatorze: 14,
  quinze: 15,
  vingt: 20,
  trente: 30,
}

const QUANTITY = `(\\d{1,2}|${Object.keys(NUMBER_WORDS).join('|')})`

const PATTERNS: { regex: RegExp; days: (count: number) => number }[] = [
  {
    regex: new RegExp(`\\b${QUANTITY}\\s*semaines?\\b`, 'gi'),
    days: (n) => n * 7,
  },
  {
    regex: new RegExp(`\\b${QUANTITY}\\s*nuits?\\b`, 'gi'),
    days: (n) => n + 1,
  },
  {
    regex: new RegExp(`\\b${QUANTITY}\\s*(?:jours?|j)\\b`, 'gi'),
    days: (n) => n,
  },
  { regex: /\blong\s+week-?end\b/gi, days: () => 3 },
  { regex: /\bweek-?end\b/gi, days: () => 2 },
]

function toNumber(word: string): number {
  return /^\d+$/.test(word)
    ? Number(word)
    : (NUMBER_WORDS[word.toLowerCase()] ?? NaN)
}

/** La durée en jours décrite dans le texte, ou `null` si elle est absente ou ambiguë. */
export function durationFromDescription(text: string): number | null {
  // Les espaces insécables comptent comme des espaces.
  let rest = text.replace(/[  ]/g, ' ')
  const found = new Set<number>()
  for (const { regex, days } of PATTERNS) {
    rest = rest.replace(regex, (match: string, ...groups: unknown[]) => {
      // Sans groupe capturant (« week-end »), le premier argument suivant est
      // la position de la mention, pas une quantité.
      const quantity = groups[0]
      const count = typeof quantity === 'string' ? toNumber(quantity) : 1
      if (Number.isFinite(count) && count > 0) found.add(days(count))
      // Retire la mention : « long week-end » ne doit pas compter deux fois.
      return ' '.repeat(match.length)
    })
  }
  if (found.size !== 1) return null
  const [days] = found
  return days >= MIN_DURATION_DAYS && days <= MAX_DURATION_DAYS ? days : null
}
