import type { Persona, PersonaCreate, PersonaUpdate } from '@malang/shared'
import { asc, eq } from 'drizzle-orm'

import type { DatabaseHandle } from '../db'
import { conversations, personas } from '../schema'
import { iso, RepositoryBase } from './base'
import { SettingsRepository } from './settings'

export class PersonaRepository extends RepositoryBase {
    constructor(
        handle: DatabaseHandle,
        private readonly settings: SettingsRepository,
    ) {
        super(handle)
    }

    ensurePersonaBootstrap(): void {
        const existing = this.db.select({ id: personas.id }).from(personas).limit(1).get()
        if (existing) return
        const settings = this.settings.getSettings()
        if (!settings.persona.trim()) return
        const persona = this.createPersona({
            name: settings.userName,
            description: settings.persona,
            note: '',
        })
        this.settings.updateSettings({ selectedPersonaId: persona.id })
    }

    listPersonas(): Persona[] {
        return this.db
            .select()
            .from(personas)
            .orderBy(asc(personas.createdAt))
            .all()
            .map(mapPersona)
    }

    getPersona(id: string): Persona | null {
        const row = this.db.select().from(personas).where(eq(personas.id, id)).get()
        return row ? mapPersona(row) : null
    }

    createPersona(input: PersonaCreate): Persona {
        const now = Date.now()
        const row = {
            id: crypto.randomUUID(),
            name: input.name,
            description: input.description,
            note: input.note,
            avatarAssetId: null,
            createdAt: now,
            updatedAt: now,
        }
        this.db.insert(personas).values(row).run()
        return mapPersona(row)
    }

    updatePersona(id: string, update: PersonaUpdate): Persona | null {
        const current = this.getPersona(id)
        if (!current) return null
        this.db
            .update(personas)
            .set({
                name: update.name ?? current.name,
                description: update.description ?? current.description,
                note: update.note ?? current.note,
                updatedAt: Date.now(),
            })
            .where(eq(personas.id, id))
            .run()
        return this.getPersona(id)
    }

    deletePersona(id: string): boolean {
        if (!this.getPersona(id)) return false
        this.db
            .update(conversations)
            .set({ personaLocked: false, updatedAt: Date.now() })
            .where(eq(conversations.boundPersonaId, id))
            .run()
        this.db.delete(personas).where(eq(personas.id, id)).run()
        return true
    }

    setPersonaAvatar(id: string, assetId: string | null): Persona | null {
        const current = this.getPersona(id)
        if (!current) return null
        this.db
            .update(personas)
            .set({ avatarAssetId: assetId, updatedAt: Date.now() })
            .where(eq(personas.id, id))
            .run()
        return this.getPersona(id)
    }
}

function mapPersona(row: typeof personas.$inferSelect): Persona {
    return {
        id: row.id,
        name: row.name,
        description: row.description,
        note: row.note,
        avatarAssetId: row.avatarAssetId,
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
    }
}
