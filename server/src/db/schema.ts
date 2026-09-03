import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

const timestampColumns = {
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
}

export const adminUsers = sqliteTable('admin_users', {
    id: text('id').primaryKey(),
    passwordHash: text('password_hash').notNull(),
    ...timestampColumns,
})

export const sessions = sqliteTable(
    'sessions',
    {
        id: text('id').primaryKey(),
        adminId: text('admin_id')
            .notNull()
            .references(() => adminUsers.id, { onDelete: 'cascade' }),
        tokenHash: text('token_hash').notNull(),
        expiresAt: integer('expires_at').notNull(),
        createdAt: integer('created_at').notNull(),
    },
    (table) => [uniqueIndex('sessions_token_hash_idx').on(table.tokenHash)],
)

export const appSettings = sqliteTable('app_settings', {
    id: integer('id').primaryKey(),
    userName: text('user_name').notNull(),
    persona: text('persona').notNull(),
    globalVariablesJson: text('global_variables_json').notNull(),
    promptToggleValuesJson: text('prompt_toggle_values_json').notNull().default('{}'),
    defaultPromptPresetId: text('default_prompt_preset_id'),
    defaultModelPresetId: text('default_model_preset_id'),
    defaultAuxiliaryModelPresetId: text('default_auxiliary_model_preset_id'),
    selectedPersonaId: text('selected_persona_id').references(() => personas.id, {
        onDelete: 'set null',
    }),
    requestDebugEnabled: integer('request_debug_enabled', { mode: 'boolean' })
        .notNull()
        .default(false),
    jailbreakToggle: integer('jailbreak_toggle', { mode: 'boolean' }).notNull().default(false),
    chainOfThought: integer('chain_of_thought', { mode: 'boolean' }).notNull().default(false),
    providerJson: text('provider_json'),
    autoBackupEnabled: integer('auto_backup_enabled', { mode: 'boolean' }).notNull().default(true),
    secretSalt: text('secret_salt'),
    providerSecretJson: text('provider_secret_json'),
    updatedAt: integer('updated_at').notNull(),
})

export const modelApiKeys = sqliteTable('model_api_keys', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    provider: text('provider').notNull(),
    credentialType: text('credential_type', {
        enum: ['apiKey', 'serviceAccount', 'aws'],
    }).notNull(),
    hint: text('hint').notNull().default(''),
    ...timestampColumns,
})

export const modelPresets = sqliteTable('model_presets', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    providerJson: text('provider_json').notNull(),
    apiKeyId: text('api_key_id').references(() => modelApiKeys.id, { onDelete: 'restrict' }),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestampColumns,
})

export const modelChainPresets = sqliteTable('model_chain_presets', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    stepsJson: text('steps_json').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestampColumns,
})

export const assets = sqliteTable(
    'assets',
    {
        id: text('id').primaryKey(),
        sha256: text('sha256').notNull(),
        mimeType: text('mime_type').notNull(),
        size: integer('size').notNull(),
        path: text('path').notNull(),
        createdAt: integer('created_at').notNull(),
    },
    (table) => [uniqueIndex('assets_sha256_idx').on(table.sha256)],
)

export const characterGroups = sqliteTable('character_groups', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').notNull(),
    ...timestampColumns,
})

export const characters = sqliteTable('characters', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    personality: text('personality').notNull(),
    scenario: text('scenario').notNull(),
    firstMessage: text('first_message').notNull(),
    alternateGreetingsJson: text('alternate_greetings_json').notNull(),
    exampleMessage: text('example_message').notNull(),
    systemPrompt: text('system_prompt').notNull(),
    postHistoryInstructions: text('post_history_instructions').notNull(),
    creator: text('creator').notNull(),
    characterVersion: text('character_version').notNull(),
    tagsJson: text('tags_json').notNull(),
    avatarAssetId: text('avatar_asset_id').references(() => assets.id, { onDelete: 'set null' }),
    sourceSpec: text('source_spec', { enum: ['v2', 'v3'] }).notNull(),
    sourceExtensionsJson: text('source_extensions_json').notNull(),
    sourceCardJson: text('source_card_json').notNull(),
    loreSettingsJson: text('lore_settings_json').notNull(),
    regexScriptsJson: text('regex_scripts_json').notNull().default('[]'),
    moduleReferencesJson: text('module_references_json').notNull().default('[]'),
    defaultVariablesJson: text('default_variables_json').notNull().default('{}'),
    luaCode: text('lua_code'),
    luaEnabled: integer('lua_enabled', { mode: 'boolean' }).notNull().default(false),
    luaLowLevelAccess: integer('lua_low_level_access', { mode: 'boolean' })
        .notNull()
        .default(false),
    luaRevision: integer('lua_revision').notNull().default(0),
    luaCodeSha256: text('lua_code_sha256').notNull().default(''),
    luaRawTriggerJson: text('lua_raw_trigger_json').notNull().default('[]'),
    groupId: text('group_id').references(() => characterGroups.id, { onDelete: 'set null' }),
    sortOrder: integer('sort_order').notNull().default(0),
    archivedAt: integer('archived_at'),
    ...timestampColumns,
})

export const characterLoreEntries = sqliteTable('character_lore_entries', {
    id: text('id').primaryKey(),
    characterId: text('character_id')
        .notNull()
        .references(() => characters.id, { onDelete: 'cascade' }),
    keysJson: text('keys_json').notNull(),
    secondaryKeysJson: text('secondary_keys_json').notNull(),
    content: text('content').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull(),
    constant: integer('constant', { mode: 'boolean' }).notNull(),
    selective: integer('selective', { mode: 'boolean' }).notNull(),
    caseSensitive: integer('case_sensitive', { mode: 'boolean' }).notNull(),
    useRegex: integer('use_regex', { mode: 'boolean' }).notNull(),
    insertionOrder: integer('insertion_order').notNull(),
    priority: integer('priority').notNull(),
    name: text('name').notNull(),
    extensionsJson: text('extensions_json').notNull(),
})

export const characterAssets = sqliteTable('character_assets', {
    id: text('id').primaryKey(),
    characterId: text('character_id')
        .notNull()
        .references(() => characters.id, { onDelete: 'cascade' }),
    assetId: text('asset_id')
        .notNull()
        .references(() => assets.id, { onDelete: 'restrict' }),
    type: text('type').notNull(),
    name: text('name').notNull(),
    extension: text('extension').notNull(),
    sourceUri: text('source_uri').notNull(),
})

export const personas = sqliteTable('personas', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    note: text('note').notNull().default(''),
    avatarAssetId: text('avatar_asset_id').references(() => assets.id, { onDelete: 'set null' }),
    ...timestampColumns,
})

export const promptPresets = sqliteTable('prompt_presets', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    blocksJson: text('blocks_json').notNull(),
    parametersJson: text('parameters_json').notNull(),
    defaultVariablesJson: text('default_variables_json').notNull(),
    togglesJson: text('toggles_json').notNull().default('[]'),
    regexScriptsJson: text('regex_scripts_json').notNull().default('[]'),
    moduleIntegrationsJson: text('module_integrations_json').notNull().default('[]'),
    promptSettingsJson: text('prompt_settings_json').notNull().default('{}'),
    warningsJson: text('warnings_json').notNull(),
    sourceJson: text('source_json').notNull(),
    ...timestampColumns,
})

export const promptModules = sqliteTable(
    'prompt_modules',
    {
        id: text('id').primaryKey(),
        name: text('name').notNull(),
        description: text('description').notNull(),
        namespace: text('namespace').notNull(),
        sourceId: text('source_id').notNull().default(''),
        runtimeOrder: integer('runtime_order').notNull().default(0),
        luaCode: text('lua_code'),
        luaEnabled: integer('lua_enabled', { mode: 'boolean' }).notNull().default(false),
        luaLowLevelAccess: integer('lua_low_level_access', { mode: 'boolean' })
            .notNull()
            .default(false),
        luaRevision: integer('lua_revision').notNull().default(0),
        luaCodeSha256: text('lua_code_sha256').notNull().default(''),
        luaRawTriggerJson: text('lua_raw_trigger_json').notNull().default('[]'),
        enabledByDefault: integer('enabled_by_default', { mode: 'boolean' })
            .notNull()
            .default(false),
        promptsJson: text('prompts_json').notNull(),
        togglesJson: text('toggles_json').notNull(),
        regexScriptsJson: text('regex_scripts_json').notNull().default('[]'),
        backgroundEmbedding: text('background_embedding').notNull().default(''),
        lorebookJson: text('lorebook_json').notNull().default('[]'),
        warningsJson: text('warnings_json').notNull(),
        sourceJson: text('source_json').notNull(),
        ...timestampColumns,
    },
    () => [],
)

export const promptModuleAssets = sqliteTable('prompt_module_assets', {
    id: text('id').primaryKey(),
    moduleId: text('module_id')
        .notNull()
        .references(() => promptModules.id, { onDelete: 'cascade' }),
    assetId: text('asset_id')
        .notNull()
        .references(() => assets.id, { onDelete: 'restrict' }),
    type: text('type').notNull(),
    name: text('name').notNull(),
    extension: text('extension').notNull(),
    sourceUri: text('source_uri').notNull(),
})

export const conversationGroups = sqliteTable('conversation_groups', {
    id: text('id').primaryKey(),
    characterId: text('character_id')
        .notNull()
        .references(() => characters.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').notNull(),
    ...timestampColumns,
})

export const conversations = sqliteTable('conversations', {
    id: text('id').primaryKey(),
    characterId: text('character_id')
        .notNull()
        .references(() => characters.id, { onDelete: 'restrict' }),
    promptPresetId: text('prompt_preset_id')
        .notNull()
        .references(() => promptPresets.id, { onDelete: 'restrict' }),
    promptPresetLocked: integer('prompt_preset_locked', { mode: 'boolean' })
        .notNull()
        .default(false),
    modelPresetId: text('model_preset_id'),
    auxiliaryModelPresetId: text('auxiliary_model_preset_id'),
    modelChainPresetId: text('model_chain_preset_id').references(() => modelChainPresets.id, {
        onDelete: 'restrict',
    }),
    title: text('title').notNull(),
    greetingIndex: integer('greeting_index').notNull(),
    variablesJson: text('variables_json').notNull(),
    togglesJson: text('toggles_json').notNull(),
    authorNote: text('author_note').notNull().default(''),
    boundPersonaId: text('bound_persona_id').references(() => personas.id, {
        onDelete: 'set null',
    }),
    personaLocked: integer('persona_locked', { mode: 'boolean' }).notNull().default(false),
    groupId: text('group_id').references(() => conversationGroups.id, { onDelete: 'set null' }),
    sortOrder: integer('sort_order').notNull().default(0),
    archivedAt: integer('archived_at'),
    displayEpoch: integer('display_epoch').notNull().default(0),
    ...timestampColumns,
})

export const conversationModules = sqliteTable(
    'conversation_modules',
    {
        conversationId: text('conversation_id')
            .notNull()
            .references(() => conversations.id, { onDelete: 'cascade' }),
        moduleId: text('module_id')
            .notNull()
            .references(() => promptModules.id, { onDelete: 'cascade' }),
        enabled: integer('enabled', { mode: 'boolean' }).notNull(),
    },
    (table) => [primaryKey({ columns: [table.conversationId, table.moduleId] })],
)

export const messages = sqliteTable(
    'messages',
    {
        id: text('id').primaryKey(),
        conversationId: text('conversation_id')
            .notNull()
            .references(() => conversations.id, { onDelete: 'cascade' }),
        role: text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
        content: text('content').notNull(),
        position: integer('position').notNull(),
        status: text('status', {
            enum: ['complete', 'streaming', 'cancelled', 'failed'],
        }).notNull(),
        ...timestampColumns,
    },
    (table) => [
        uniqueIndex('messages_conversation_position_idx').on(table.conversationId, table.position),
    ],
)

export const conversationMemorySettings = sqliteTable('conversation_memory_settings', {
    conversationId: text('conversation_id')
        .primaryKey()
        .references(() => conversations.id, { onDelete: 'cascade' }),
    settingsJson: text('settings_json').notNull(),
    metricsJson: text('metrics_json').notNull().default('{}'),
    updatedAt: integer('updated_at').notNull(),
})

export const conversationMemorySummaries = sqliteTable(
    'conversation_memory_summaries',
    {
        id: text('id').primaryKey(),
        conversationId: text('conversation_id')
            .notNull()
            .references(() => conversations.id, { onDelete: 'cascade' }),
        text: text('text').notNull(),
        sourceMessageIdsJson: text('source_message_ids_json').notNull(),
        vectorJson: text('vector_json').notNull(),
        isImportant: integer('is_important', { mode: 'boolean' }).notNull().default(false),
        ...timestampColumns,
    },
    (table) => [
        index('conversation_memory_summaries_conversation_idx').on(
            table.conversationId,
            table.createdAt,
        ),
    ],
)

export const modelChainAgentMemories = sqliteTable(
    'model_chain_agent_memories',
    {
        conversationId: text('conversation_id')
            .notNull()
            .references(() => conversations.id, { onDelete: 'cascade' }),
        agentId: text('agent_id').notNull(),
        content: text('content').notNull().default(''),
        updatedAt: integer('updated_at').notNull(),
    },
    (table) => [primaryKey({ columns: [table.conversationId, table.agentId] })],
)

export const generationRuns = sqliteTable(
    'generation_runs',
    {
        id: text('id').primaryKey(),
        conversationId: text('conversation_id')
            .notNull()
            .references(() => conversations.id, { onDelete: 'cascade' }),
        messageId: text('message_id').references(() => messages.id, { onDelete: 'set null' }),
        idempotencyKey: text('idempotency_key').notNull(),
        status: text('status', { enum: ['running', 'complete', 'cancelled', 'failed'] }).notNull(),
        provider: text('provider').notNull(),
        modelId: text('model_id').notNull(),
        parametersJson: text('parameters_json').notNull(),
        outputText: text('output_text').notNull(),
        processedOutputText: text('processed_output_text').notNull().default(''),
        inputTokens: integer('input_tokens'),
        outputTokens: integer('output_tokens'),
        errorCode: text('error_code'),
        errorMessage: text('error_message'),
        startedAt: integer('started_at').notNull(),
        completedAt: integer('completed_at'),
    },
    (table) => [
        uniqueIndex('generation_idempotency_idx').on(table.conversationId, table.idempotencyKey),
    ],
)

export const requestDebugRecords = sqliteTable('request_debug_records', {
    id: text('id').primaryKey(),
    generationId: text('generation_id')
        .notNull()
        .references(() => generationRuns.id, { onDelete: 'cascade' }),
    conversationId: text('conversation_id')
        .notNull()
        .references(() => conversations.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    modelId: text('model_id').notNull(),
    parametersJson: text('parameters_json').notNull(),
    requestJson: text('request_json').notNull(),
    createdAt: integer('created_at').notNull(),
})

export const luaStates = sqliteTable(
    'lua_states',
    {
        conversationId: text('conversation_id')
            .notNull()
            .references(() => conversations.id, { onDelete: 'cascade' }),
        ownerType: text('owner_type', { enum: ['character', 'module'] }).notNull(),
        ownerId: text('owner_id').notNull(),
        stateKey: text('state_key').notNull(),
        valueJson: text('value_json').notNull(),
        version: integer('version').notNull().default(1),
        updatedAt: integer('updated_at').notNull(),
    },
    (table) => [
        primaryKey({
            columns: [table.conversationId, table.ownerType, table.ownerId, table.stateKey],
        }),
    ],
)

export const luaEventRuns = sqliteTable(
    'lua_event_runs',
    {
        id: text('id').primaryKey(),
        conversationId: text('conversation_id')
            .notNull()
            .references(() => conversations.id, { onDelete: 'cascade' }),
        eventKey: text('event_key').notNull(),
        phase: text('phase').notNull(),
        clientInstanceId: text('client_instance_id'),
        status: text('status', { enum: ['running', 'complete', 'failed'] }).notNull(),
        inputJson: text('input_json').notNull().default('{}'),
        resultJson: text('result_json'),
        errorJson: text('error_json'),
        createdAt: integer('created_at').notNull(),
        completedAt: integer('completed_at'),
    },
    (table) => [
        uniqueIndex('lua_event_runs_unique_idx').on(
            table.conversationId,
            table.eventKey,
            table.phase,
        ),
    ],
)

export const luaInvocations = sqliteTable(
    'lua_invocations',
    {
        id: text('id').primaryKey(),
        eventRunId: text('event_run_id')
            .notNull()
            .references(() => luaEventRuns.id, { onDelete: 'cascade' }),
        ownerType: text('owner_type', { enum: ['character', 'module'] }).notNull(),
        ownerId: text('owner_id').notNull(),
        scriptRevision: integer('script_revision').notNull(),
        sequence: integer('sequence').notNull(),
        status: text('status', { enum: ['running', 'complete', 'failed'] }).notNull(),
        resultJson: text('result_json'),
        warningsJson: text('warnings_json').notNull().default('[]'),
        errorJson: text('error_json'),
        createdAt: integer('created_at').notNull(),
        completedAt: integer('completed_at'),
    },
    (table) => [
        uniqueIndex('lua_invocations_unique_idx').on(
            table.eventRunId,
            table.ownerType,
            table.ownerId,
            table.scriptRevision,
        ),
    ],
)

export const luaApiCalls = sqliteTable(
    'lua_api_calls',
    {
        id: text('id').primaryKey(),
        invocationId: text('invocation_id')
            .notNull()
            .references(() => luaInvocations.id, { onDelete: 'cascade' }),
        callIndex: integer('call_index').notNull(),
        operation: text('operation').notNull(),
        status: text('status', {
            enum: ['running', 'complete', 'failed', 'indeterminate'],
        }).notNull(),
        requestJson: text('request_json').notNull().default('{}'),
        resultJson: text('result_json'),
        errorJson: text('error_json'),
        createdAt: integer('created_at').notNull(),
        completedAt: integer('completed_at'),
    },
    (table) => [uniqueIndex('lua_api_calls_unique_idx').on(table.invocationId, table.callIndex)],
)

export const luaRemoteCommands = sqliteTable(
    'lua_remote_commands',
    {
        id: text('id').primaryKey(),
        invocationId: text('invocation_id')
            .notNull()
            .references(() => luaInvocations.id, { onDelete: 'cascade' }),
        callIndex: integer('call_index').notNull(),
        clientInstanceId: text('client_instance_id').notNull(),
        kind: text('kind').notNull(),
        payloadJson: text('payload_json').notNull(),
        resultJson: text('result_json'),
        status: text('status', { enum: ['pending', 'complete', 'failed', 'expired'] }).notNull(),
        blocking: integer('blocking', { mode: 'boolean' }).notNull().default(false),
        expiresAt: integer('expires_at').notNull(),
        createdAt: integer('created_at').notNull(),
        completedAt: integer('completed_at'),
    },
    (table) => [
        uniqueIndex('lua_remote_commands_unique_idx').on(table.invocationId, table.callIndex),
    ],
)

export const luaDisplayBatches = sqliteTable(
    'lua_display_batches',
    {
        conversationId: text('conversation_id')
            .notNull()
            .references(() => conversations.id, { onDelete: 'cascade' }),
        displayEpoch: integer('display_epoch').notNull(),
        scriptSetHash: text('script_set_hash').notNull(),
        status: text('status', { enum: ['running', 'complete', 'failed'] }).notNull(),
        resultJson: text('result_json'),
        errorJson: text('error_json'),
        createdAt: integer('created_at').notNull(),
        completedAt: integer('completed_at'),
    },
    (table) => [
        primaryKey({ columns: [table.conversationId, table.displayEpoch, table.scriptSetHash] }),
    ],
)

export const conversationLoreEntries = sqliteTable(
    'conversation_lore_entries',
    {
        id: text('id').primaryKey(),
        conversationId: text('conversation_id')
            .notNull()
            .references(() => conversations.id, { onDelete: 'cascade' }),
        name: text('name').notNull(),
        entryJson: text('entry_json').notNull(),
        updatedAt: integer('updated_at').notNull(),
    },
    (table) => [
        uniqueIndex('conversation_lore_entries_name_idx').on(table.conversationId, table.name),
    ],
)
