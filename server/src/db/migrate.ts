import type { Database } from 'bun:sqlite'
import { readFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'

import InitialMigrationPath from './migrations/0000_initial.sql' with { type: 'file' }
import ProviderSecretsMigrationPath from './migrations/0001_provider_secrets.sql' with { type: 'file' }
import CharacterWorkspaceMigrationPath from './migrations/0002_character_workspace.sql' with { type: 'file' }
import PromptModulesMigrationPath from './migrations/0003_prompt_modules.sql' with { type: 'file' }
import PromptModuleLorebookMigrationPath from './migrations/0004_prompt_module_lorebook.sql' with { type: 'file' }
import RisuPromptRuntimeMigrationPath from './migrations/0005_risu_prompt_runtime.sql' with { type: 'file' }
import PersonasMigrationPath from './migrations/0006_personas.sql' with { type: 'file' }
import ModuleBackgroundEmbeddingMigrationPath from './migrations/0007_module_background_embedding.sql' with { type: 'file' }
import RequestDebugMigrationPath from './migrations/0008_request_debug.sql' with { type: 'file' }
import JailbreakTogglesMigrationPath from './migrations/0009_jailbreak_toggles.sql' with { type: 'file' }
import GlobalPromptTogglesMigrationPath from './migrations/0010_global_prompt_toggles.sql' with { type: 'file' }
import GeneralChatTitlesMigrationPath from './migrations/0011_general_chat_titles.sql' with { type: 'file' }
import CharacterChatTitlesMigrationPath from './migrations/0012_character_chat_titles.sql' with { type: 'file' }
import CollectionGroupsMigrationPath from './migrations/0013_collection_groups.sql' with { type: 'file' }
import LuaRuntimeMigrationPath from './migrations/0014_lua_runtime.sql' with { type: 'file' }
import ModelPresetsMigrationPath from './migrations/0015_model_presets.sql' with { type: 'file' }
import HypaMemoryV3MigrationPath from './migrations/0016_hypa_memory_v3.sql' with { type: 'file' }
import ModelChainsMigrationPath from './migrations/0017_model_chains.sql' with { type: 'file' }
import ModelChainLayersMigrationPath from './migrations/0018_model_chain_layers.sql' with { type: 'file' }
import ConversationPromptPersonaLocksMigrationPath from './migrations/0019_conversation_prompt_persona_locks.sql' with { type: 'file' }
import AutoBackupMigrationPath from './migrations/0020_auto_backup.sql' with { type: 'file' }

const migrations = [
    { version: 1, path: InitialMigrationPath },
    { version: 2, path: ProviderSecretsMigrationPath },
    { version: 3, path: CharacterWorkspaceMigrationPath },
    { version: 4, path: PromptModulesMigrationPath },
    { version: 5, path: PromptModuleLorebookMigrationPath },
    { version: 6, path: RisuPromptRuntimeMigrationPath },
    { version: 7, path: PersonasMigrationPath },
    { version: 8, path: ModuleBackgroundEmbeddingMigrationPath },
    { version: 9, path: RequestDebugMigrationPath },
    { version: 10, path: JailbreakTogglesMigrationPath },
    { version: 11, path: GlobalPromptTogglesMigrationPath },
    { version: 12, path: GeneralChatTitlesMigrationPath },
    { version: 13, path: CharacterChatTitlesMigrationPath },
    { version: 14, path: CollectionGroupsMigrationPath },
    { version: 15, path: LuaRuntimeMigrationPath },
    { version: 16, path: ModelPresetsMigrationPath },
    { version: 17, path: HypaMemoryV3MigrationPath },
    { version: 18, path: ModelChainsMigrationPath },
    { version: 19, path: ModelChainLayersMigrationPath },
    { version: 20, path: ConversationPromptPersonaLocksMigrationPath },
    { version: 21, path: AutoBackupMigrationPath },
]

export function runMigrations(sqlite: Database): void {
    sqlite.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            applied_at INTEGER NOT NULL
        )
    `)

    const applied = new Set(
        sqlite
            .query<{ version: number }, []>('SELECT version FROM schema_migrations')
            .all()
            .map((row) => row.version),
    )

    for (const migration of migrations) {
        if (applied.has(migration.version)) continue

        const statements = readFileSync(resolveMigrationPath(migration.path), 'utf8')
        sqlite.transaction(() => {
            sqlite.exec(statements)
            sqlite
                .query('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
                .run(migration.version, Date.now())
        })()
    }
}

function resolveMigrationPath(path: string) {
    if (path.startsWith('$bunfs/') || isAbsolute(path)) return path
    return join(import.meta.dir, path)
}
