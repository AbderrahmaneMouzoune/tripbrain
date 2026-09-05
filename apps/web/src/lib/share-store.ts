// Stockage serveur des partages : bucketcode (S3/R2) + codes de synchronisation.
// Les identifiants R2 ne quittent jamais le serveur — le navigateur ne parle
// qu'à /api/share, il n'y a donc ni CORS à configurer ni signature côté client.

import { createBucket, syncCodeAlphabets, type Bucket } from 'bucketcode'
import { SHARE_CODE_LENGTH } from '@/lib/share'

/** Nom d'application inscrit dans l'enveloppe du snapshot. */
export const SHARE_APP = 'tripbrain'

/**
 * Version du format de `data` stocké dans le snapshot. À incrémenter quand la
 * forme du payload change : une build plus ancienne refusera alors le snapshot
 * au lieu de le lire de travers.
 */
export const SHARE_SCHEMA_VERSION = 1

/** Durée de vie d'un code : le temps de passer d'un appareil à l'autre. */
export const SHARE_EXPIRES_IN = 60 * 60

/** Taille maximale du payload compressé (base64url) accepté par l'API. */
export const SHARE_MAX_PAYLOAD_CHARS = 2 * 1024 * 1024

/** Ce que contient le snapshot : l'itinéraire compressé, tel qu'envoyé par le client. */
export interface SharedSnapshotData {
  payload: string
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Variable d'environnement manquante : ${name}`)
  }
  return value
}

let store: Bucket | null = null

/**
 * Handle bucket partagé par les routes d'API. Créé à la première requête pour
 * qu'une variable d'environnement manquante fasse échouer la requête plutôt
 * que le build.
 */
export function getShareStore(): Bucket {
  if (!store) {
    store = createBucket({
      bucket: requireEnv('R2_BUCKET_NAME'),
      endpoint: `https://${requireEnv('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
        secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
      },
      // Namespace interne : les snapshots ne côtoient pas d'autres objets.
      prefix: 'shares',
      // Chiffres uniquement : le code se dicte au téléphone et se saisit au
      // pavé numérique. Huit chiffres valent 26,6 bits — moins que le base32
      // par défaut, mais le code expire en une heure et /api/share/[code] est
      // limité à 30 tentatives par minute.
      syncCode: {
        alphabet: syncCodeAlphabets.digits,
        length: SHARE_CODE_LENGTH,
      },
      maxSize: SHARE_MAX_PAYLOAD_CHARS,
    })
  }
  return store
}
