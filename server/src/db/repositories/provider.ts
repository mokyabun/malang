import type { ProviderConfig } from '@malang/shared'
import { eq } from 'drizzle-orm'

import type { DatabaseHandle } from '../db'
import { appSettings } from '../schema'
import { RepositoryBase } from './base'
import { SettingsRepository } from './settings'

export class ProviderRepository extends RepositoryBase {
    constructor(
        handle: DatabaseHandle,
        private readonly settings: SettingsRepository,
    ) {
        super(handle)
    }

    get(): ProviderConfig | null {
        this.settings.ensure()
        const row = this.db
            .select({ providerJson: appSettings.providerJson })
            .from(appSettings)
            .where(eq(appSettings.id, 1))
            .get()
        return row?.providerJson ?? null
    }

    set(provider: ProviderConfig): ProviderConfig {
        this.settings.ensure()
        this.db
            .update(appSettings)
            .set({ providerJson: provider, updatedAt: Date.now() })
            .where(eq(appSettings.id, 1))
            .run()
        return provider
    }
}
