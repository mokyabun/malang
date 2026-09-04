import type { ConversationGroup } from '@malang/shared'
import { asc, eq } from 'drizzle-orm'

import type { DatabaseHandle } from '../db'
import { conversationGroups } from '../schema'
import { RepositoryBase } from './base'
import { CharacterRepository } from './characters'
import { ConversationOrganizationRepository } from './conversation-organization'
import { mapConversationGroup } from './conversation-records'

export class ConversationGroupRepository extends RepositoryBase {
    constructor(
        handle: DatabaseHandle,
        private readonly character: CharacterRepository,
        private readonly organization: ConversationOrganizationRepository,
    ) {
        super(handle)
    }

    list(characterId?: string): ConversationGroup[] {
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

    create(characterId: string, name: string): ConversationGroup | null {
        if (!this.character.get(characterId)) return null
        const now = Date.now()
        const id = crypto.randomUUID()
        this.db
            .insert(conversationGroups)
            .values({
                id,
                characterId,
                name,
                sortOrder: this.organization.nextRootOrder(characterId),
                createdAt: now,
                updatedAt: now,
            })
            .run()
        return this.list(characterId).find((group) => group.id === id) ?? null
    }

    update(id: string, name: string): ConversationGroup | null {
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
        return this.list(existing.characterId).find((group) => group.id === id) ?? null
    }

    delete(id: string): boolean {
        const existing = this.db
            .select({ id: conversationGroups.id })
            .from(conversationGroups)
            .where(eq(conversationGroups.id, id))
            .get()
        if (!existing) return false
        this.db.delete(conversationGroups).where(eq(conversationGroups.id, id)).run()
        return true
    }
}
