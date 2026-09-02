import { describe, expect, test } from 'bun:test'

import { GenerationEventSchema, ProviderConfigSchema } from '@malang/shared'

describe('shared runtime contracts from the server boundary', () => {
    test('validates provider and SSE event payloads', () => {
        expect(
            ProviderConfigSchema.parse({
                provider: 'ollama',
                baseUrl: 'http://localhost:11434',
                modelId: 'gemma3',
                defaults: {},
            }).provider,
        ).toBe('ollama')
        expect(
            GenerationEventSchema.safeParse({
                type: 'message.delta',
                generationId: crypto.randomUUID(),
                messageId: crypto.randomUUID(),
                delta: 'x',
            }).success,
        ).toBeTrue()
    })
})
