# Realtime and Jobs

## Realtime

```vasp
realtime OrderChannel {
  entity: Order
  events: [created, updated, deleted]
}
```

Use realtime channels to broadcast CRUD events to subscribed clients.

::: warning
Realtime requires a matching `crud` block for the same entity.
:::

## Jobs

```vasp
job processInvoice {
  executor: BullMQ
  perform: {
    fn: import { processInvoice } from "@src/jobs.js"
  }
}
```

Supported executors include PgBoss, BullMQ, Redis Streams, RabbitMQ, and Kafka.
