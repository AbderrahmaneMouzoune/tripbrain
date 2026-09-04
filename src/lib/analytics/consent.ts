/**
 * Consentement aux mesures d'audience.
 *
 * Le choix du visiteur vit sur son appareil et n'est jamais envoyé nulle part.
 * Tant qu'il n'a pas dit oui, PostHog reste en opt-out complet : aucune requête
 * ne part, aucun identifiant n'est écrit. Dire non, ou revenir sur un oui, est
 * aussi simple que d'accepter — c'est ce qu'exige l'article 7.3 du RGPD.
 */

export type ConsentStatus = 'granted' | 'denied'

/**
 * Version du texte d'information affiché au moment du recueil. L'incrémenter
 * redemande le consentement : c'est ce qu'il faut faire si la finalité, les
 * destinataires ou les données collectées changent.
 */
export const CONSENT_VERSION = 1

const STORAGE_KEY = 'tripbrain:analytics-consent'

/** Événement interne : prévient les composants montés d'un changement d'avis. */
const CHANGE_EVENT = 'tripbrain:analytics-consent-change'

export interface ConsentRecord {
  status: ConsentStatus
  /** Version du texte accepté : un choix périmé vaut absence de choix. */
  version: number
  /** Date ISO du choix, pour pouvoir en justifier. */
  decidedAt: string
}

function isRecord(value: unknown): value is ConsentRecord {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<ConsentRecord>
  return (
    (candidate.status === 'granted' || candidate.status === 'denied') &&
    typeof candidate.version === 'number' &&
    typeof candidate.decidedAt === 'string'
  )
}

/**
 * Choix en cours, ou `null` si rien n'a été décidé — y compris quand le
 * stockage est indisponible (navigation privée, stockage bloqué) : dans le
 * doute, on considère qu'il n'y a pas de consentement.
 */
export function readConsent(): ConsentRecord | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null

    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return null
    // Le texte a changé depuis : on redemande plutôt que de présumer.
    if (parsed.version !== CONSENT_VERSION) return null

    return parsed
  } catch {
    return null
  }
}

export function hasGrantedConsent(): boolean {
  return readConsent()?.status === 'granted'
}

/** Enregistre un choix et prévient l'application, onglet courant compris. */
export function writeConsent(status: ConsentStatus): ConsentRecord {
  const record: ConsentRecord = {
    status,
    version: CONSENT_VERSION,
    decidedAt: new Date().toISOString(),
  }

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record))
    } catch {
      // Stockage refusé : le choix ne vaudra que pour la session en cours,
      // ce qui reste plus protecteur que de passer outre.
    }
    notify(record)
  }

  return record
}

/** Oublie le choix : la bannière réapparaîtra à la prochaine visite. */
export function clearConsent(): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Rien à faire : sans stockage, il n'y avait rien à oublier.
  }
  notify(null)
}

function notify(record: ConsentRecord | null): void {
  window.dispatchEvent(
    new CustomEvent<ConsentRecord | null>(CHANGE_EVENT, { detail: record }),
  )
}

/**
 * S'abonne aux changements d'avis, y compris ceux venus d'un autre onglet :
 * refuser quelque part doit couper la mesure partout.
 */
export function subscribeToConsent(
  listener: (record: ConsentRecord | null) => void,
): () => void {
  if (typeof window === 'undefined') return () => {}

  const onChange = (event: Event) => {
    listener((event as CustomEvent<ConsentRecord | null>).detail ?? null)
  }
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) {
      listener(readConsent())
    }
  }

  window.addEventListener(CHANGE_EVENT, onChange)
  window.addEventListener('storage', onStorage)

  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange)
    window.removeEventListener('storage', onStorage)
  }
}
