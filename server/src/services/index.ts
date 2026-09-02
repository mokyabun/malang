import type { Logger } from 'pino'

import { type AppConfig, loadConfig } from '@/config'
import { openDatabase, Store } from '@/db'
import { createLogger } from '@/logger'

import { AssetStore } from './app/assets'
import { AuthService } from './app/auth'
import { CharacterService } from './app/characters'
import { GenerationService } from './app/generations'
import { PromptModuleService } from './app/modules'
import { PersonaService } from './app/personas'
import { PromptService } from './app/prompts'
import { ProviderService } from './app/providers'
import { SecretVault } from './app/secret-vault'
import { LuaRuntime } from './lua'
import { HypaMemoryV3Service } from './memory'

export * from './app'
export * from './prompt'
export * from './providers'
export * from './memory'

export interface AppContext {
    config: AppConfig
    store: Store
    auth: AuthService
    assets: AssetStore
    characters: CharacterService
    personas: PersonaService
    prompts: PromptService
    modules: PromptModuleService
    providers: ProviderService
    generations: GenerationService
    lua: LuaRuntime
    memory: HypaMemoryV3Service
    logger: Logger
    close(): void
}

export async function createContext(config: AppConfig = loadConfig()): Promise<AppContext> {
    const store = new Store(openDatabase(config.databasePath))
    store.generations.recoverInterruptedGenerations()
    store.settings.ensureSettings()
    store.prompts.ensureDefaultPrompt()
    store.characters.ensureGeneralChatCharacter()
    store.personas.ensurePersonaBootstrap()
    const vault = new SecretVault(store)
    const auth = new AuthService(store, config.sessionSecret, vault)
    await auth.bootstrap(config.adminPassword)
    const assetStore = new AssetStore(config.dataDir, store)
    const logger = createLogger(config)
    const providers = new ProviderService(store, vault)
    const personas = new PersonaService(store, assetStore)
    const lua = new LuaRuntime(store, providers, personas, logger.child({ module: 'lua-runtime' }))
    const memory = new HypaMemoryV3Service(
        store,
        providers,
        logger.child({ module: 'hypa-memory-v3' }),
    )
    return {
        config,
        store,
        auth,
        assets: assetStore,
        characters: new CharacterService(config, store, assetStore),
        personas,
        prompts: new PromptService(store),
        modules: new PromptModuleService(store, config, assetStore),
        providers,
        lua,
        memory,
        generations: new GenerationService(
            store,
            providers,
            personas,
            lua,
            memory,
            logger.child({ module: 'generation-service' }),
        ),
        logger,
        close: () => {
            lua.close()
            store.close()
        },
    }
}
