import { Elysia } from 'elysia'
import { adminUserRoutes } from './user.ts'
import { adminSpaceRoutes } from './space.ts'
import { adminPageRoutes } from './page.ts'
import { adminLabelRoutes } from './label.ts'
import { adminPageVersionRoutes } from './pageVersion.ts'
import { adminCommentRoutes } from './comment.ts'
import { adminAttachmentRoutes } from './attachment.ts'

export const adminRoutes = new Elysia()
  .use(adminUserRoutes)
  .use(adminSpaceRoutes)
  .use(adminPageRoutes)
  .use(adminLabelRoutes)
  .use(adminPageVersionRoutes)
  .use(adminCommentRoutes)
  .use(adminAttachmentRoutes)
