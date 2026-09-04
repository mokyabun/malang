import type { GenerationParameters, RequestDebugSnapshot } from '@malang/shared'
import { desc } from 'drizzle-orm'

import { requestDebugRecords } from '../schema'
import { iso, RepositoryBase } from './base'

export class RequestDebugRepository extends RepositoryBase {
    create(input: {
        generationId: string
        conversationId: string
        provider: string
        modelId: string
        parameters: GenerationParameters
        request: RequestDebugSnapshot
    }) {
        const row = {
            id: crypto.randomUUID(),
            generationId: input.generationId,
            conversationId: input.conversationId,
            provider: input.provider,
            modelId: input.modelId,
            parametersJson: input.parameters,
            requestJson: input.request,
            createdAt: new Date(),
        }
        this.db.insert(requestDebugRecords).values(row).run()
        this.sqlite
            .query(
                `DELETE FROM request_debug_records
                     WHERE id NOT IN (
                         SELECT id FROM request_debug_records ORDER BY created_at DESC LIMIT 100
                     )`,
            )
            .run()
        return mapRequestDebugRecord(row)
    }

    list(limit = 100) {
        return this.db
            .select()
            .from(requestDebugRecords)
            .orderBy(desc(requestDebugRecords.createdAt))
            .limit(Math.max(1, Math.min(limit, 100)))
            .all()
            .map(mapRequestDebugRecord)
    }

    clear(): number {
        const count = this.sqlite
            .query<{ count: number }, []>('SELECT COUNT(*) AS count FROM request_debug_records')
            .get()?.count
        this.db.delete(requestDebugRecords).run()
        return count || 0
    }
}

function mapRequestDebugRecord(row: typeof requestDebugRecords.$inferSelect) {
    return {
        id: row.id,
        generationId: row.generationId,
        conversationId: row.conversationId,
        provider: row.provider,
        modelId: row.modelId,
        parameters: row.parametersJson,
        request: row.requestJson,
        createdAt: iso(row.createdAt),
    }
}
