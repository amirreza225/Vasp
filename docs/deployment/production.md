# Deployment and Production

Vasp includes deployment helpers:

```bash
vasp build
vasp deploy --target=docker
vasp deploy --target=fly
vasp deploy --target=railway
```

## Production checklist

- [ ] Set secure environment variables (`DATABASE_URL`, `JWT_SECRET`, provider keys)
- [ ] Configure CORS and trusted origins
- [ ] Set rate limit env vars as needed
- [ ] Run migrations before production traffic
- [ ] Enable observability exports for tracing/metrics/error tracking

## Security defaults

Generated apps include rate limiting, CSRF middleware, Argon2id hashing, and startup env validation.
