import { AppSettingsSchema } from '@malang/shared'
import { Hono } from 'hono'

import { ValidationError } from '@/errors'
import type { AppContext } from '@/services'
import { type AppEnv, jsonValidator } from '@/utils'

export function createSettingsDomain(context: AppContext) {
    return new Hono<AppEnv>()
        .get('/', (c) => c.json(context.store.settings.getSettings()))
        .patch('/', jsonValidator(AppSettingsSchema.partial()), (c) => {
            const body = c.req.valid('json')
            if (body.defaultPromptPresetId && !context.prompts.get(body.defaultPromptPresetId)) {
                throw new ValidationError('Default prompt preset does not exist')
            }
            if (body.selectedPersonaId && !context.personas.get(body.selectedPersonaId)) {
                throw new ValidationError('Persona does not exist')
            }
            if (
                body.defaultModelPresetId &&
                !context.providers.getModelPreset(body.defaultModelPresetId)
            ) {
                throw new ValidationError('Default model preset does not exist')
            }
            if (
                body.defaultAuxiliaryModelPresetId &&
                !context.providers.getModelPreset(body.defaultAuxiliaryModelPresetId)
            ) {
                throw new ValidationError('Default auxiliary model preset does not exist')
            }
            return c.json(context.store.settings.updateSettings(body))
        })
}
