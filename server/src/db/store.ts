import type { DatabaseHandle } from './db'
import { AdminRepository } from './repositories/admin'
import { AssetRepository } from './repositories/assets'
import { CharacterAssetRepository } from './repositories/character-assets'
import { CharacterGroupRepository } from './repositories/character-groups'
import { CharacterLoreRepository } from './repositories/character-lore'
import { CharacterOrganizationRepository } from './repositories/character-organization'
import { CharacterRepository } from './repositories/characters'
import { ConversationGroupRepository } from './repositories/conversation-groups'
import { ConversationModuleRepository } from './repositories/conversation-modules'
import { ConversationOrganizationRepository } from './repositories/conversation-organization'
import { ConversationRepository } from './repositories/conversations'
import { CredentialRotationRepository } from './repositories/credential-rotation'
import { GenerationRepository } from './repositories/generations'
import { MemoryMetricsRepository } from './repositories/memory-metrics'
import { MemorySettingsRepository } from './repositories/memory-settings'
import { MemorySummaryRepository } from './repositories/memory-summaries'
import { MessageRepository } from './repositories/messages'
import { ModelApiKeyRepository } from './repositories/model-api-keys'
import { ModelChainMemoryRepository } from './repositories/model-chain-memory'
import { ModelChainRepository } from './repositories/model-chains'
import { ModelPresetRepository } from './repositories/model-presets'
import { PersonaRepository } from './repositories/personas'
import { PromptModuleAssetRepository } from './repositories/prompt-module-assets'
import { PromptModuleRepository } from './repositories/prompt-modules'
import { PromptPresetRepository } from './repositories/prompt-presets'
import { ProviderRepository } from './repositories/provider'
import { RequestDebugRepository } from './repositories/request-debug'
import { SecretStorageRepository } from './repositories/secret-storage'
import { SessionRepository } from './repositories/sessions'
import { SettingsRepository } from './repositories/settings'

export { LuaRevisionConflictError } from './repositories/base'
export {
    type CharacterAssetRecord,
    type CharacterRecord,
    loreFieldsFromExtensions,
    type NewCharacterRecord,
} from './repositories/characters'
export type { AssetRecord } from './repositories/assets'
export type { PromptModuleAssetRecord } from './repositories/prompt-module-assets'
export type { MemorySummaryRecord, SparseVector } from './repositories/memory-summaries'

export class Store {
    readonly admin: AdminRepository
    readonly session: SessionRepository
    readonly credentialRotation: CredentialRotationRepository
    readonly settings: SettingsRepository
    readonly persona: PersonaRepository
    readonly provider: ProviderRepository
    readonly modelPreset: ModelPresetRepository
    readonly modelApiKey: ModelApiKeyRepository
    readonly secretStorage: SecretStorageRepository
    readonly promptPreset: PromptPresetRepository
    readonly promptModule: PromptModuleRepository
    readonly promptModuleAsset: PromptModuleAssetRepository
    readonly asset: AssetRepository
    readonly character: CharacterRepository
    readonly characterAsset: CharacterAssetRepository
    readonly characterLore: CharacterLoreRepository
    readonly characterGroup: CharacterGroupRepository
    readonly characterOrganization: CharacterOrganizationRepository
    readonly conversation: ConversationRepository
    readonly conversationGroup: ConversationGroupRepository
    readonly conversationModule: ConversationModuleRepository
    readonly conversationOrganization: ConversationOrganizationRepository
    readonly message: MessageRepository
    readonly generation: GenerationRepository
    readonly requestDebug: RequestDebugRepository
    readonly memorySettings: MemorySettingsRepository
    readonly memoryMetrics: MemoryMetricsRepository
    readonly memorySummary: MemorySummaryRepository
    readonly modelChain: ModelChainRepository
    readonly modelChainMemory: ModelChainMemoryRepository

    constructor(private readonly handle: DatabaseHandle) {
        this.admin = new AdminRepository(handle)
        this.session = new SessionRepository(handle)
        this.credentialRotation = new CredentialRotationRepository(handle)
        this.settings = new SettingsRepository(handle)
        this.persona = new PersonaRepository(handle)
        this.provider = new ProviderRepository(handle, this.settings)
        this.modelPreset = new ModelPresetRepository(handle, this.settings)
        this.modelApiKey = new ModelApiKeyRepository(handle)
        this.secretStorage = new SecretStorageRepository(handle, this.settings)
        this.promptPreset = new PromptPresetRepository(handle, this.settings)
        this.promptModule = new PromptModuleRepository(handle)
        this.promptModuleAsset = new PromptModuleAssetRepository(handle)
        this.asset = new AssetRepository(handle)
        this.characterOrganization = new CharacterOrganizationRepository(handle)
        this.characterGroup = new CharacterGroupRepository(handle, this.characterOrganization)
        this.character = new CharacterRepository(handle, this.characterOrganization)
        this.characterAsset = new CharacterAssetRepository(handle)
        this.characterLore = new CharacterLoreRepository(handle)
        this.message = new MessageRepository(handle)
        this.conversationOrganization = new ConversationOrganizationRepository(handle)
        this.conversationGroup = new ConversationGroupRepository(
            handle,
            this.character,
            this.conversationOrganization,
        )
        this.conversation = new ConversationRepository(
            handle,
            this.settings,
            this.promptPreset,
            this.character,
            this.message,
            this.conversationOrganization,
        )
        this.conversationModule = new ConversationModuleRepository(
            handle,
            this.settings,
            this.promptPreset,
            this.promptModule,
            this.character,
            this.message,
        )
        this.generation = new GenerationRepository(handle, this.message)
        this.requestDebug = new RequestDebugRepository(handle)
        this.memorySettings = new MemorySettingsRepository(handle)
        this.memoryMetrics = new MemoryMetricsRepository(handle, this.memorySettings)
        this.memorySummary = new MemorySummaryRepository(handle)
        this.modelChain = new ModelChainRepository(handle)
        this.modelChainMemory = new ModelChainMemoryRepository(handle)
    }

    get sqlite() {
        return this.handle.sqlite
    }

    get db() {
        return this.handle.db
    }

    replaceWith(sourcePath: string, rollbackPath: string): void {
        this.handle.replaceWith(sourcePath, rollbackPath)
    }

    close(): void {
        this.handle.close()
    }
}
