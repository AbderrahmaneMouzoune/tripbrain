'use client'

import { KeyRound, QrCode, Sparkles } from 'lucide-react'
import { OptionCard } from '@/components/mobile/option-card'

/** Les points de départ d'un voyage à charger. */
export type IntentionChoice = 'code' | 'scan' | 'generator' | 'file'

/**
 * Les trois façons de commencer, dans l'ordre de qui arrive : la plupart ont
 * préparé leur voyage sur le site et viennent le récupérer avec un code. Le
 * générateur ferme la marche : il sert ceux qui arrivent les mains vides.
 */
export function IntentionOptions({
  onChoose,
}: {
  onChoose: (choice: Exclude<IntentionChoice, 'file'>) => void
}) {
  return (
    <div className="stagger flex flex-col gap-3">
      <OptionCard
        icon={KeyRound}
        tone="primary"
        title="Je l’ai préparé sur tripbrain.fr"
        description="Saisis le code affiché sous ton programme"
        badge="Le plus fréquent"
        selected
        onClick={() => onChoose('code')}
      />
      <OptionCard
        icon={QrCode}
        tone="accent"
        title="On me l’a partagé"
        description="Scanne le QR code ou ouvre le lien reçu"
        onClick={() => onChoose('scan')}
      />
      <OptionCard
        icon={Sparkles}
        tone="secondary"
        title="Je n’ai pas encore de programme"
        description="Décris tes envies, on le construit avec toi"
        onClick={() => onChoose('generator')}
      />
    </div>
  )
}
