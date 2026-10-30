/**
 * Numéros de téléphone dans un texte libre (notes, conseils, documents texte).
 * L'app native ne laisse plus iOS les détecter tout seul : on les rend
 * nous-mêmes en liens `tel:`. Détection prudente — un numéro commence par `+`
 * (8 à 15 chiffres) ou par le `0` national (9 à 15 chiffres) — pour ne pas
 * transformer une date (01.02.2025 n'en compte que 8), une heure ou une
 * référence de réservation en lien d'appel.
 */

export type PhoneTextPart =
  | { kind: 'text'; text: string }
  | { kind: 'phone'; text: string; href: string }

const PHONE_PATTERN =
  /(?<![\w+])(?:\+\d{1,3}(?:[ .-]?\(0\))?|0)(?:[ .-]?\(?\d{1,4}\)?){2,7}(?![\w])/g

/** Date écrite JJ.MM.AAAA, JJ-MM-AAAA ou JJ MM AAAA : jamais un numéro. */
const DATE_PATTERN = /^\d{1,2}([ .-])\d{1,2}\1\d{2,4}$/

/** Fin d'un bloc de chiffres juste avant (IBAN, référence découpée). */
const PRECEDED_BY_DIGITS = /\d[ .-]?$/

/** Lien `tel:` d'un numéro tel qu'écrit : chiffres seuls, `+` initial gardé. */
export function telHref(phone: string): string {
  const withoutTrunk = phone.replace(/\(0\)/g, '')
  const digits = withoutTrunk.replace(/\D/g, '')
  return `tel:${withoutTrunk.trim().startsWith('+') ? '+' : ''}${digits}`
}

/** Découpe le texte en morceaux, les numéros de téléphone à part. */
export function splitPhoneNumbers(text: string): PhoneTextPart[] {
  const parts: PhoneTextPart[] = []
  let last = 0
  for (const match of text.matchAll(PHONE_PATTERN)) {
    const raw = match[0]
    const digitCount = raw.replace(/\(0\)/g, '').replace(/\D/g, '').length
    const minDigits = raw.startsWith('+') ? 8 : 9
    if (digitCount < minDigits || digitCount > 15) continue
    if (DATE_PATTERN.test(raw)) continue
    const start = match.index ?? 0
    // La suite d'un long numéro (fin d'IBAN…) n'est pas un téléphone.
    if (PRECEDED_BY_DIGITS.test(text.slice(Math.max(0, start - 2), start)))
      continue
    if (start > last)
      parts.push({ kind: 'text', text: text.slice(last, start) })
    parts.push({ kind: 'phone', text: raw, href: telHref(raw) })
    last = start + raw.length
  }
  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) })
  return parts
}
