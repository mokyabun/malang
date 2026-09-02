import { ProviderSettingsInputSchema } from '@malang/shared'
import { Hono } from 'hono'

import type { AppContext } from '@/services'
import { providerFor } from '@/services/providers'
import { type AppEnv, jsonValidator } from '@/utils'

export function createProviderDomain(context: AppContext) {
    return new Hono<AppEnv>()
        .get('/', (c) => c.json(context.providers.get()))
        .put('/', jsonValidator(ProviderSettingsInputSchema), async (c) => {
            return c.json(await context.providers.update(c.req.valid('json')))
        })
        .post('/test', async (c) => {
            const config = await context.providers.requireRuntime()
            return c.json(await providerFor(config).healthCheck(config))
        })
        .get('/models', async (c) => {
            const config = await context.providers.requireRuntime()
            return c.json({ models: await providerFor(config).listModels(config) })
        })
}
