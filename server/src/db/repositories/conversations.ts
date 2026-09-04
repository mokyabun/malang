import type { Conversation, ConversationCreate } from '@malang/shared'
import { and, asc, desc, eq, isNull } from 'drizzle-orm'

import type { DatabaseHandle } from '../db'
import { conversations, messages } from '../schema'
import { RepositoryBase, requireValue } from './base'
import { CharacterRepository } from './characters'
import { ConversationOrganizationRepository } from './conversation-organization'
import { mapConversation } from './conversation-records'
import { MessageRepository } from './messages'
import { PromptPresetRepository } from './prompt-presets'
import { SettingsRepository } from './settings'

export class ConversationRepository extends RepositoryBase {
    constructor(
        handle: DatabaseHandle,
        private readonly settings: SettingsRepository,
        private readonly promptPreset: PromptPresetRepository,
        private readonly character: CharacterRepository,
        private readonly message: MessageRepository,
        private readonly organization: ConversationOrganizationRepository,
    ) {
        super(handle)
    }

    create(input: ConversationCreate): Conversation {
        const character = this.character.get(input.characterId)
        if (!character) throw new Error('Character not found')
        const prompt = input.promptPresetId
            ? this.promptPreset.get(input.promptPresetId)
            : this.promptPreset.ensureDefault()
        if (!prompt) throw new Error('Prompt preset not found')
        const id = crypto.randomUUID()
        const now = new Date()
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
                variablesJson: {},
                authorNote: '',
                boundPersonaId: null,
                personaLocked: false,
                groupId: null,
                sortOrder: this.organization.nextRootOrder(character.id),
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
        if (greeting) this.message.create(id, 'assistant', greeting, 'complete')
        return requireValue(this.get(id), 'Failed to create conversation')
    }

    list(includeArchived = false): Conversation[] {
        const query = this.db
            .select()
            .from(conversations)
            .orderBy(asc(conversations.sortOrder), desc(conversations.updatedAt))
        const rows = includeArchived
            ? query.all()
            : query.where(isNull(conversations.archivedAt)).all()
        return rows.map(mapConversation)
    }

    get(id: string): Conversation | null {
        const row = this.db.select().from(conversations).where(eq(conversations.id, id)).get()
        return row ? mapConversation(row) : null
    }

    update(
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
                | 'authorNote'
                | 'boundPersonaId'
                | 'personaLocked'
            >
        >,
    ): Conversation | null {
        const current = this.get(id)
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
                variablesJson: update.variables ?? current.variables,
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
            })
            .where(eq(conversations.id, id))
            .run()
        return this.get(id)
    }

    archive(id: string): boolean {
        if (!this.get(id)) return false
        this.db
            .update(conversations)
            .set({ archivedAt: new Date() })
            .where(eq(conversations.id, id))
            .run()
        return true
    }

    delete(id: string): boolean {
        if (!this.get(id)) return false
        this.db.delete(conversations).where(eq(conversations.id, id)).run()
        return true
    }

    restore(id: string): boolean {
        if (!this.get(id)) return false
        this.db
            .update(conversations)
            .set({ archivedAt: null })
            .where(eq(conversations.id, id))
            .run()
        return true
    }

    updateGreeting(id: string, greetingIndex: number, greeting: string) {
        const conversation = this.get(id)
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
                .set({ greetingIndex })
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
                    .set({ content: greeting })
                    .where(eq(messages.id, first.id))
                    .run()
            } else if (greeting) {
                this.message.create(id, 'assistant', greeting, 'complete')
            }
        })()
        return this.get(id)
    }

    effectivePromptPresetId(conversation: Conversation): string {
        if (conversation.promptPresetLocked) return conversation.promptPresetId
        return this.settings.get().defaultPromptPresetId ?? conversation.promptPresetId
    }
}
