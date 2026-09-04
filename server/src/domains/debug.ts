import { Hono } from 'hono'

import type { AppContext } from '@/services'
import type { AppEnv } from '@/utils'

export function createDebugDomain(context: AppContext) {
    return new Hono<AppEnv>()
        .get('/requests', (c) => c.json({ requests: context.store.requestDebug.list() }))
        .delete('/requests', (c) => {
            const deleted = context.store.requestDebug.clear()
            return c.json({ deleted })
        })
}
