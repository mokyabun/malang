import { Database } from 'bun:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

import { type BunSQLiteDatabase, drizzle } from 'drizzle-orm/bun-sqlite'

import { runMigrations } from './migrate'
import * as schema from './schema'

export interface DatabaseHandle {
    sqlite: Database
    db: BunSQLiteDatabase<typeof schema>
    close(): void
}

export function openDatabase(path: string): DatabaseHandle {
    mkdirSync(dirname(path), { recursive: true })
    const sqlite = new Database(path, { create: true, strict: true })
    sqlite.run('PRAGMA foreign_keys = ON;')
    sqlite.run('PRAGMA journal_mode = WAL;')
    sqlite.run('PRAGMA busy_timeout = 5000;')
    runMigrations(sqlite)

    return {
        sqlite,
        db: drizzle(sqlite, { schema }),
        close: () => sqlite.close(),
    }
}
