# Authentication and RBAC

Vasp supports username/password and OAuth providers (Google, GitHub), plus role/permission models.

## Auth block

```vasp
auth UserAuth {
  userEntity: User
  methods: [usernameAndPassword, google, github]
  roles: [admin, editor, viewer]
  permissions: {
    "post:create": [admin, editor]
    "post:delete": [admin]
  }
}
```

## Route-level authorization

Apply `auth` and `roles` in `query`, `action`, and `api` blocks.

::: info
Generated auth uses secure defaults including Argon2id password hashing and JWT-based cookie auth.
:::
