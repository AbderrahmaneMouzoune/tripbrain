import type { GenerateRequest } from '@/lib/generator/requests'
import { EMPTY_BRIEF, type TripBrief } from '@/lib/generator/trip-brief'

/**
 * Demande du générateur intégré, transmise au générateur du site.
 *
 * Quand le serveur n'a pas de clé d'API, l'app renvoie vers `tripbrain.fr` :
 * sans ce relais, tout ce que le voyageur vient de remplir serait à refaire.
 * La demande voyage dans le fragment de l'URL (`#brouillon=…`), que le
 * navigateur n'envoie jamais au serveur et que la mesure d'audience ignore.
 *
 * Le site lit ce format dans `src/lib/app-prefill.ts` : les deux fichiers
 * doivent évoluer ensemble, d'où le numéro de version.
 */

/** Nom du paramètre, dans le fragment de l'URL du générateur du site. */
export const SITE_PREFILL_KEY = 'brouillon'

export interface SitePrefill {
  v: 1
  mode: 'express' | 'brief'
  description?: string
  startDate?: string
  durationDays?: number
  /** Seules les réponses qui diffèrent du questionnaire vide. */
  brief?: Partial<TripBrief>
}

/** Les réponses données, sans les valeurs par défaut : l'URL reste courte. */
function answeredFields(brief: TripBrief): Partial<TripBrief> {
  const answered: Partial<TripBrief> = {}
  for (const key of Object.keys(brief) as (keyof TripBrief)[]) {
    const value = brief[key]
    const empty = EMPTY_BRIEF[key]
    const same = Array.isArray(value)
      ? Array.isArray(empty) &&
        value.length === empty.length &&
        value.every((item, index) => item === empty[index])
      : value === empty
    if (!same) Object.assign(answered, { [key]: value })
  }
  return answered
}

export function toSitePrefill(request: GenerateRequest): SitePrefill {
  if (request.mode === 'brief') {
    return {
      v: 1,
      mode: 'brief',
      startDate: request.startDate,
      brief: answeredFields(request.brief),
    }
  }
  return {
    v: 1,
    mode: 'express',
    description: request.description,
    startDate: request.startDate,
    durationDays: request.durationDays,
  }
}

/** Base64 sans `+`, `/` ni `=` : rien à échapper dans une URL. */
function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Fragment à ajouter à l'URL du générateur du site, `#` compris. */
export function encodeSitePrefill(request: GenerateRequest): string {
  return `#${SITE_PREFILL_KEY}=${toBase64Url(JSON.stringify(toSitePrefill(request)))}`
}
