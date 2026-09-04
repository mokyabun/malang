import { z } from 'zod'

import { IdSchema, TimestampSchema } from './common'
import { ModelRoleSchema } from './prompts'

export const MessageSchema = z.object({
    id: IdSchema,
    conversationId: IdSchema,
    role: ModelRoleSchema,
    content: z.string(),
    displayContent: z.string().optional(),
    position: z.number().int().nonnegative(),
    status: z.enum(['complete', 'streaming', 'cancelled', 'failed']),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
})

/**
 * Conversation-scoped long-term memory settings, adapted from PocketRisu HypaMemory V3.
 * Ratios are portions of the prompt context reserved for recalled summaries.
 */
export const LongTermMemorySettingsSchema = z.object({
    enabled: z.boolean().default(false),
    memoryTokensRatio: z.number().min(0.01).max(0.5).default(0.2),
    extraSummarizationRatio: z.number().min(0).max(0.5).default(0),
    maxMessagesPerSummary: z.number().int().min(2).max(50).default(6),
    recentMemoryRatio: z.number().min(0).max(1).default(0.4),
    similarMemoryRatio: z.number().min(0).max(1).default(0.4),
    queryMessageCount: z.number().int().min(1).max(20).default(3),
    preserveOrphanedMemory: z.boolean().default(false),
    summaryChunkSeparator: z.string().max(200).default('\\n\\n'),
    summarizationPrompt: z.string().max(100_000).default(''),
})

export const LongTermMemorySettingsPatchSchema = z
    .object({
        enabled: z.boolean().optional(),
        memoryTokensRatio: z.number().min(0.01).max(0.5).optional(),
        extraSummarizationRatio: z.number().min(0).max(0.5).optional(),
        maxMessagesPerSummary: z.number().int().min(2).max(50).optional(),
        recentMemoryRatio: z.number().min(0).max(1).optional(),
        similarMemoryRatio: z.number().min(0).max(1).optional(),
        queryMessageCount: z.number().int().min(1).max(20).optional(),
        preserveOrphanedMemory: z.boolean().optional(),
        summaryChunkSeparator: z.string().max(200).optional(),
        summarizationPrompt: z.string().max(100_000).optional(),
    })
    .refine(
        (settings) => (settings.recentMemoryRatio ?? 0) + (settings.similarMemoryRatio ?? 0) <= 1,
        { message: 'Recent and similar memory ratios must add up to at most 1' },
    )

export const LongTermMemorySummarySchema = z.object({
    id: IdSchema,
    conversationId: IdSchema,
    text: z.string(),
    sourceMessageIds: z.array(IdSchema),
    isImportant: z.boolean(),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
})

export const LongTermMemoryMetricsSchema = z.object({
    importantSummaryIds: z.array(IdSchema).default([]),
    recentSummaryIds: z.array(IdSchema).default([]),
    similarSummaryIds: z.array(IdSchema).default([]),
    randomSummaryIds: z.array(IdSchema).default([]),
})

export const LongTermMemoryStateSchema = z.object({
    settings: LongTermMemorySettingsSchema,
    summaries: z.array(LongTermMemorySummarySchema),
    metrics: LongTermMemoryMetricsSchema,
})

export const ConversationSchema = z.object({
    id: IdSchema,
    characterId: IdSchema,
    /** Conversation prompt snapshot; used when promptPresetLocked is enabled. */
    promptPresetId: IdSchema,
    /** When false, prompt compilation follows AppSettings.defaultPromptPresetId. */
    promptPresetLocked: z.boolean().default(false),
    /** Null inherits AppSettings.defaultModelPresetId. */
    modelPresetId: IdSchema.nullable().default(null),
    /** Null inherits AppSettings.defaultAuxiliaryModelPresetId, then the primary model. */
    auxiliaryModelPresetId: IdSchema.nullable().default(null),
    /** Null keeps the default single-model generation path. */
    modelChainPresetId: IdSchema.nullable().default(null),
    title: z.string(),
    greetingIndex: z.number().int().min(-1),
    variables: z.record(z.string(), z.string()),
    authorNote: z.string(),
    /** Conversation persona selection; used when personaLocked is enabled. */
    boundPersonaId: IdSchema.nullable(),
    /** When false, persona selection follows AppSettings.selectedPersonaId. */
    personaLocked: z.boolean().default(false),
    archivedAt: TimestampSchema.nullable(),
    groupId: IdSchema.nullable(),
    sortOrder: z.number().int().nonnegative(),
    displayEpoch: z.number().int().nonnegative().default(0),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
})

export const ConversationCreateSchema = z.object({
    characterId: IdSchema,
    promptPresetId: IdSchema.optional(),
    modelPresetId: IdSchema.nullable().optional(),
    auxiliaryModelPresetId: IdSchema.nullable().optional(),
    modelChainPresetId: IdSchema.nullable().optional(),
    title: z.string().max(200).optional(),
    greetingIndex: z.number().int().min(-1).default(-1),
})
