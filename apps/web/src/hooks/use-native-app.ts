'use client'

import { useEffect, useState } from 'react'
import { getNativeApp, type NativeAppInfo } from '@/lib/native-app'

/**
 * L'app native qui héberge la page, connue après le montage seulement :
 * au rendu serveur, rien ne distingue l'app d'un navigateur, et un rendu
 * différent ferait échouer l'hydratation.
 */
export function useNativeApp(): NativeAppInfo | null {
  const [app, setApp] = useState<NativeAppInfo | null>(null)
  useEffect(() => {
    setApp(getNativeApp())
  }, [])
  return app
}

export function useIsNativeApp(): boolean {
  return useNativeApp() !== null
}
