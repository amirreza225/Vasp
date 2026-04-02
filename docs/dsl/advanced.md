# Advanced DSL Blocks

## Auth and RBAC

```vasp
auth UserAuth {
  userEntity: User
  methods: [usernameAndPassword, google, github]
  roles: [admin, editor, viewer]
}
```

## Realtime

```vasp
realtime TodoChannel {
  entity: Todo
  events: [created, updated, deleted]
}
```

## Jobs

```vasp
job sendDigest {
  executor: PgBoss
  perform: {
    fn: import { sendDigest } from "@src/jobs.js"
  }
  schedule: "0 * * * *"
}
```

## Storage

```vasp
storage UserFiles {
  provider: s3
  bucket: my-bucket
  maxSize: "10mb"
  allowedTypes: ["image/jpeg", "image/png"]
}
```

## Email

```vasp
email Mailer {
  provider: resend
  from: "noreply@myapp.com"
  templates: [
    { name: welcome; fn: import { welcomeEmail } from "@src/emails.js" }
  ]
}
```

## Cache

```vasp
cache QueryCache {
  provider: redis
  ttl: 300
  redis: { url: REDIS_URL }
}
```

## Webhooks and observability

Vasp also supports `webhook` and `observability` blocks for inbound/outbound events and production telemetry.
