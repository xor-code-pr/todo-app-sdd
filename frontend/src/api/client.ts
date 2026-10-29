/**
 * Typed API client.
 *
 * `schema.d.ts` in this directory is GENERATED from the backend's emitted
 * OpenAPI document — never hand-edit it, run `npm run generate:api`.
 * This file is the small amount of configuration that binds those generated
 * types to a fetch implementation; it is hand-written on purpose and is the
 * only hand-written file under src/api/.
 */

import createClient from 'openapi-fetch'

import type { paths } from './schema'

const BASE_URL = import.meta.env['VITE_API_BASE_URL'] ?? 'http://127.0.0.1:8000'

export const api = createClient<paths>({ baseUrl: BASE_URL })

/** Shape of every non-2xx body — one envelope for the whole API. */
export interface ApiError {
  error: {
    code: string
    message: string
    field: string | null
  }
}

/**
 * Narrow an unknown error body to the envelope.
 *
 * The client never branches on `message` — wording may change without a
 * contract break. `code` is the stable part.
 */
export function isApiError(value: unknown): value is ApiError {
  if (typeof value !== 'object' || value === null || !('error' in value)) {
    return false
  }
  const detail = (value as { error: unknown }).error
  return (
    typeof detail === 'object' &&
    detail !== null &&
    'code' in detail &&
    typeof (detail as { code: unknown }).code === 'string'
  )
}

/** Human-readable message from an error body, with a safe fallback. */
export function errorMessage(value: unknown, fallback: string): string {
  return isApiError(value) ? value.error.message : fallback
}
