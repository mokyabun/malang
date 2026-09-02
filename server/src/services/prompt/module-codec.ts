import {
    type LoreEntry,
    type ModulePrompt,
    type PromptModuleInput,
    type PromptToggle,
    PromptModuleInputSchema,
} from '@malang/shared'

import { ValidationError } from '@/errors/app-error'

import {
    mergeLuaTriggers,
    normalizeLuaTriggers,
    normalizeRegexScripts,
    toRisuRegexScripts,
} from './risu'
import { decodeRPack, encodeRPack } from './rpack'

const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })
// RisuAI's addLorebookFolder() stamps a folder entry's `key` with this sentinel prefix; children
// reference the folder via their own `folder` field set to that exact string.
const RISU_FOLDER_KEY_PREFIX = 'folder:'
export class ModuleFormatError extends ValidationError {
    constructor(message: string) {
        super(message)
        this.name = 'ModuleFormatError'
    }
}

interface RisuLore {
    id?: unknown
    key?: unknown
    secondkey?: unknown
    insertorder?: unknown
    comment?: unknown
    content?: unknown
    mode?: unknown
    alwaysActive?: unknown
    selective?: unknown
    extentions?: unknown
    useRegex?: unknown
    folder?: unknown
}

interface RisuModule {
    name?: unknown
    description?: unknown
    id?: unknown
    namespace?: unknown
    lorebook?: unknown
    customModuleToggle?: unknown
    regex?: unknown
    cjs?: unknown
    trigger?: unknown
    lowLevelAccess?: unknown
    backgroundEmbedding?: unknown
    assets?: unknown
    mcp?: unknown
    icon?: unknown
    runtimeOrder?: unknown
}

export interface ImportedPromptModuleAsset {
    bytes: Uint8Array
    type: string
    name: string
    extension: string
    sourceUri: string
    mimeType: string
}

export function importPromptModule(
    bytes: Uint8Array,
    filename: string,
): {
    input: PromptModuleInput
    source: Record<string, unknown>
    warnings: string[]
    assets: ImportedPromptModuleAsset[]
} {
    const decoded = filename.toLocaleLowerCase().endsWith('.risum')
        ? decodeRisum(bytes)
        : { source: decodeJson(bytes), assets: [] }
    const { source } = decoded
    const native = source.type === 'malangPromptModule' ? source.module : null
    if (native && typeof native === 'object') {
        const parsed = PromptModuleInputSchema.safeParse(native)
        if (!parsed.success) throw new ModuleFormatError('Invalid Malang prompt module JSON')
        return { input: parsed.data, source, warnings: [], assets: decoded.assets }
    }

    const candidate =
        source.type === 'risuModule' && isRecord(source.module) ? source.module : source
    return { ...normalizeRisuModule(candidate as RisuModule, source), assets: decoded.assets }
}

export function exportPromptModule(
    input: PromptModuleInput,
    format: 'json' | 'risum',
    assets: ImportedPromptModuleAsset[] = [],
    preservedSource: Record<string, unknown> = {},
): Uint8Array {
    if (format === 'json') {
        return encoder.encode(
            JSON.stringify({ type: 'malangPromptModule', version: 1, module: input }, null, 2),
        )
    }
    const module = { ...preservedRisuModuleFields(preservedSource), ...toRisuModule(input) }
    module.assets = assets.map((asset) => [asset.name, '', asset.extension])
    const main = encodeRPack(encoder.encode(JSON.stringify({ module, type: 'risuModule' })))
    const encodedAssets = assets.map((asset) => encodeRPack(asset.bytes))
    const assetBytes = encodedAssets.reduce((total, asset) => total + 5 + asset.length, 0)
    const output = new Uint8Array(7 + main.length + assetBytes)
    output[0] = 111
    output[1] = 0
    new DataView(output.buffer).setUint32(2, main.length, true)
    output.set(main, 6)
    let offset = 6 + main.length
    for (const asset of encodedAssets) {
        output[offset] = 1
        new DataView(output.buffer).setUint32(offset + 1, asset.length, true)
        output.set(asset, offset + 5)
        offset += 5 + asset.length
    }
    output[offset] = 0
    return output
}

function preservedRisuModuleFields(source: Record<string, unknown>): Record<string, unknown> {
    const candidate =
        source.type === 'risuModule' && isRecord(source.module) ? source.module : source
    if (source.type !== 'risuModule' || !isRecord(candidate)) return {}
    const result = { ...candidate }
    delete result.type
    delete result.module
    delete result.assets
    return result
}

export function decodeRisum(bytes: Uint8Array): {
    source: Record<string, unknown>
    assets: ImportedPromptModuleAsset[]
} {
    if (bytes.length < 7 || bytes[0] !== 111 || bytes[1] !== 0) {
        throw new ModuleFormatError('Invalid or unsupported .risum header')
    }
    const mainLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
        2,
        true,
    )
    if (mainLength > bytes.length - 7 || mainLength > 8 * 1024 * 1024) {
        throw new ModuleFormatError('Invalid .risum main payload length')
    }
    const source = decodeJson(decodeRPack(bytes.subarray(6, 6 + mainLength)))
    const module = isRecord(source.module) ? source.module : {}
    const metadata = Array.isArray(module.assets) ? module.assets : []
    const assets: ImportedPromptModuleAsset[] = []
    let offset = 6 + mainLength
    let assetCount = 0
    while (offset < bytes.length) {
        const marker = bytes[offset]
        offset += 1
        if (marker === 0) break
        if (marker !== 1 || offset + 4 > bytes.length) {
            throw new ModuleFormatError('Invalid .risum asset section')
        }
        const length = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true)
        offset += 4
        if (length > bytes.length - offset || length > 32 * 1024 * 1024) {
            throw new ModuleFormatError('Invalid .risum asset payload length')
        }
        const encoded = bytes.subarray(offset, offset + length)
        offset += length
        const tuple = Array.isArray(metadata[assetCount]) ? metadata[assetCount] : []
        const name = stringValue(tuple[0]) || `asset-${assetCount + 1}`
        const extension = stringValue(tuple[2]) || 'webp'
        assets.push({
            bytes: decodeRPack(encoded),
            type: 'other',
            name,
            extension,
            sourceUri: `risum:${assetCount}`,
            mimeType: mimeForExtension(extension),
        })
        assetCount += 1
        if (assetCount > 4_096) throw new ModuleFormatError('Too many .risum assets')
    }
    if (assetCount) source.__malangImportedAssetCount = assetCount
    return { source, assets }
}

function decodeJson(bytes: Uint8Array): Record<string, unknown> {
    try {
        const value = JSON.parse(decoder.decode(bytes)) as unknown
        if (!isRecord(value)) throw new Error('not an object')
        return value
    } catch {
        throw new ModuleFormatError('Invalid prompt module JSON')
    }
}

function normalizeRisuModule(
    module: RisuModule,
    source: Record<string, unknown>,
): { input: PromptModuleInput; source: Record<string, unknown>; warnings: string[] } {
    if (!module || typeof module !== 'object') throw new ModuleFormatError('Missing module data')
    const warnings: string[] = []
    const prompts: ModulePrompt[] = []
    const lorebook: LoreEntry[] = []
    const rawLore = Array.isArray(module.lorebook) ? module.lorebook : []
    const groupKeys = new Map<string, string>()
    const groupKeyFor = (id: string) => {
        let key = groupKeys.get(id)
        if (!key) {
            key = crypto.randomUUID()
            groupKeys.set(id, key)
        }
        return key
    }
    for (const value of rawLore) {
        if (!isRecord(value)) continue
        const lore = value as RisuLore
        const content = stringValue(lore.content)
        const indicator = content.match(/^@@indicator\s+([^\s]+)\s*\n?([\s\S]*)$/i)
        if (indicator) {
            const converted = indicatorPrompt(
                stringValue(lore.comment),
                indicator[1] || '',
                indicator[2] || '',
            )
            if (converted) {
                prompts.push(converted)
                continue
            }
            warnings.push(`Unsupported Risu indicator ${indicator[1]} was preserved as lore`)
        }
        lorebook.push(normalizeLore(lore, groupKeyFor))
    }
    const regexScripts = normalizeRegexScripts(module.regex)
    const lua = normalizeLuaTriggers(module.trigger, module.lowLevelAccess)
    const toggles = parseRisuModuleToggles(module.customModuleToggle)
    if (module.cjs) warnings.push('CJS scripts are preserved but never executed')
    warnings.push(...lua.warnings)
    if (module.mcp) warnings.push('MCP metadata is preserved but not executed')
    if (module.icon) warnings.push('Module icon metadata is preserved but not displayed')
    const input = PromptModuleInputSchema.parse({
        name: stringValue(module.name) || 'Imported module',
        description: stringValue(module.description),
        namespace: stringValue(module.namespace).slice(0, 200),
        sourceId: stringValue(module.id).slice(0, 200),
        enabledByDefault: false,
        runtimeOrder: finiteInteger(module.runtimeOrder, 0),
        luaScript: lua.luaScript,
        luaRawTriggers: lua.rawTriggers,
        prompts,
        toggles,
        regexScripts,
        backgroundEmbedding: stringValue(module.backgroundEmbedding),
        lorebook,
    })
    return { input, source, warnings: [...new Set(warnings)] }
}

function indicatorPrompt(name: string, indicator: string, content: string): ModulePrompt | null {
    const positions: Record<string, ModulePrompt['position']> = {
        character_desc: 'afterMain',
        persona: 'afterMain',
        replace_global_note: 'afterChat',
        phi: 'afterChat',
        character_first_message: 'beforeChat',
    }
    const position = positions[indicator.toLocaleLowerCase()]
    if (!position) return null
    return {
        id: crypto.randomUUID(),
        name: name || indicator.replaceAll('_', ' '),
        enabled: true,
        toggleKey: null,
        role: 'system',
        position,
        content: content.trim(),
    }
}

function normalizeLore(lore: RisuLore, groupKeyFor: (id: string) => string): LoreEntry {
    const extensions = isRecord(lore.extentions) ? lore.extentions : {}
    const isGroup = lore.mode === 'folder'
    // RisuAI repurposes `key` as a folder's identity (e.g. 'folder:<uuid>'); children point back
    // to it via their own `folder` field set to that exact string. See character-card.ts for the
    // matching CharX-side conversion and a fuller explanation.
    const ownKey = stringValue(lore.key)
    const folderId = stringValue(lore.folder)
    const group = isGroup
        ? ownKey && groupKeyFor(ownKey)
        : folderId
          ? groupKeyFor(folderId)
          : undefined
    return {
        id: typeof lore.id === 'string' && isUuid(lore.id) ? lore.id : crypto.randomUUID(),
        keys: isGroup ? [] : splitKeys(lore.key),
        secondaryKeys: splitKeys(lore.secondkey),
        content: stringValue(lore.content),
        enabled: lore.mode !== 'folder' && lore.mode !== 'child',
        constant: lore.alwaysActive === true || lore.mode === 'constant',
        selective: lore.selective === true,
        caseSensitive: extensions.risu_case_sensitive === true,
        useRegex: lore.useRegex === true,
        insertionOrder: finiteInteger(lore.insertorder, 100),
        priority: finiteInteger(lore.insertorder, 100),
        name: stringValue(lore.comment),
        position: '',
        depth: 0,
        role: 'system',
        recursive: 'global',
        probability: 100,
        additionalKeys: [],
        excludeKeys: [],
        decorators: {},
        group: group || undefined,
        isGroup,
    }
}

function toRisuModule(input: PromptModuleInput): Record<string, unknown> {
    const lorebook = input.lorebook.map((entry) => ({
        id: entry.id,
        key: entry.isGroup
            ? `${RISU_FOLDER_KEY_PREFIX}${entry.group || entry.id}`
            : entry.keys.join(', '),
        secondkey: entry.secondaryKeys.join(', '),
        insertorder: entry.insertionOrder,
        comment: entry.name,
        content: entry.content,
        mode: entry.isGroup ? 'folder' : entry.constant ? 'constant' : 'normal',
        alwaysActive: entry.constant,
        selective: entry.selective,
        useRegex: entry.useRegex,
        extentions: { risu_case_sensitive: entry.caseSensitive },
        folder:
            !entry.isGroup && entry.group ? `${RISU_FOLDER_KEY_PREFIX}${entry.group}` : undefined,
    }))
    for (const prompt of input.prompts) {
        if (!prompt.enabled) continue
        const content = prompt.toggleKey
            ? `{{#when::toggle::${prompt.toggleKey}}}\n${prompt.content}\n{{/when}}`
            : prompt.content
        lorebook.push({
            id: prompt.id,
            key: '',
            secondkey: '',
            insertorder: 100,
            comment: prompt.name,
            content: `@@indicator ${positionIndicator(prompt.position)}\n\n${content}`,
            mode: 'constant',
            alwaysActive: true,
            selective: false,
            useRegex: false,
            folder: undefined,
            extentions: { risu_case_sensitive: false },
        })
    }
    return {
        name: input.name,
        description: input.description,
        id: input.sourceId || crypto.randomUUID(),
        namespace: input.namespace || undefined,
        lorebook,
        customModuleToggle: serializeRisuModuleToggles(input.toggles || []),
        regex: toRisuRegexScripts(input.regexScripts || []),
        backgroundEmbedding: input.backgroundEmbedding || '',
        trigger: mergeLuaTriggers(input.luaRawTriggers, input.luaScript),
        lowLevelAccess: input.luaScript?.lowLevelAccess === true,
        runtimeOrder: input.runtimeOrder ?? 0,
        assets: [],
    }
}

/** Parse PocketRisu's `key=label=type=option,option` custom-module toggle syntax. */
export function parseRisuModuleToggles(value: unknown): PromptToggle[] {
    if (typeof value === 'string') {
        if (!value) return []
        const toggles: PromptToggle[] = []
        for (const rawLine of value.split('\n')) {
            const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
            const [key = '', label = '', rawType = '', rawOptions] = line.split('=')
            const type = normalizeToggleType(rawType)
            if (type === 'group' || type === 'groupEnd' || type === 'divider') {
                toggles.push({ key, label, type, options: [], defaultValue: '' })
            } else if (type === 'caption' && label) {
                toggles.push({ key, label, type, options: [], defaultValue: '' })
            } else if (key && label) {
                toggles.push({
                    key,
                    label,
                    type: type || 'boolean',
                    options: type === 'select' ? (rawOptions?.split(',') ?? []) : [],
                    defaultValue: type === 'select' ? '0' : '',
                })
            }
        }
        return toggles
    }

    // Accept early Malang/object-based module toggle data without dropping it.
    if (isRecord(value)) {
        return Object.entries(value).flatMap(([key, declaration]) => {
            if (typeof declaration === 'string') {
                return [
                    {
                        key,
                        label: declaration,
                        type: 'boolean' as const,
                        options: [],
                        defaultValue: '',
                    },
                ]
            }
            if (!isRecord(declaration)) return []
            const label = stringValue(declaration.label) || key
            return [
                {
                    key,
                    label,
                    type: 'boolean' as const,
                    options: [],
                    defaultValue: declaration.defaultEnabled === true ? '1' : '',
                },
            ]
        })
    }
    return []
}

/** Serialize controls back to the exact syntax consumed by PocketRisu modules and CharX cards. */
export function serializeRisuModuleToggles(toggles: PromptToggle[]): string {
    return toggles
        .map((toggle) => {
            if (toggle.type === 'boolean') return `${toggle.key}=${toggle.label}`
            if (toggle.type === 'select') {
                return `${toggle.key}=${toggle.label}=select=${toggle.options.join(',')}`
            }
            if (toggle.type === 'text' || toggle.type === 'textarea') {
                return `${toggle.key}=${toggle.label}=${toggle.type}`
            }
            return `${toggle.key}=${toggle.label}=${toggle.type}`
        })
        .join('\n')
}

function normalizeToggleType(value: string): PromptToggle['type'] | null {
    if (
        value === 'select' ||
        value === 'text' ||
        value === 'textarea' ||
        value === 'group' ||
        value === 'groupEnd' ||
        value === 'divider' ||
        value === 'caption'
    ) {
        return value
    }
    return null
}

function positionIndicator(position: ModulePrompt['position']): string {
    if (position === 'afterMain') return 'character_desc'
    if (position === 'afterChat') return 'replace_global_note'
    if (position === 'beforeChat') return 'character_first_message'
    return 'character_desc'
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

function stringValue(value: unknown): string {
    return typeof value === 'string' ? value : ''
}

function splitKeys(value: unknown): string[] {
    return stringValue(value)
        .split(',')
        .map((key) => key.trim())
        .filter(Boolean)
}

function finiteInteger(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback
}

function isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function mimeForExtension(extension: string): string {
    const value = extension.toLocaleLowerCase().replace(/^\./, '')
    if (value === 'png') return 'image/png'
    if (value === 'jpg' || value === 'jpeg') return 'image/jpeg'
    if (value === 'gif') return 'image/gif'
    if (value === 'webp') return 'image/webp'
    if (value === 'svg') return 'image/svg+xml'
    return 'application/octet-stream'
}
