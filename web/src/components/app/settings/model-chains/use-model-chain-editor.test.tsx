import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'

import type { ModelChainPreset, ModelPreset } from '@malang/shared'
import { Window } from 'happy-dom'
import { act, useLayoutEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import { api } from '@/lib/api'

import { starterChain } from './model'
import { useModelChainEditor } from './use-model-chain-editor'

const modelId = '11111111-1111-4111-8111-111111111111'
const models = [{ id: modelId, name: 'Model' }] as ModelPreset[]
let root: Root
let container: HTMLDivElement
let editor: ReturnType<typeof useModelChainEditor>
let restoreMocks: Array<() => void>

beforeEach(() => {
    const window = new Window({ url: 'https://malang.test/' })
    Object.assign(globalThis, { window, document: window.document, IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    restoreMocks = []
})

afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    restoreMocks.forEach((restore) => restore())
})

async function mount(modelPresets = models) {
    const published: ModelChainPreset[][] = []
    function Harness() {
        const value = useModelChainEditor({
            presets: [],
            modelPresets,
            onChanged: (presets) => published.push(presets),
        })
        useLayoutEffect(() => {
            editor = value
        })
        return null
    }
    await act(async () => root.render(<Harness />))
    return published
}

function fileOf(value: unknown): File {
    return { text: async () => JSON.stringify(value) } as File
}

describe('model chain editor persistence', () => {
    test('requires a model before opening a new chain', async () => {
        await mount([])
        await act(async () => editor.beginCreate())
        expect(editor.dialogOpen).toBe(false)
        expect(editor.notice).toContain('모델 프리셋')
    })

    test('creates a chain including the editable graph and closes after publishing', async () => {
        const published = await mount()
        const create = spyOn(api, 'createModelChain').mockImplementation(async (draft) => ({
            ...draft,
            id: 'saved',
            sortOrder: 0,
            createdAt: '',
            updatedAt: '',
        }))
        const list = spyOn(api, 'modelChains').mockResolvedValue({ presets: [] })
        restoreMocks.push(
            () => create.mockRestore(),
            () => list.mockRestore(),
        )
        await act(async () => editor.beginCreate())
        const draft = editor.draft!
        await act(async () => {
            await editor.savePreset()
        })
        expect(create).toHaveBeenCalledWith(draft)
        expect(Object.keys(create.mock.calls[0]![0]).sort()).toEqual([
            'description',
            'graph',
            'layers',
            'name',
        ])
        expect(published).toHaveLength(1)
        expect(editor.dialogOpen).toBe(false)
        expect(editor.saving).toBe(false)
    })

    test('updates a saved chain and preserves its layer and agent IDs', async () => {
        await mount()
        const preset = {
            ...starterChain(modelId),
            id: 'saved',
            sortOrder: 0,
            createdAt: '',
            updatedAt: '',
        }
        const update = spyOn(api, 'updateModelChain').mockResolvedValue(preset)
        const list = spyOn(api, 'modelChains').mockResolvedValue({ presets: [preset] })
        restoreMocks.push(
            () => update.mockRestore(),
            () => list.mockRestore(),
        )
        await act(async () => editor.beginEdit(preset))
        await act(async () => {
            await editor.savePreset()
        })
        expect(update.mock.calls[0]![0]).toBe(preset.id)
        expect(update.mock.calls[0]![1].layers).toEqual(preset.layers)
        expect(editor.dialogOpen).toBe(false)
    })

    test('keeps the draft open and reports a failed save', async () => {
        await mount()
        const create = spyOn(api, 'createModelChain').mockRejectedValue(
            new Error('테스트 저장 오류'),
        )
        restoreMocks.push(() => create.mockRestore())
        await act(async () => editor.beginCreate())
        const draft = editor.draft
        await act(async () => {
            await editor.savePreset()
        })
        expect(editor.dialogOpen).toBe(true)
        expect(editor.draft).toBe(draft)
        expect(editor.notice).toBe('테스트 저장 오류')
        expect(editor.saving).toBe(false)
    })

    test('does not send invalid drafts to the API', async () => {
        await mount()
        const create = spyOn(api, 'createModelChain')
        restoreMocks.push(() => create.mockRestore())
        await act(async () => editor.beginCreate())
        await act(async () => editor.setDraft({ ...editor.draft!, name: '' }))
        await act(async () => {
            await editor.savePreset()
        })
        expect(create).not.toHaveBeenCalled()
        expect(editor.notice).toContain('이름')
    })

    test('failed imports preserve edits and successful imports open an isolated new draft', async () => {
        await mount()
        await act(async () => editor.beginCreate())
        const draft = editor.draft!
        await act(async () => {
            await editor.importDraft(fileOf({ layers: [] }))
        })
        expect(editor.draft).toBe(draft)
        expect(editor.notice).not.toBe('')
        await act(async () => {
            await editor.importDraft(fileOf(draft))
        })
        expect(editor.editingId).toBeNull()
        expect(editor.draft!.layers[0]!.id).not.toBe(draft.layers[0]!.id)
        expect(editor.selectedAgentId).toBe(editor.draft!.layers[0]!.agents[0]!.id)
        expect(editor.notice).toBe('')
    })
})
