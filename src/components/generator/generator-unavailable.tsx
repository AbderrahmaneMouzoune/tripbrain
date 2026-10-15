'use client'

import { IconExternalLink, IconWorldWww } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { IconBadge } from '@/components/mobile/icon-badge'
import { MobileScreen } from '@/components/mobile/mobile-screen'
import { trackEvent } from '@/lib/analytics/client'
import type { GenerateRequest } from '@/lib/generator/requests'
import { getGeneratorUrl } from '@/lib/site-links'

/**
 * Repli quand le serveur n'a pas de clé d'API : on le dit simplement, et on
 * propose le générateur du site, qui fait le même travail par copier-coller
 * et renvoie l'itinéraire dans l'app. La demande déjà remplie l'accompagne :
 * le formulaire du site s'ouvre pré-rempli.
 */
export function GeneratorUnavailable({
  request,
  onBack,
  onClose,
}: {
  /** Demande refusée faute de clé, reprise telle quelle par le site. */
  request: GenerateRequest | null
  onBack: () => void
  onClose: () => void
}) {
  return (
    <MobileScreen
      onBack={onBack}
      eyebrow="Générateur indisponible"
      title="Le générateur intégré n’est pas activé ici"
      description="Ce serveur n’a pas d’accès au modèle d’IA. Le générateur du site tripbrain.fr fait le même travail : votre demande s’y ouvre déjà remplie, vous passez par ChatGPT ou Claude, et l’itinéraire revient directement dans l’app."
      footer={
        <>
          <Button asChild size="xl" className="w-full">
            <a
              href={getGeneratorUrl('generator_fallback', request)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() =>
                trackEvent('generator_opened', {
                  surface: 'generator_fallback',
                })
              }
            >
              Ouvrir le générateur du site
              <IconExternalLink aria-hidden />
            </a>
          </Button>
          <Button
            variant="ghost"
            size="lg2"
            className="text-muted-foreground w-full font-extrabold"
            onClick={onClose}
          >
            Plus tard
          </Button>
        </>
      }
    >
      <div className="bg-card border-border flex items-start gap-3.5 rounded-[20px] border p-4">
        <IconBadge icon={IconWorldWww} tone="accent" size="lg" />
        <p className="text-muted-foreground flex-1 text-sm leading-relaxed">
          Rien à remplir à nouveau : votre description et vos réponses partent
          avec le lien et s’affichent dans le formulaire du site. Elles restent
          aussi ici, si le générateur intégré est activé plus tard.
        </p>
      </div>
    </MobileScreen>
  )
}
