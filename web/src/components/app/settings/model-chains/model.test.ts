import { describe, expect, test } from 'bun:test'

import type { ModelChainPreset, ModelPreset } from '@malang/shared'

import {
    chainInput,
    copyChain,
    deleteAgent,
    findAgent,
    moveAgentToLayer,
    normalizeImportedChain,
    starterChain,
    updateAgent,
    validDraft,
} from './model'

describe('model chain editor operations', () => {
    test('copies chains with new IDs without mutating the original', () => {
        const original = starterChain('model-a')
        const copy = copyChain(original)
        expect(copy.layers[0]?.id).not.toBe(original.layers[0]?.id)
        expect(copy.layers[0]?.agents[0]?.id).not.toBe(original.layers[0]?.agents[0]?.id)
        copy.layers[0]!.agents[0]!.instruction = 'Changed'
        expect(original.layers[0]?.agents[0]?.instruction).not.toBe('Changed')
    })

    test('creates an isolated editable draft from a saved chain', () => {
        const preset = {
            ...starterChain('model-a'),
            id: 'chain-a',
            createdAt: '',
            updatedAt: '',
        } as ModelChainPreset
        const draft = chainInput(preset)
        draft.layers[0]!.agents[0]!.enabled = false
        expect(preset.layers[0]?.agents[0]?.enabled).toBe(true)
    })

    test('updates and deletes agents without changing the source draft', () => {
        const draft = starterChain('model-a')
        const agent = draft.layers[0]!.agents[0]!
        const updated = updateAgent(draft, { ...agent, name: 'Updated' })
        expect(findAgent(updated, agent.id)?.agent.name).toBe('Updated')
        expect(findAgent(draft, agent.id)?.agent.name).not.toBe('Updated')
        expect(findAgent(deleteAgent(updated, agent.id), agent.id)).toBeNull()
    })

    test('moves an agent between layers without duplicating it', () => {
        const draft = starterChain('model-a')
        const agent = draft.layers[0]!.agents[0]!
        const target = draft.layers[1]!
        const moved = moveAgentToLayer(draft, agent.id, target.id)
        expect(findAgent(moved, agent.id)?.layer.id).toBe(target.id)
        expect(
            moved.layers.flatMap((layer) => layer.agents).filter((item) => item.id === agent.id),
        ).toHaveLength(1)
        expect(findAgent(draft, agent.id)?.layer.id).not.toBe(target.id)
    })

    test('normalizes imported model bindings and disables post-processing memory', () => {
        const draft = starterChain('missing')
        draft.layers[1]!.agents[0]!.memoryEnabled = true
        const result = normalizeImportedChain(draft, [{ id: 'available' } as ModelPreset])
        expect(
            result.layers
                .flatMap((layer) => layer.agents)
                .every((agent) => agent.modelPresetId === 'available'),
        ).toBe(true)
        expect(result.layers[1]?.agents[0]?.memoryEnabled).toBe(false)
        expect(result.layers[0]?.id).not.toBe(draft.layers[0]?.id)
    })

    test('rejects incomplete drafts', () => {
        const draft = starterChain('model-a')
        expect(validDraft(draft)).toBe(true)
        expect(validDraft({ ...draft, name: '' })).toBe(false)
        expect(validDraft({ ...draft, layers: [] })).toBe(false)
    })
})
