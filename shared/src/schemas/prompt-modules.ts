import { z } from 'zod'

import { IdSchema, TimestampSchema } from './common'
import { ModelRoleSchema, PromptRoleSchema, PromptToggleSchema, RegexScriptSchema } from './prompts'

export const LoreEntrySchema = z.object({
    id: IdSchema,
    keys: z.array(z.string()),
    secondaryKeys: z.array(z.string()),
    content: z.string(),
    enabled: z.boolean(),
    constant: z.boolean(),
    selective: z.boolean(),
    caseSensitive: z.boolean(),
    useRegex: z.boolean(),
    insertionOrder: z.number().int(),
    priority: z.number().int(),
    name: z.string(),
    position: z.string().max(200).default(''),
    depth: z.number().int().default(0),
    role: ModelRoleSchema.default('system'),
    scanDepth: z.number().int().min(1).max(1_000).optional(),
    recursive: z.enum(['global', 'enabled', 'disabled']).default('global'),
    probability: z.number().min(0).max(100).default(100),
    additionalKeys: z.array(z.string()).default([]),
    excludeKeys: z.array(z.string()).default([]),
    fullWordMatching: z.boolean().optional(),
    decorators: z.record(z.string(), z.unknown()).default({}),
    group: z.string().max(200).optional(),
    isGroup: z.boolean().default(false),
})

export const ModulePromptSchema = z.object({
    id: IdSchema,
    name: z.string().min(1).max(200),
    enabled: z.boolean(),
    toggleKey: z
        .string()
        .regex(/^[a-zA-Z0-9_.-]{1,100}$/)
        .nullable(),
    role: PromptRoleSchema,
    position: z.enum(['beforeMain', 'afterMain', 'beforeChat', 'afterChat']),
    content: z.string().max(1_000_000),
})

/** PocketRisu module-local custom toggles use the same controls as prompt presets. */
export const ModuleToggleSchema = PromptToggleSchema

export const ModuleAssetSchema = z.object({
    assetId: IdSchema,
    type: z.string(),
    name: z.string(),
    extension: z.string(),
    sourceUri: z.string(),
    mimeType: z.string(),
    size: z.number().int().nonnegative(),
})

export const LuaScriptSchema = z.object({
    code: z.string().max(1_000_000),
    enabled: z.boolean(),
    lowLevelAccess: z.boolean(),
    revision: z.number().int().nonnegative(),
    codeSha256: z.string().regex(/^[a-f0-9]{64}$/),
})

export const LuaScriptInputSchema = LuaScriptSchema.pick({
    code: true,
    enabled: true,
    lowLevelAccess: true,
}).extend({
    expectedRevision: z.number().int().nonnegative().optional(),
})

export const PromptModuleSchema = z.object({
    id: IdSchema,
    name: z.string().min(1).max(200),
    description: z.string().max(100_000),
    namespace: z.string().max(200),
    enabledByDefault: z.boolean(),
    sourceId: z.string().max(200).default(''),
    runtimeOrder: z.number().int().default(0),
    luaScript: LuaScriptSchema.nullable().default(null),
    luaRawTriggers: z.array(z.unknown()).max(10_000).default([]),
    prompts: z.array(ModulePromptSchema).max(1_000),
    toggles: z.array(ModuleToggleSchema).max(200).default([]),
    regexScripts: z.array(RegexScriptSchema).max(2_000).default([]),
    backgroundEmbedding: z.string().max(1_000_000).default(''),
    lorebook: z.array(LoreEntrySchema).max(10_000),
    assets: z.array(ModuleAssetSchema).max(4_096).default([]),
    warnings: z.array(z.string()),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
})

export const PromptModuleInputSchema = PromptModuleSchema.omit({
    id: true,
    warnings: true,
    createdAt: true,
    updatedAt: true,
    assets: true,
    luaScript: true,
    luaRawTriggers: true,
}).extend({
    luaScript: LuaScriptInputSchema.nullable().optional(),
    luaRawTriggers: z.array(z.unknown()).max(10_000).optional(),
})

export const ConversationModuleStateSchema = z.object({
    module: PromptModuleSchema,
    enabled: z.boolean(),
    inherited: z.boolean(),
    activationSource: z.enum(['default', 'character', 'preset', 'conversation']).default('default'),
})

export const LoreSettingsSchema = z.object({
    scanDepth: z.number().int().min(1).max(1_000).optional(),
    tokenBudget: z.number().int().min(1).max(1_000_000).optional(),
    recursiveScanning: z.boolean().optional(),
})
