import {
    chmodSync,
    mkdirSync,
    readdirSync,
    renameSync,
    rmdirSync,
    statSync,
    unlinkSync,
} from 'node:fs'
import { basename, join } from 'node:path'

import type { Logger } from 'pino'

import type { AppConfig } from '@/config'
import type { Store } from '@/db'

export const BACKUP_INTERVAL_MS = 5 * 60 * 1000
export const BACKUP_MAX_COUNT = 20
export const BACKUP_MAX_BYTES = 500 * 1024 * 1024
const BACKUP_NAME = /^auto-\d{13}-[0-9a-f-]{36}\.sqlite$/

/** Independent SQLite snapshots; assets remain in DATA_DIR/assets. */
export class BackupService {
    private timer: ReturnType<typeof setInterval> | undefined
    private revision = ''
    readonly directory: string

    constructor(
        private readonly config: AppConfig,
        private readonly store: Store,
        private readonly logger: Logger,
    ) {
        this.directory = join(config.dataDir, 'backups')
    }

    start(): void {
        if (this.timer || !this.config.autoBackupEnabled) return
        this.run()
        this.timer = setInterval(() => this.run(), BACKUP_INTERVAL_MS)
        this.timer.unref()
    }

    close(): void {
        clearInterval(this.timer)
        this.timer = undefined
    }

    run(): void {
        let temporary: string | undefined
        let staging: string | undefined
        try {
            if (
                !this.config.autoBackupEnabled ||
                !this.store.settings.getSettings().autoBackupEnabled
            )
                return
            // total_changes sees this connection's writes; data_version sees other connections.
            const revision = JSON.stringify([
                this.store.sqlite.query('SELECT total_changes()').get(),
                this.store.sqlite.query('PRAGMA data_version').get(),
            ])
            if (revision === this.revision) return
            mkdirSync(this.directory, { recursive: true, mode: 0o700 })
            const destination = join(
                this.directory,
                `auto-${Date.now()}-${crypto.randomUUID()}.sqlite`,
            )
            staging = `${destination}.tmp`
            mkdirSync(staging, { mode: 0o700 })
            temporary = join(staging, 'snapshot.sqlite')
            // VACUUM INTO takes a consistent snapshot including committed WAL contents.
            // The private staging directory protects secrets before permissions are set.
            this.store.sqlite.query('VACUUM INTO ?').run(temporary)
            chmodSync(temporary, 0o600)
            renameSync(temporary, destination)
            temporary = undefined
            rmdirSync(staging)
            staging = undefined
            this.rotate(basename(destination))
            this.revision = revision
            this.logger.info(
                { event: 'backup.created', path: destination },
                'Automatic database backup created',
            )
        } catch (error) {
            if (temporary) {
                try {
                    unlinkSync(temporary)
                } catch {
                    /* Preserve the original failure. */
                }
            }
            if (staging) {
                try {
                    rmdirSync(staging)
                } catch {
                    /* Preserve the original failure. */
                }
            }
            this.logger.error(
                { err: error, event: 'backup.failed' },
                'Automatic database backup failed',
            )
        }
    }

    private rotate(newest: string): void {
        const entries = [
            newest,
            ...readdirSync(this.directory)
                .filter((name) => name !== newest && BACKUP_NAME.test(name))
                .sort()
                .reverse(),
        ]
        let bytes = 0
        for (const [index, name] of entries.entries()) {
            const path = join(this.directory, name)
            const size = statSync(path).size
            // Always retain the newest snapshot, even when it alone exceeds the cap.
            if (index === 0 || (index < BACKUP_MAX_COUNT && bytes + size <= BACKUP_MAX_BYTES)) {
                bytes += size
            } else {
                unlinkSync(path)
            }
        }
    }
}
