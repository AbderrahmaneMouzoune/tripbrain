'use client'

import { FileText, KeyRound, QrCode, Sparkles } from 'lucide-react'
import { OptionCard } from '@/components/mobile/option-card'

/** Les points de départ d'un voyage à charger. */
export type IntentionChoice = 'code' | 'scan' | 'program' | 'generator' | 'file'

/**
 * Les façons de commencer, dans l'ordre de qui arrive : la plupart ont
 * préparé leur voyage sur le site et viennent le récupérer avec un code. Puis
 * ceux qui ont déjà un programme ailleurs (agence, ChatGPT, notes) et veulent
 * le retrouver ici. Le générateur ferme la marche : il sert ceux qui arrivent
 * les mains vides.
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
        description="Saisissez le code affiché sous votre programme"
        badge="Le plus fréquent"
        selected
        onClick={() => onChoose('code')}
      />
      <OptionCard
        icon={QrCode}
        tone="accent"
        title="On me l’a partagé"
        description="Scannez le QR code ou ouvrez le lien reçu"
        onClick={() => onChoose('scan')}
      />
      <OptionCard
        icon={FileText}
        tone="success"
        title="J’ai déjà un programme ailleurs"
        description="Agence, ChatGPT, notes, PDF : on le recopie pour vous"
        onClick={() => onChoose('program')}
      />
      <OptionCard
        icon={Sparkles}
        tone="secondary"
        title="Je n’ai pas encore de programme"
        description="Décrivez vos envies, on le construit avec vous"
        onClick={() => onChoose('generator')}
      />
    </div>
  )
}
