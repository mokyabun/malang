import { Hono } from 'hono'

import type { AppContext } from '@/services'
import type { AppEnv } from '@/utils'

export function createDebugDomain(context: AppContext) {
    return new Hono<AppEnv>()
        .get('/requests', (c) =>
            c.json({ requests: context.store.generations.listRequestDebugRecords() }),
        )
        .delete('/requests', (c) => {
            const deleted = context.store.generations.clearRequestDebugRecords()
            return c.json({ deleted })
        })
}
