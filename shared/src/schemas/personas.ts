import { z } from 'zod'

import { IdSchema, TimestampSchema } from './common'

export const PersonaSchema = z.object({
    id: IdSchema,
    name: z.string().min(1).max(100),
    description: z.string().max(100_000),
    note: z.string().max(100_000),
    avatarAssetId: IdSchema.nullable(),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
})

export const PersonaCreateSchema = z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(100_000).default(''),
    note: z.string().max(100_000).default(''),
})

export const PersonaUpdateSchema = PersonaSchema.pick({
    name: true,
    description: true,
    note: true,
}).partial()

export const EffectivePersonaSchema = z.object({
    id: IdSchema.nullable(),
    name: z.string(),
    description: z.string(),
    avatarAssetId: IdSchema.nullable(),
    source: z.enum(['conversation', 'global', 'default']),
})
