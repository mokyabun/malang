import { Hono } from 'hono'

import { NotFoundError } from '@/errors'
import type { AppContext } from '@/services'
import type { AppEnv } from '@/utils'

export function createAssetDomain(context: AppContext) {
    return new Hono<AppEnv>().get('/:id', async (c) => {
        const asset = context.store.assets.getAsset(c.req.param('id'))
        const bytes = asset ? await context.assets.read(asset.id) : null
        if (!asset || !bytes) throw new NotFoundError('Asset not found')

        return new Response(bytes, {
            headers: {
                'content-type': asset.mimeType,
                'content-length': String(asset.size),
            },
        })
    })
}
