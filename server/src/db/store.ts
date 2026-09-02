import type { DatabaseHandle } from './db'
import { AssetRepository } from './repositories/assets'
import { AuthRepository } from './repositories/auth'
import { CharacterRepository } from './repositories/characters'
import { ConversationRepository } from './repositories/conversations'
import { GenerationRepository } from './repositories/generations'
import { MemoryRepository } from './repositories/memory'
import { ModelChainRepository } from './repositories/model-chains'
import { PersonaRepository } from './repositories/personas'
import { PromptRepository } from './repositories/prompts'
import { ProviderRepository } from './repositories/providers'
import { SettingsRepository } from './repositories/settings'

export { LuaRevisionConflictError } from './repositories/base'
export {
    type CharacterAssetRecord,
    type CharacterRecord,
    loreFieldsFromExtensions,
    type NewCharacterRecord,
} from './repositories/characters'
export type { AssetRecord } from './repositories/assets'
export type { PromptModuleAssetRecord } from './repositories/prompts'
export type { MemorySummaryRecord, SparseVector } from './repositories/memory'

export class Store {
    readonly auth: AuthRepository
    readonly settings: SettingsRepository
    readonly personas: PersonaRepository
    readonly providers: ProviderRepository
    readonly prompts: PromptRepository
    readonly assets: AssetRepository
    readonly characters: CharacterRepository
    readonly conversations: ConversationRepository
    readonly generations: GenerationRepository
    readonly memory: MemoryRepository
    readonly modelChains: ModelChainRepository

    constructor(private readonly handle: DatabaseHandle) {
        this.auth = new AuthRepository(handle)
        this.settings = new SettingsRepository(handle)
        this.personas = new PersonaRepository(handle, this.settings)
        this.providers = new ProviderRepository(handle, this.settings)
        this.prompts = new PromptRepository(handle, this.settings)
        this.assets = new AssetRepository(handle)
        this.characters = new CharacterRepository(handle, this.prompts)
        this.conversations = new ConversationRepository(
            handle,
            this.settings,
            this.prompts,
            this.characters,
        )
        this.generations = new GenerationRepository(handle, this.conversations)
        this.memory = new MemoryRepository(handle)
        this.modelChains = new ModelChainRepository(handle)
    }

    get sqlite() {
        return this.handle.sqlite
    }

    get db() {
        return this.handle.db
    }

    close(): void {
        this.handle.close()
    }
}
