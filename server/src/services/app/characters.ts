import type { CharacterCreate, CharacterUpdate } from '@malang/shared'
import type { CharacterCardV3 } from '@risuai/ccardlib'

import type { AppConfig } from '@/config'
import { loreFieldsFromExtensions, type Store } from '@/db'
import { ValidationError } from '@/errors/app-error'
import { exportPromptModule } from '@/services/prompt/module-codec'
import {
    mergeLuaTriggers,
    normalizeLuaTriggers,
    normalizeRegexScripts,
    parseKeyValueVariables,
    record,
    serializeKeyValueVariables,
    stringArray,
    toRisuRegexScripts,
} from '@/services/prompt/risu'

import type { AssetStore } from './assets'
import { type ExportableCard, exportCharacterCard, importCharacterCard } from './character-card'

export class CharacterService {
    constructor(
        private readonly config: AppConfig,
        private readonly store: Store,
        private readonly assetStore: AssetStore,
    ) {}

    list(includeArchived = false) {
        return this.store.characters.listCharacters(includeArchived)
    }

    get(id: string) {
        return this.store.characters.getCharacter(id)
    }

    create(input: CharacterCreate) {
        const id = crypto.randomUUID()
        const sourceCard = {
            spec: 'chara_card_v3',
            spec_version: '3.0',
            data: {
                name: input.name,
                description: input.description,
                personality: input.personality,
                scenario: input.scenario,
                first_mes: input.firstMessage,
                alternate_greetings: input.alternateGreetings,
                mes_example: input.exampleMessage,
                system_prompt: input.systemPrompt,
                post_history_instructions: input.postHistoryInstructions,
                creator: input.creator,
                character_version: input.characterVersion,
                tags: input.tags,
                creator_notes: '',
                group_only_greetings: [],
                extensions: {},
            },
        }
        return this.store.characters.createCharacter(
            {
                id,
                ...input,
                avatarAssetId: null,
                sourceSpec: 'v3',
                sourceExtensions: {},
                sourceCard,
                loreSettings: input.loreSettings,
                regexScripts: input.regexScripts || [],
                moduleReferences: input.moduleReferences || [],
            },
            [],
        )
    }

    update(id: string, update: CharacterUpdate) {
        return this.store.characters.updateCharacter(id, update)
    }

    archive(id: string) {
        return this.store.characters.archiveCharacter(id)
    }

    delete(id: string) {
        return this.store.characters.deleteCharacter(id)
    }

    restore(id: string) {
        return this.store.characters.restoreCharacter(id)
    }

    async setAvatar(id: string, bytes: Uint8Array, mimeType: string) {
        if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mimeType)) {
            throw new ValidationError('Avatar must be a PNG, JPEG, WebP, or GIF image')
        }
        if (!this.store.characters.getCharacter(id)) return null
        const asset = await this.assetStore.put(bytes, mimeType)
        return this.store.characters.setCharacterAvatar(id, asset.id)
    }

    removeAvatar(id: string) {
        return this.store.characters.setCharacterAvatar(id, null)
    }

    assets(id: string) {
        const character = this.store.characters.getCharacter(id)
        if (!character) return null
        const linked = this.store.characters.getCharacterAssetLinks(id).flatMap((link) => {
            const asset = this.store.assets.getAsset(link.assetId)
            return asset
                ? [
                      {
                          assetId: asset.id,
                          type: link.type,
                          name: link.name,
                          extension: link.extension,
                          sourceUri: link.sourceUri,
                          mimeType: asset.mimeType,
                          size: asset.size,
                      },
                  ]
                : []
        })
        if (
            character.avatarAssetId &&
            !linked.some((asset) => asset.assetId === character.avatarAssetId)
        ) {
            const avatar = this.store.assets.getAsset(character.avatarAssetId)
            if (avatar) {
                linked.unshift({
                    assetId: avatar.id,
                    type: 'icon',
                    name: 'main',
                    extension: extensionForMime(avatar.mimeType),
                    sourceUri: 'ccdefault:',
                    mimeType: avatar.mimeType,
                    size: avatar.size,
                })
            }
        }
        return linked
    }

    async import(bytes: Uint8Array, filename: string) {
        const imported = importCharacterCard(bytes, filename, this.config)
        const id = crypto.randomUUID()
        const avatar = imported.avatar
            ? await this.assetStore.put(imported.avatar.bytes, imported.avatar.mimeType)
            : null
        const linkedAssets = []

        for (const importedAsset of imported.assets) {
            const asset = await this.assetStore.put(importedAsset.bytes, importedAsset.mimeType)
            linkedAssets.push({
                id: crypto.randomUUID(),
                characterId: id,
                assetId: asset.id,
                type: importedAsset.type,
                name: importedAsset.name,
                extension: importedAsset.extension,
                sourceUri: importedAsset.sourceUri,
            })
        }

        const data = imported.card.data
        const risu = record(data.extensions?.risuai)
        const lua = normalizeLuaTriggers(risu.triggerscript, risu.lowLevelAccess)
        const book = data.character_book
        const character = this.store.characters.createCharacter(
            {
                id,
                name: data.name || 'Unnamed',
                description: data.description || '',
                personality: data.personality || '',
                scenario: data.scenario || '',
                firstMessage: data.first_mes || '',
                alternateGreetings: data.alternate_greetings || [],
                exampleMessage: data.mes_example || '',
                systemPrompt: data.system_prompt || '',
                postHistoryInstructions: data.post_history_instructions || '',
                creator: data.creator || '',
                characterVersion: data.character_version || '',
                tags: data.tags || [],
                avatarAssetId: avatar?.id || null,
                sourceSpec: imported.sourceSpec,
                sourceExtensions: data.extensions || {},
                sourceCard: imported.card as unknown as Record<string, unknown>,
                regexScripts: normalizeRegexScripts(risu.customScripts),
                moduleReferences: stringArray(risu.modules),
                defaultVariables: parseKeyValueVariables(risu.defaultVariables),
                luaScript: lua.luaScript,
                luaRawTriggers: lua.rawTriggers,
                loreSettings: {
                    scanDepth: book?.scan_depth,
                    tokenBudget: book?.token_budget,
                    recursiveScanning: book?.recursive_scanning,
                },
                lorebook: (book?.entries || []).map((entry) => ({
                    keys: entry.keys || [],
                    secondaryKeys: entry.secondary_keys || [],
                    content: entry.content || '',
                    enabled: entry.enabled !== false,
                    constant: entry.constant === true,
                    selective: entry.selective === true,
                    caseSensitive: entry.case_sensitive === true,
                    useRegex: entry.use_regex === true,
                    insertionOrder: entry.insertion_order || 0,
                    priority: entry.priority || 0,
                    name: entry.name || entry.comment || '',
                    ...loreFieldsFromExtensions(entry.extensions || {}),
                    extensions: entry.extensions || {},
                })),
            },
            linkedAssets,
        )

        return { character, warnings: [...imported.warnings, ...lua.warnings] }
    }

    async export(id: string, spec: 'v2' | 'v3', format: 'json' | 'png' | 'charx') {
        const character = this.store.characters.getCharacter(id)
        if (!character) return null
        const loreExtensions = this.store.characters.getCharacterLoreExtensions(id)
        const raw = structuredClone(character.sourceCard) as unknown as CharacterCardV3
        const card = raw?.spec === 'chara_card_v3' ? raw : this.blankCard()
        card.spec = 'chara_card_v3'
        card.spec_version = '3.0'
        card.data = {
            ...card.data,
            name: character.name,
            description: character.description,
            personality: character.personality,
            scenario: character.scenario,
            first_mes: character.firstMessage,
            alternate_greetings: character.alternateGreetings,
            mes_example: character.exampleMessage,
            system_prompt: character.systemPrompt,
            post_history_instructions: character.postHistoryInstructions,
            creator: character.creator,
            character_version: character.characterVersion,
            tags: character.tags,
            extensions: {
                ...card.data.extensions,
                ...character.sourceExtensions,
                risuai: {
                    ...record(card.data.extensions?.risuai),
                    ...record(character.sourceExtensions.risuai),
                    customScripts: toRisuRegexScripts(character.regexScripts),
                    modules: character.moduleReferences,
                    defaultVariables: serializeKeyValueVariables(character.defaultVariables),
                    triggerscript: mergeLuaTriggers(character.luaRawTriggers, character.luaScript),
                    lowLevelAccess: character.luaScript?.lowLevelAccess === true,
                },
            },
            character_book: {
                scan_depth: character.loreSettings.scanDepth,
                token_budget: character.loreSettings.tokenBudget,
                recursive_scanning: character.loreSettings.recursiveScanning,
                extensions: card.data.character_book?.extensions || {},
                entries: (character.lorebook || []).map((entry) => ({
                    keys: entry.keys,
                    secondary_keys: entry.secondaryKeys,
                    content: entry.content,
                    enabled: entry.enabled,
                    constant: entry.constant,
                    selective: entry.selective,
                    case_sensitive: entry.caseSensitive,
                    use_regex: entry.useRegex,
                    insertion_order: entry.insertionOrder,
                    priority: entry.priority,
                    name: entry.name,
                    extensions: loreExtensions.get(entry.id) || {},
                })),
            },
        }

        const exportable: ExportableCard = { card, assets: [] }
        if (format === 'charx') {
            exportable.risuModule = exportPromptModule(
                {
                    name: `${character.name} Module`,
                    description: `Lorebook for ${character.name}`,
                    namespace: '',
                    sourceId: character.id,
                    enabledByDefault: false,
                    prompts: [],
                    toggles: [],
                    regexScripts: character.regexScripts,
                    backgroundEmbedding: '',
                    runtimeOrder: 0,
                    luaScript: character.luaScript,
                    luaRawTriggers: character.luaRawTriggers,
                    lorebook: character.lorebook || [],
                },
                'risum',
            )
        }
        if (character.avatarAssetId) {
            const asset = this.store.assets.getAsset(character.avatarAssetId)
            const bytes = await this.assetStore.read(character.avatarAssetId)
            if (asset && bytes) {
                exportable.avatar = {
                    bytes,
                    mimeType: asset.mimeType,
                    type: 'icon',
                    name: 'main',
                    extension: extensionForMime(asset.mimeType),
                    sourceUri: 'ccdefault:',
                }
            }
        }

        for (const link of this.store.characters.getCharacterAssetLinks(id)) {
            const asset = this.store.assets.getAsset(link.assetId)
            const bytes = await this.assetStore.read(link.assetId)
            if (!asset || !bytes) continue
            exportable.assets.push({
                bytes,
                mimeType: asset.mimeType,
                type: link.type,
                name: link.name,
                extension: link.extension,
                sourceUri: link.sourceUri,
            })
        }
        if (
            format === 'charx' &&
            exportable.avatar &&
            !exportable.assets.some((asset) => asset.type === 'icon' && asset.name === 'main')
        ) {
            exportable.assets.push(exportable.avatar)
        }

        return exportCharacterCard(exportable, spec, format)
    }

    private blankCard(): CharacterCardV3 {
        return {
            spec: 'chara_card_v3',
            spec_version: '3.0',
            data: {
                name: '',
                description: '',
                tags: [],
                creator: '',
                character_version: '',
                mes_example: '',
                extensions: {},
                system_prompt: '',
                post_history_instructions: '',
                first_mes: '',
                alternate_greetings: [],
                personality: '',
                scenario: '',
                creator_notes: '',
                group_only_greetings: [],
            },
        }
    }
}

function extensionForMime(mimeType: string): string {
    return (
        (
            {
                'image/png': 'png',
                'image/jpeg': 'jpg',
                'image/webp': 'webp',
                'image/gif': 'gif',
            } as Record<string, string>
        )[mimeType] || 'bin'
    )
}
