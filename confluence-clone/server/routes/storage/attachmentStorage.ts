// provider: local | block: AttachmentStorage
import { Elysia, t } from 'elysia'
import { MAX_BYTES, isMimeAllowed, saveFile } from '../../storage/attachmentStorage.ts'
import { VaspError } from '../../middleware/errorHandler.ts'

export const attachmentStorageUploadRoutes = new Elysia({ prefix: '/api/storage/attachmentstorage' })
  /**
   * POST /api/storage/attachmentStorage/upload
   * Accepts multipart/form-data with a single "file" field.
   * Returns { url } — the stored file URL (local path or cloud URL).
   */
  .post(
    '/upload',
    async ({ body, set }) => {
      const file = body.file
      if (!file || !(file instanceof File)) {
        set.status = 400
        throw new VaspError('BAD_REQUEST', 'No file provided', 400)
      }

      // File size validation
      if (file.size > MAX_BYTES) {
        set.status = 413
        throw new VaspError(
          'PAYLOAD_TOO_LARGE',
          `File size ${file.size} exceeds the limit of 50mb`,
          413,
        )
      }

      // MIME type validation
      if (!isMimeAllowed(file.type)) {
        set.status = 415
        throw new VaspError(
          'UNSUPPORTED_MEDIA_TYPE',
          `File type '${file.type}' is not allowed`,
          415,
        )
      }

      const buffer = await file.arrayBuffer()
      const url = await saveFile(file.name, buffer)

      return { url }
    },
    {
      body: t.Object({
        file: t.File(),
      }),
    },
  )
