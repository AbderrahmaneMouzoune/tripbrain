// Limiteur de débit à fenêtre fixe, en mémoire.
//
// Un code de partage est un jeton au porteur : qui l'a peut lire le snapshot.
// Huit caractères Crockford valent 40 bits, ce qui rend le tirage au sort
// inintéressant — à condition de ne pas laisser essayer en boucle. C'est le
// rôle de ce limiteur, appliqué à la lecture comme à la création.
//
// La mémoire est celle de l'instance : en serverless, chaque instance a son
// propre compteur et un redémarrage remet à zéro. C'est un garde-fou contre le
// balayage naïf, pas un quota distribué.

export interface RateLimiterOptions {
  /** Nombre de requêtes autorisées par fenêtre. */
  limit: number
  /** Durée de la fenêtre, en millisecondes. */
  windowMs: number
}

export interface RateLimitVerdict {
  allowed: boolean
  /** Secondes à attendre avant la prochaine tentative. `0` quand la requête passe. */
  retryAfter: number
}

interface Bucket {
  count: number
  resetAt: number
}

/** Au-delà de ce nombre d'entrées, les fenêtres expirées sont balayées. */
const SWEEP_THRESHOLD = 1000

export function createRateLimiter({ limit, windowMs }: RateLimiterOptions) {
  const buckets = new Map<string, Bucket>()

  return function check(key: string): RateLimitVerdict {
    const now = Date.now()

    if (buckets.size > SWEEP_THRESHOLD) {
      for (const [k, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(k)
      }
    }

    const bucket = buckets.get(key)

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs })
      return { allowed: true, retryAfter: 0 }
    }

    if (bucket.count >= limit) {
      return {
        allowed: false,
        retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
      }
    }

    bucket.count += 1
    return { allowed: true, retryAfter: 0 }
  }
}

/**
 * Identifie l'appelant derrière le proxy de l'hébergeur. En dernier recours,
 * tout le monde partage le même seau : mieux vaut limiter trop que pas du tout.
 */
export function getClientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0].trim()
    if (first) return first
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown'
}
