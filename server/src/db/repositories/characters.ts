import type {
    Character,
    CharacterGroup,
    CharacterOrganization,
    CharacterUpdate,
    LoreEntry,
    LuaScriptInput,
} from '@malang/shared'
import { GENERAL_CHAT_CHARACTER_ID } from '@malang/shared'
import { asc, desc, eq, isNull, max } from 'drizzle-orm'

import type { DatabaseHandle } from '../db'
import {
    characterAssets,
    characterGroups,
    characterLoreEntries,
    characters,
    conversations,
} from '../schema'
import {
    iso,
    mapLuaScript,
    newLuaColumns,
    RepositoryBase,
    requireValue,
    updateLuaColumns,
} from './base'
import { PromptRepository } from './prompts'

export interface CharacterRecord extends Character {
    sourceExtensions: Record<string, unknown>
    sourceCard: Record<string, unknown>
    loreSettings: { scanDepth?: number; tokenBudget?: number; recursiveScanning?: boolean }
    regexScripts: Character['regexScripts']
    moduleReferences: string[]
    luaRawTriggers: unknown[]
}

export interface NewCharacterRecord {
    id: string
    name: string
    description: string
    personality: string
    scenario: string
    firstMessage: string
    alternateGreetings: string[]
    exampleMessage: string
    systemPrompt: string
    postHistoryInstructions: string
    creator: string
    characterVersion: string
    tags: string[]
    avatarAssetId: string | null
    sourceSpec: 'v2' | 'v3'
    sourceExtensions: Record<string, unknown>
    sourceCard: Record<string, unknown>
    loreSettings: { scanDepth?: number; tokenBudget?: number; recursiveScanning?: boolean }
    regexScripts: Character['regexScripts']
    moduleReferences: string[]
    defaultVariables?: Record<string, string>
    luaScript?: LuaScriptInput | null
    luaRawTriggers?: unknown[]
    lorebook: Array<Omit<LoreEntry, 'id'> & { id?: string; extensions?: Record<string, unknown> }>
}

export interface CharacterAssetRecord {
    id: string
    characterId: string
    assetId: string
    type: string
    name: string
    extension: string
    sourceUri: string
}

export class CharacterRepository extends RepositoryBase {
    constructor(
        handle: DatabaseHandle,
        private readonly prompts: PromptRepository,
    ) {
        super(handle)
    }

    getCharacterLoreExtensions(characterId: string): Map<string, Record<string, unknown>> {
        const rows = this.db
            .select({
                id: characterLoreEntries.id,
                extensionsJson: characterLoreEntries.extensionsJson,
            })
            .from(characterLoreEntries)
            .where(eq(characterLoreEntries.characterId, characterId))
            .all()
        return new Map(rows.map((row) => [row.id, row.extensionsJson]))
    }

    ensureGeneralChatCharacter(): CharacterRecord {
        const existing = this.getCharacter(GENERAL_CHAT_CHARACTER_ID)
        if (existing) {
            if (existing.archivedAt) {
                this.db
                    .update(characters)
                    .set({ archivedAt: null, updatedAt: Date.now() })
                    .where(eq(characters.id, GENERAL_CHAT_CHARACTER_ID))
                    .run()
                return requireValue(
                    this.getCharacter(GENERAL_CHAT_CHARACTER_ID),
                    'Failed to restore the built-in Chat character',
                )
            }
            return existing
        }

        const systemPrompt =
            'You are Chat, a helpful general-purpose AI assistant. Respond directly and clearly to the user. Do not role-play a fictional character unless the user asks you to.'
        return this.createCharacter(
            {
                id: GENERAL_CHAT_CHARACTER_ID,
                name: 'Chat',
                description: 'A helpful general-purpose AI assistant for everyday questions.',
                personality: 'Helpful, clear, practical, and adaptable.',
                scenario: '',
                firstMessage: '',
                alternateGreetings: [],
                exampleMessage: '',
                systemPrompt,
                postHistoryInstructions: '',
                creator: 'Malang',
                characterVersion: '1.0',
                tags: ['built-in', 'general'],
                avatarAssetId: null,
                sourceSpec: 'v3',
                sourceExtensions: { malang: { builtIn: 'general-chat' } },
                sourceCard: {
                    spec: 'chara_card_v3',
                    spec_version: '3.0',
                    data: {
                        name: 'Chat',
                        description:
                            'A helpful general-purpose AI assistant for everyday questions.',
                        personality: 'Helpful, clear, practical, and adaptable.',
                        scenario: '',
                        first_mes: '',
                        alternate_greetings: [],
                        mes_example: '',
                        system_prompt: systemPrompt,
                        post_history_instructions: '',
                        creator: 'Malang',
                        character_version: '1.0',
                        tags: ['built-in', 'general'],
                        creator_notes: '',
                        group_only_greetings: [],
                        extensions: { malang: { builtIn: 'general-chat' } },
                    },
                },
                loreSettings: {},
                regexScripts: [],
                moduleReferences: [],
                lorebook: [],
            },
            [],
        )
    }

    createCharacter(
        input: NewCharacterRecord,
        linkedAssets: CharacterAssetRecord[],
    ): CharacterRecord {
        const now = Date.now()
        const sortOrder = this.nextCharacterRootOrder()
        this.db.transaction((tx) => {
            tx.insert(characters)
                .values({
                    id: input.id,
                    name: input.name,
                    description: input.description,
                    personality: input.personality,
                    scenario: input.scenario,
                    firstMessage: input.firstMessage,
                    alternateGreetingsJson: input.alternateGreetings,
                    exampleMessage: input.exampleMessage,
                    systemPrompt: input.systemPrompt,
                    postHistoryInstructions: input.postHistoryInstructions,
                    creator: input.creator,
                    characterVersion: input.characterVersion,
                    tagsJson: input.tags,
                    avatarAssetId: input.avatarAssetId,
                    sourceSpec: input.sourceSpec,
                    sourceExtensionsJson: input.sourceExtensions,
                    sourceCardJson: input.sourceCard,
                    loreSettingsJson: input.loreSettings,
                    regexScriptsJson: input.regexScripts,
                    moduleReferencesJson: input.moduleReferences,
                    defaultVariablesJson: input.defaultVariables || {},
                    ...newLuaColumns(input.luaScript),
                    luaRawTriggerJson: input.luaRawTriggers || [],
                    groupId: null,
                    sortOrder,
                    archivedAt: null,
                    createdAt: now,
                    updatedAt: now,
                })
                .run()
            if (input.lorebook.length) {
                tx.insert(characterLoreEntries)
                    .values(
                        input.lorebook.map((entry) => ({
                            id: entry.id || crypto.randomUUID(),
                            characterId: input.id,
                            keysJson: entry.keys,
                            secondaryKeysJson: entry.secondaryKeys,
                            content: entry.content,
                            enabled: entry.enabled,
                            constant: entry.constant,
                            selective: entry.selective,
                            caseSensitive: entry.caseSensitive,
                            useRegex: entry.useRegex,
                            insertionOrder: entry.insertionOrder,
                            priority: entry.priority,
                            name: entry.name,
                            extensionsJson: loreExtensions(entry),
                        })),
                    )
                    .run()
            }
            if (linkedAssets.length) tx.insert(characterAssets).values(linkedAssets).run()
        })
        return requireValue(this.getCharacter(input.id), 'Failed to create character')
    }

    listCharacters(includeArchived = false): CharacterRecord[] {
        const query = this.db
            .select()
            .from(characters)
            .orderBy(asc(characters.sortOrder), desc(characters.updatedAt))
        const rows = includeArchived
            ? query.all()
            : query.where(isNull(characters.archivedAt)).all()
        return rows.map((row) => this.mapCharacter(row, false))
    }

    listCharacterGroups(): CharacterGroup[] {
        return this.db
            .select()
            .from(characterGroups)
            .orderBy(asc(characterGroups.sortOrder), asc(characterGroups.createdAt))
            .all()
            .map(mapCharacterGroup)
    }

    createCharacterGroup(name: string): CharacterGroup {
        const now = Date.now()
        const id = crypto.randomUUID()
        this.db
            .insert(characterGroups)
            .values({
                id,
                name,
                sortOrder: this.nextCharacterRootOrder(),
                createdAt: now,
                updatedAt: now,
            })
            .run()
        return requireValue(
            this.listCharacterGroups().find((group) => group.id === id),
            'Failed to create character group',
        )
    }

    updateCharacterGroup(id: string, name: string): CharacterGroup | null {
        const existing = this.db
            .select()
            .from(characterGroups)
            .where(eq(characterGroups.id, id))
            .get()
        if (!existing) return null
        this.db
            .update(characterGroups)
            .set({ name, updatedAt: Date.now() })
            .where(eq(characterGroups.id, id))
            .run()
        return this.listCharacterGroups().find((group) => group.id === id) ?? null
    }

    deleteCharacterGroup(id: string): boolean {
        const existing = this.db
            .select({ id: characterGroups.id })
            .from(characterGroups)
            .where(eq(characterGroups.id, id))
            .get()
        if (!existing) return false
        this.db.delete(characterGroups).where(eq(characterGroups.id, id)).run()
        return true
    }

    organizeCharacters(input: CharacterOrganization): boolean {
        const groupIds = new Set(this.listCharacterGroups().map((group) => group.id))
        const characterRows = this.db.select({ id: characters.id }).from(characters).all()
        const characterIds = new Set(characterRows.map((character) => character.id))
        if (
            input.groups.some((group) => !groupIds.has(group.id)) ||
            input.characters.some(
                (character) =>
                    character.id === GENERAL_CHAT_CHARACTER_ID ||
                    !characterIds.has(character.id) ||
                    (character.groupId !== null && !groupIds.has(character.groupId)),
            )
        ) {
            return false
        }

        const now = Date.now()
        this.sqlite.transaction(() => {
            for (const group of input.groups) {
                this.db
                    .update(characterGroups)
                    .set({ sortOrder: group.sortOrder, updatedAt: now })
                    .where(eq(characterGroups.id, group.id))
                    .run()
            }
            for (const character of input.characters) {
                this.db
                    .update(characters)
                    .set({
                        groupId: character.groupId,
                        sortOrder: character.sortOrder,
                    })
                    .where(eq(characters.id, character.id))
                    .run()
            }
        })()
        return true
    }

    getCharacter(id: string): CharacterRecord | null {
        const row = this.db.select().from(characters).where(eq(characters.id, id)).get()
        return row ? this.mapCharacter(row, true) : null
    }

    updateCharacter(id: string, update: CharacterUpdate): CharacterRecord | null {
        if (id === GENERAL_CHAT_CHARACTER_ID) return null
        const current = this.getCharacter(id)
        if (!current) return null
        const patch: Partial<typeof characters.$inferInsert> = { updatedAt: Date.now() }
        if (update.name !== undefined) patch.name = update.name
        if (update.description !== undefined) patch.description = update.description
        if (update.personality !== undefined) patch.personality = update.personality
        if (update.scenario !== undefined) patch.scenario = update.scenario
        if (update.firstMessage !== undefined) patch.firstMessage = update.firstMessage
        if (update.alternateGreetings !== undefined)
            patch.alternateGreetingsJson = update.alternateGreetings
        if (update.exampleMessage !== undefined) patch.exampleMessage = update.exampleMessage
        if (update.systemPrompt !== undefined) patch.systemPrompt = update.systemPrompt
        if (update.postHistoryInstructions !== undefined)
            patch.postHistoryInstructions = update.postHistoryInstructions
        if (update.creator !== undefined) patch.creator = update.creator
        if (update.characterVersion !== undefined) patch.characterVersion = update.characterVersion
        if (update.tags !== undefined) patch.tagsJson = update.tags
        if (update.regexScripts !== undefined) patch.regexScriptsJson = update.regexScripts
        if (update.moduleReferences !== undefined)
            patch.moduleReferencesJson = update.moduleReferences
        if (update.defaultVariables !== undefined)
            patch.defaultVariablesJson = update.defaultVariables
        if (update.luaScript !== undefined)
            Object.assign(patch, updateLuaColumns(current.luaScript, update.luaScript))
        if (update.loreSettings !== undefined) patch.loreSettingsJson = update.loreSettings
        this.sqlite.transaction(() => {
            this.db.update(characters).set(patch).where(eq(characters.id, id)).run()
            if (update.lorebook !== undefined) {
                const extensions = new Map(
                    this.db
                        .select({
                            id: characterLoreEntries.id,
                            value: characterLoreEntries.extensionsJson,
                        })
                        .from(characterLoreEntries)
                        .where(eq(characterLoreEntries.characterId, id))
                        .all()
                        .map((entry) => [entry.id, entry.value]),
                )
                this.db
                    .delete(characterLoreEntries)
                    .where(eq(characterLoreEntries.characterId, id))
                    .run()
                if (update.lorebook.length) {
                    this.db
                        .insert(characterLoreEntries)
                        .values(
                            update.lorebook.map((entry) => ({
                                id: entry.id,
                                characterId: id,
                                keysJson: entry.keys,
                                secondaryKeysJson: entry.secondaryKeys,
                                content: entry.content,
                                enabled: entry.enabled,
                                constant: entry.constant,
                                selective: entry.selective,
                                caseSensitive: entry.caseSensitive,
                                useRegex: entry.useRegex,
                                insertionOrder: entry.insertionOrder,
                                priority: entry.priority,
                                name: entry.name,
                                extensionsJson: {
                                    ...extensions.get(entry.id),
                                    ...loreExtensions(entry),
                                },
                            })),
                        )
                        .run()
                }
            }
        })()
        return this.getCharacter(id)
    }

    archiveCharacter(id: string): boolean {
        if (id === GENERAL_CHAT_CHARACTER_ID) return false
        if (!this.getCharacter(id)) return false
        this.db
            .update(characters)
            .set({ archivedAt: Date.now(), updatedAt: Date.now() })
            .where(eq(characters.id, id))
            .run()
        return true
    }

    deleteCharacter(id: string): boolean {
        if (id === GENERAL_CHAT_CHARACTER_ID) return false
        if (!this.getCharacter(id)) return false
        this.db.transaction((tx) => {
            tx.delete(conversations).where(eq(conversations.characterId, id)).run()
            tx.delete(characters).where(eq(characters.id, id)).run()
        })
        return true
    }

    restoreCharacter(id: string): boolean {
        const character = this.getCharacter(id)
        if (!character) return false
        this.db
            .update(characters)
            .set({ archivedAt: null, updatedAt: Date.now() })
            .where(eq(characters.id, id))
            .run()
        return true
    }

    setCharacterAvatar(id: string, assetId: string | null): CharacterRecord | null {
        if (id === GENERAL_CHAT_CHARACTER_ID) return null
        if (!this.getCharacter(id)) return null
        this.db
            .update(characters)
            .set({ avatarAssetId: assetId, updatedAt: Date.now() })
            .where(eq(characters.id, id))
            .run()
        return this.getCharacter(id)
    }

    getCharacterAssetLinks(characterId: string) {
        return this.db
            .select()
            .from(characterAssets)
            .where(eq(characterAssets.characterId, characterId))
            .all()
    }

    private mapCharacter(
        row: typeof characters.$inferSelect,
        includeLore: boolean,
    ): CharacterRecord {
        const lorebook = includeLore
            ? this.db
                  .select()
                  .from(characterLoreEntries)
                  .where(eq(characterLoreEntries.characterId, row.id))
                  .orderBy(asc(characterLoreEntries.insertionOrder))
                  .all()
                  .map((entry) => {
                      const extensions = entry.extensionsJson
                      return {
                          id: entry.id,
                          keys: entry.keysJson,
                          secondaryKeys: entry.secondaryKeysJson,
                          content: entry.content,
                          enabled: entry.enabled,
                          constant: entry.constant,
                          selective: entry.selective,
                          caseSensitive: entry.caseSensitive,
                          useRegex: entry.useRegex,
                          insertionOrder: entry.insertionOrder,
                          priority: entry.priority,
                          name: entry.name,
                          ...loreFieldsFromExtensions(extensions),
                      }
                  })
            : undefined
        return {
            id: row.id,
            name: row.name,
            description: row.description,
            personality: row.personality,
            scenario: row.scenario,
            firstMessage: row.firstMessage,
            alternateGreetings: row.alternateGreetingsJson,
            exampleMessage: row.exampleMessage,
            systemPrompt: row.systemPrompt,
            postHistoryInstructions: row.postHistoryInstructions,
            creator: row.creator,
            characterVersion: row.characterVersion,
            tags: row.tagsJson,
            avatarAssetId: row.avatarAssetId,
            sourceSpec: row.sourceSpec,
            archivedAt: iso(row.archivedAt),
            groupId: row.groupId,
            sortOrder: row.sortOrder,
            lorebook,
            sourceExtensions: row.sourceExtensionsJson,
            sourceCard: row.sourceCardJson,
            loreSettings: row.loreSettingsJson,
            regexScripts: row.regexScriptsJson,
            moduleReferences: row.moduleReferencesJson,
            defaultVariables: row.defaultVariablesJson,
            luaScript: mapLuaScript(row),
            luaRawTriggers: row.luaRawTriggerJson,
            createdAt: iso(row.createdAt),
            updatedAt: iso(row.updatedAt),
        }
    }

    private nextCharacterRootOrder(): number {
        const itemMax = this.db
            .select({ value: max(characters.sortOrder) })
            .from(characters)
            .where(isNull(characters.groupId))
            .get()?.value
        const groupMax = this.db
            .select({ value: max(characterGroups.sortOrder) })
            .from(characterGroups)
            .get()?.value
        return Math.max(itemMax ?? -1, groupMax ?? -1) + 1
    }
}

function mapCharacterGroup(row: typeof characterGroups.$inferSelect): CharacterGroup {
    return {
        id: row.id,
        name: row.name,
        sortOrder: row.sortOrder,
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
    }
}

export function loreFieldsFromExtensions(extensions: Record<string, unknown>) {
    return {
        position: stringValue(extensions.malang_position),
        depth: numberValue(extensions.malang_depth, 0),
        role: modelRole(extensions.malang_role),
        scanDepth: optionalNumber(extensions.malang_scan_depth),
        recursive: recursiveValue(extensions.malang_recursive),
        probability: numberValue(extensions.malang_probability, 100),
        additionalKeys: stringArray(extensions.malang_additional_keys),
        excludeKeys: stringArray(extensions.malang_exclude_keys),
        fullWordMatching:
            typeof extensions.malang_full_word_matching === 'boolean'
                ? extensions.malang_full_word_matching
                : undefined,
        decorators: isRecord(extensions.malang_decorators) ? extensions.malang_decorators : {},
        group: optionalString(extensions.malang_group),
        isGroup:
            typeof extensions.malang_is_group === 'boolean' ? extensions.malang_is_group : false,
    }
}

function loreExtensions(entry: Omit<LoreEntry, 'id'> & { extensions?: Record<string, unknown> }) {
    return {
        ...entry.extensions,
        malang_position: entry.position,
        malang_depth: entry.depth,
        malang_role: entry.role,
        malang_scan_depth: entry.scanDepth,
        malang_recursive: entry.recursive,
        malang_probability: entry.probability,
        malang_additional_keys: entry.additionalKeys,
        malang_exclude_keys: entry.excludeKeys,
        malang_full_word_matching: entry.fullWordMatching,
        malang_decorators: entry.decorators,
        malang_group: entry.group,
        malang_is_group: entry.isGroup,
    }
}

function stringValue(value: unknown): string {
    return typeof value === 'string' ? value : ''
}

function numberValue(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function optionalNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function optionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length ? value : undefined
}

function stringArray(value: unknown): string[] {
    return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string')
        : []
}

function modelRole(value: unknown): 'user' | 'assistant' | 'system' {
    return value === 'user' || value === 'assistant' ? value : 'system'
}

function recursiveValue(value: unknown): 'global' | 'enabled' | 'disabled' {
    return value === 'enabled' || value === 'disabled' ? value : 'global'
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}
