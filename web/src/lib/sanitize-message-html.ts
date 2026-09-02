import DOMPurify, { type Config } from 'dompurify'
import markdownit from 'markdown-it'

import { transformRisuCss } from './risu-css'

const markdown = markdownit({
    html: true,
    breaks: true,
    linkify: false,
    typographer: true,
})

// PocketRisu deliberately treats indented blocks as normal chat text.
markdown.disable(['code'])

// ASCII survives DOMPurify consistently across browsers, Tauri WebView and the
// test DOM. A token is only restored when its index exists in this render's
// separately extracted style array, so ordinary model text stays inert.
const STYLE_TOKEN_PREFIX = 'RISU_STYLE_7F39E0_'
const STYLE_TOKEN_SUFFIX = '_END_RISU_STYLE'

const PURIFY_CONFIG: Config = {
    ADD_TAGS: [
        'iframe',
        'style',
        'risu-style',
        'x-em',
        'annotation',
        'semantics',
        'mrow',
        'mi',
        'mo',
        'mn',
        'msup',
        'msub',
        'mfrac',
        'msqrt',
    ],
    ADD_ATTR: [
        'allow',
        'allowfullscreen',
        'frameborder',
        'scrolling',
        'risu-ctrl',
        'risu-btn',
        'risu-trigger',
        'risu-mark',
        'risu-id',
        'x-hl-lang',
        'x-hl-text',
    ],
    ALLOW_DATA_ATTR: true,
    ALLOW_ARIA_ATTR: true,
    RETURN_DOM_FRAGMENT: true,
}

/** Render ordinary chat Markdown with PocketRisu's raw-HTML behavior. */
export function renderMessageHtml(value: string): string {
    const prepared = extractStyleBlocks(value)
    return sanitizeRenderedHtml(markdown.render(prepared.html), prepared.styles)
}

/** Sanitize an already-rendered HTML fragment with the same compatibility policy. */
export function sanitizeMessageHtml(value: string): string {
    const prepared = extractStyleBlocks(value)
    return sanitizeRenderedHtml(prepared.html, prepared.styles)
}

function sanitizeRenderedHtml(value: string, styles: string[]): string {
    const fragment = DOMPurify.sanitize(value, PURIFY_CONFIG) as unknown as DocumentFragment

    sanitizeInteractiveContent(fragment)
    prefixRisuClasses(fragment)
    restoreAndScopeStyleBlocks(fragment, styles)

    const container = document.createElement('div')
    container.append(fragment)
    return container.innerHTML
}

function sanitizeInteractiveContent(fragment: DocumentFragment) {
    // DOMPurify removes script nodes in browsers; keep this explicit for DOM
    // implementations used by desktop shells and tests as well.
    for (const script of fragment.querySelectorAll('script')) script.remove()

    for (const element of fragment.querySelectorAll('*')) {
        for (const attribute of Array.from(element.attributes)) {
            if (/^on/i.test(attribute.name)) element.removeAttribute(attribute.name)
        }
    }

    for (const element of fragment.querySelectorAll<HTMLElement>('[style]')) {
        const value = element.getAttribute('style') || ''
        const safe = value
            .split(';')
            .map((declaration) => declaration.trim())
            .filter(
                (declaration) =>
                    declaration &&
                    !/(?:expression\s*\(|javascript:|behavior\s*:|-moz-binding)/i.test(declaration),
            )
            .join('; ')
        if (safe) element.setAttribute('style', safe)
        else element.removeAttribute('style')
    }

    for (const image of fragment.querySelectorAll('img')) {
        if (!image.getAttribute('loading')) image.setAttribute('loading', 'lazy')
        if (!image.getAttribute('decoding')) image.setAttribute('decoding', 'async')
    }

    for (const link of fragment.querySelectorAll<HTMLAnchorElement>('a[href]')) {
        const href = link.getAttribute('href') || ''
        if (href.startsWith('http://') || href.startsWith('https://')) {
            link.target = '_blank'
            link.rel = 'noopener noreferrer'
        } else {
            link.setAttribute('href', '')
        }
    }

    for (const frame of fragment.querySelectorAll<HTMLIFrameElement>('iframe')) {
        const source = frame.getAttribute('src') || ''
        if (!source.startsWith('https://www.youtube.com/embed/')) {
            frame.remove()
            continue
        }
        frame.referrerPolicy = 'no-referrer'
    }
}

function prefixRisuClasses(fragment: DocumentFragment) {
    for (const element of fragment.querySelectorAll<HTMLElement>('[class]')) {
        element.className = element.className
            .split(/\s+/)
            .filter(Boolean)
            .map((name) =>
                name.startsWith('x-risu-') || name.startsWith('hljs') || name.startsWith('malang-')
                    ? name
                    : `x-risu-${name}`,
            )
            .join(' ')
    }
}

function extractStyleBlocks(value: string): { html: string; styles: string[] } {
    const styles: string[] = []
    const html = value
        .replace(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style\s*>/gi, (_match, source: string) => {
            const index = styles.push(source) - 1
            return `<span>${STYLE_TOKEN_PREFIX}${index}${STYLE_TOKEN_SUFFIX}</span>`
        })
        .replace(
            /<risu-style(?:\s[^>]*)?>([\s\S]*?)<\/risu-style\s*>/gi,
            (_match, source: string) => {
                const decoded = decodeHex(source.trim())
                if (decoded === undefined) return ''
                const index = styles.push(decoded) - 1
                return `<span>${STYLE_TOKEN_PREFIX}${index}${STYLE_TOKEN_SUFFIX}</span>`
            },
        )
    return { html, styles }
}

function restoreAndScopeStyleBlocks(fragment: DocumentFragment, styles: string[]) {
    const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT)
    const textNodes: Text[] = []
    while (walker.nextNode()) textNodes.push(walker.currentNode as Text)
    const tokenPattern = new RegExp(`${STYLE_TOKEN_PREFIX}(\\d+)${STYLE_TOKEN_SUFFIX}`, 'gu')
    for (const node of textNodes) {
        if (!node.data.includes(STYLE_TOKEN_PREFIX)) continue
        const replacement = document.createDocumentFragment()
        let cursor = 0
        for (const match of node.data.matchAll(tokenPattern)) {
            if (match.index > cursor) {
                replacement.append(document.createTextNode(node.data.slice(cursor, match.index)))
            }
            const source = styles[Number.parseInt(match[1] || '', 10)]
            const scoped = source === undefined ? undefined : transformRisuCss(source)
            if (scoped !== undefined) {
                const style = document.createElement('style')
                style.textContent = scoped.replaceAll(/<\/(?=style)/gi, '<\\/')
                replacement.append(style)
            }
            cursor = match.index + match[0].length
        }
        if (cursor < node.data.length) {
            replacement.append(document.createTextNode(node.data.slice(cursor)))
        }
        const parent = node.parentElement
        if (
            parent &&
            ['P', 'SPAN'].includes(parent.tagName) &&
            parent.childNodes.length === 1 &&
            node.data.startsWith(STYLE_TOKEN_PREFIX) &&
            node.data.endsWith(STYLE_TOKEN_SUFFIX)
        )
            parent.replaceWith(replacement)
        else node.replaceWith(replacement)
    }

    // PocketRisu's encoded style element is accepted as well for imported output.
    for (const encoded of fragment.querySelectorAll('risu-style')) {
        const source = decodeHex(encoded.textContent || '')
        if (source === undefined) {
            encoded.remove()
            continue
        }
        const style = document.createElement('style')
        const scoped = transformRisuCss(source)
        if (scoped === undefined) {
            encoded.remove()
            continue
        }
        style.textContent = scoped.replaceAll(/<\/(?=style)/gi, '<\\/')
        encoded.replaceWith(style)
    }
}

function decodeHex(value: string): string | undefined {
    if (!value || value.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(value)) return undefined
    const bytes = new Uint8Array(value.length / 2)
    for (let index = 0; index < value.length; index += 2) {
        bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16)
    }
    return new TextDecoder().decode(bytes)
}
