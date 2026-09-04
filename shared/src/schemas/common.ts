import { z } from 'zod'

export const GENERAL_CHAT_CHARACTER_ID = '00000000-0000-4000-8000-000000000001'

export const IdSchema = z.uuid()
export const TimestampSchema = z.iso.datetime()

export const ApiErrorCodeSchema = z.enum([
    'bad_request',
    'unauthorized',
    'forbidden',
    'not_found',
    'conflict',
    'validation_failed',
    'provider_auth',
    'provider_unreachable',
    'model_not_found',
    'rate_limited',
    'context_too_large',
    'safety_blocked',
    'cancelled',
    'invalid_provider_response',
    'internal_error',
])

export const ApiErrorSchema = z.object({
    code: ApiErrorCodeSchema,
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string(),
})
