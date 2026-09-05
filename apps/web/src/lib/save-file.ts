import { isNativeApp, shareFileNatively } from './native-app'

/**
 * Déclenche un téléchargement classique : un lien `<a download>` cliqué pour
 * l'utilisateur.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Remet un fichier à l'utilisateur.
 *
 * Dans un navigateur, c'est un téléchargement. Dans l'app native, où
 * `<a download>` ne fait rien, le fichier part dans la feuille de partage du
 * système ; si le natif ne répond pas, on retombe sur le téléchargement.
 */
export function saveFile(blob: Blob, filename: string): void {
  if (isNativeApp()) {
    void shareFileNatively(blob, filename).then((outcome) => {
      if (outcome === 'unavailable') downloadBlob(blob, filename)
    })
    return
  }
  downloadBlob(blob, filename)
}
