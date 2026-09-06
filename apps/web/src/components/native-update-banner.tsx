'use client'

import { useEffect, useState } from 'react'
import { IconDeviceMobile } from '@tabler/icons-react'
import { isNativeAppOutdated } from '@/lib/native-app'

/**
 * Invite à mettre à jour l'app native quand elle est trop ancienne pour le
 * bridge que cette page attend, plutôt que d'échouer en silence.
 */
export function NativeUpdateBanner() {
  const [outdated, setOutdated] = useState(false)

  useEffect(() => {
    setOutdated(isNativeAppOutdated())
  }, [])

  if (!outdated) return null

  return (
    <div
      role="status"
      className="bg-primary/10 text-primary border-primary/20 mx-auto flex max-w-4xl items-center gap-3 border-b px-4 py-2 text-sm"
    >
      <IconDeviceMobile className="h-4 w-4 shrink-0" />
      <p className="text-pretty">
        Une nouvelle version de TripBrain est disponible sur l’App Store et
        Google Play : certaines fonctions ne marcheront plus sans elle.
      </p>
    </div>
  )
}
