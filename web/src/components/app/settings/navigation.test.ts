import { describe, expect, test } from 'bun:test'

import { SETTINGS_NAV } from './navigation'
import { isSettingsSection, SETTINGS_SECTIONS } from './types'

describe('settings navigation', () => {
    test('includes every supported route exactly once', () => {
        const sections = SETTINGS_NAV.map((item) => item.section)
        expect(sections).toEqual([...SETTINGS_SECTIONS])
        expect(new Set(sections).size).toBe(sections.length)
    })

    test('keeps the modules URL and rejects unsupported sections', () => {
        expect(isSettingsSection('modules')).toBe(true)
        expect(isSettingsSection('provider')).toBe(true)
        expect(isSettingsSection('unknown')).toBe(false)
        expect(isSettingsSection('')).toBe(false)
    })
})
