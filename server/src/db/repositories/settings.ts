import type { AppSettings } from '@malang/shared'
import { eq } from 'drizzle-orm'

import { appSettings } from '../schema'
import { normalizeToggleValues, RepositoryBase, requireValue } from './base'

export class SettingsRepository extends RepositoryBase {
    ensureSettings(): void {
        if (this.db.select().from(appSettings).where(eq(appSettings.id, 1)).get()) return
        this.db
            .insert(appSettings)
            .values({
                id: 1,
                userName: 'User',
                globalVariablesJson: {},
                promptToggleValuesJson: {},
                defaultPromptPresetId: null,
                defaultModelPresetId: null,
                defaultAuxiliaryModelPresetId: null,
                selectedPersonaId: null,
                providerJson: null,
                updatedAt: Date.now(),
            })
            .run()
    }

    getSettings(): AppSettings {
        this.ensureSettings()
        const row = requireValue(
            this.db.select().from(appSettings).where(eq(appSettings.id, 1)).get(),
            'Application settings are missing',
        )
        return {
            userName: row.userName,
            globalVariables: row.globalVariablesJson,
            promptToggleValues: normalizeToggleValues(row.promptToggleValuesJson),
            defaultPromptPresetId: row.defaultPromptPresetId,
            defaultModelPresetId: row.defaultModelPresetId,
            defaultAuxiliaryModelPresetId: row.defaultAuxiliaryModelPresetId,
            selectedPersonaId: row.selectedPersonaId,
            requestDebugEnabled: row.requestDebugEnabled,
            autoBackupEnabled: row.autoBackupEnabled,
            jailbreakToggle: row.jailbreakToggle,
            chainOfThought: row.chainOfThought,
        }
    }

    updateSettings(update: Partial<AppSettings>): AppSettings {
        const current = this.getSettings()
        const next = { ...current, ...update }
        this.db
            .update(appSettings)
            .set({
                userName: next.userName,
                globalVariablesJson: next.globalVariables,
                promptToggleValuesJson: next.promptToggleValues,
                defaultPromptPresetId: next.defaultPromptPresetId,
                defaultModelPresetId: next.defaultModelPresetId,
                defaultAuxiliaryModelPresetId: next.defaultAuxiliaryModelPresetId,
                selectedPersonaId: next.selectedPersonaId,
                requestDebugEnabled: next.requestDebugEnabled,
                autoBackupEnabled: next.autoBackupEnabled,
                jailbreakToggle: next.jailbreakToggle,
                chainOfThought: next.chainOfThought,
                updatedAt: Date.now(),
            })
            .where(eq(appSettings.id, 1))
            .run()
        return this.getSettings()
    }
}
