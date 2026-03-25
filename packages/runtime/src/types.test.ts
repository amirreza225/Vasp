import { describe, expect, it } from 'vitest'
import { VaspApiError } from './types.js'
import type { ApiError } from './types.js'

describe('VaspApiError', () => {
  const apiError: ApiError = {
    code: 'RESOURCE_NOT_FOUND',
    message: 'The requested resource was not found',
    hint: 'Check the resource ID',
  }

  it('is an instance of Error', () => {
    const err = new VaspApiError(apiError)
    expect(err).toBeInstanceOf(Error)
  })

  it('is an instance of VaspApiError', () => {
    const err = new VaspApiError(apiError)
    expect(err).toBeInstanceOf(VaspApiError)
  })

  it('has name "VaspApiError"', () => {
    const err = new VaspApiError(apiError)
    expect(err.name).toBe('VaspApiError')
  })

  it('carries the error code', () => {
    const err = new VaspApiError(apiError)
    expect(err.code).toBe('RESOURCE_NOT_FOUND')
  })

  it('uses the message from the ApiError', () => {
    const err = new VaspApiError(apiError)
    expect(err.message).toBe('The requested resource was not found')
  })

  it('carries the hint', () => {
    const err = new VaspApiError(apiError)
    expect(err.hint).toBe('Check the resource ID')
  })

  it('uses the provided statusCode', () => {
    const err = new VaspApiError(apiError, 404)
    expect(err.statusCode).toBe(404)
  })

  it('defaults statusCode to 400', () => {
    const err = new VaspApiError(apiError)
    expect(err.statusCode).toBe(400)
  })

  it('works without a hint', () => {
    const noHint: ApiError = { code: 'AUTH_REQUIRED', message: 'Unauthorized' }
    const err = new VaspApiError(noHint)
    expect(err.hint).toBeUndefined()
    expect(err.code).toBe('AUTH_REQUIRED')
  })
})
