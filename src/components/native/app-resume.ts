import { onNativeEvent } from '@/lib/native-app'

/** Les deux signaux arrivent souvent ensemble : un seul retour compte. */
const RESUME_DEDUPE_MS = 1500

/**
 * Appelle `handler` au retour de l'app au premier plan : `app/resume` du natif
 * (v2, le plus fiable) ou `visibilitychange` de la WebView. Retourne la
 * fonction de désabonnement.
 */
export function onAppResume(handler: () => void): () => void {
  let last = 0
  const fire = () => {
    const now = Date.now()
    if (now - last < RESUME_DEDUPE_MS) return
    last = now
    handler()
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible') fire()
  }
  document.addEventListener('visibilitychange', onVisible)
  const unsubscribe = onNativeEvent('app/resume', fire)
  return () => {
    document.removeEventListener('visibilitychange', onVisible)
    unsubscribe()
  }
}
