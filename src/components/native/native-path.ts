import type { ReminderKind } from '@/lib/reminders'
import { readIncomingShare, type IncomingShare } from '@/lib/share'

/** Voyage, journée et écran à ouvrir (lien d'un rappel, voir `reminderPath`). */
export interface TripTarget {
  tripId: string
  /** `null` : journée absente ou illisible, on ouvre seulement le voyage. */
  dayIndex: number | null
  open: ReminderKind | null
}

/** Ce qu'un chemin demandé par le natif (ou l'URL d'ouverture) veut afficher. */
export type NativePathIntent =
  | { kind: 'trip'; target: TripTarget }
  | { kind: 'share'; share: IncomingShare }
  /** L'accueil : on referme les écrans ouverts. */
  | { kind: 'home' }
  /** Une autre page du site : rechargement classique. */
  | { kind: 'page'; href: string }

const REMINDER_KINDS: readonly ReminderKind[] = [
  'transport-eve',
  'morning',
  'check-in',
]

/** `?trip=…&day=…&open=…`, ou `null` sans voyage désigné. */
export function readTripTarget(params: URLSearchParams): TripTarget | null {
  const tripId = params.get('trip')
  if (!tripId) return null
  const day = params.get('day')
  const dayIndex = day !== null && /^\d+$/.test(day) ? Number(day) : null
  const open = params.get('open')
  return {
    tripId,
    dayIndex,
    open: REMINDER_KINDS.includes(open as ReminderKind)
      ? (open as ReminderKind)
      : null,
  }
}

/**
 * Lit un chemin du site (`/?trip=…`, `/s/<code>`, `/?code=…`, `/guide`…).
 * `null` pour un lien vers un autre site, qui n'a rien à faire ici.
 */
export function parseNativePath(
  path: string,
  origin: string,
): NativePathIntent | null {
  let url: URL
  try {
    url = new URL(path, origin)
  } catch {
    return null
  }
  if (url.origin !== origin) return null

  if (url.pathname === '/') {
    const target = readTripTarget(url.searchParams)
    if (target) return { kind: 'trip', target }
    const share = readIncomingShare(url.search, url.hash)
    if (share) return { kind: 'share', share }
    return { kind: 'home' }
  }

  const shared = url.pathname.match(/^\/s\/([^/]+)\/?$/)
  if (shared) {
    try {
      return { kind: 'share', share: { code: decodeURIComponent(shared[1]) } }
    } catch {
      return null
    }
  }

  return { kind: 'page', href: url.href }
}
