/// <reference types="bun" />

import { describe, expect, test } from 'bun:test'

import {
    extractBackgroundEmbeddingCss,
    renderBackgroundTemplate,
    resolveBackgroundEmbedding,
    scopedBackgroundEmbeddingCss,
} from './background-embedding'

describe('module background embedding', () => {
    test('extracts style blocks without rendering adjacent HTML', () => {
        const value =
            '<div>ignored</div><style>.risu-chat { color: silver; }</style><script>alert(1)</script>'
        expect(extractBackgroundEmbeddingCss(value)).toBe('.risu-chat { color: silver; }')
        expect(scopedBackgroundEmbeddingCss(value)).toBe(
            '#malang-chat-root .chattext .x-risu-risu-chat{color:silver;}',
        )
    })

    test('accepts raw CSS and rejects scope escapes or imports', () => {
        expect(scopedBackgroundEmbeddingCss('.panel { font-style: italic; }')).toContain(
            '#malang-chat-root .chattext .x-risu-panel{font-style:italic;}',
        )
        expect(scopedBackgroundEmbeddingCss('} body { display: none; }')).toBe('')
        expect(scopedBackgroundEmbeddingCss('@import "https://example.invalid/style.css";')).toBe(
            '',
        )
        expect(scopedBackgroundEmbeddingCss('<script>alert(1)</script>')).toBe('')
    })

    test('evaluates nested Risu toggle comparisons before extracting CSS', () => {
        const source = `
            {{#if {{? {{getglobalvar::toggle_theme}}=0}}}}<style>.chattext { color: white; }</style>{{/if}}
            {{#if {{? {{getglobalvar::toggle_theme}}=2}}}}<style>.chattext { color: gold; }</style>{{/if}}
        `
        const rendered = renderBackgroundTemplate(source, { toggle_theme: '2' })
        expect(rendered).not.toContain('color: white')
        expect(rendered).toContain('color: gold')
    })

    test('resolves imported module asset commands to served URLs', () => {
        const assetId = crypto.randomUUID()
        const result = resolveBackgroundEmbedding(
            '<style>.stage { background-image: url({{raw::moon}}); }</style>{{bg::moon}}',
            [
                {
                    assetId,
                    type: 'other',
                    name: 'moon',
                    extension: 'webp',
                    sourceUri: 'risum:0',
                    mimeType: 'image/webp',
                    size: 4,
                },
            ],
            {},
            (id) => `/api/v1/assets/${id}`,
        )

        expect(result.css).toContain(`/api/v1/assets/${assetId}`)
        expect(result.layers).toEqual([
            {
                kind: 'background',
                name: 'moon',
                url: `/api/v1/assets/${assetId}`,
                mimeType: 'image/webp',
            },
        ])
    })

    test('keeps layer commands out of CSS when conditional styles are disabled', () => {
        const assetId = crypto.randomUUID()
        const result = resolveBackgroundEmbedding(
            '{{#if {{? {{getglobalvar::toggle_theme}}=2}}}}<style>.chattext { color: gold; }</style>{{/if}}\n{{bg::moon}}',
            [
                {
                    assetId,
                    type: 'other',
                    name: 'moon',
                    extension: 'webp',
                    sourceUri: 'risum:0',
                    mimeType: 'image/webp',
                    size: 4,
                },
            ],
            { toggle_theme: '0' },
            (id) => `/api/v1/assets/${id}`,
        )

        expect(result.css).toBe('')
        expect(result.layers).toHaveLength(1)
        expect(result.layers[0]?.kind).toBe('background')
    })

    test('can scope imported theme CSS to the message transcript only', () => {
        const result = resolveBackgroundEmbedding(
            '<style>.chattext { color: gold; }</style>',
            [],
            {},
            (id) => `/api/v1/assets/${id}`,
            '#malang-chat-theme',
        )

        expect(result.css).toContain('#malang-chat-theme .chattext .x-risu-chattext{color:gold;}')
        expect(result.css).not.toContain('#malang-chat-root')
    })

    test('matches PocketRisu-prefixed message classes from module CSS', () => {
        const result = resolveBackgroundEmbedding(
            `<style>
                .regex-thought-block { color: gold; }
                @media (min-width: 40rem) {
                    .regex-dice-wrapper .info-row { display: grid; }
                }
            </style>`,
            [],
            {},
            (id) => `/api/v1/assets/${id}`,
            '#malang-chat-theme',
        )

        expect(result.css).toContain(
            '#malang-chat-theme .chattext .x-risu-regex-thought-block{color:gold;}',
        )
        expect(result.css).toContain(
            '#malang-chat-theme .chattext .x-risu-regex-dice-wrapper .x-risu-info-row{display:grid;}',
        )
        expect(result.css).not.toContain('@scope')
    })
})
