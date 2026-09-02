import type {
    Conversation,
    ConversationCreate,
    ConversationGroup,
    ConversationOrganization,
    Message,
    PromptModule,
} from '@malang/shared'
import { and, asc, desc, eq, isNull, max, sql } from 'drizzle-orm'

import type { DatabaseHandle } from '../db'
import { conversationGroups, conversationModules, conversations, messages } from '../schema'
import { iso, normalizeToggleValues, parseJson, RepositoryBase, requireValue } from './base'
import { CharacterRepository } from './characters'
import { PromptRepository } from './prompts'
import { SettingsRepository } from './settings'

export class ConversationRepository extends RepositoryBase {
    constructor(
        handle: DatabaseHandle,
        private readonly settings: SettingsRepository,
        private readonly prompts: PromptRepository,
        private readonly characters: CharacterRepository,
    ) {
        super(handle)
    }

    listConversationModuleStates(conversationId: string) {
        const conversation = this.getConversation(conversationId)
        if (!conversation) return []
        const overrides = new Map(
            this.db
                .select()
                .from(conversationModules)
                .where(eq(conversationModules.conversationId, conversationId))
                .all()
                .map((row) => [row.moduleId, row.enabled]),
        )
        const preset = this.prompts.getPromptPreset(this.effectivePromptPresetId(conversation))
        const character = this.characters.getCharacter(conversation.characterId)
        const integrations = new Set(preset?.moduleIntegrations || [])
        const characterModules = new Set(character?.moduleReferences || [])
        return this.prompts.listPromptModules().map((module) => {
            const presetActive = integrations.has(module.id) || integrations.has(module.namespace)
            const characterActive =
                characterModules.has(module.id) || characterModules.has(module.sourceId)
            const explicit = overrides.get(module.id)
            const enabled = explicit ?? (presetActive || characterActive || module.enabledByDefault)
            const activationSource =
                explicit !== undefined
                    ? 'conversation'
                    : presetActive
                      ? 'preset'
                      : characterActive
                        ? 'character'
                        : 'default'
            return {
                module,
                enabled,
                inherited: explicit === undefined,
                activationSource,
            } as const
        })
    }

    listActivePromptModules(conversationId: string): PromptModule[] {
        return this.listConversationModuleStates(conversationId)
            .filter((state) => state.enabled)
            .map((state) => state.module)
    }

    setConversationModule(conversationId: string, moduleId: string, enabled: boolean): void {
        this.db
            .insert(conversationModules)
            .values({ conversationId, moduleId, enabled })
            .onConflictDoUpdate({
                target: [conversationModules.conversationId, conversationModules.moduleId],
                set: { enabled },
            })
            .run()
        this.bumpDisplayEpoch(conversationId)
    }

    resetConversationModule(conversationId: string, moduleId: string): void {
        this.db
            .delete(conversationModules)
            .where(
                and(
                    eq(conversationModules.conversationId, conversationId),
                    eq(conversationModules.moduleId, moduleId),
                ),
            )
            .run()
        this.bumpDisplayEpoch(conversationId)
    }

    createConversation(input: ConversationCreate): Conversation {
        const character = this.characters.getCharacter(input.characterId)
        if (!character) throw new Error('Character not found')
        const prompt = input.promptPresetId
            ? this.prompts.getPromptPreset(input.promptPresetId)
            : this.prompts.ensureDefaultPrompt()
        if (!prompt) throw new Error('Prompt preset not found')
        const id = crypto.randomUUID()
        const now = Date.now()
        const defaultTitle = `Chat ${
            this.db
                .select({ id: conversations.id })
                .from(conversations)
                .where(eq(conversations.characterId, character.id))
                .all().length + 1
        }`
        this.db
            .insert(conversations)
            .values({
                id,
                characterId: character.id,
                promptPresetId: prompt.id,
                promptPresetLocked: false,
                modelPresetId: input.modelPresetId ?? null,
                auxiliaryModelPresetId: input.auxiliaryModelPresetId ?? null,
                modelChainPresetId: input.modelChainPresetId ?? null,
                title: input.title || defaultTitle,
                greetingIndex: input.greetingIndex,
                variablesJson: '{}',
                togglesJson: '{}',
                authorNote: '',
                boundPersonaId: null,
                personaLocked: false,
                groupId: null,
                sortOrder: this.nextConversationRootOrder(character.id),
                archivedAt: null,
                displayEpoch: 0,
                createdAt: now,
                updatedAt: now,
            })
            .run()
        const greeting =
            input.greetingIndex >= 0
                ? character.alternateGreetings[input.greetingIndex]
                : character.firstMessage
        if (greeting) this.createMessage(id, 'assistant', greeting, 'complete')
        return requireValue(this.getConversation(id), 'Failed to create conversation')
    }

    listConversations(includeArchived = false): Conversation[] {
        const query = this.db
            .select()
            .from(conversations)
            .orderBy(asc(conversations.sortOrder), desc(conversations.updatedAt))
        const rows = includeArchived
            ? query.all()
            : query.where(isNull(conversations.archivedAt)).all()
        return rows.map(mapConversation)
    }

    listConversationGroups(characterId?: string): ConversationGroup[] {
        const base = this.db.select().from(conversationGroups)
        const rows = characterId
            ? base
                  .where(eq(conversationGroups.characterId, characterId))
                  .orderBy(asc(conversationGroups.sortOrder), asc(conversationGroups.createdAt))
                  .all()
            : base
                  .orderBy(
                      asc(conversationGroups.characterId),
                      asc(conversationGroups.sortOrder),
                      asc(conversationGroups.createdAt),
                  )
                  .all()
        return rows.map(mapConversationGroup)
    }

    createConversationGroup(characterId: string, name: string): ConversationGroup | null {
        if (!this.characters.getCharacter(characterId)) return null
        const now = Date.now()
        const id = crypto.randomUUID()
        this.db
            .insert(conversationGroups)
            .values({
                id,
                characterId,
                name,
                sortOrder: this.nextConversationRootOrder(characterId),
                createdAt: now,
                updatedAt: now,
            })
            .run()
        return this.listConversationGroups(characterId).find((group) => group.id === id) ?? null
    }

    updateConversationGroup(id: string, name: string): ConversationGroup | null {
        const existing = this.db
            .select()
            .from(conversationGroups)
            .where(eq(conversationGroups.id, id))
            .get()
        if (!existing) return null
        this.db
            .update(conversationGroups)
            .set({ name, updatedAt: Date.now() })
            .where(eq(conversationGroups.id, id))
            .run()
        return (
            this.listConversationGroups(existing.characterId).find((group) => group.id === id) ??
            null
        )
    }

    deleteConversationGroup(id: string): boolean {
        const existing = this.db
            .select({ id: conversationGroups.id })
            .from(conversationGroups)
            .where(eq(conversationGroups.id, id))
            .get()
        if (!existing) return false
        this.db.delete(conversationGroups).where(eq(conversationGroups.id, id)).run()
        return true
    }

    organizeConversations(input: ConversationOrganization): boolean {
        const groups = this.listConversationGroups(input.characterId)
        const groupIds = new Set(groups.map((group) => group.id))
        const conversationIds = new Set(
            this.db
                .select({ id: conversations.id })
                .from(conversations)
                .where(eq(conversations.characterId, input.characterId))
                .all()
                .map((conversation) => conversation.id),
        )
        if (
            input.groups.some((group) => !groupIds.has(group.id)) ||
            input.conversations.some(
                (conversation) =>
                    !conversationIds.has(conversation.id) ||
                    (conversation.groupId !== null && !groupIds.has(conversation.groupId)),
            )
        ) {
            return false
        }

        const now = Date.now()
        this.sqlite.transaction(() => {
            for (const group of input.groups) {
                this.db
                    .update(conversationGroups)
                    .set({ sortOrder: group.sortOrder, updatedAt: now })
                    .where(eq(conversationGroups.id, group.id))
                    .run()
            }
            for (const conversation of input.conversations) {
                this.db
                    .update(conversations)
                    .set({
                        groupId: conversation.groupId,
                        sortOrder: conversation.sortOrder,
                    })
                    .where(eq(conversations.id, conversation.id))
                    .run()
            }
        })()
        return true
    }

    getConversation(id: string): Conversation | null {
        const row = this.db.select().from(conversations).where(eq(conversations.id, id)).get()
        return row ? mapConversation(row) : null
    }

    updateConversation(
        id: string,
        update: Partial<
            Pick<
                Conversation,
                | 'title'
                | 'promptPresetId'
                | 'promptPresetLocked'
                | 'modelPresetId'
                | 'auxiliaryModelPresetId'
                | 'modelChainPresetId'
                | 'variables'
                | 'toggles'
                | 'authorNote'
                | 'boundPersonaId'
                | 'personaLocked'
            >
        >,
    ): Conversation | null {
        const current = this.getConversation(id)
        if (!current) return null
        this.db
            .update(conversations)
            .set({
                title: update.title ?? current.title,
                promptPresetId: update.promptPresetId ?? current.promptPresetId,
                promptPresetLocked: update.promptPresetLocked ?? current.promptPresetLocked,
                modelPresetId:
                    update.modelPresetId === undefined
                        ? current.modelPresetId
                        : update.modelPresetId,
                auxiliaryModelPresetId:
                    update.auxiliaryModelPresetId === undefined
                        ? current.auxiliaryModelPresetId
                        : update.auxiliaryModelPresetId,
                modelChainPresetId:
                    update.modelChainPresetId === undefined
                        ? current.modelChainPresetId
                        : update.modelChainPresetId,
                variablesJson: JSON.stringify(update.variables ?? current.variables),
                togglesJson: JSON.stringify(update.toggles ?? current.toggles),
                authorNote: update.authorNote ?? current.authorNote,
                boundPersonaId:
                    update.boundPersonaId === undefined
                        ? current.boundPersonaId
                        : update.boundPersonaId,
                personaLocked: update.personaLocked ?? current.personaLocked,
                displayEpoch:
                    update.variables === undefined &&
                    update.promptPresetId === undefined &&
                    update.promptPresetLocked === undefined &&
                    update.boundPersonaId === undefined &&
                    update.personaLocked === undefined
                        ? current.displayEpoch
                        : current.displayEpoch + 1,
                updatedAt: Date.now(),
            })
            .where(eq(conversations.id, id))
            .run()
        return this.getConversation(id)
    }

    archiveConversation(id: string): boolean {
        if (!this.getConversation(id)) return false
        this.db
            .update(conversations)
            .set({ archivedAt: Date.now(), updatedAt: Date.now() })
            .where(eq(conversations.id, id))
            .run()
        return true
    }

    deleteConversation(id: string): boolean {
        if (!this.getConversation(id)) return false
        this.db.delete(conversations).where(eq(conversations.id, id)).run()
        return true
    }

    restoreConversation(id: string): boolean {
        if (!this.getConversation(id)) return false
        this.db
            .update(conversations)
            .set({ archivedAt: null, updatedAt: Date.now() })
            .where(eq(conversations.id, id))
            .run()
        return true
    }

    updateConversationGreeting(id: string, greetingIndex: number, greeting: string) {
        const conversation = this.getConversation(id)
        if (!conversation) return null
        const hasUserMessage = this.db
            .select({ id: messages.id })
            .from(messages)
            .where(and(eq(messages.conversationId, id), eq(messages.role, 'user')))
            .limit(1)
            .get()
        if (hasUserMessage) return null
        this.sqlite.transaction(() => {
            this.db
                .update(conversations)
                .set({ greetingIndex, updatedAt: Date.now() })
                .where(eq(conversations.id, id))
                .run()
            const first = this.db
                .select()
                .from(messages)
                .where(and(eq(messages.conversationId, id), eq(messages.role, 'assistant')))
                .orderBy(asc(messages.position))
                .limit(1)
                .get()
            if (first) {
                this.db
                    .update(messages)
                    .set({ content: greeting, updatedAt: Date.now() })
                    .where(eq(messages.id, first.id))
                    .run()
            } else if (greeting) {
                this.createMessage(id, 'assistant', greeting, 'complete')
            }
        })()
        return this.getConversation(id)
    }

    listMessages(conversationId: string): Message[] {
        return this.db
            .select()
            .from(messages)
            .where(eq(messages.conversationId, conversationId))
            .orderBy(asc(messages.position))
            .all()
            .map(mapMessage)
    }

    getMessage(id: string): Message | null {
        const row = this.db.select().from(messages).where(eq(messages.id, id)).get()
        return row ? mapMessage(row) : null
    }

    createMessage(
        conversationId: string,
        role: Message['role'],
        content: string,
        status: Message['status'],
    ): Message {
        const result = this.db
            .select({ value: max(messages.position) })
            .from(messages)
            .where(eq(messages.conversationId, conversationId))
            .get()
        const now = Date.now()
        const row = {
            id: crypto.randomUUID(),
            conversationId,
            role,
            content,
            position: (result?.value ?? -1) + 1,
            status,
            createdAt: now,
            updatedAt: now,
        }
        this.db.insert(messages).values(row).run()
        this.db
            .update(conversations)
            .set({ updatedAt: now, displayEpoch: sql`${conversations.displayEpoch} + 1` })
            .where(eq(conversations.id, conversationId))
            .run()
        return mapMessage(row)
    }

    updateMessage(
        id: string,
        update: { content?: string; status?: Message['status'] },
    ): Message | null {
        const current = this.db.select().from(messages).where(eq(messages.id, id)).get()
        if (!current) return null
        this.db
            .update(messages)
            .set({
                content: update.content ?? current.content,
                status: update.status ?? current.status,
                updatedAt: Date.now(),
            })
            .where(eq(messages.id, id))
            .run()
        this.bumpDisplayEpoch(current.conversationId)
        return mapMessage(
            requireValue(
                this.db.select().from(messages).where(eq(messages.id, id)).get(),
                'Failed to update message',
            ),
        )
    }

    truncateMessages(conversationId: string, position: number): number {
        const { count } = this.sqlite
            .query(
                'SELECT COUNT(*) as count FROM messages WHERE conversation_id = ? AND position >= ?',
            )
            .get(conversationId, position) as { count: number }
        this.sqlite
            .query('DELETE FROM messages WHERE conversation_id = ? AND position >= ?')
            .run(conversationId, position)
        if (count) this.bumpDisplayEpoch(conversationId)
        return count
    }

    replaceConversationMessages(
        conversationId: string,
        next: Array<{
            id?: string
            role: Message['role']
            content: string
            status?: Message['status']
        }>,
    ): Message[] {
        const now = Date.now()
        const existing = new Map(
            this.listMessages(conversationId).map((message) => [message.id, message]),
        )
        const rows = next.map((message, position) => ({
            id: message.id && existing.has(message.id) ? message.id : crypto.randomUUID(),
            conversationId,
            role: message.role,
            content: message.content ?? '',
            position,
            status: message.status ?? 'complete',
            createdAt:
                message.id && existing.get(message.id)?.createdAt
                    ? Date.parse(existing.get(message.id)!.createdAt)
                    : now,
            updatedAt: now,
        }))
        this.sqlite.transaction(() => {
            this.sqlite
                .query(
                    'UPDATE messages SET position = position + 1000000 WHERE conversation_id = ?',
                )
                .run(conversationId)
            const keep = new Set(rows.map((row) => row.id))
            for (const current of existing.values()) {
                if (!keep.has(current.id))
                    this.db.delete(messages).where(eq(messages.id, current.id)).run()
            }
            for (const row of rows) {
                if (existing.has(row.id)) {
                    this.db
                        .update(messages)
                        .set({
                            role: row.role,
                            content: row.content,
                            position: row.position,
                            status: row.status,
                            updatedAt: now,
                        })
                        .where(eq(messages.id, row.id))
                        .run()
                } else {
                    this.db.insert(messages).values(row).run()
                }
            }
            this.bumpDisplayEpoch(conversationId)
        })()
        return this.listMessages(conversationId)
    }

    deleteMessage(id: string): void {
        const current = this.db.select().from(messages).where(eq(messages.id, id)).get()
        this.db.delete(messages).where(eq(messages.id, id)).run()
        if (current) this.bumpDisplayEpoch(current.conversationId)
    }

    getLastAssistantMessage(conversationId: string): Message | null {
        const row = this.db
            .select()
            .from(messages)
            .where(and(eq(messages.conversationId, conversationId), eq(messages.role, 'assistant')))
            .orderBy(desc(messages.position))
            .limit(1)
            .get()
        return row ? mapMessage(row) : null
    }

    private nextConversationRootOrder(characterId: string): number {
        const itemMax = this.db
            .select({ value: max(conversations.sortOrder) })
            .from(conversations)
            .where(and(eq(conversations.characterId, characterId), isNull(conversations.groupId)))
            .get()?.value
        const groupMax = this.db
            .select({ value: max(conversationGroups.sortOrder) })
            .from(conversationGroups)
            .where(eq(conversationGroups.characterId, characterId))
            .get()?.value
        return Math.max(itemMax ?? -1, groupMax ?? -1) + 1
    }

    bumpDisplayEpoch(conversationId: string): void {
        this.db
            .update(conversations)
            .set({ displayEpoch: sql`${conversations.displayEpoch} + 1`, updatedAt: Date.now() })
            .where(eq(conversations.id, conversationId))
            .run()
    }

    effectivePromptPresetId(conversation: Conversation): string {
        if (conversation.promptPresetLocked) return conversation.promptPresetId
        return this.settings.getSettings().defaultPromptPresetId ?? conversation.promptPresetId
    }
}

function mapConversation(row: typeof conversations.$inferSelect): Conversation {
    return {
        id: row.id,
        characterId: row.characterId,
        promptPresetId: row.promptPresetId,
        promptPresetLocked: row.promptPresetLocked,
        modelPresetId: row.modelPresetId,
        auxiliaryModelPresetId: row.auxiliaryModelPresetId,
        modelChainPresetId: row.modelChainPresetId,
        title: row.title,
        greetingIndex: row.greetingIndex,
        variables: parseJson(row.variablesJson, {}),
        toggles: normalizeToggleValues(parseJson(row.togglesJson, {})),
        authorNote: row.authorNote,
        boundPersonaId: row.boundPersonaId,
        personaLocked: row.personaLocked,
        archivedAt: iso(row.archivedAt),
        groupId: row.groupId,
        sortOrder: row.sortOrder,
        displayEpoch: row.displayEpoch,
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
    }
}

function mapConversationGroup(row: typeof conversationGroups.$inferSelect): ConversationGroup {
    return {
        id: row.id,
        characterId: row.characterId,
        name: row.name,
        sortOrder: row.sortOrder,
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
    }
}

function mapMessage(row: typeof messages.$inferSelect): Message {
    return {
        id: row.id,
        conversationId: row.conversationId,
        role: row.role,
        content: row.content,
        position: row.position,
        status: row.status,
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
    }
}
