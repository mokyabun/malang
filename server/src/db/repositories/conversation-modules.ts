import type { PromptModule } from '@malang/shared'
import { and, eq } from 'drizzle-orm'

import type { DatabaseHandle } from '../db'
import { conversationModules, conversations } from '../schema'
import { RepositoryBase } from './base'
import { CharacterRepository } from './characters'
import { mapConversation } from './conversation-records'
import { MessageRepository } from './messages'
import { PromptModuleRepository } from './prompt-modules'
import { PromptPresetRepository } from './prompt-presets'
import { SettingsRepository } from './settings'

export class ConversationModuleRepository extends RepositoryBase {
    constructor(
        handle: DatabaseHandle,
        private readonly settings: SettingsRepository,
        private readonly promptPreset: PromptPresetRepository,
        private readonly promptModule: PromptModuleRepository,
        private readonly character: CharacterRepository,
        private readonly message: MessageRepository,
    ) {
        super(handle)
    }

    list(conversationId: string) {
        const row = this.db
            .select()
            .from(conversations)
            .where(eq(conversations.id, conversationId))
            .get()
        if (!row) return []
        const conversation = mapConversation(row)
        const overrides = new Map(
            this.db
                .select()
                .from(conversationModules)
                .where(eq(conversationModules.conversationId, conversationId))
                .all()
                .map((item) => [item.moduleId, item.enabled]),
        )
        const presetId = conversation.promptPresetLocked
            ? conversation.promptPresetId
            : (this.settings.get().defaultPromptPresetId ?? conversation.promptPresetId)
        const preset = this.promptPreset.get(presetId)
        const character = this.character.get(conversation.characterId)
        const integrations = new Set(preset?.moduleIntegrations || [])
        const characterModules = new Set(character?.moduleReferences || [])
        return this.promptModule.list().map((module) => {
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
            return { module, enabled, inherited: explicit === undefined, activationSource } as const
        })
    }

    listActive(conversationId: string): PromptModule[] {
        return this.list(conversationId)
            .filter((state) => state.enabled)
            .map((state) => state.module)
    }

    set(conversationId: string, moduleId: string, enabled: boolean): void {
        this.db
            .insert(conversationModules)
            .values({ conversationId, moduleId, enabled })
            .onConflictDoUpdate({
                target: [conversationModules.conversationId, conversationModules.moduleId],
                set: { enabled },
            })
            .run()
        this.message.bumpDisplayEpoch(conversationId)
    }

    reset(conversationId: string, moduleId: string): void {
        this.db
            .delete(conversationModules)
            .where(
                and(
                    eq(conversationModules.conversationId, conversationId),
                    eq(conversationModules.moduleId, moduleId),
                ),
            )
            .run()
        this.message.bumpDisplayEpoch(conversationId)
    }
}
