import { describe, expect, test } from 'bun:test'

import { AppSettingsPatchSchema, AppSettingsSchema } from './settings'

describe('application settings schemas', () => {
    test('applies defaults when parsing a complete settings response', () => {
        expect(
            AppSettingsSchema.parse({
                userName: 'User',
                globalVariables: {},
                defaultPromptPresetId: null,
                selectedPersonaId: null,
            }),
        ).toMatchObject({
            promptToggleValues: {},
            defaultModelPresetId: null,
            defaultAuxiliaryModelPresetId: null,
            requestDebugEnabled: false,
            autoBackupEnabled: true,
            jailbreakToggle: false,
            chainOfThought: false,
        })
    })

    test('does not add defaults to an unrelated settings patch', () => {
        expect(AppSettingsPatchSchema.parse({ autoBackupEnabled: false })).toEqual({
            autoBackupEnabled: false,
        })
    })

    test('preserves explicitly supplied prompt toggle values in a patch', () => {
        expect(AppSettingsPatchSchema.parse({ promptToggleValues: { quiet: '1' } })).toEqual({
            promptToggleValues: { quiet: '1' },
        })
    })
})
