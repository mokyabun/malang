import { z } from 'zod'

import { IdSchema } from './common'

export const AppSettingsSchema = z.object({
    userName: z.string().min(1).max(100),
    globalVariables: z.record(z.string(), z.string()),
    /** Prompt toggle values are shared by every conversation and preset that declares the key. */
    promptToggleValues: z.record(z.string(), z.string()).default({}),
    defaultPromptPresetId: IdSchema.nullable(),
    /** Default primary model inherited by conversations without an explicit binding. */
    defaultModelPresetId: IdSchema.nullable().default(null),
    /** Default model used only by Lua axLLM/auxiliary calls. Null inherits the primary model. */
    defaultAuxiliaryModelPresetId: IdSchema.nullable().default(null),
    selectedPersonaId: IdSchema.nullable(),
    requestDebugEnabled: z.boolean().default(false),
    autoBackupEnabled: z.boolean().default(true),
    /**
     * RisuAI-compatible global switches: `jailbreak`/`cot`-type prompt blocks only render when
     * their matching switch is on (default off), independent of the block's own `enabled` flag.
     */
    jailbreakToggle: z.boolean().default(false),
    chainOfThought: z.boolean().default(false),
})
