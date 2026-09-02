import { afterEach, describe, expect, test } from 'bun:test'

import { ProviderConfigSchema, type CompiledMessage, type ProviderKind } from '@malang/shared'

import { providerFor } from '@/services/providers'
import type { RuntimeProviderConfig } from '@/services/providers/types'

const originalFetch = globalThis.fetch
afterEach(() => {
    globalThis.fetch = originalFetch
})

const messages: CompiledMessage[] = [
    { role: 'system', content: 'System' },
    { role: 'user', content: 'Hello' },
]

function config(
    provider: ProviderKind,
    extra: Record<string, unknown> = {},
): RuntimeProviderConfig {
    const parsed = ProviderConfigSchema.parse({
        provider,
        modelId: 'test-model',
        defaults: {},
        providerOptions: {},
        ...extra,
    }) as RuntimeProviderConfig
    return {
        ...parsed,
        ...(typeof extra.apiKey === 'string' ? { apiKey: extra.apiKey } : {}),
    }
}

async function collect(runtime: RuntimeProviderConfig) {
    const output: string[] = []
    for await (const chunk of providerFor(runtime).streamChat(runtime, {
        messages,
        parameters: {},
        signal: new AbortController().signal,
    })) {
        output.push(chunk.delta)
    }
    return output.join('')
}

describe('PocketRisu provider compatibility', () => {
    test('accepts every PocketRisu provider family in the public contract', () => {
        const providers = [
            'openai',
            'openrouter',
            'anthropic',
            'google',
            'vertex',
            'mistral',
            'cohere',
            'novelai',
            'novellist',
            'horde',
            'aws',
            'deepseek',
            'deepinfra',
            'nanogpt',
            'openai-compatible',
            'ooba',
            'mancer',
            'kobold',
            'ollama',
            'echo',
            'webllm',
            'plugin',
        ] as const
        for (const provider of providers) {
            const result = ProviderConfigSchema.safeParse({
                provider,
                modelId: 'model',
                defaults: {},
                providerOptions: {},
                ...(provider === 'vertex' ? { projectId: '', location: 'global' } : {}),
                ...(provider === 'aws' ? { region: 'us-east-1' } : {}),
                ...(provider === 'ollama' ? { baseUrl: 'http://127.0.0.1:11434' } : {}),
            })
            expect(result.success).toBe(true)
        }
    })

    test('streams OpenAI-compatible chat deltas', async () => {
        globalThis.fetch = (async () =>
            new Response(
                'data: {"choices":[{"delta":{"content":"Hello "}}]}\n\n' +
                    'data: {"choices":[{"delta":{"content":"world"}}]}\n\n' +
                    'data: [DONE]\n\n',
                { status: 200 },
            )) as unknown as typeof fetch
        expect(
            await collect(
                config('openai', {
                    apiKey: 'secret',
                    baseUrl: 'https://api.openai.test/v1',
                }),
            ),
        ).toBe('Hello world')
    })

    test('supports PocketRisu Ooba completions and OpenRouter routing options', async () => {
        const requests: Array<{ url: string; body: Record<string, unknown> }> = []
        globalThis.fetch = (async (input, init) => {
            const url =
                typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
            requests.push({
                url,
                body: JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as Record<
                    string,
                    unknown
                >,
            })
            if (url.includes('ooba')) {
                return Response.json({ choices: [{ text: 'Ooba' }] })
            }
            return new Response('data: {"choices":[{"delta":{"content":"Router"}}]}\n\n', {
                status: 200,
                headers: { 'content-type': 'text/event-stream' },
            })
        }) as typeof fetch
        expect(
            await collect(
                config('ooba', {
                    baseUrl: 'https://ooba.test/v1',
                    apiFormat: 'openai-completions',
                }),
            ),
        ).toBe('Ooba')
        expect(
            await collect(
                config('openrouter', {
                    apiKey: 'secret',
                    providerOptions: {
                        middleOut: true,
                        routing: { order: ['Anthropic'] },
                    },
                }),
            ),
        ).toBe('Router')
        expect(requests[0]?.url).toBe('https://ooba.test/v1/completions')
        expect(requests[1]?.body.transforms).toEqual(['middle-out'])
        expect(requests[1]?.body.provider).toEqual({ order: ['Anthropic'] })
    })

    test('streams Anthropic Messages deltas with Pocket role shaping', async () => {
        globalThis.fetch = (async () =>
            new Response(
                'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":4}}}\n\n' +
                    'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Claude"}}\n\n' +
                    'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":2}}\n\n',
                { status: 200 },
            )) as unknown as typeof fetch
        expect(
            await collect(
                config('anthropic', {
                    apiKey: 'secret',
                    baseUrl: 'https://anthropic.test/v1',
                }),
            ),
        ).toBe('Claude')
    })

    test('supports Cohere, Kobold, Mancer and developer Echo response formats', async () => {
        globalThis.fetch = (async (input) => {
            const url =
                typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
            if (url.includes('cohere')) return Response.json({ text: 'Cohere' })
            if (url.includes('mancer')) return Response.json({ results: [{ text: 'Mancer' }] })
            return Response.json({ results: [{ text: 'Kobold' }] })
        }) as typeof fetch
        expect(
            await collect(
                config('cohere', {
                    apiKey: 'secret',
                    baseUrl: 'https://cohere.test',
                }),
            ),
        ).toBe('Cohere')
        expect(
            await collect(config('kobold', { baseUrl: 'https://kobold.test/api/v1/generate' })),
        ).toBe('Kobold')
        expect(
            await collect(
                config('mancer', {
                    apiKey: 'secret',
                    baseUrl: 'https://mancer.test',
                }),
            ),
        ).toBe('Mancer')
        expect(
            await collect(
                config('echo', {
                    providerOptions: { message: 'Echo Message', delayMs: 0 },
                }),
            ),
        ).toBe('Echo Message')
    })

    test('explains server-incompatible WebLLM and browser plugin providers', () => {
        expect(() => providerFor(config('webllm')).validateConfig(config('webllm'))).toThrow(
            'browser GPU runtime',
        )
        expect(() => providerFor(config('plugin')).validateConfig(config('plugin'))).toThrow(
            'browser plugins',
        )
    })
})
