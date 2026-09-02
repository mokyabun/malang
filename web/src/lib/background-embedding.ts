import type { ModuleAsset } from '@malang/shared'

import { transformRisuCss } from './risu-css'

const STYLE_BLOCK = /<style(?:\s[^>]*)?>([\s\S]*?)<\/style\s*>/gi
const HTML_TAG = /<\/?[a-z][^>]*>/i
const FORBIDDEN_AT_RULE = /@(import|namespace)\b/i
const ASSET_TOKEN = /\{\{(raw|path|img|image|asset|bg|video|video-img|audio)::(.+?)}}/gi
const LAYER_ASSET_TOKEN = /\{\{(?:img|image|asset|bg|video|video-img|audio)::.+?}}/gi

export interface BackgroundLayer {
    kind: 'background' | 'image' | 'video' | 'audio'
    name: string
    url: string
    mimeType: string
}

export interface ResolvedBackgroundEmbedding {
    css: string
    layers: BackgroundLayer[]
}

/**
 * Resolves the safe subset of Risu background embedding used by Malang:
 * conditional toggle blocks, scoped CSS, and local module asset commands.
 * Arbitrary imported HTML and scripts are never mounted.
 */
export function resolveBackgroundEmbedding(
    value: string,
    assets: ModuleAsset[],
    variables: Record<string, string>,
    assetHref: (assetId: string) => string,
    scope = '#malang-chat-root',
): ResolvedBackgroundEmbedding {
    const rendered = renderBackgroundTemplate(value, variables)
    const assetMap = moduleAssetMap(assets)
    const cssSource = extractBackgroundEmbeddingCss(rendered).replace(
        ASSET_TOKEN,
        (full, rawKind: string, rawName: string) => {
            const kind = rawKind.toLocaleLowerCase()
            if (kind !== 'raw' && kind !== 'path') return full
            const asset = findAsset(assetMap, rawName)
            return asset ? assetHref(asset.assetId) : ''
        },
    )
    const css = safeScopedCss(cssSource, scope)
    const layers: BackgroundLayer[] = []
    const withoutStyles = rendered.replace(STYLE_BLOCK, '')

    for (const match of withoutStyles.matchAll(ASSET_TOKEN)) {
        const command = (match[1] || '').toLocaleLowerCase()
        if (command === 'raw' || command === 'path') continue
        const name = match[2] || ''
        const asset = findAsset(assetMap, name)
        if (!asset) continue
        const kind: BackgroundLayer['kind'] =
            command === 'bg'
                ? 'background'
                : command === 'video' || command === 'video-img'
                  ? 'video'
                  : command === 'audio'
                    ? 'audio'
                    : asset.mimeType.startsWith('video/')
                      ? 'video'
                      : asset.mimeType.startsWith('audio/')
                        ? 'audio'
                        : 'image'
        layers.push({
            kind,
            name: asset.name || name,
            url: assetHref(asset.assetId),
            mimeType: asset.mimeType,
        })
    }

    return { css, layers }
}

export function scopedBackgroundEmbeddingCss(value: string, scope = '#malang-chat-root'): string {
    return safeScopedCss(extractBackgroundEmbeddingCss(value), scope)
}

export function extractBackgroundEmbeddingCss(value: string): string {
    const blocks = [...value.matchAll(STYLE_BLOCK)].map((match) => match[1]?.trim() || '')
    if (blocks.length) return blocks.filter(Boolean).join('\n')
    return HTML_TAG.test(value) ? '' : value.replace(LAYER_ASSET_TOKEN, '').trim()
}

export function renderBackgroundTemplate(
    source: string,
    variables: Record<string, string>,
): string {
    function renderRange(input: string, depth: number): string {
        if (depth > 20) return ''
        let output = ''
        let cursor = 0
        while (cursor < input.length) {
            const start = input.indexOf('{{#', cursor)
            if (start === -1) return output + input.slice(cursor)
            output += input.slice(cursor, start)
            const headerEnd = findTagEnd(input, start)
            if (headerEnd === -1) return output + input.slice(start)
            const header = input.slice(start + 2, headerEnd).trim()
            const kind = header.startsWith('#if')
                ? 'if'
                : header.startsWith('#when')
                  ? 'when'
                  : null
            if (!kind) {
                output += input.slice(start, headerEnd + 2)
                cursor = headerEnd + 2
                continue
            }
            const closing = findClosing(input, headerEnd + 2, kind)
            if (!closing) {
                cursor = headerEnd + 2
                continue
            }
            const body = splitElse(input.slice(headerEnd + 2, closing.closeStart))
            const condition = header
                .slice(kind === 'if' ? 3 : 5)
                .replace(/^::/, '')
                .trim()
            const truthy =
                kind === 'when'
                    ? evaluateWhen(condition, variables)
                    : isTruthy(expandExpressions(condition, variables))
            output += renderRange(truthy ? body.truthy : body.falsy, depth + 1)
            cursor = closing.closeEnd
        }
        return output
    }

    return expandExpressions(renderRange(source, 0), variables)
}

function safeScopedCss(value: string, scope: string): string {
    const css = value.trim()
    if (!css || !isBalancedStylesheet(css) || FORBIDDEN_AT_RULE.test(css)) return ''
    return transformRisuCss(css, scope) ?? ''
}

function moduleAssetMap(assets: ModuleAsset[]): Map<string, ModuleAsset> {
    const result = new Map<string, ModuleAsset>()
    for (const asset of assets) {
        for (const name of [asset.name, `${asset.name}.${asset.extension}`]) {
            result.set(normalizeAssetName(name), asset)
        }
    }
    return result
}

function findAsset(assets: Map<string, ModuleAsset>, name: string): ModuleAsset | undefined {
    const normalized = normalizeAssetName(name)
    return assets.get(normalized) || assets.get(normalized.replace(/\.[a-z0-9]+$/i, ''))
}

function normalizeAssetName(value: string): string {
    return value
        .trim()
        .toLocaleLowerCase()
        .replace(/[_ .-]/g, '')
}

function expandExpressions(source: string, variables: Record<string, string>): string {
    let result = source
    for (let pass = 0; pass < 12; pass += 1) {
        const next = result.replace(/\{\{([^{}]+)}}/g, (full, rawExpression: string) => {
            const expression = rawExpression.trim()
            const [rawName, ...args] = expression.split('::')
            const name = (rawName || '')
                .trim()
                .toLocaleLowerCase()
                .replace(/[\s_-]/g, '')
            const key = args.join('::')
            if (name === 'getglobalvar' || name === 'getvar') return variables[key] ?? ''
            if (name === 'toggle') return isTruthy(variables[key] ?? '') ? 'true' : 'false'
            if (name.startsWith('?'))
                return legacyComparison(expression.slice(1).trim()) ? 'true' : 'false'
            return full
        })
        if (next === result) break
        result = next
    }
    return result
}

function evaluateWhen(source: string, variables: Record<string, string>): boolean {
    const tokens = source.split('::')
    if (tokens[0] === 'toggle') return isTruthy(variables[tokens[1] || ''] ?? '')
    if (tokens[0] === 'var') return isTruthy(variables[tokens[1] || ''] ?? '')
    return isTruthy(expandExpressions(source, variables))
}

function legacyComparison(source: string): boolean {
    const match = source.match(/^([\s\S]*?)\s*(===|!==|==|!=|>=|<=|>|<|=)\s*([\s\S]*)$/)
    if (!match) return isTruthy(source)
    const left = (match[1] || '').trim()
    const operator = match[2] || '='
    const right = (match[3] || '').trim()
    if (operator === '=' || operator === '==' || operator === '===') return left === right
    if (operator === '!=' || operator === '!==') return left !== right
    const a = Number(left)
    const b = Number(right)
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false
    if (operator === '>') return a > b
    if (operator === '<') return a < b
    if (operator === '>=') return a >= b
    return a <= b
}

function isTruthy(value: string): boolean {
    const normalized = value.trim().toLocaleLowerCase()
    return normalized !== '' && !['0', 'false', 'null', 'undefined', 'off'].includes(normalized)
}

function findClosing(input: string, from: number, kind: 'if' | 'when') {
    let cursor = from
    let depth = 1
    while (cursor < input.length) {
        const start = input.indexOf('{{', cursor)
        if (start === -1) return null
        const end = findTagEnd(input, start)
        if (end === -1) return null
        const token = input.slice(start + 2, end).trim()
        if (token.startsWith('#if') || token.startsWith('#when')) depth += 1
        else if (token === '/if' || token === '/when') {
            depth -= 1
            if (depth === 0) {
                if (token !== `/${kind}`) return null
                return { closeStart: start, closeEnd: end + 2 }
            }
        }
        cursor = end + 2
    }
    return null
}

function splitElse(body: string): { truthy: string; falsy: string } {
    let depth = 0
    for (let cursor = 0; cursor < body.length;) {
        const next = body.indexOf('{{', cursor)
        if (next === -1) break
        const end = findTagEnd(body, next)
        if (end === -1) break
        const token = body.slice(next + 2, end).trim()
        if (token.startsWith('#if') || token.startsWith('#when')) depth += 1
        else if (token === '/if' || token === '/when') depth -= 1
        else if (token === ':else' && depth === 0)
            return { truthy: body.slice(0, next), falsy: body.slice(end + 2) }
        cursor = end + 2
    }
    return { truthy: body, falsy: '' }
}

function findTagEnd(input: string, start: number): number {
    let depth = 1
    for (let cursor = start + 2; cursor < input.length - 1;) {
        if (input.startsWith('{{', cursor)) {
            depth += 1
            cursor += 2
        } else if (input.startsWith('}}', cursor)) {
            depth -= 1
            if (depth === 0) return cursor
            cursor += 2
        } else cursor += 1
    }
    return -1
}

function isBalancedStylesheet(value: string): boolean {
    let depth = 0
    let quote: "'" | '"' | null = null
    let comment = false

    for (let index = 0; index < value.length; index += 1) {
        const character = value[index]
        const next = value[index + 1]

        if (comment) {
            if (character === '*' && next === '/') {
                comment = false
                index += 1
            }
            continue
        }
        if (quote) {
            if (character === '\\') index += 1
            else if (character === quote) quote = null
            continue
        }
        if (character === '/' && next === '*') {
            comment = true
            index += 1
        } else if (character === "'" || character === '"') quote = character
        else if (character === '{') depth += 1
        else if (character === '}') {
            depth -= 1
            if (depth < 0) return false
        }
    }

    return depth === 0 && quote === null && !comment
}
