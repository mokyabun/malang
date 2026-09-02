import { describe, expect, test } from 'bun:test'

import { parseNdjson } from '../src/services/providers/ollama'

describe('Ollama NDJSON parser', () => {
    test('handles arbitrary network chunk boundaries and a final unterminated line', async () => {
        const source = ['{"message":{"content":"Hel', 'lo"}}\n\n{"done":true,"eval_count":2}']
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                for (const part of source) controller.enqueue(new TextEncoder().encode(part))
                controller.close()
            },
        })
        const values = []
        for await (const value of parseNdjson(stream)) values.push(value)
        expect(values).toHaveLength(2)
        expect(values[0]).toMatchObject({ message: { content: 'Hello' } })
        expect(values[1]).toMatchObject({ done: true, eval_count: 2 })
    })

    test('rejects malformed provider output', async () => {
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new TextEncoder().encode('not-json\n'))
                controller.close()
            },
        })
        const consume = async () => {
            for await (const _ of parseNdjson(stream)) {
                /* consume */
            }
        }
        expect(consume()).rejects.toThrow('malformed NDJSON')
    })
})
