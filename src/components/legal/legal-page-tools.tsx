'use client'

/**
 * Les deux morceaux interactifs des pages légales : la remontée de la
 * consultation, et le réglage du consentement.
 *
 * Le réglage est ici plutôt que dans une bannière rouverte : retirer son accord
 * doit être aussi direct que de le donner, et se trouver là où on le cherche.
 */

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { useAnalytics } from '@/hooks/use-analytics'
import { IconCheck, IconX } from '@tabler/icons-react'

type LegalPage = 'mentions-legales' | 'politique-de-confidentialite'

export function LegalPageView({ page }: { page: LegalPage }) {
  const { track } = useAnalytics()

  useEffect(() => {
    track('legal_page_viewed', { page })
  }, [track, page])

  return null
}

export function ConsentPreferences() {
  const { isConfigured, consent, decide } = useAnalytics()

  if (!isConfigured) {
    return (
      <p className="text-muted-foreground text-sm">
        Aucune mesure d’audience n’est active sur cette installation : aucune
        donnée n’est envoyée, il n’y a donc rien à régler.
      </p>
    )
  }

  const status = consent?.status ?? null

  return (
    <div className="border-border/70 bg-muted/30 rounded-xl border p-3">
      <p className="text-foreground text-sm font-medium">
        {status === 'granted' && 'Mesure d’audience : activée'}
        {status === 'denied' && 'Mesure d’audience : désactivée'}
        {status === null && 'Mesure d’audience : aucun choix enregistré'}
      </p>
      <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
        {status === 'granted'
          ? 'Tu peux la couper à tout moment : l’identifiant anonyme est alors effacé de cet appareil.'
          : 'Tant qu’elle est désactivée, aucune requête n’est envoyée à PostHog.'}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => decide('denied', 'privacy_page')}
          disabled={status === 'denied'}
          className="gap-1.5"
        >
          <IconX className="h-3.5 w-3.5" />
          Désactiver
        </Button>
        <Button
          size="sm"
          onClick={() => decide('granted', 'privacy_page')}
          disabled={status === 'granted'}
          className="gap-1.5"
        >
          <IconCheck className="h-3.5 w-3.5" />
          Activer
        </Button>
      </div>
    </div>
  )
}
