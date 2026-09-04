import { z } from 'zod'

import { IdSchema, TimestampSchema } from './common'
import { GenerationParametersSchema } from './providers'

export const RequestDebugSnapshotSchema = z.object({
    endpoint: z.string(),
    method: z.string(),
    headers: z.record(z.string(), z.string()),
    body: z.unknown(),
    chain: z
        .object({
            presetId: IdSchema,
            presetName: z.string(),
            phase: z.enum(['pre', 'post']),
            layerId: IdSchema,
            layerName: z.string(),
            agentId: IdSchema,
            agentName: z.string(),
        })
        .optional(),
})

export const RequestDebugRecordSchema = z.object({
    id: IdSchema,
    generationId: IdSchema,
    conversationId: IdSchema,
    provider: z.string(),
    modelId: z.string(),
    parameters: GenerationParametersSchema,
    request: RequestDebugSnapshotSchema,
    createdAt: TimestampSchema,
})
