# Queries, Actions, CRUD, and API

## Query

```vasp
query getTodos {
  fn: import { getTodos } from "@src/queries.js"
  entities: [Todo]
  auth: true
}
```

## Action

```vasp
action createTodo {
  fn: import { createTodo } from "@src/actions.js"
  entities: [Todo]
  auth: true
}
```

## CRUD

```vasp
crud Todo {
  entity: Todo
  operations: [list, create, update, delete]
}
```

## API endpoint

```vasp
api adminStats {
  method: GET
  path: "/api/admin/stats"
  fn: import { getStats } from "@src/admin.js"
  auth: true
  roles: [admin]
}
```

## Nested CRUD config (v2)

```vasp
crud Todo {
  entity: Todo
  operations: [list, create, update, delete]

  list {
    paginate: true
    sortable: [title, createdAt]
    filterable: [done]
    search: [title]
  }

  form {
    layout: "2-column"
  }
}
```
