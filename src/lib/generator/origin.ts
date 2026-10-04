import { corsHeaders, isAllowedOrigin } from '@/lib/share-cors'

/**
 * Qui peut lancer une génération.
 *
 * Même liste que le partage (`share-cors.ts`) : l'app elle-même, et le site
 * vitrine avec ses préproductions. Une différence pourtant : le partage laisse
 * passer une origine inconnue (le navigateur refusera seulement d'en lire la
 * réponse), alors qu'ici elle est refusée d'emblée. Chaque génération est
 * facturée : une page tierce ne doit pas pouvoir la déclencher, même sans en
 * lire le résultat.
 *
 * Une requête sans en-tête `Origin` (outil en ligne de commande, navigateur
 * qui l'omet en same-origin) passe : la limite de débit reste le garde-fou.
 */
export function checkGeneratorOrigin(request: Request): {
  allowed: boolean
  headers: Record<string, string>
} {
  const origin = request.headers.get('origin')
  const headers = corsHeaders(origin)
  if (!origin) return { allowed: true, headers }
  if (isAllowedOrigin(origin)) return { allowed: true, headers }

  let originHost: string
  try {
    originHost = new URL(origin).host
  } catch {
    return { allowed: false, headers }
  }
  const hosts = [
    request.headers.get('x-forwarded-host'),
    request.headers.get('host'),
    safeHost(request.url),
  ].filter(Boolean)
  return { allowed: hosts.includes(originHost), headers }
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).host
  } catch {
    return null
  }
}
