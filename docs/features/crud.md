# CRUD

CRUD blocks generate REST endpoints and frontend integration for entities.

```vasp
crud Post {
  entity: Post
  operations: [list, create, update, delete]
}
```

## Generated behavior

- List endpoint with pagination metadata
- Single-item GET/PUT/DELETE endpoints
- Validation and typed payload handling
- Optional permissions mapping

## Advanced CRUD UI metadata

Use nested `list`, `form`, `sections`, `steps`, and `columns` in v2 DSL for richer generated UX.
