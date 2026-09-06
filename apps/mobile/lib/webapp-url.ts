/**
 * URL de la webapp en développement.
 *
 * `.env` dit `http://localhost:3000`, mais sur un téléphone `localhost`
 * désigne le téléphone lui-même : la WebView ne trouve rien et affiche
 * l'écran d'erreur. Expo connaît pourtant l'adresse de la machine de
 * développement (`hostUri`, celle qui sert le bundle, par exemple
 * `192.168.1.20:8081`) : on la substitue au loopback, et la webapp lancée par
 * `bun run dev` dans apps/web est trouvée sans rien configurer.
 *
 * Fonction pure, sans dépendance React Native : elle se teste avec Vitest.
 */

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]'])

function isLoopback(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname.toLowerCase())
}

export function devWebappUrl(
  configured: string,
  hostUri: string | undefined,
): string {
  let url: URL
  try {
    url = new URL(configured)
  } catch {
    return configured
  }
  if (!isLoopback(url.hostname)) return configured
  if (!hostUri) return configured

  // hostUri : `hôte:port`, parfois avec un chemin (`exp.host/@user/app`).
  const host = hostUri.split('/')[0]?.split(':')[0] ?? ''
  if (!host || isLoopback(host)) return configured

  url.hostname = host
  return url.toString()
}
