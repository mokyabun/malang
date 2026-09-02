import type {
    GenerationParameters,
    LoreEntry,
    PromptBlock,
    PromptModule,
    PromptModuleInput,
    PromptPreset,
    PromptPresetInput,
} from '@malang/shared'
import { LoreEntrySchema, PromptToggleSchema } from '@malang/shared'
import { asc, eq } from 'drizzle-orm'

import type { DatabaseHandle } from '../db'
import { conversations, promptModuleAssets, promptModules, promptPresets } from '../schema'
import {
    iso,
    mapLuaScript,
    newLuaColumns,
    parseJson,
    RepositoryBase,
    requireValue,
    updateLuaColumns,
} from './base'
import { SettingsRepository } from './settings'

export interface PromptModuleAssetRecord {
    id: string
    moduleId: string
    assetId: string
    type: string
    name: string
    extension: string
    sourceUri: string
}

export class PromptRepository extends RepositoryBase {
    constructor(
        handle: DatabaseHandle,
        private readonly settings: SettingsRepository,
    ) {
        super(handle)
    }

    createPromptPreset(
        input: PromptPresetInput,
        source: Record<string, unknown> = {},
        warnings: string[] = [],
    ): PromptPreset {
        const id = crypto.randomUUID()
        const now = Date.now()
        this.db
            .insert(promptPresets)
            .values({
                id,
                name: input.name,
                blocksJson: JSON.stringify(input.blocks),
                parametersJson: JSON.stringify(input.parameters),
                defaultVariablesJson: JSON.stringify(input.defaultVariables),
                togglesJson: JSON.stringify(input.toggles || []),
                regexScriptsJson: JSON.stringify(input.regexScripts || []),
                moduleIntegrationsJson: JSON.stringify(input.moduleIntegrations || []),
                promptSettingsJson: JSON.stringify(input.promptSettings || {}),
                warningsJson: JSON.stringify(warnings),
                sourceJson: JSON.stringify(source),
                createdAt: now,
                updatedAt: now,
            })
            .run()
        return requireValue(this.getPromptPreset(id), 'Failed to create prompt preset')
    }

    updatePromptPreset(id: string, input: PromptPresetInput): PromptPreset | null {
        if (!this.getPromptPreset(id)) return null
        this.db
            .update(promptPresets)
            .set({
                name: input.name,
                blocksJson: JSON.stringify(input.blocks),
                parametersJson: JSON.stringify(input.parameters),
                defaultVariablesJson: JSON.stringify(input.defaultVariables),
                togglesJson: JSON.stringify(input.toggles || []),
                regexScriptsJson: JSON.stringify(input.regexScripts || []),
                moduleIntegrationsJson: JSON.stringify(input.moduleIntegrations || []),
                promptSettingsJson: JSON.stringify(input.promptSettings || {}),
                updatedAt: Date.now(),
            })
            .where(eq(promptPresets.id, id))
            .run()
        return this.getPromptPreset(id)
    }

    listPromptPresets(): PromptPreset[] {
        return this.db
            .select()
            .from(promptPresets)
            .orderBy(asc(promptPresets.name))
            .all()
            .map(mapPromptPreset)
    }

    getPromptPreset(id: string): PromptPreset | null {
        const row = this.db.select().from(promptPresets).where(eq(promptPresets.id, id)).get()
        return row ? mapPromptPreset(row) : null
    }

    getPromptPresetSource(id: string): Record<string, unknown> {
        const row = this.db
            .select({ sourceJson: promptPresets.sourceJson })
            .from(promptPresets)
            .where(eq(promptPresets.id, id))
            .get()
        return parseJson(row?.sourceJson || '{}', {})
    }

    deletePromptPreset(id: string): 'deleted' | 'not_found' | 'in_use' {
        if (!this.getPromptPreset(id)) return 'not_found'
        if (this.settings.getSettings().defaultPromptPresetId === id) return 'in_use'
        const used = this.db
            .select({ id: conversations.id })
            .from(conversations)
            .where(eq(conversations.promptPresetId, id))
            .limit(1)
            .get()
        if (used) return 'in_use'
        this.db.delete(promptPresets).where(eq(promptPresets.id, id)).run()
        return 'deleted'
    }

    createPromptModule(
        input: PromptModuleInput,
        source: Record<string, unknown> = {},
        warnings: string[] = [],
    ): PromptModule {
        const id = crypto.randomUUID()
        const now = Date.now()
        this.db
            .insert(promptModules)
            .values({
                id,
                name: input.name,
                description: input.description,
                namespace: input.namespace,
                sourceId: input.sourceId || '',
                runtimeOrder: input.runtimeOrder ?? 0,
                ...newLuaColumns(input.luaScript),
                luaRawTriggerJson: JSON.stringify(input.luaRawTriggers || []),
                enabledByDefault: input.enabledByDefault,
                promptsJson: JSON.stringify(input.prompts),
                togglesJson: JSON.stringify(input.toggles || []),
                regexScriptsJson: JSON.stringify(input.regexScripts || []),
                backgroundEmbedding: input.backgroundEmbedding || '',
                lorebookJson: JSON.stringify(input.lorebook),
                warningsJson: JSON.stringify(warnings),
                sourceJson: JSON.stringify(source),
                createdAt: now,
                updatedAt: now,
            })
            .run()
        return requireValue(this.getPromptModule(id), 'Failed to create prompt module')
    }

    listPromptModules(): PromptModule[] {
        return this.db
            .select()
            .from(promptModules)
            .orderBy(asc(promptModules.name))
            .all()
            .map(mapPromptModule)
    }

    getPromptModule(id: string): PromptModule | null {
        const row = this.db.select().from(promptModules).where(eq(promptModules.id, id)).get()
        return row ? mapPromptModule(row) : null
    }

    getPromptModuleSource(id: string): Record<string, unknown> {
        const row = this.db
            .select({ sourceJson: promptModules.sourceJson })
            .from(promptModules)
            .where(eq(promptModules.id, id))
            .get()
        return parseJson(row?.sourceJson || '{}', {})
    }

    findPromptModuleByNamespace(namespace: string): PromptModule | null {
        if (!namespace) return null
        const row = this.db
            .select()
            .from(promptModules)
            .where(eq(promptModules.namespace, namespace))
            .get()
        return row ? mapPromptModule(row) : null
    }

    updatePromptModule(id: string, input: PromptModuleInput): PromptModule | null {
        const current = this.getPromptModule(id)
        if (!current) return null
        this.db
            .update(promptModules)
            .set({
                name: input.name,
                description: input.description,
                namespace: input.namespace,
                sourceId: input.sourceId || '',
                runtimeOrder: input.runtimeOrder ?? current.runtimeOrder,
                ...(input.luaScript === undefined
                    ? {}
                    : updateLuaColumns(current.luaScript, input.luaScript)),
                luaRawTriggerJson: JSON.stringify(input.luaRawTriggers ?? current.luaRawTriggers),
                enabledByDefault: input.enabledByDefault,
                promptsJson: JSON.stringify(input.prompts),
                togglesJson: JSON.stringify(input.toggles || []),
                regexScriptsJson: JSON.stringify(input.regexScripts || []),
                backgroundEmbedding: input.backgroundEmbedding || '',
                lorebookJson: JSON.stringify(input.lorebook),
                updatedAt: Date.now(),
            })
            .where(eq(promptModules.id, id))
            .run()
        return this.getPromptModule(id)
    }

    deletePromptModule(id: string): boolean {
        if (!this.getPromptModule(id)) return false
        this.db.delete(promptModules).where(eq(promptModules.id, id)).run()
        return true
    }

    setPromptModuleAssets(moduleId: string, links: PromptModuleAssetRecord[]): void {
        this.db.transaction((tx) => {
            tx.delete(promptModuleAssets).where(eq(promptModuleAssets.moduleId, moduleId)).run()
            if (links.length) tx.insert(promptModuleAssets).values(links).run()
        })
    }

    getPromptModuleAssetLinks(moduleId: string) {
        return this.db
            .select()
            .from(promptModuleAssets)
            .where(eq(promptModuleAssets.moduleId, moduleId))
            .all()
    }

    ensureDefaultPrompt(): PromptPreset {
        const settings = this.settings.getSettings()
        if (settings.defaultPromptPresetId) {
            const existing = this.getPromptPreset(settings.defaultPromptPresetId)
            if (existing) return existing
        }
        const block = (type: string, rest: Record<string, unknown> = {}): PromptBlock =>
            ({
                id: crypto.randomUUID(),
                enabled: true,
                type,
                ...rest,
            }) as PromptBlock
        const preset = this.createPromptPreset({
            name: 'Default',
            parameters: { temperature: 0.9, maxContextTokens: 8192, maxOutputTokens: 512 },
            defaultVariables: {},
            toggles: [],
            regexScripts: [],
            moduleIntegrations: [],
            promptSettings: {
                assistantPrefill: '',
                postEndInnerFormat: '',
                sendChatAsSystem: false,
                sendName: false,
                trimStartNewChat: false,
                groupTemplate: '',
            },
            blocks: [
                block('plain', {
                    type2: 'main',
                    role: 'system',
                    text: 'Continue the fictional conversation as {{char}}.',
                }),
                block('description'),
                block('persona'),
                block('lorebook'),
                block('chat', { rangeStart: 0, rangeEnd: 'end' }),
                block('authornote'),
                block('plain', { type2: 'globalNote', role: 'system', text: '' }),
                block('postEverything'),
            ],
        })
        this.settings.updateSettings({ defaultPromptPresetId: preset.id })
        return preset
    }
}

function mapPromptPreset(row: typeof promptPresets.$inferSelect): PromptPreset {
    return {
        id: row.id,
        name: row.name,
        blocks: parseJson<PromptBlock[]>(row.blocksJson, []),
        parameters: parseJson<GenerationParameters>(row.parametersJson, {}),
        defaultVariables: parseJson(row.defaultVariablesJson, {}),
        toggles: parseJson(row.togglesJson, []),
        regexScripts: parseJson(row.regexScriptsJson, []),
        moduleIntegrations: parseJson(row.moduleIntegrationsJson, []),
        promptSettings: {
            assistantPrefill: '',
            postEndInnerFormat: '',
            sendChatAsSystem: false,
            sendName: false,
            trimStartNewChat: false,
            groupTemplate: '',
            ...parseJson(row.promptSettingsJson, {}),
        },
        warnings: parseJson(row.warningsJson, []),
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
    }
}

function mapPromptModule(row: typeof promptModules.$inferSelect): PromptModule {
    return {
        id: row.id,
        name: row.name,
        description: row.description,
        namespace: row.namespace,
        sourceId: row.sourceId,
        runtimeOrder: row.runtimeOrder,
        luaScript: mapLuaScript(row),
        luaRawTriggers: parseJson(row.luaRawTriggerJson, []),
        enabledByDefault: row.enabledByDefault,
        prompts: parseJson(row.promptsJson, []),
        toggles: normalizeModuleToggles(parseJson(row.togglesJson, [])),
        regexScripts: parseJson(row.regexScriptsJson, []),
        backgroundEmbedding: row.backgroundEmbedding,
        lorebook: normalizeLoreEntries(parseJson(row.lorebookJson, [])),
        assets: [],
        warnings: parseJson(row.warningsJson, []),
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
    }
}

function normalizeModuleToggles(value: unknown): PromptModule['toggles'] {
    if (!Array.isArray(value)) return []
    return value.flatMap((toggle) => {
        if (!toggle || typeof toggle !== 'object' || Array.isArray(toggle)) return []
        const candidate = toggle as Record<string, unknown>
        if (typeof candidate.type === 'string') {
            const parsed = PromptToggleSchema.safeParse(candidate)
            return parsed.success ? [parsed.data] : []
        }
        // Compatibility with Malang's pre-PocketRisu boolean-only module toggle shape.
        if (typeof candidate.key !== 'string' || typeof candidate.label !== 'string') return []
        const parsed = PromptToggleSchema.safeParse({
            key: candidate.key,
            label: candidate.label,
            type: 'boolean',
            options: [],
            defaultValue: candidate.defaultEnabled === true ? '1' : '0',
        })
        return parsed.success ? [parsed.data] : []
    })
}

function normalizeLoreEntries(value: unknown): LoreEntry[] {
    if (!Array.isArray(value)) return []
    return value.flatMap((entry) => {
        const parsed = LoreEntrySchema.safeParse(entry)
        return parsed.success ? [parsed.data] : []
    })
}
