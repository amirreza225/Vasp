async function apiFetch(url, options) {
  const res = await fetch('/api/admin' + url, {
    credentials: 'include',
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
  })
  const json = await res.json()
  if (!res.ok) {
    const err = Object.assign(new Error(json?.error?.message ?? 'HTTP ' + res.status), {
      errorCode: json?.error?.code ?? 'ERROR',
      serverStack: json?.error?.stack ?? null,
    })
    throw err
  }
  return json
}

export const PageVersionApi = {
  list: (params) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : ''
    return apiFetch('/pageVersion' + qs).then(r => r.data)
  },
  get: (id) => apiFetch('/pageVersion/' + id).then(r => r.data),
  create: (data) => apiFetch('/pageVersion', { method: 'POST', body: JSON.stringify(data) }).then(r => r.data),
  update: (id, data) => apiFetch('/pageVersion/' + id, { method: 'PUT', body: JSON.stringify(data) }).then(r => r.data),
  remove: (id) => apiFetch('/pageVersion/' + id, { method: 'DELETE' }),
}
