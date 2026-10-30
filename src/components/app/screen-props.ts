import { createContext, useContext, useEffect } from 'react'
import type { AppScreen, AppScreenKind } from '@/components/app/navigation'
import type { NativeStatusBarStyle } from '@/lib/native-app'

/** Ce que reçoit chaque écran empilé : sa description et de quoi se fermer. */
export interface ScreenProps<K extends AppScreenKind> {
  screen: Extract<AppScreen, { kind: K }>
  /** Ferme cet écran (retour à l'écran du dessous). */
  onClose: () => void
}

/** Barre d'état demandée par un écran empilé (app native seulement). */
export interface ScreenStatusBarRequest {
  /** `light` : icônes claires, pour un haut d'écran foncé ou une photo. */
  style: NativeStatusBarStyle
  /**
   * Hauteur (px) de l'en-tête photo qui justifie le style : une fois défilé
   * au-delà, la barre revient au style par défaut, sur fond clair.
   */
  heroHeight?: number
}

/** Fourni par `ScreenHost` à chaque écran empilé. */
export const ScreenStatusBarContext = createContext<
  ((request: ScreenStatusBarRequest | null) => void) | null
>(null)

/**
 * Demande un style de barre d'état tant que l'écran est monté. `ScreenHost`
 * n'applique que celui de l'écran du dessus, et revient au style par défaut à
 * la fermeture. `null` : pas de demande. Sans effet hors de l'app native.
 */
export function useScreenStatusBar(
  style: NativeStatusBarStyle | null,
  heroHeight?: number,
) {
  const request = useContext(ScreenStatusBarContext)
  useEffect(() => {
    if (!request) return
    request(style ? { style, heroHeight } : null)
    return () => request(null)
  }, [request, style, heroHeight])
}
