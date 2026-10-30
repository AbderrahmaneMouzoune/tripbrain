/**
 * Scanner du téléphone (app native) : ce que fait le natif de la valeur lue.
 *
 * Un natif v1 (sans liste `capabilities`) ouvre lui-même la WebView sur un
 * lien TripBrain scanné, avant de rendre la valeur à la page : la page se
 * recharge sur le partage. Un natif v2 rend seulement la valeur, la page la
 * traite comme un lien collé.
 *
 * Logique pure, testée dans `src/lib/__tests__/receive-native-scan.test.ts`.
 */

/** Hôte de production des liens universels, toujours connu du natif. */
const PRODUCTION_HOST = 'app.tripbrain.fr'

/**
 * Le natif v1 va-t-il recharger la page sur cette valeur ? Reprend les règles
 * de `resolveWebappUrl` côté natif : schéma `tripbrain://`, ou lien http(s)
 * vers l'app (production ou instance chargée).
 */
export function scanValueReloadsPage(
  value: string,
  currentHost: string,
  legacyNative: boolean,
): boolean {
  if (!legacyNative) return false
  const trimmed = value.trim()
  if (trimmed.toLowerCase().startsWith('tripbrain://')) {
    return !trimmed
      .slice('tripbrain://'.length)
      .startsWith('expo-development-client')
  }
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
  const host = url.host.toLowerCase()
  return host === PRODUCTION_HOST || host === currentHost.toLowerCase()
}
