/**
 * Passe le résultat de l'écran de scan (app/scan.tsx) à l'écran principal,
 * qui l'attend au nom de la webapp. Un seul abonné à la fois suffit.
 */

type Listener = (value: string | null) => void

let listener: Listener | null = null

export function waitForScanResult(next: Listener): () => void {
  listener = next
  return () => {
    if (listener === next) listener = null
  }
}

export function deliverScanResult(value: string | null): void {
  const current = listener
  listener = null
  current?.(value)
}
