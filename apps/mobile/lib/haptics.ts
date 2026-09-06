import * as Haptics from 'expo-haptics'

import type { HapticKind } from './bridge-protocol'

/** Déclenche le retour haptique demandé par la webapp ; silencieux si l'appareil n'en a pas. */
export async function triggerHaptic(kind: HapticKind): Promise<void> {
  try {
    switch (kind) {
      case 'selection':
        await Haptics.selectionAsync()
        break
      case 'impact':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
        break
      case 'success':
        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        )
        break
      case 'warning':
        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Warning,
        )
        break
      case 'error':
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        break
    }
  } catch {
    // Simulateur ou appareil sans moteur haptique : rien à faire.
  }
}
