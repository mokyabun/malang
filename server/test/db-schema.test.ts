import { describe, expect, test } from 'bun:test'

import { openDatabase } from '../src/db'

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
})
