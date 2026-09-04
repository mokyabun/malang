import { z } from 'zod'

import { chainGraphError } from '../model-chain-graph'
import { IdSchema, TimestampSchema } from './common'
import { ModelPresetInputSchema } from './providers'

export const ModelChainAgentSchema = z.object({
    id: IdSchema,
    name: z.string().trim().min(1).max(100),
    modelPresetId: IdSchema,
    systemPrompt: z.string().max(100_000).default(''),
    instruction: z.string().max(100_000).default(''),
    enabled: z.boolean().default(true),
    postMode: z.enum(['replace', 'prepend', 'append']).default('replace'),
    assistantPrefill: z.boolean().default(false),
    includeSettingInfo: z.boolean().default(true),
    includeGlobalNote: z.boolean().default(false),
    includeLongTermMemory: z.boolean().default(true),
    includeRecentChat: z.boolean().default(true),
    includeCurrentUserInput: z.boolean().default(true),
    includePreviousNotes: z.boolean().default(true),
    memoryEnabled: z.boolean().default(false),
    memoryInstruction: z.string().max(100_000).default(''),
    memoryFormat: z.string().max(100_000).default(''),
})

export const ModelChainLayerSchema = z.object({
    id: IdSchema,
    name: z.string().trim().min(1).max(100),
    phase: z.enum(['pre', 'post']),
    agents: z.array(ModelChainAgentSchema).min(1).max(8),
})

export const ModelChainGraphSchema = z.object({
    edges: z
        .array(
            z.object({
                id: z.string().min(1).max(200),
                source: z.string().min(1).max(100),
                target: z.string().min(1).max(100),
            }),
        )
        .max(1056),
    positions: z.record(
        z.string().max(100),
        z.object({
            x: z.number(),
            y: z.number(),
        }),
    ),
})

export const ModelChainPresetSchema = z.object({
    id: IdSchema,
    name: z.string().min(1).max(100),
    description: z.string().max(1_000),
    layers: z.array(ModelChainLayerSchema).max(32),
    graph: ModelChainGraphSchema.optional(),
    sortOrder: z.number().int().nonnegative(),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
})

export const ModelChainPresetInputSchema = ModelChainPresetSchema.pick({
    name: true,
    description: true,
    layers: true,
    graph: true,
}).superRefine((preset, context) => {
    if (!preset.graph && (preset.layers.length < 1 || preset.layers.length > 12)) {
        context.addIssue({
            code: 'custom',
            path: ['layers'],
            message: 'Legacy chains require 1–12 layers',
        })
    }
    const layerIds = new Set<string>()
    const agentIds = new Set<string>()
    let agentCount = 0
    preset.layers.forEach((layer, layerIndex) => {
        if (layerIds.has(layer.id)) {
            context.addIssue({
                code: 'custom',
                path: ['layers', layerIndex, 'id'],
                message: 'Model chain layer IDs must be unique',
            })
        }
        layerIds.add(layer.id)
        layer.agents.forEach((agent, agentIndex) => {
            agentCount += 1
            if (agentIds.has(agent.id)) {
                context.addIssue({
                    code: 'custom',
                    path: ['layers', layerIndex, 'agents', agentIndex, 'id'],
                    message: 'Model chain agent IDs must be unique',
                })
            }
            if (!preset.graph && layer.phase === 'post' && agent.memoryEnabled) {
                context.addIssue({
                    code: 'custom',
                    path: ['layers', layerIndex, 'agents', agentIndex, 'memoryEnabled'],
                    message: 'Persistent agent memory is only available to pre layers',
                })
            }
            agentIds.add(agent.id)
        })
    })
    if (agentCount > 32) {
        context.addIssue({
            code: 'custom',
            path: ['layers'],
            message: 'Model chains support at most 32 agents',
        })
    }
    if (preset.graph) {
        const error = chainGraphError(preset)
        if (error) context.addIssue({ code: 'custom', path: ['graph'], message: error })
    }
})

export const ModelDiscoveryInputSchema = ModelPresetInputSchema.pick({
    config: true,
    apiKeyId: true,
})
