# `entity` Block

Entities drive database schema, validation, CRUD generation, and typed clients.

```vasp
entity Post {
  id:        Int      @id
  slug:      String   @unique
  title:     String   @validate(minLength: 1, maxLength: 255)
  body:      Text     @nullable
  status:    Enum(draft, published, archived)
  avatar:    File     @storage(UserFiles)
  author:    User     @onDelete(cascade)
  createdAt: DateTime @default(now)
  updatedAt: DateTime @updatedAt

  @@index([slug])
  @@unique([slug])
}
```

## Primitive types

`String`, `Int`, `Boolean`, `DateTime`, `Float`, `Text`, `Json`, `Enum`, `File`

## Common modifiers

- `@id`, `@unique`, `@nullable`
- `@default(now)`
- `@updatedAt`
- `@storage(Name)` for `File`
- `@validate(...)`
- `@onDelete(cascade|restrict|setNull)`

::: warning
`File` fields require a matching `storage` block reference.
:::
