import { z } from 'zod'

/** Stable identity for the built-in, non-removable general chat character. */
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

export const GenerationParametersSchema = z.object({
    temperature: z.number().min(0).max(2).optional(),
    topP: z.number().min(0).max(1).optional(),
    topK: z.number().int().min(0).optional(),
    minP: z.number().min(0).max(1).optional(),
    topA: z.number().min(0).max(1).optional(),
    repetitionPenalty: z.number().min(0).optional(),
    frequencyPenalty: z.number().min(-2).max(2).optional(),
    presencePenalty: z.number().min(-2).max(2).optional(),
    maxContextTokens: z.number().int().min(256).max(10_000_000).optional(),
    maxOutputTokens: z.number().int().min(1).max(1_000_000).optional(),
    stopSequences: z.array(z.string().max(500)).max(32).optional(),
})

export const ProviderKindSchema = z.enum([
    'openai',
    'openrouter',
    'anthropic',
    'google',
    'vertex',
    'mistral',
    'cohere',
    'novelai',
    'novellist',
    'horde',
    'aws',
    'deepseek',
    'deepinfra',
    'nanogpt',
    'openai-compatible',
    'ooba',
    'mancer',
    'kobold',
    'ollama',
    'echo',
    'webllm',
    'plugin',
])

export const ProviderApiFormatSchema = z.enum([
    'openai-chat',
    'openai-completions',
    'openai-responses',
    'anthropic-messages',
    'google-gemini',
    'cohere-chat',
    'novelai',
    'novellist',
    'horde',
    'kobold',
    'ollama',
    'aws-bedrock',
    'echo',
])

const ProviderBaseSchema = z.object({
    modelId: z.string().min(1).max(512),
    auxiliaryModelId: z.string().max(512).optional(),
    defaults: GenerationParametersSchema.default({}),
    baseUrl: z
        .url()
        .refine((url) => ['http:', 'https:'].includes(new URL(url).protocol), {
            message: 'Provider URL must use http or https',
        })
        .optional(),
    apiFormat: ProviderApiFormatSchema.optional(),
    providerOptions: z.record(z.string(), z.unknown()).default({}),
    credentialType: z.enum(['none', 'adc', 'apiKey', 'serviceAccount', 'aws']).optional(),
})

function keyedProvider<
    const T extends Exclude<z.infer<typeof ProviderKindSchema>, 'vertex' | 'aws'>,
>(provider: T) {
    return ProviderBaseSchema.extend({ provider: z.literal(provider) })
}

export const VertexProviderConfigSchema = ProviderBaseSchema.extend({
    provider: z.literal('vertex'),
    projectId: z.string().max(256).default(''),
    location: z.string().min(1).max(100).default('global'),
})

export const AwsProviderConfigSchema = ProviderBaseSchema.extend({
    provider: z.literal('aws'),
    region: z.string().min(1).max(100).default('us-east-1'),
    accessKeyId: z.string().max(512).optional(),
})

export const OllamaProviderConfigSchema = keyedProvider('ollama').extend({
    baseUrl: z.url().refine((url) => ['http:', 'https:'].includes(new URL(url).protocol), {
        message: 'Ollama URL must use http or https',
    }),
})

export const ProviderConfigSchema = z.discriminatedUnion('provider', [
    keyedProvider('openai'),
    keyedProvider('openrouter'),
    keyedProvider('anthropic'),
    keyedProvider('google'),
    VertexProviderConfigSchema,
    keyedProvider('mistral'),
    keyedProvider('cohere'),
    keyedProvider('novelai'),
    keyedProvider('novellist'),
    keyedProvider('horde'),
    AwsProviderConfigSchema,
    keyedProvider('deepseek'),
    keyedProvider('deepinfra'),
    keyedProvider('nanogpt'),
    keyedProvider('openai-compatible'),
    keyedProvider('ooba'),
    keyedProvider('mancer'),
    keyedProvider('kobold'),
    OllamaProviderConfigSchema,
    keyedProvider('echo'),
    keyedProvider('webllm'),
    keyedProvider('plugin'),
])

const ProviderSecretInputSchema = z.object({
    apiKey: z.string().min(1).max(100_000).optional(),
    serviceAccountJson: z.string().min(1).max(100_000).optional(),
    awsSecretAccessKey: z.string().min(1).max(10_000).optional(),
    awsSessionToken: z.string().min(1).max(100_000).optional(),
    clearApiKey: z.boolean().default(false),
    clearCredentials: z.boolean().default(false),
})

export const VertexProviderSettingsInputSchema =
    VertexProviderConfigSchema.and(ProviderSecretInputSchema)
export const ProviderSettingsInputSchema = ProviderConfigSchema.and(ProviderSecretInputSchema)

const ProviderSecretStatusSchema = z.object({
    credentialType: z.enum(['none', 'adc', 'apiKey', 'serviceAccount', 'aws']),
    apiKeyConfigured: z.boolean(),
    serviceAccountConfigured: z.boolean(),
    awsCredentialsConfigured: z.boolean(),
    apiKeyLocked: z.boolean(),
})

export const VertexProviderSettingsSchema = VertexProviderConfigSchema.and(
    ProviderSecretStatusSchema,
)
export const ProviderSettingsSchema = ProviderConfigSchema.and(ProviderSecretStatusSchema)

export const ModelApiKeySchema = z.object({
    id: IdSchema,
    name: z.string().min(1).max(100),
    provider: ProviderKindSchema,
    credentialType: z.enum(['apiKey', 'serviceAccount', 'aws']),
    hint: z.string().max(200),
    configured: z.boolean(),
    locked: z.boolean(),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
})

export const ModelApiKeyInputSchema = z.object({
    name: z.string().trim().min(1).max(100),
    provider: ProviderKindSchema,
    credentialType: z.enum(['apiKey', 'serviceAccount', 'aws']),
    apiKey: z.string().min(1).max(100_000).optional(),
    serviceAccountJson: z.string().min(1).max(100_000).optional(),
    accessKeyId: z.string().min(1).max(512).optional(),
    awsSecretAccessKey: z.string().min(1).max(10_000).optional(),
    awsSessionToken: z.string().min(1).max(100_000).optional(),
})

export const ModelPresetSchema = z.object({
    id: IdSchema,
    name: z.string().min(1).max(100),
    config: ProviderConfigSchema,
    apiKeyId: IdSchema.nullable(),
    sortOrder: z.number().int().nonnegative(),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
})

export const ModelPresetInputSchema = z.object({
    name: z.string().trim().min(1).max(100),
    config: ProviderConfigSchema,
    apiKeyId: IdSchema.nullable().default(null),
})

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

/** @deprecated Use ModelChainAgentSchema. Kept as a source-compatible alias. */
export const ModelChainStepSchema = ModelChainAgentSchema

export const ModelChainLayerSchema = z.object({
    id: IdSchema,
    name: z.string().trim().min(1).max(100),
    phase: z.enum(['pre', 'post']),
    agents: z.array(ModelChainAgentSchema).min(1).max(8),
})

export const ModelChainPresetSchema = z.object({
    id: IdSchema,
    name: z.string().min(1).max(100),
    description: z.string().max(1_000),
    layers: z.array(ModelChainLayerSchema).min(1).max(12),
    sortOrder: z.number().int().nonnegative(),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
})

export const ModelChainPresetInputSchema = ModelChainPresetSchema.pick({
    name: true,
    description: true,
    layers: true,
}).superRefine((preset, context) => {
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
            if (layer.phase === 'post' && agent.memoryEnabled) {
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
})

export const ModelDiscoveryInputSchema = ModelPresetInputSchema.pick({
    config: true,
    apiKeyId: true,
})

export const POCKET_RISU_PROFILE_OPTION = '__pocketRisuProfile'

export const PocketRisuProfileEnumOptionSchema = z.object({
    value: z.union([z.string(), z.number(), z.boolean()]),
    label: z.string(),
})

export const PocketRisuProfileFieldSchema = z
    .object({
        key: z.string().min(1).max(200),
        type: z.enum(['string', 'number', 'integer', 'boolean', 'stringArray', 'json']),
        label: z.string().min(1).max(200),
        description: z.string().max(10_000).optional(),
        descriptionI18n: z.record(z.string(), z.string()).optional(),
        required: z.boolean().optional(),
        secret: z.boolean().optional(),
        default: z.unknown().optional(),
        min: z.number().optional(),
        max: z.number().optional(),
        step: z.number().positive().optional(),
        enum: z.array(PocketRisuProfileEnumOptionSchema).optional(),
        mapsTo: z
            .object({
                target: z.enum(['auth', 'custom', 'body', 'header']),
                path: z.string().min(1).max(500),
            })
            .optional(),
    })
    .passthrough()

export const PocketRisuProfileUiSchema = z
    .object({
        groups: z
            .array(
                z
                    .object({
                        id: z.string().min(1).max(200),
                        label: z.string().min(1).max(200),
                        order: z.number().optional(),
                        labelI18n: z.record(z.string(), z.string()).optional(),
                    })
                    .passthrough(),
            )
            .default([]),
        fields: z
            .array(
                z
                    .object({
                        key: z.string().min(1).max(200),
                        widget: z.string().max(100).optional(),
                        visibility: z.enum(['basic', 'advanced']).default('basic'),
                        group: z.string().max(200).optional(),
                        order: z.number().optional(),
                        placeholder: z.string().max(1_000).optional(),
                    })
                    .passthrough(),
            )
            .default([]),
    })
    .passthrough()

export const PocketRisuModelProfileSchema = z
    .object({
        id: z.string().min(1).max(500),
        updatedAt: z.number().optional(),
        displayName: z.string().min(1).max(200),
        providerBaseId: z.string().min(1).max(200),
        profileStatus: z.string().max(100).optional(),
        modelId: z.string().min(1).max(512),
        endpoint: z.object({ kind: z.string().min(1).max(200) }).passthrough(),
        auth: z
            .object({
                kind: z.string().min(1).max(200),
                fields: z.array(z.string().max(200)).default([]),
            })
            .passthrough(),
        defaults: z.record(z.string(), z.unknown()).default({}),
        schema: z.array(PocketRisuProfileFieldSchema).default([]),
        uiSchema: PocketRisuProfileUiSchema.default({ groups: [], fields: [] }),
        headerTemplate: z.record(z.string(), z.string()).optional(),
        capabilities: z.array(z.string().max(100)).default([]),
        limits: z.record(z.string(), z.unknown()).optional(),
        recommendedTokenizer: z.string().max(100).optional(),
        sourceUrls: z.array(z.url()).default([]),
    })
    .passthrough()

export const PocketRisuModelProfileEnvelopeSchema = z
    .object({
        schemaVersion: z.literal(1),
        exportedAt: z.number().optional(),
        profile: PocketRisuModelProfileSchema,
        baseProvider: z
            .object({
                id: z.string().min(1).max(200),
                displayName: z.string().min(1).max(200),
                adapterKind: z.string().min(1).max(200),
                authKinds: z.array(z.string().max(200)).default([]),
                endpointKinds: z.array(z.string().max(200)).default([]),
                requestSchema: z.array(z.unknown()).default([]),
                uiSchema: PocketRisuProfileUiSchema.default({ groups: [], fields: [] }),
                sourceUrls: z.array(z.url()).default([]),
            })
            .passthrough(),
    })
    .passthrough()

export const PocketRisuProfileBindingSchema = z.object({
    envelope: PocketRisuModelProfileEnvelopeSchema,
    values: z.record(z.string(), z.unknown()).default({}),
})

export const PromptRoleSchema = z.enum(['user', 'bot', 'system'])
export const ModelRoleSchema = z.enum(['user', 'assistant', 'system'])

const PromptBlockBaseSchema = z.object({
    id: z.string().min(1),
    enabled: z.boolean().default(true),
    name: z.string().max(200).optional(),
})

export const PlainPromptBlockSchema = PromptBlockBaseSchema.extend({
    type: z.enum(['plain', 'jailbreak', 'cot']),
    type2: z.enum(['normal', 'globalNote', 'main']).default('normal'),
    text: z.string(),
    role: PromptRoleSchema.default('system'),
})

export const SlotPromptBlockSchema = PromptBlockBaseSchema.extend({
    type: z.enum(['persona', 'description', 'lorebook', 'postEverything']),
    innerFormat: z.string().optional(),
    role2: PromptRoleSchema.optional(),
})

export const AuthorNotePromptBlockSchema = PromptBlockBaseSchema.extend({
    type: z.literal('authornote'),
    innerFormat: z.string().optional(),
    defaultText: z.string().optional(),
    role2: PromptRoleSchema.optional(),
})

export const ChatPromptBlockSchema = PromptBlockBaseSchema.extend({
    type: z.literal('chat'),
    rangeStart: z.number().int(),
    rangeEnd: z.union([z.number().int(), z.literal('end')]),
    chatAsOriginalOnSystem: z.boolean().optional(),
})

export const ChatMlPromptBlockSchema = PromptBlockBaseSchema.extend({
    type: z.literal('chatML'),
    text: z.string(),
})

export const KnownPromptBlockSchema = z.discriminatedUnion('type', [
    PlainPromptBlockSchema,
    SlotPromptBlockSchema,
    AuthorNotePromptBlockSchema,
    ChatPromptBlockSchema,
    ChatMlPromptBlockSchema,
])

export const PreservedPromptBlockSchema = PromptBlockBaseSchema.extend({
    type: z.string(),
    enabled: z.literal(false),
    raw: z.record(z.string(), z.unknown()),
})

export const PromptBlockSchema = z.union([KnownPromptBlockSchema, PreservedPromptBlockSchema])

export const PromptToggleSchema = z.object({
    key: z.string().max(100).default(''),
    label: z.string().max(200).default(''),
    type: z.enum([
        'boolean',
        'select',
        'text',
        'textarea',
        'group',
        'groupEnd',
        'divider',
        'caption',
    ]),
    options: z.array(z.string().max(500)).max(200).default([]),
    defaultValue: z.string().max(100_000).default(''),
})

export const RegexPhaseSchema = z.enum(['editinput', 'editprocess', 'editoutput', 'editdisplay'])

export const RegexScriptSchema = z.object({
    id: z.string().min(1),
    comment: z.string().max(10_000).default(''),
    pattern: z.string().max(262_144),
    replacement: z.string().max(1_000_000),
    phase: RegexPhaseSchema,
    enabled: z.boolean().default(true),
    flags: z.string().max(500).default(''),
    disabledReason: z.string().max(10_000).optional(),
    raw: z.record(z.string(), z.unknown()).optional(),
})

export const PromptSettingsSchema = z.object({
    assistantPrefill: z.string().max(1_000_000).default(''),
    postEndInnerFormat: z.string().max(1_000_000).default(''),
    sendChatAsSystem: z.boolean().default(false),
    sendName: z.boolean().default(false),
    trimStartNewChat: z.boolean().default(false),
    /**
     * RisuAI wraps every non-greeting history message in this template when `sendName` is on
     * (default `<{{char}}'s Message>\n{{slot}}\n</{{char}}'s Message>`, `{{char}}` is always the
     * character's name even for user turns). Stored at the top level of a RisuAI preset export,
     * not nested under promptSettings — see preset-codec.ts.
     */
    groupTemplate: z.string().max(1_000_000).default(''),
})

export const PromptPresetSchema = z.object({
    id: IdSchema,
    name: z.string().min(1).max(200),
    blocks: z.array(PromptBlockSchema).max(1_000),
    parameters: GenerationParametersSchema,
    defaultVariables: z.record(z.string(), z.string()),
    toggles: z.array(PromptToggleSchema).max(1_000).default([]),
    regexScripts: z.array(RegexScriptSchema).max(2_000).default([]),
    moduleIntegrations: z.array(z.string().max(200)).max(1_000).default([]),
    promptSettings: PromptSettingsSchema.default({
        assistantPrefill: '',
        postEndInnerFormat: '',
        sendChatAsSystem: false,
        sendName: false,
        trimStartNewChat: false,
        groupTemplate: '',
    }),
    warnings: z.array(z.string()),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
})

export const PromptPresetInputSchema = PromptPresetSchema.omit({
    id: true,
    warnings: true,
    createdAt: true,
    updatedAt: true,
})

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

export const CharacterAssetSchema = z.object({
    assetId: IdSchema,
    type: z.string(),
    name: z.string(),
    extension: z.string(),
    sourceUri: z.string(),
    mimeType: z.string(),
    size: z.number().int().nonnegative(),
})

export const CharacterSchema = z.object({
    id: IdSchema,
    name: z.string(),
    description: z.string(),
    personality: z.string(),
    scenario: z.string(),
    firstMessage: z.string(),
    alternateGreetings: z.array(z.string()),
    exampleMessage: z.string(),
    systemPrompt: z.string(),
    postHistoryInstructions: z.string(),
    creator: z.string(),
    characterVersion: z.string(),
    tags: z.array(z.string()),
    avatarAssetId: IdSchema.nullable(),
    sourceSpec: z.enum(['v2', 'v3']),
    archivedAt: TimestampSchema.nullable(),
    groupId: IdSchema.nullable(),
    sortOrder: z.number().int().nonnegative(),
    lorebook: z.array(LoreEntrySchema).optional(),
    regexScripts: z.array(RegexScriptSchema).default([]),
    moduleReferences: z.array(z.string().max(200)).default([]),
    defaultVariables: z.record(z.string(), z.string()).default({}),
    luaScript: LuaScriptSchema.nullable().default(null),
    luaRawTriggers: z.array(z.unknown()).max(10_000).default([]),
    loreSettings: LoreSettingsSchema,
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
})

export const CharacterUpdateSchema = CharacterSchema.pick({
    name: true,
    description: true,
    personality: true,
    scenario: true,
    firstMessage: true,
    alternateGreetings: true,
    exampleMessage: true,
    systemPrompt: true,
    postHistoryInstructions: true,
    creator: true,
    characterVersion: true,
    tags: true,
    lorebook: true,
    loreSettings: true,
    regexScripts: true,
    moduleReferences: true,
    defaultVariables: true,
})
    .partial()
    .extend({ luaScript: LuaScriptInputSchema.nullable().optional() })

export const CharacterCreateSchema = z.object({
    name: z.string().min(1).max(500),
    description: z.string().default(''),
    personality: z.string().default(''),
    scenario: z.string().default(''),
    firstMessage: z.string().default(''),
    alternateGreetings: z.array(z.string()).default([]),
    exampleMessage: z.string().default(''),
    systemPrompt: z.string().default(''),
    postHistoryInstructions: z.string().default(''),
    creator: z.string().default(''),
    characterVersion: z.string().default(''),
    tags: z.array(z.string()).default([]),
    lorebook: z
        .array(LoreEntrySchema.omit({ id: true }).extend({ id: IdSchema.optional() }))
        .default([]),
    loreSettings: LoreSettingsSchema.default({}),
    regexScripts: z.array(RegexScriptSchema).max(2_000).default([]),
    moduleReferences: z.array(z.string().max(200)).max(1_000).default([]),
    defaultVariables: z.record(z.string(), z.string()).default({}),
    luaScript: LuaScriptInputSchema.nullable().default(null),
})

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
    source: z.enum(['conversation', 'global', 'legacy']),
})

export const AppSettingsSchema = z.object({
    userName: z.string().min(1).max(100),
    /** @deprecated Legacy single-persona text, kept only as the last-resort prompt fallback once no personas exist. Use the personas API instead. */
    persona: z.string().max(100_000),
    globalVariables: z.record(z.string(), z.string()),
    /** Prompt toggle values are shared by every conversation and preset that declares the key. */
    promptToggleValues: z.record(z.string(), z.string()).default({}),
    defaultPromptPresetId: IdSchema.nullable(),
    /** Default primary model inherited by conversations without an explicit binding. */
    defaultModelPresetId: IdSchema.nullable().default(null),
    /** Default model used only by Lua axLLM/auxiliary calls. Null inherits the primary model. */
    defaultAuxiliaryModelPresetId: IdSchema.nullable().default(null),
    selectedPersonaId: IdSchema.nullable(),
    requestDebugEnabled: z.boolean().default(false),
    /**
     * RisuAI-compatible global switches: `jailbreak`/`cot`-type prompt blocks only render when
     * their matching switch is on (default off), independent of the block's own `enabled` flag.
     */
    jailbreakToggle: z.boolean().default(false),
    chainOfThought: z.boolean().default(false),
})

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
    /** @deprecated Legacy persisted values. Prompt compilation uses AppSettings.promptToggleValues. */
    toggles: z.record(z.string(), z.string()),
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

export const GenerationRequestSchema = z.discriminatedUnion('mode', [
    z.object({
        mode: z.literal('reply'),
        content: z.string().min(1).max(1_000_000),
        idempotencyKey: z.string().min(8).max(200),
        clientInstanceId: z.string().uuid().optional(),
    }),
    z.object({
        mode: z.literal('regenerate'),
        idempotencyKey: z.string().min(8).max(200),
        clientInstanceId: z.string().uuid().optional(),
    }),
])

const LuaTriggerCommonSchema = z.object({
    idempotencyKey: z.string().uuid(),
    clientInstanceId: z.string().uuid(),
    sourceMessageId: IdSchema.nullable().optional(),
    triggerElementId: z.string().max(500).nullable().optional(),
})

export const LuaTriggerRequestSchema = z.discriminatedUnion('type', [
    LuaTriggerCommonSchema.extend({
        type: z.literal('manual'),
        name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,199}$/),
    }),
    LuaTriggerCommonSchema.extend({
        type: z.literal('button'),
        data: z.string().max(100_000),
    }),
])

export const LuaRemoteCommandResultSchema = z.object({
    clientInstanceId: z.string().uuid(),
    result: z.unknown(),
    error: z.string().max(10_000).optional(),
})

export const GenerationRunSchema = z.object({
    id: IdSchema,
    conversationId: IdSchema,
    messageId: IdSchema.nullable(),
    status: z.enum(['running', 'complete', 'cancelled', 'failed']),
    provider: z.string(),
    modelId: z.string(),
    parameters: GenerationParametersSchema,
    outputText: z.string(),
    processedOutputText: z.string(),
    inputTokens: z.number().int().nullable(),
    outputTokens: z.number().int().nullable(),
    errorCode: z.string().nullable(),
    errorMessage: z.string().nullable(),
    startedAt: TimestampSchema,
    completedAt: TimestampSchema.nullable(),
})

export const CompiledMessageSchema = z.object({
    role: ModelRoleSchema,
    content: z.string(),
})

export const PromptPreviewSchema = z.object({
    messages: z.array(CompiledMessageSchema),
    estimatedInputTokens: z.number().int().nonnegative(),
    reservedOutputTokens: z.number().int().positive(),
    activatedLoreIds: z.array(IdSchema),
    activeModuleIds: z.array(IdSchema).default([]),
    activeModules: z
        .array(
            z.object({
                id: IdSchema,
                source: z.enum(['default', 'character', 'preset', 'conversation']),
            }),
        )
        .default([]),
    effectiveToggles: z.record(z.string(), z.string()).default({}),
    activeRegexScriptIds: z.record(RegexPhaseSchema, z.array(z.string())).default({
        editinput: [],
        editprocess: [],
        editoutput: [],
        editdisplay: [],
    }),
    trimmedMessageIds: z.array(IdSchema),
    warnings: z.array(z.string()),
    persona: EffectivePersonaSchema.optional(),
    longTermMemory: z
        .object({
            enabled: z.boolean(),
            summaryCount: z.number().int().nonnegative(),
            selectedSummaryIds: z.array(IdSchema),
        })
        .optional(),
})

export const GenerationEventSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('generation.started'),
        generationId: IdSchema,
        messageId: IdSchema,
    }),
    z.object({
        type: z.literal('message.delta'),
        generationId: IdSchema,
        messageId: IdSchema,
        delta: z.string(),
    }),
    z.object({
        type: z.literal('message.snapshot'),
        generationId: IdSchema,
        messageId: IdSchema,
        content: z.string(),
    }),
    z.object({
        type: z.literal('message.completed'),
        generationId: IdSchema,
        message: MessageSchema,
        usage: z
            .object({
                inputTokens: z.number().optional(),
                outputTokens: z.number().optional(),
            })
            .optional(),
    }),
    z.object({
        type: z.literal('generation.failed'),
        generationId: IdSchema,
        messageId: IdSchema.optional(),
        error: ApiErrorSchema,
    }),
])

export type ApiError = z.infer<typeof ApiErrorSchema>
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>
export type ProviderKind = z.infer<typeof ProviderKindSchema>
export type ProviderApiFormat = z.infer<typeof ProviderApiFormatSchema>
export type ProviderSettingsInput = z.infer<typeof ProviderSettingsInputSchema>
export type ProviderSettings = z.infer<typeof ProviderSettingsSchema>
export type ModelApiKey = z.infer<typeof ModelApiKeySchema>
export type ModelApiKeyInput = z.infer<typeof ModelApiKeyInputSchema>
export type ModelPreset = z.infer<typeof ModelPresetSchema>
export type ModelPresetInput = z.infer<typeof ModelPresetInputSchema>
export type ModelChainAgent = z.infer<typeof ModelChainAgentSchema>
/** @deprecated Use ModelChainAgent. */
export type ModelChainStep = ModelChainAgent
export type ModelChainLayer = z.infer<typeof ModelChainLayerSchema>
export type ModelChainPreset = z.infer<typeof ModelChainPresetSchema>
export type ModelChainPresetInput = z.infer<typeof ModelChainPresetInputSchema>
export type ModelDiscoveryInput = z.infer<typeof ModelDiscoveryInputSchema>
export type PocketRisuProfileField = z.infer<typeof PocketRisuProfileFieldSchema>
export type PocketRisuModelProfileEnvelope = z.infer<typeof PocketRisuModelProfileEnvelopeSchema>
export type PocketRisuProfileBinding = z.infer<typeof PocketRisuProfileBindingSchema>
export type GenerationParameters = z.infer<typeof GenerationParametersSchema>
export type PromptRole = z.infer<typeof PromptRoleSchema>
export type ModelRole = z.infer<typeof ModelRoleSchema>
export type KnownPromptBlock = z.infer<typeof KnownPromptBlockSchema>
export type PromptBlock = z.infer<typeof PromptBlockSchema>
export type PromptToggle = z.infer<typeof PromptToggleSchema>
export type RegexPhase = z.infer<typeof RegexPhaseSchema>
export type RegexScript = z.infer<typeof RegexScriptSchema>
export type PromptSettings = z.infer<typeof PromptSettingsSchema>
export type PromptPreset = z.infer<typeof PromptPresetSchema>
type PromptPresetInputOutput = z.infer<typeof PromptPresetInputSchema>
export type PromptPresetInput = Omit<
    PromptPresetInputOutput,
    'toggles' | 'regexScripts' | 'moduleIntegrations' | 'promptSettings'
> &
    Partial<
        Pick<
            PromptPresetInputOutput,
            'toggles' | 'regexScripts' | 'moduleIntegrations' | 'promptSettings'
        >
    >
export type ModulePrompt = z.infer<typeof ModulePromptSchema>
export type ModuleToggle = z.infer<typeof ModuleToggleSchema>
export type ModuleAsset = z.infer<typeof ModuleAssetSchema>
export type PromptModule = z.infer<typeof PromptModuleSchema>
export type LuaScript = z.infer<typeof LuaScriptSchema>
export type LuaScriptInput = z.infer<typeof LuaScriptInputSchema>
type PromptModuleInputOutput = z.infer<typeof PromptModuleInputSchema>
export type LoreEntryInput = Omit<
    LoreEntry,
    | 'position'
    | 'depth'
    | 'role'
    | 'scanDepth'
    | 'recursive'
    | 'probability'
    | 'additionalKeys'
    | 'excludeKeys'
    | 'fullWordMatching'
    | 'decorators'
    | 'isGroup'
> &
    Partial<
        Pick<
            LoreEntry,
            | 'position'
            | 'depth'
            | 'role'
            | 'scanDepth'
            | 'recursive'
            | 'probability'
            | 'additionalKeys'
            | 'excludeKeys'
            | 'fullWordMatching'
            | 'decorators'
            | 'isGroup'
        >
    >
export type PromptModuleInput = Omit<
    PromptModuleInputOutput,
    | 'sourceId'
    | 'regexScripts'
    | 'backgroundEmbedding'
    | 'lorebook'
    | 'runtimeOrder'
    | 'luaScript'
    | 'luaRawTriggers'
> & {
    lorebook: LoreEntryInput[]
} & Partial<
        Pick<
            PromptModuleInputOutput,
            | 'sourceId'
            | 'regexScripts'
            | 'backgroundEmbedding'
            | 'runtimeOrder'
            | 'luaScript'
            | 'luaRawTriggers'
        >
    >
export type ConversationModuleState = z.infer<typeof ConversationModuleStateSchema>
export type LoreEntry = z.infer<typeof LoreEntrySchema>
export type LoreSettings = z.infer<typeof LoreSettingsSchema>
export type CharacterGroup = z.infer<typeof CharacterGroupSchema>
export type ConversationGroup = z.infer<typeof ConversationGroupSchema>
export type GroupCreate = z.infer<typeof GroupCreateSchema>
export type GroupUpdate = z.infer<typeof GroupUpdateSchema>
export type CharacterOrganization = z.infer<typeof CharacterOrganizationSchema>
export type ConversationOrganization = z.infer<typeof ConversationOrganizationSchema>
export type CharacterAsset = z.infer<typeof CharacterAssetSchema>
export type Character = z.infer<typeof CharacterSchema>
export type CharacterCreate = z.infer<typeof CharacterCreateSchema>
export type CharacterUpdate = z.infer<typeof CharacterUpdateSchema>
export type Persona = z.infer<typeof PersonaSchema>
export type PersonaCreate = z.infer<typeof PersonaCreateSchema>
export type PersonaUpdate = z.infer<typeof PersonaUpdateSchema>
export type EffectivePersona = z.infer<typeof EffectivePersonaSchema>
export type AppSettings = z.infer<typeof AppSettingsSchema>
export type RequestDebugSnapshot = z.infer<typeof RequestDebugSnapshotSchema>
export type RequestDebugRecord = z.infer<typeof RequestDebugRecordSchema>
export type Message = z.infer<typeof MessageSchema>
export type LongTermMemorySettings = z.infer<typeof LongTermMemorySettingsSchema>
export type LongTermMemorySettingsPatch = z.infer<typeof LongTermMemorySettingsPatchSchema>
export type LongTermMemorySummary = z.infer<typeof LongTermMemorySummarySchema>
export type LongTermMemoryMetrics = z.infer<typeof LongTermMemoryMetricsSchema>
export type LongTermMemoryState = z.infer<typeof LongTermMemoryStateSchema>
export type Conversation = z.infer<typeof ConversationSchema>
export type ConversationCreate = z.infer<typeof ConversationCreateSchema>
export type GenerationRequest = z.infer<typeof GenerationRequestSchema>
export type LuaTriggerRequest = z.infer<typeof LuaTriggerRequestSchema>
export type LuaRemoteCommandResult = z.infer<typeof LuaRemoteCommandResultSchema>
export type GenerationRun = z.infer<typeof GenerationRunSchema>
export type CompiledMessage = z.infer<typeof CompiledMessageSchema>
export type PromptPreview = z.infer<typeof PromptPreviewSchema>
export type GenerationEvent = z.infer<typeof GenerationEventSchema>
