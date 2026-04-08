import * as v from 'valibot'

export const CreateUserSchema = v.object({
  username: v.pipe(v.string(), v.minLength(2), v.maxLength(50)),
  email: v.pipe(v.string(), v.email(), v.minLength(1)),
  role: v.picklist(['admin', 'editor', 'viewer']),
  displayName: v.optional(v.nullable(v.pipe(v.string(), v.minLength(1), v.maxLength(100)))),
  bio: v.optional(v.nullable(v.pipe(v.string(), v.minLength(1)))),
  avatar: v.optional(v.nullable(v.pipe(v.string(), v.minLength(1)))),
  isActive: v.boolean(),
})

export const UpdateUserSchema = v.partial(CreateUserSchema)

export const CreateSpaceSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(120)),
  key: v.pipe(v.string(), v.minLength(2), v.maxLength(10)),
  description: v.optional(v.nullable(v.pipe(v.string(), v.minLength(1)))),
  iconUrl: v.optional(v.nullable(v.pipe(v.string(), v.minLength(1)))),
  isPublic: v.boolean(),
  ownerId: v.number(),
})

export const UpdateSpaceSchema = v.partial(CreateSpaceSchema)

export const CreatePageSchema = v.object({
  title: v.pipe(v.string(), v.minLength(1), v.maxLength(255)),
  body: v.optional(v.nullable(v.unknown())),
  status: v.picklist(['draft', 'published', 'archived']),
  version: v.number(),
  excerpt: v.optional(v.nullable(v.pipe(v.string(), v.minLength(1)))),
  slug: v.optional(v.nullable(v.pipe(v.string(), v.minLength(1), v.maxLength(255)))),
  isFeatured: v.boolean(),
  viewCount: v.number(),
  spaceId: v.number(),
  authorId: v.number(),
  parentId: v.optional(v.nullable(v.number())),
})

export const UpdatePageSchema = v.partial(CreatePageSchema)

export const CreatePageVersionSchema = v.object({
  version: v.number(),
  title: v.pipe(v.string(), v.minLength(1), v.maxLength(255)),
  body: v.optional(v.nullable(v.unknown())),
  changeNote: v.optional(v.nullable(v.pipe(v.string(), v.minLength(1), v.maxLength(255)))),
  pageId: v.number(),
  authorId: v.number(),
})

export const UpdatePageVersionSchema = v.partial(CreatePageVersionSchema)

export const CreateCommentSchema = v.object({
  content: v.pipe(v.string(), v.minLength(1), v.maxLength(5000)),
  isEdited: v.boolean(),
  editedAt: v.optional(v.union([v.null(), v.pipe(v.string(), v.minLength(1), v.transform(s => new Date(s)), v.check(d => !isNaN(d.getTime()), 'Invalid date'))])),
  pageId: v.number(),
  authorId: v.number(),
  parentId: v.optional(v.nullable(v.number())),
})

export const UpdateCommentSchema = v.partial(CreateCommentSchema)

export const CreateLabelSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(50)),
  color: v.optional(v.nullable(v.pipe(v.string(), v.minLength(1), v.maxLength(7)))),
})

export const UpdateLabelSchema = v.partial(CreateLabelSchema)

export const CreateAttachmentSchema = v.object({
  filename: v.pipe(v.string(), v.minLength(1), v.maxLength(255)),
  mimeType: v.pipe(v.string(), v.minLength(1), v.maxLength(127)),
  sizeBytes: v.number(),
  url: v.pipe(v.string(), v.minLength(1)),
  pageId: v.number(),
  uploadedById: v.number(),
})

export const UpdateAttachmentSchema = v.partial(CreateAttachmentSchema)

export const CreatePageWatchSchema = v.object({
  userId: v.number(),
  pageId: v.number(),
})

export const UpdatePageWatchSchema = v.partial(CreatePageWatchSchema)

