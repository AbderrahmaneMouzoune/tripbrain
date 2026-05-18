import { route, type Router } from '@better-upload/server'
import { toRouteHandler } from '@better-upload/server/adapters/next'
import { cloudflare } from '@better-upload/server/clients'
import { uploadEnv } from '@/lib/upload-env'
import { generateUploadObjectKey } from '@/lib/upload-file-key'

const router: Router = {
  client: cloudflare({
    accountId: uploadEnv.R2_ACCOUNT_ID,
    accessKeyId: uploadEnv.R2_ACCESS_KEY_ID,
    secretAccessKey: uploadEnv.R2_SECRET_ACCESS_KEY,
  }),
  bucketName: uploadEnv.R2_BUCKET_NAME,
  routes: {
    'itinerary-export': route({
      fileTypes: ['application/json'],
      maxFileSize: 1024 * 1024, // 1 Mo max
      signedUrlExpiresIn: 600, // URL d'upload valide 10 minutes
      onBeforeUpload: async ({ file }) => {
        return {
          objectInfo: {
            key: generateUploadObjectKey(file.name),
          },
        }
      },
      onAfterSignedUrl: async ({ file }) => {
        const key = file.objectInfo?.key
        if (!key) throw new Error('Missing object key')

        return {
          // URL publique retournée au client pour générer le QR code
          metadata: { url: `${uploadEnv.R2_PUBLIC_URL}/${key}` },
        }
      },
    }),
  },
}

export const { POST } = toRouteHandler(router)
