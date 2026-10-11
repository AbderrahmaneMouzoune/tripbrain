import type { AppScreen, AppScreenKind } from '@/components/app/navigation'

/** Ce que reçoit chaque écran empilé : sa description et de quoi se fermer. */
export interface ScreenProps<K extends AppScreenKind> {
  screen: Extract<AppScreen, { kind: K }>
  /** Ferme cet écran (retour à l'écran du dessous). */
  onClose: () => void
}
