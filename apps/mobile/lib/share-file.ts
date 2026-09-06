import { Directory, File, Paths } from 'expo-file-system'
import { Platform, Share } from 'react-native'
import * as Sharing from 'expo-sharing'

import type {
  ShareFilePayload,
  ShareLinkPayload,
  ShareOutcome,
} from './bridge-protocol'

/** Sous-dossier du cache où atterrissent les fichiers remis à la feuille de partage. */
const SHARE_DIRECTORY = 'partages'

/**
 * Nom de fichier sûr pour le système : ni séparateur de chemin, ni caractère
 * de contrôle, et jamais vide.
 */
export function safeFileName(name: string): string {
  const cleaned = name
    .replace(/[/\\]/g, '-')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, '')
    .trim()
  return cleaned || 'fichier'
}

function shareDirectory(): Directory {
  return new Directory(Paths.cache, SHARE_DIRECTORY)
}

/**
 * Vide le dossier des partages précédents.
 *
 * Pas tout de suite après l'envoi : sur Android, la feuille de partage rend
 * la main avant que l'application choisie ait lu le fichier. On nettoie donc
 * au lancement de l'app et avant chaque nouveau partage.
 */
export function purgeSharedFiles(): void {
  try {
    const directory = shareDirectory()
    if (!directory.exists) return
    for (const entry of directory.list()) {
      try {
        entry.delete()
      } catch {
        // Fichier encore ouvert par une autre app : il partira la prochaine fois.
      }
    }
  } catch (error) {
    console.warn('[Partage] nettoyage impossible', error)
  }
}

/**
 * Écrit le fichier envoyé par la webapp dans le cache, puis ouvre la feuille
 * de partage du système (« Enregistrer dans Fichiers », Drive, mail…).
 *
 * Le cache peut être vidé par l'OS : c'est voulu, le fichier n'a de valeur
 * que le temps du partage — la source reste dans l'IndexedDB de la webapp.
 */
export async function shareFile({
  name,
  mimeType,
  base64,
}: ShareFilePayload): Promise<ShareOutcome> {
  if (!(await Sharing.isAvailableAsync())) return 'unavailable'

  try {
    purgeSharedFiles()
    const directory = shareDirectory()
    if (!directory.exists) directory.create({ intermediates: true })

    const file = new File(directory, safeFileName(name))
    file.write(base64, { encoding: 'base64' })

    await Sharing.shareAsync(file.uri, {
      mimeType,
      dialogTitle: name,
    })
    // Ni iOS ni Android ne disent si la feuille a été fermée sans rien faire.
    return 'shared'
  } catch (error) {
    console.warn('[Partage] shareFile a échoué', error)
    return 'unavailable'
  }
}

/**
 * Ouvre la feuille de partage du système avec le lien d'un voyage.
 *
 * Android ne transmet que `message` : le lien y est donc collé au texte.
 */
export async function shareLink({
  title,
  text,
  url,
}: ShareLinkPayload): Promise<ShareOutcome> {
  try {
    const result = await Share.share(
      Platform.OS === 'ios'
        ? { title, message: text, url }
        : { title, message: text ? `${text}\n${url}` : url },
      { dialogTitle: title, subject: title },
    )
    return result.action === Share.dismissedAction ? 'dismissed' : 'shared'
  } catch (error) {
    console.warn('[Partage] shareLink a échoué', error)
    return 'unavailable'
  }
}
