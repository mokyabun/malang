import { describe, expect, test } from 'bun:test'

import { toGeminiContents } from '../src/services/providers/vertex'

describe('Gemini message shaping (matches PocketRisu requestGoogleCloudVertex)', () => {
    test('only hoists the very first message into systemInstruction', () => {
        const result = toGeminiContents([
            { role: 'system', content: 'Main prompt' },
            { role: 'system', content: 'Description block' },
            { role: 'user', content: 'Hello' },
        ])

        expect(result.systemInstruction).toBe('Main prompt')
        // The second system message is not hoisted — it folds into a 'user' turn instead,
        // which then merges with the next (also 'user') turn in the consecutive-role pass.
        expect(result.contents).toEqual([
            { role: 'user', parts: [{ text: 'system:Description block\n\nHello' }] },
        ])
    })

    test('folds a later system message into an immediately preceding user turn', () => {
        const result = toGeminiContents([
            { role: 'user', content: 'Hello' },
            { role: 'system', content: 'A reminder' },
        ])

        expect(result.contents).toEqual([
            { role: 'user', parts: [{ text: 'Hello\nsystem:A reminder' }] },
        ])
    })

    test('maps assistant to model and merges consecutive same-role turns', () => {
        const result = toGeminiContents([
            { role: 'user', content: 'One' },
            { role: 'user', content: 'Two' },
            { role: 'assistant', content: 'Reply' },
        ])

        expect(result.contents).toEqual([
            { role: 'user', parts: [{ text: 'One\n\nTwo' }] },
            { role: 'model', parts: [{ text: 'Reply' }] },
        ])
    })

    test('omits systemInstruction when there is no leading system message', () => {
        const result = toGeminiContents([{ role: 'user', content: 'Hi' }])
        expect(result.systemInstruction).toBe('')
    })
})
