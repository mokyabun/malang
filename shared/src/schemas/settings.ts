import { z } from 'zod'

import { IdSchema } from './common'

const AppSettingsFields = {
    userName: z.string().min(1).max(100),
    globalVariables: z.record(z.string(), z.string()),
    /** Prompt toggle values are shared by every conversation and preset that declares the key. */
    promptToggleValues: z.record(z.string(), z.string()),
    defaultPromptPresetId: IdSchema.nullable(),
    /** Default primary model inherited by conversations without an explicit binding. */
    defaultModelPresetId: IdSchema.nullable(),
    /** Default model used only by Lua axLLM/auxiliary calls. Null inherits the primary model. */
    defaultAuxiliaryModelPresetId: IdSchema.nullable(),
    selectedPersonaId: IdSchema.nullable(),
    requestDebugEnabled: z.boolean(),
    autoBackupEnabled: z.boolean(),
    /**
     * RisuAI-compatible global switches: `jailbreak`/`cot`-type prompt blocks only render when
     * their matching switch is on (default off), independent of the block's own `enabled` flag.
     */
    jailbreakToggle: z.boolean(),
    chainOfThought: z.boolean(),
}

export const AppSettingsSchema = z.object({
    ...AppSettingsFields,
    promptToggleValues: AppSettingsFields.promptToggleValues.default({}),
    defaultModelPresetId: AppSettingsFields.defaultModelPresetId.default(null),
    defaultAuxiliaryModelPresetId: AppSettingsFields.defaultAuxiliaryModelPresetId.default(null),
    requestDebugEnabled: AppSettingsFields.requestDebugEnabled.default(false),
    autoBackupEnabled: AppSettingsFields.autoBackupEnabled.default(true),
    jailbreakToggle: AppSettingsFields.jailbreakToggle.default(false),
    chainOfThought: AppSettingsFields.chainOfThought.default(false),
})

/** PATCH input must not materialize defaults for fields that the caller omitted. */
export const AppSettingsPatchSchema = z.object(AppSettingsFields).partial()
