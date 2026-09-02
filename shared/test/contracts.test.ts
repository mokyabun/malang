import { describe, expect, test } from 'bun:test'

import {
    GenerationRequestSchema,
    LongTermMemorySettingsPatchSchema,
    ModelChainPresetInputSchema,
    ProviderConfigSchema,
} from '../src'

describe('shared contracts', () => {
    test('long-term memory patches do not materialize unspecified defaults', () => {
        expect(LongTermMemorySettingsPatchSchema.parse({ enabled: true })).toEqual({
            enabled: true,
        })
    })

    test('accepts a valid Ollama configuration', () => {
        expect(
            ProviderConfigSchema.parse({
                provider: 'ollama',
                baseUrl: 'http://localhost:11434',
                modelId: 'gemma3',
            }).provider,
        ).toBe('ollama')
    })

    test('requires idempotency keys for generations', () => {
        expect(() => GenerationRequestSchema.parse({ mode: 'reply', content: 'hello' })).toThrow()
    })

    test('validates server-side model chain presets', () => {
        const modelPresetId = crypto.randomUUID()
        const parsed = ModelChainPresetInputSchema.parse({
            name: 'Narrative review',
            description: 'Analyze, answer, then polish.',
            layers: [
                {
                    id: crypto.randomUUID(),
                    name: 'Analysis layer',
                    phase: 'pre',
                    agents: [
                        {
                            id: crypto.randomUUID(),
                            name: 'Continuity check',
                            modelPresetId,
                        },
                    ],
                },
            ],
        })
        expect(parsed.layers[0]?.agents[0]).toMatchObject({
            enabled: true,
            postMode: 'replace',
            includeSettingInfo: true,
            includeLongTermMemory: true,
        })
        expect(() =>
            ModelChainPresetInputSchema.parse({
                name: 'Empty chain',
                description: '',
                layers: [],
            }),
        ).toThrow()
    })
})
