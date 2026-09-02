import { PromptModuleInputSchema } from '@malang/shared'
import { Hono } from 'hono'

import { NotFoundError } from '@/errors'
import type { AppContext } from '@/services'
import { type AppEnv, binaryResponse, jsonValidator, parseEnum, readImportFile } from '@/utils'

export function createPromptModuleDomain(context: AppContext) {
    return new Hono<AppEnv>()
        .get('/', (c) => c.json({ modules: context.modules.list() }))
        .post('/', jsonValidator(PromptModuleInputSchema), (c) =>
            c.json(context.modules.create(c.req.valid('json')), 201),
        )
        .post('/import', async (c) => {
            const file = await readImportFile(c, context.config.limits.importBytes)
            return c.json(await context.modules.import(file.bytes, file.filename), 201)
        })
        .get('/:id/export', async (c) => {
            const format = parseEnum(
                c.req.query('format') ?? 'json',
                ['json', 'risum', 'charx'] as const,
                'format',
            )
            const bytes = await context.modules.export(c.req.param('id'), format)
            if (!bytes) throw new NotFoundError('Prompt module not found')
            return binaryResponse(
                bytes,
                format === 'json'
                    ? 'application/json'
                    : format === 'charx'
                      ? 'application/zip'
                      : 'application/octet-stream',
                `module-${c.req.param('id')}.${format}`,
            )
        })
        .get('/:id', (c) => {
            const module = context.modules.get(c.req.param('id'))
            if (!module) throw new NotFoundError('Prompt module not found')
            return c.json(module)
        })
        .put('/:id', jsonValidator(PromptModuleInputSchema), (c) => {
            const module = context.modules.update(c.req.param('id'), c.req.valid('json'))
            if (!module) throw new NotFoundError('Prompt module not found')
            return c.json(module)
        })
        .delete('/:id', (c) => {
            if (!context.modules.delete(c.req.param('id'))) {
                throw new NotFoundError('Prompt module not found')
            }
            return c.body(null, 204)
        })
}
