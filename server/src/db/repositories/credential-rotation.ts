import { eq } from 'drizzle-orm'

import { adminUsers, appSettings, sessions } from '../schema'
import { RepositoryBase } from './base'

export class CredentialRotationRepository extends RepositoryBase {
    run(
        adminId: string,
        passwordHash: string,
        secretSalt: string,
        providerSecret: string | null,
    ): void {
        const now = Date.now()
        this.sqlite.transaction(() => {
            this.db
                .update(adminUsers)
                .set({ passwordHash, updatedAt: now })
                .where(eq(adminUsers.id, adminId))
                .run()
            this.db
                .update(appSettings)
                .set({ secretSalt, providerSecretJson: providerSecret, updatedAt: now })
                .where(eq(appSettings.id, 1))
                .run()
            this.db.delete(sessions).where(eq(sessions.adminId, adminId)).run()
        })()
    }
}
