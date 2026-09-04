import { describe, expect, test } from 'bun:test'

import { eq } from 'drizzle-orm'

import { openDatabase } from '../src/db'
import { adminUsers } from '../src/db/schema'

describe('database baseline', () => {
    test('creates only version 1 without deprecated columns', () => {
        const handle = openDatabase(':memory:')
        try {
            const columns = (table: string) =>
                handle.sqlite
                    .query<{ name: string }, []>(`PRAGMA table_info(${table})`)
                    .all()
                    .map((column) => column.name)

            expect(
                handle.sqlite
                    .query<{ version: number }, []>(
                        'SELECT version FROM schema_migrations ORDER BY version',
                    )
                    .all(),
            ).toEqual([{ version: 1 }])
            expect(columns('app_settings')).not.toContain('persona')
            expect(columns('conversations')).not.toContain('toggles_json')
            expect(columns('model_chain_presets')).toContain('config_json')
            expect(columns('model_chain_presets')).not.toContain('steps_json')

            // These store current toggle declarations, not deprecated conversation values.
            expect(columns('prompt_presets')).toContain('toggles_json')
            expect(columns('prompt_modules')).toContain('toggles_json')
        } finally {
            handle.close()
        }
    })

    test('maps millisecond timestamps to Date and updates updatedAt automatically', () => {
        const handle = openDatabase(':memory:')
        try {
            handle.db
                .insert(adminUsers)
                .values({ id: 'timestamp-test', passwordHash: 'before' })
                .run()

            const created = handle.db.select().from(adminUsers).get()
            expect(created?.createdAt).toBeInstanceOf(Date)
            expect(created?.updatedAt).toBeInstanceOf(Date)

            handle.sqlite.run("UPDATE admin_users SET updated_at = 1 WHERE id = 'timestamp-test'")
            handle.db
                .update(adminUsers)
                .set({ passwordHash: 'after' })
                .where(eq(adminUsers.id, 'timestamp-test'))
                .run()

            const updated = handle.db.select().from(adminUsers).get()
            expect(updated?.updatedAt).toBeInstanceOf(Date)
            expect(updated!.updatedAt.getTime()).toBeGreaterThan(1)

            const stored = handle.sqlite
                .query<{ createdAt: number; updatedAt: number }, []>(
                    'SELECT created_at AS createdAt, updated_at AS updatedAt FROM admin_users',
                )
                .get()
            expect(typeof stored?.createdAt).toBe('number')
            expect(typeof stored?.updatedAt).toBe('number')
        } finally {
            handle.close()
        }
    })
})
