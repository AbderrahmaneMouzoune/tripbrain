import { Fragment } from 'react'
import { splitPhoneNumbers } from '@/lib/phone-links'

/**
 * Texte libre dont les numéros de téléphone deviennent des liens d'appel.
 * L'app native a coupé la détection automatique d'iOS : sans cela, un numéro
 * dans une note ne s'appelait plus d'un toucher. Le lien reste sélectionnable
 * pour qui veut le copier.
 */
export function PhoneText({ text }: { text: string }) {
  return (
    <>
      {splitPhoneNumbers(text).map((part, index) =>
        part.kind === 'phone' ? (
          <a
            key={index}
            href={part.href}
            className="text-primary font-bold whitespace-nowrap underline underline-offset-2 select-text"
          >
            {part.text}
          </a>
        ) : (
          <Fragment key={index}>{part.text}</Fragment>
        ),
      )}
    </>
  )
}
