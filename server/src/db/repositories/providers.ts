import type { ModelPreset, ModelPresetInput, ProviderConfig } from '@malang/shared'
import { asc, eq, max } from 'drizzle-orm'

import type { DatabaseHandle } from '../db'
import {
    appSettings,
    conversations,
    modelApiKeys,
    modelChainPresets,
    modelPresets,
} from '../schema'
import { iso, parseJson, RepositoryBase, requireValue } from './base'
import { SettingsRepository } from './settings'

export class ProviderRepository extends RepositoryBase {
    constructor(
        handle: DatabaseHandle,
        private readonly settings: SettingsRepository,
    ) {
        super(handle)
    }

    getProvider(): ProviderConfig | null {
        this.settings.ensureSettings()
        const row = this.db
            .select({ providerJson: appSettings.providerJson })
            .from(appSettings)
            .where(eq(appSettings.id, 1))
            .get()
        return row?.providerJson ? parseJson<ProviderConfig | null>(row.providerJson, null) : null
    }

    setProvider(provider: ProviderConfig): ProviderConfig {
        this.settings.ensureSettings()
        this.db
            .update(appSettings)
            .set({ providerJson: JSON.stringify(provider), updatedAt: Date.now() })
            .where(eq(appSettings.id, 1))
            .run()
        return provider
    }

    listModelPresets(): ModelPreset[] {
        return this.db
            .select()
            .from(modelPresets)
            .orderBy(asc(modelPresets.sortOrder), asc(modelPresets.createdAt))
            .all()
            .map(mapModelPreset)
    }

    getModelPreset(id: string): ModelPreset | null {
        const row = this.db.select().from(modelPresets).where(eq(modelPresets.id, id)).get()
        return row ? mapModelPreset(row) : null
    }

    createModelPreset(input: ModelPresetInput): ModelPreset {
        const now = Date.now()
        const id = crypto.randomUUID()
        const last = this.db
            .select({ value: max(modelPresets.sortOrder) })
            .from(modelPresets)
            .get()
        this.db
            .insert(modelPresets)
            .values({
                id,
                name: input.name,
                providerJson: JSON.stringify(input.config),
                apiKeyId: input.apiKeyId,
                sortOrder: (last?.value ?? -1) + 1,
                createdAt: now,
                updatedAt: now,
            })
            .run()
        return requireValue(this.getModelPreset(id), 'Failed to create model preset')
    }

    updateModelPreset(id: string, input: ModelPresetInput): ModelPreset | null {
        if (!this.getModelPreset(id)) return null
        this.db
            .update(modelPresets)
            .set({
                name: input.name,
                providerJson: JSON.stringify(input.config),
                apiKeyId: input.apiKeyId,
                updatedAt: Date.now(),
            })
            .where(eq(modelPresets.id, id))
            .run()
        return this.getModelPreset(id)
    }

    deleteModelPreset(id: string): 'deleted' | 'in_use' | 'not_found' {
        if (!this.getModelPreset(id)) return 'not_found'
        const settings = this.settings.getSettings()
        if (
            settings.defaultModelPresetId === id ||
            settings.defaultAuxiliaryModelPresetId === id ||
            this.db
                .select({ id: conversations.id })
                .from(conversations)
                .where(eq(conversations.modelPresetId, id))
                .limit(1)
                .get() ||
            this.db
                .select({ id: conversations.id })
                .from(conversations)
                .where(eq(conversations.auxiliaryModelPresetId, id))
                .limit(1)
                .get()
        )
            return 'in_use'
        const usedByChain = this.db
            .select({ stepsJson: modelChainPresets.stepsJson })
            .from(modelChainPresets)
            .all()
            .some(({ stepsJson }) => {
                const parsed = parseJson<
                    | Array<{ modelPresetId?: string }>
                    | {
                          steps?: Array<{ modelPresetId?: string }>
                          layers?: Array<{ agents?: Array<{ modelPresetId?: string }> }>
                      }
                >(stepsJson, [])
                const agents = Array.isArray(parsed)
                    ? parsed
                    : [
                          ...(parsed.steps ?? []),
                          ...(parsed.layers ?? []).flatMap((layer) => layer.agents ?? []),
                      ]
                return agents.some((agent) => agent.modelPresetId === id)
            })
        if (usedByChain) return 'in_use'
        this.db.delete(modelPresets).where(eq(modelPresets.id, id)).run()
        return 'deleted'
    }

    listModelApiKeyRows() {
        return this.db.select().from(modelApiKeys).orderBy(asc(modelApiKeys.createdAt)).all()
    }

    getModelApiKeyRow(id: string) {
        return this.db.select().from(modelApiKeys).where(eq(modelApiKeys.id, id)).get() ?? null
    }

    createModelApiKeyRow(input: {
        name: string
        provider: string
        credentialType: 'apiKey' | 'serviceAccount' | 'aws'
        hint: string
    }) {
        const now = Date.now()
        const row = { id: crypto.randomUUID(), ...input, createdAt: now, updatedAt: now }
        this.db.insert(modelApiKeys).values(row).run()
        return requireValue(this.getModelApiKeyRow(row.id), 'Failed to create API key')
    }

    updateModelApiKeyRow(
        id: string,
        input: {
            name: string
            provider: string
            credentialType: 'apiKey' | 'serviceAccount' | 'aws'
            hint: string
        },
    ) {
        if (!this.getModelApiKeyRow(id)) return null
        this.db
            .update(modelApiKeys)
            .set({ ...input, updatedAt: Date.now() })
            .where(eq(modelApiKeys.id, id))
            .run()
        return this.getModelApiKeyRow(id)
    }

    deleteModelApiKeyRow(id: string): 'deleted' | 'in_use' | 'not_found' {
        if (!this.getModelApiKeyRow(id)) return 'not_found'
        if (
            this.db
                .select({ id: modelPresets.id })
                .from(modelPresets)
                .where(eq(modelPresets.apiKeyId, id))
                .limit(1)
                .get()
        )
            return 'in_use'
        this.db.delete(modelApiKeys).where(eq(modelApiKeys.id, id)).run()
        return 'deleted'
    }

    getSecretStorage(): { salt: string | null; providerSecret: string | null } {
        this.settings.ensureSettings()
        const row = this.db
            .select({
                salt: appSettings.secretSalt,
                providerSecret: appSettings.providerSecretJson,
            })
            .from(appSettings)
            .where(eq(appSettings.id, 1))
            .get()
        return {
            salt: row?.salt ?? null,
            providerSecret: row?.providerSecret ?? null,
        }
    }

    setSecretSalt(salt: string): void {
        this.settings.ensureSettings()
        this.db
            .update(appSettings)
            .set({ secretSalt: salt, updatedAt: Date.now() })
            .where(eq(appSettings.id, 1))
            .run()
    }

    setProviderSecret(providerSecret: string | null): void {
        this.settings.ensureSettings()
        this.db
            .update(appSettings)
            .set({ providerSecretJson: providerSecret, updatedAt: Date.now() })
            .where(eq(appSettings.id, 1))
            .run()
    }
}

function mapModelPreset(row: typeof modelPresets.$inferSelect): ModelPreset {
    return {
        id: row.id,
        name: row.name,
        config: parseJson<ProviderConfig>(row.providerJson, {
            provider: 'echo',
            modelId: 'echo',
            defaults: {},
            providerOptions: {},
        }),
        apiKeyId: row.apiKeyId,
        sortOrder: row.sortOrder,
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
    }
}
