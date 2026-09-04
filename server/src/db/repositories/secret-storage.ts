import { eq } from 'drizzle-orm'

import type { DatabaseHandle } from '../db'
import { appSettings } from '../schema'
import { RepositoryBase } from './base'
import { SettingsRepository } from './settings'

export class SecretStorageRepository extends RepositoryBase {
    constructor(
        handle: DatabaseHandle,
        private readonly settings: SettingsRepository,
    ) {
        super(handle)
    }

    get(): { salt: string | null; providerSecret: string | null } {
        this.settings.ensure()
        const row = this.db
            .select({
                salt: appSettings.secretSalt,
                providerSecret: appSettings.providerSecretJson,
            })
            .from(appSettings)
            .where(eq(appSettings.id, 1))
            .get()
        return { salt: row?.salt ?? null, providerSecret: row?.providerSecret ?? null }
    }

    setSalt(salt: string): void {
        this.settings.ensure()
        this.db.update(appSettings).set({ secretSalt: salt }).where(eq(appSettings.id, 1)).run()
    }

    setSecret(providerSecret: string | null): void {
        this.settings.ensure()
        this.db
            .update(appSettings)
            .set({ providerSecretJson: providerSecret })
            .where(eq(appSettings.id, 1))
            .run()
    }
}
