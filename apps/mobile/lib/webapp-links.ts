/**
 * Liens entre l'application native et la webapp.
 *
 * Fonctions pures, sans dépendance React Native : elles se testent avec Vitest.
 *
 * Deux familles d'URL arrivent jusqu'à l'app :
 * - les liens universels / App Links (`https://app.tripbrain.fr/s/48205137`),
 *   quand la personne tape un lien de partage reçu par message ;
 * - le schéma maison (`tripbrain://s/48205137`), utile pour les QR codes et
 *   les tests sur simulateur.
 *
 * Dans les deux cas, on ne garde que le chemin et la requête, rejoués sur
 * l'URL de la webapp configurée : un build de développement branché sur un
 * serveur local ouvre ainsi le même partage que la production.
 */

/** Schéma déclaré dans app.json (`expo.scheme`). */
export const APP_SCHEME = 'tripbrain'

/** Hôte de production : les liens universels y pointent toujours. */
export const PRODUCTION_HOST = 'app.tripbrain.fr'

/** URL de la webapp quand aucun environnement ne dit mieux. */
export const DEFAULT_WEBAPP_URL = `https://${PRODUCTION_HOST}`

/** Préfixe des URL internes d'Expo (dev client), jamais destinées à la webapp. */
const EXPO_DEV_CLIENT_PREFIX = 'expo-development-client'

function tryParse(url: string): URL | null {
  try {
    return new URL(url)
  } catch {
    return null
  }
}

/**
 * Traduit une URL reçue par l'app en URL à charger dans la WebView.
 *
 * Retourne `null` pour tout ce qui ne concerne pas la webapp : autre domaine,
 * URL interne d'Expo, texte invalide.
 */
export function resolveWebappUrl(
  incoming: string | null | undefined,
  webappUrl: string,
): string | null {
  if (!incoming) return null
  const base = tryParse(webappUrl)
  if (!base) return null

  // Schéma maison : `tripbrain://s/1234`, `tripbrain:///?code=1234`,
  // `tripbrain://?code=1234`. `new URL` lit l'hôte de façon incohérente selon
  // le moteur, on découpe donc à la main.
  const schemePrefix = `${APP_SCHEME}://`
  if (incoming.toLowerCase().startsWith(schemePrefix)) {
    const rest = incoming.slice(schemePrefix.length)
    if (rest.startsWith(EXPO_DEV_CLIENT_PREFIX)) return null
    const path = rest.startsWith('/') ? rest : `/${rest}`
    return new URL(path, base).toString()
  }

  const parsed = tryParse(incoming)
  if (!parsed) return null
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null

  const knownHosts = new Set([PRODUCTION_HOST, base.host])
  if (!knownHosts.has(parsed.host)) return null

  return new URL(
    `${parsed.pathname}${parsed.search}${parsed.hash}`,
    base,
  ).toString()
}

/**
 * Une navigation demandée par la page doit-elle rester dans la WebView ?
 *
 * Tout ce qui n'est pas la webapp (réservations, Google Maps, mentions
 * légales externes, `mailto:`) part vers le système, qui ouvre le navigateur
 * ou l'application dédiée.
 */
export function isWebappRequest(url: string, webappUrl: string): boolean {
  if (url === 'about:blank') return true
  // Aperçus et exports générés par la page elle-même.
  if (url.startsWith('blob:') || url.startsWith('data:')) return true

  const parsed = tryParse(url)
  const base = tryParse(webappUrl)
  if (!parsed || !base) return false

  return parsed.origin === base.origin
}
