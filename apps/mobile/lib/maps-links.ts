/**
 * Cartes : ouvrir l'application de navigation plutôt que la page web de Maps.
 *
 * La webapp pointe partout sur `google.com/maps` (recherche d'un lieu ou
 * itinéraire). Dans l'app, ces liens sont traduits vers les applications
 * installées : Google Maps si présent, sinon Plans sur iOS ; sur Android, une
 * intention `geo:` que le système confie à l'app de cartes par défaut.
 *
 * Fonctions pures, sans dépendance React Native : elles se testent avec Vitest.
 */

export type MapsIntent =
  | { kind: 'search'; query: string }
  | { kind: 'directions'; destination: string }

/** Reconnaît les URL Google Maps produites par apps/web/src/lib/quick-actions.ts. */
export function parseMapsUrl(url: string): MapsIntent | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  const host = parsed.hostname.toLowerCase()
  if (
    host !== 'www.google.com' &&
    host !== 'google.com' &&
    host !== 'maps.google.com'
  ) {
    return null
  }
  if (!parsed.pathname.startsWith('/maps')) return null

  if (parsed.pathname.startsWith('/maps/search')) {
    const query = parsed.searchParams.get('query')
    return query ? { kind: 'search', query } : null
  }
  if (parsed.pathname.startsWith('/maps/dir')) {
    const destination = parsed.searchParams.get('destination')
    return destination ? { kind: 'directions', destination } : null
  }
  return null
}

/**
 * URL candidates pour ouvrir l'intention dans une app de cartes, par ordre de
 * préférence. L'appelant garde la première que le système sait ouvrir.
 */
export function nativeMapsUrls(
  intent: MapsIntent,
  platform: 'ios' | 'android' | string,
): string[] {
  const value = encodeURIComponent(
    intent.kind === 'search' ? intent.query : intent.destination,
  )

  if (platform === 'ios') {
    return intent.kind === 'search'
      ? [`comgooglemaps://?q=${value}`, `maps://?q=${value}`]
      : [`comgooglemaps://?daddr=${value}`, `maps://?daddr=${value}&dirflg=w`]
  }

  if (platform === 'android') {
    return intent.kind === 'search'
      ? [`geo:0,0?q=${value}`]
      : [`google.navigation:q=${value}`, `geo:0,0?q=${value}`]
  }

  return []
}
