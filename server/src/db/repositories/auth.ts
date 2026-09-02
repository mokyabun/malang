import { and, eq, gt, lt } from 'drizzle-orm'

import { adminUsers, appSettings, sessions } from '../schema'
import { RepositoryBase } from './base'

export class AuthRepository extends RepositoryBase {
    getAdmin() {
        return this.db.select().from(adminUsers).limit(1).get()
    }

    createAdmin(passwordHash: string) {
        const now = Date.now()
        const admin = { id: crypto.randomUUID(), passwordHash, createdAt: now, updatedAt: now }
        this.db.insert(adminUsers).values(admin).run()
        return admin
    }

    updateAdminPassword(adminId: string, passwordHash: string): void {
        this.db
            .update(adminUsers)
            .set({ passwordHash, updatedAt: Date.now() })
            .where(eq(adminUsers.id, adminId))
            .run()
        this.db.delete(sessions).where(eq(sessions.adminId, adminId)).run()
    }

    createSession(adminId: string, tokenHash: string, expiresAt: number): string {
        const id = crypto.randomUUID()
        this.db
            .insert(sessions)
            .values({ id, adminId, tokenHash, expiresAt, createdAt: Date.now() })
            .run()
        return id
    }

    getSession(tokenHash: string) {
        this.db.delete(sessions).where(lt(sessions.expiresAt, Date.now())).run()
        return this.db
            .select({ id: sessions.id, adminId: sessions.adminId, expiresAt: sessions.expiresAt })
            .from(sessions)
            .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, Date.now())))
            .get()
    }

    deleteSession(tokenHash: string): void {
        this.db.delete(sessions).where(eq(sessions.tokenHash, tokenHash)).run()
    }

    rotateAdminPassword(
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
