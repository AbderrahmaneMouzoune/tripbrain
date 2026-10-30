import { useSyncExternalStore } from 'react'
import { isInsideNativeApp } from '@/lib/native-app'

const subscribe = () => () => {}

/**
 * La page tourne-t-elle dans l'app native ? `false` au rendu serveur et à
 * l'hydratation, puis la vraie valeur : pas d'écart d'hydratation.
 *
 * Pour masquer un élément dès la première peinture, préférer la variante CSS
 * `native:` (attribut `data-native` posé dans le `<head>`).
 */
export function useIsNativeApp(): boolean {
  return useSyncExternalStore(subscribe, isInsideNativeApp, () => false)
}
