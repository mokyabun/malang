import { describe, expect, test } from 'bun:test'

import { activePromptToggles } from './prompt-toggles'

describe('active PocketRisu module toggles', () => {
    test('appends only enabled module declarations after preset declarations', () => {
        const presetToggle = {
            key: 'preset',
            label: 'Preset',
            type: 'boolean' as const,
            options: [],
            defaultValue: '',
        }
        const moduleToggle = {
            key: 'module',
            label: 'Module',
            type: 'select' as const,
            options: ['A', 'B'],
            defaultValue: '0',
        }
        const result = activePromptToggles(
            { toggles: [presetToggle] } as never,
            [
                { enabled: true, module: { toggles: [moduleToggle] } },
                { enabled: false, module: { toggles: [{ ...moduleToggle, key: 'disabled' }] } },
            ] as never,
        )

        expect(result).toEqual([presetToggle, moduleToggle])
    })
})
