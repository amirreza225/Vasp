export { createVaspClient } from "./client/ofetch.js";
export { useVasp, installVasp } from "./client/composables/useVasp.js";
export { useQuery, invalidateQueries } from "./client/composables/useQuery.js";
export { useAction } from "./client/composables/useAction.js";
export { useAuth } from "./client/composables/useAuth.js";
export type {
  VaspClient,
  VaspClientOptions,
  VaspQueryFn,
  VaspActionFn,
  ApiError,
  ApiSuccessEnvelope,
  ApiErrorEnvelope,
  ApiEnvelope,
} from "./types.js";
export { VaspApiError } from "./types.js";
export type { UseAuthResult } from "./client/composables/useAuth.js";
export type { UseActionOptions } from "./client/composables/useAction.js";
