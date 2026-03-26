export interface VaspClientOptions {
  baseURL?: string;
}

export type VaspQueryFn = (name: string, args?: unknown) => Promise<unknown>;
export type VaspActionFn = (name: string, args?: unknown) => Promise<unknown>;

export interface VaspClient {
  query: VaspQueryFn;
  action: VaspActionFn;
}

/** Structured error returned from the Vasp API envelope */
export interface ApiError {
  code: string;
  message: string;
  hint?: string;
}

/** Success envelope shape: `{ ok: true, data: T }` */
export interface ApiSuccessEnvelope<T = unknown> {
  ok: true;
  data: T;
}

/** Error envelope shape: `{ ok: false, error: ApiError }` */
export interface ApiErrorEnvelope {
  ok: false;
  error: ApiError;
}

/** Union of both envelope shapes */
export type ApiEnvelope<T = unknown> = ApiSuccessEnvelope<T> | ApiErrorEnvelope;

/**
 * Error thrown by the Vasp client when the server returns `{ ok: false }`.
 * Carries the structured error code and optional hint.
 */
export class VaspApiError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly hint?: string;

  constructor(apiError: ApiError, statusCode: number = 400) {
    super(apiError.message);
    this.name = "VaspApiError";
    this.code = apiError.code;
    this.statusCode = statusCode;
    if (apiError.hint !== undefined) {
      this.hint = apiError.hint;
    }
  }
}
