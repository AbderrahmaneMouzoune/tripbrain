/**
 * Dernier filtre avant l'envoi vers PostHog.
 *
 * Le principe est celui de la liste blanche : ce qui n'a pas été explicitement
 * autorisé ne part pas. Un événement inconnu est jeté, une propriété non
 * déclarée est retirée, une valeur qui n'est pas un compteur, un booléen ou un
 * choix fermé est écartée, et toute URL est réduite à son chemin.
 *
 * Ce filtre existe parce que les URL de TripBrain transportent parfois le
 * voyage entier (`/?import=…`) ou un code de partage (`/?code=…`) : ces
 * valeurs ne doivent jamais quitter l'appareil autrement que par le partage
 * demandé par l'utilisateur.
 */

import {
  analyticsEvents,
  type AnalyticsEventName,
  type EventCatalog,
  type PropertySpec,
} from '@/lib/analytics/events'

/** Remplace une valeur qu'on ne sait pas prouver inoffensive. */
export const REDACTED = '[masqué]'

/**
 * Événements produits par le SDK lui-même et jugés sans risque une fois leurs
 * URL nettoyées. Tout le reste (autocapture, clics morts, exceptions, replay)
 * est désactivé à l'initialisation ; si l'un d'eux surgissait quand même, il
 * serait jeté ici.
 */
export const ALLOWED_SYSTEM_EVENTS: readonly string[] = [
  '$pageview',
  '$pageleave',
  '$web_vitals',
]

/**
 * Paramètres d'URL conservés : uniquement ceux qui disent d'où vient la
 * visite. Tous les autres — dont `import`, `code` et `q` — sont supprimés.
 */
const ALLOWED_QUERY_PARAMS: readonly string[] = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'demo',
]

/**
 * Propriétés non préfixées par `$` acceptées sur les événements du SDK. Les
 * identifiants publicitaires (`gclid`, `fbclid`…) n'y sont pas : ils désignent
 * une personne, pas un usage.
 */
const ALLOWED_SYSTEM_PROPERTIES: readonly string[] = [
  'distinct_id',
  'token',
  'title',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
]

/** Propriétés retirées quoi qu'il arrive, même si le SDK venait à les ajouter. */
const PROPERTY_DENYLIST: readonly string[] = [
  '$ip',
  '$elements',
  '$elements_chain',
  '$el_text',
  '$selected_content',
  '$initial_person_info',
  '$anon_distinct_id',
  '$user_id',
  '$email',
  '$name',
  '$username',
  '$raw_user_agent',
]

/** Clés dont la valeur est une URL, et doit donc être réduite avant l'envoi. */
const URL_PROPERTY_PATTERN = /url|referrer|pathname|href|origin|host/i

/** Longueur maximale d'un titre de page conservé. */
const MAX_TITLE_LENGTH = 120

/** Longueur maximale d'une valeur de paramètre `utm_*` conservée. */
const MAX_QUERY_VALUE_LENGTH = 96

/** Origine fictive : permet de traiter un chemin relatif comme une URL. */
const RELATIVE_BASE = 'https://relative.invalid'

export interface SanitizeUrlOptions {
  /**
   * Ancres conservées telles quelles. Tout fragment absent de cette liste est
   * supprimé : rien ne garantit qu'un `#…` ne transporte pas de contenu.
   */
  allowedFragments?: readonly string[]
}

/**
 * Réduit une URL à ce qui décrit une page : origine, chemin, paramètres de
 * provenance. Les valeurs sentinelles de PostHog (`$direct`) passent telles
 * quelles ; ce qui n'est pas analysable devient `[masqué]`.
 */
export function sanitizeUrlValue(
  value: string,
  options: SanitizeUrlOptions = {},
): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (/^\$[a-z_]+$/i.test(trimmed)) return trimmed

  const isAbsolute = /^https?:\/\//i.test(trimmed)
  const isRelative = trimmed.startsWith('/')
  if (!isAbsolute && !isRelative) {
    // Un nom d'hôte seul (`$host`, `$referring_domain`) n'a ni chemin ni
    // paramètre : il n'y a rien à en retirer.
    return /^[a-z0-9.:-]+$/i.test(trimmed) ? trimmed : REDACTED
  }

  let url: URL
  try {
    url = new URL(trimmed, RELATIVE_BASE)
  } catch {
    return REDACTED
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return REDACTED

  const kept = new URLSearchParams()
  url.searchParams.forEach((paramValue, key) => {
    if (!ALLOWED_QUERY_PARAMS.includes(key.toLowerCase())) return
    kept.set(key.toLowerCase(), paramValue.slice(0, MAX_QUERY_VALUE_LENGTH))
  })

  const query = kept.toString()
  const fragment = url.hash.replace(/^#/, '')
  const keepFragment =
    fragment.length > 0 && (options.allowedFragments ?? []).includes(fragment)

  const base = isAbsolute ? `${url.origin}${url.pathname}` : url.pathname

  return `${base}${query ? `?${query}` : ''}${keepFragment ? `#${fragment}` : ''}`
}

/** Une valeur est-elle conforme à ce que le catalogue déclare pour elle ? */
export function matchesSpec(spec: PropertySpec, value: unknown): boolean {
  switch (spec.kind) {
    case 'enum':
      return typeof value === 'string' && spec.values.includes(value)
    case 'count':
      return typeof value === 'number' && Number.isFinite(value)
    case 'flag':
      return typeof value === 'boolean'
  }
}

/**
 * Ne garde d'un lot de propriétés que ce que le catalogue déclare pour cet
 * événement, et seulement si la valeur a la forme attendue. Le reste est
 * silencieusement écarté : mieux vaut une mesure incomplète qu'une fuite.
 */
export function sanitizeEventProperties(
  eventName: AnalyticsEventName,
  properties: Record<string, unknown> | undefined,
  catalog: EventCatalog = analyticsEvents,
): Record<string, string | number | boolean> {
  const declared = catalog[eventName]?.properties ?? {}
  const safe: Record<string, string | number | boolean> = {}

  for (const [key, spec] of Object.entries(declared)) {
    const value = properties?.[key]
    if (value === undefined) continue
    if (!matchesSpec(spec, value)) continue
    safe[key] = value as string | number | boolean
  }

  return safe
}

/** Forme minimale d'un événement PostHog, suffisante pour le filtrer. */
export interface CapturePayload {
  event: string
  properties?: Record<string, unknown>
  $set?: Record<string, unknown>
  $set_once?: Record<string, unknown>
  $unset?: string[]
}

export interface BeforeSendOptions extends SanitizeUrlOptions {
  catalog?: EventCatalog
}

/**
 * Filtre installé sur `before_send` : c'est le point de passage obligé de tous
 * les événements, y compris ceux que le SDK produit de lui-même.
 *
 * Retourne `null` pour jeter un événement, ce que PostHog interprète comme
 * « ne rien envoyer ».
 */
export function sanitizeCapture<T extends CapturePayload>(
  payload: T | null,
  options: BeforeSendOptions = {},
): T | null {
  if (!payload) return null

  // L'annotation explicite évite que le type littéral du catalogue par défaut
  // ne prenne le dessus et rende l'indexation par une chaîne impossible.
  const catalog: EventCatalog = options.catalog ?? analyticsEvents
  const { allowedFragments } = options
  const name = payload.event

  const isSystemEvent = ALLOWED_SYSTEM_EVENTS.includes(name)
  const isCatalogEvent = Object.hasOwn(catalog, name)
  if (!isSystemEvent && !isCatalogEvent) return null

  const source = payload.properties ?? {}
  const properties: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(source)) {
    if (PROPERTY_DENYLIST.includes(key)) continue

    if (!key.startsWith('$')) {
      // Sur un événement du SDK, seules les métadonnées de provenance passent.
      if (isSystemEvent) {
        if (!ALLOWED_SYSTEM_PROPERTIES.includes(key)) continue
        properties[key] =
          key === 'title' && typeof value === 'string'
            ? value.slice(0, MAX_TITLE_LENGTH)
            : value
        continue
      }

      // Sur un événement du catalogue, la déclaration fait foi.
      const spec = catalog[name]?.properties?.[key]
      if (!spec || !matchesSpec(spec, value)) continue
      properties[key] = value
      continue
    }

    properties[key] =
      URL_PROPERTY_PATTERN.test(key) && typeof value === 'string'
        ? sanitizeUrlValue(value, { allowedFragments })
        : value
  }

  // Aucun profil personne n'est créé : les propriétés de personne n'ont donc
  // aucune raison d'exister, et sont retirées si le SDK en ajoutait.
  const sanitized = { ...payload, properties }
  delete sanitized.$set
  delete sanitized.$set_once
  delete sanitized.$unset

  return sanitized
}

/** Fabrique le filtre attendu par l'option `before_send` de PostHog. */
export function createBeforeSend(options: BeforeSendOptions = {}) {
  return <T extends CapturePayload>(payload: T | null): T | null =>
    sanitizeCapture(payload, options)
}

export const __testing = {
  ALLOWED_QUERY_PARAMS,
  ALLOWED_SYSTEM_PROPERTIES,
  PROPERTY_DENYLIST,
}
