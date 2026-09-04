import { z } from 'zod'

import { IdSchema, TimestampSchema } from './common'

const CollectionGroupBaseSchema = z.object({
    id: IdSchema,
    name: z.string().min(1).max(100),
    sortOrder: z.number().int().nonnegative(),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
})

export const CharacterGroupSchema = CollectionGroupBaseSchema

export const ConversationGroupSchema = CollectionGroupBaseSchema.extend({
    characterId: IdSchema,
})

export const GroupCreateSchema = z.object({
    name: z.string().trim().min(1).max(100),
})

export const GroupUpdateSchema = GroupCreateSchema.partial()

export const CharacterOrganizationSchema = z.object({
    groups: z
        .array(z.object({ id: IdSchema, sortOrder: z.number().int().nonnegative() }))
        .max(1_000),
    characters: z
        .array(
            z.object({
                id: IdSchema,
                groupId: IdSchema.nullable(),
                sortOrder: z.number().int().nonnegative(),
            }),
        )
        .max(10_000),
})

export const ConversationOrganizationSchema = z.object({
    characterId: IdSchema,
    groups: z
        .array(z.object({ id: IdSchema, sortOrder: z.number().int().nonnegative() }))
        .max(1_000),
    conversations: z
        .array(
            z.object({
                id: IdSchema,
                groupId: IdSchema.nullable(),
                sortOrder: z.number().int().nonnegative(),
            }),
        )
        .max(100_000),
})
