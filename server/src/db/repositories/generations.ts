import type { GenerationParameters, Message, RequestDebugSnapshot } from '@malang/shared'
import { and, asc, desc, eq } from 'drizzle-orm'

import type { DatabaseHandle } from '../db'
import { generationRuns, requestDebugRecords } from '../schema'
import { iso, parseJson, RepositoryBase } from './base'
import { ConversationRepository } from './conversations'

export class GenerationRepository extends RepositoryBase {
    constructor(
        handle: DatabaseHandle,
        private readonly conversations: ConversationRepository,
    ) {
        super(handle)
    }

    recoverInterruptedGenerations(): void {
        const now = Date.now()
        this.sqlite.transaction(() => {
            this.sqlite
                .query(`
            UPDATE messages
            SET status = 'cancelled', updated_at = ?
            WHERE status = 'streaming'
              AND id IN (SELECT message_id FROM generation_runs WHERE status = 'running')
          `)
                .run(now)
            this.sqlite
                .query(`
            UPDATE generation_runs
            SET status = 'cancelled', error_code = 'cancelled',
                error_message = 'Server stopped during generation', completed_at = ?
            WHERE status = 'running'
          `)
                .run(now)
        })()
    }

    findRunningGeneration(conversationId: string) {
        return this.db
            .select()
            .from(generationRuns)
            .where(
                and(
                    eq(generationRuns.conversationId, conversationId),
                    eq(generationRuns.status, 'running'),
                ),
            )
            .get()
    }

    getActiveGeneration(conversationId: string) {
        const row = this.findRunningGeneration(conversationId)
        return row ? mapGenerationRun(row) : null
    }

    findGenerationByIdempotency(conversationId: string, key: string) {
        return this.db
            .select()
            .from(generationRuns)
            .where(
                and(
                    eq(generationRuns.conversationId, conversationId),
                    eq(generationRuns.idempotencyKey, key),
                ),
            )
            .get()
    }

    createGeneration(input: {
        id: string
        conversationId: string
        messageId: string | null
        idempotencyKey: string
        provider: string
        modelId: string
        parameters: GenerationParameters
    }): void {
        this.db
            .insert(generationRuns)
            .values({
                ...input,
                status: 'running',
                parametersJson: JSON.stringify(input.parameters),
                outputText: '',
                processedOutputText: '',
                startedAt: Date.now(),
            })
            .run()
    }

    attachGenerationMessage(id: string, messageId: string): void {
        this.db.update(generationRuns).set({ messageId }).where(eq(generationRuns.id, id)).run()
    }

    finishGeneration(
        id: string,
        update: {
            status: 'complete' | 'cancelled' | 'failed'
            inputTokens?: number
            outputTokens?: number
            errorCode?: string
            errorMessage?: string
            outputText?: string
            processedOutputText?: string
        },
    ): void {
        this.db
            .update(generationRuns)
            .set({ ...update, completedAt: Date.now() })
            .where(eq(generationRuns.id, id))
            .run()
    }

    getGeneration(id: string) {
        return this.db.select().from(generationRuns).where(eq(generationRuns.id, id)).get()
    }

    createRequestDebugRecord(input: {
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
            parametersJson: JSON.stringify(input.parameters),
            requestJson: JSON.stringify(input.request),
            createdAt: Date.now(),
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

    listRequestDebugRecords(limit = 100) {
        return this.db
            .select()
            .from(requestDebugRecords)
            .orderBy(desc(requestDebugRecords.createdAt))
            .limit(Math.max(1, Math.min(limit, 100)))
            .all()
            .map(mapRequestDebugRecord)
    }

    clearRequestDebugRecords(): number {
        const count = this.sqlite
            .query<{ count: number }, []>('SELECT COUNT(*) AS count FROM request_debug_records')
            .get()?.count
        this.db.delete(requestDebugRecords).run()
        return count || 0
    }

    listMessageGenerations(messageId: string) {
        return this.db
            .select()
            .from(generationRuns)
            .where(eq(generationRuns.messageId, messageId))
            .orderBy(asc(generationRuns.startedAt))
            .all()
            .map(mapGenerationRun)
    }

    selectGenerationOutput(messageId: string, generationId: string): Message | null {
        const run = this.db
            .select()
            .from(generationRuns)
            .where(
                and(eq(generationRuns.id, generationId), eq(generationRuns.messageId, messageId)),
            )
            .get()
        if (!run || run.status !== 'complete') return null
        return this.conversations.updateMessage(messageId, {
            content: run.processedOutputText || run.outputText,
            status: 'complete',
        })
    }
}

function mapGenerationRun(row: typeof generationRuns.$inferSelect) {
    return {
        id: row.id,
        conversationId: row.conversationId,
        messageId: row.messageId,
        status: row.status,
        provider: row.provider,
        modelId: row.modelId,
        parameters: parseJson<GenerationParameters>(row.parametersJson, {}),
        outputText: row.outputText,
        processedOutputText: row.processedOutputText,
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        errorCode: row.errorCode,
        errorMessage: row.errorMessage,
        startedAt: iso(row.startedAt),
        completedAt: iso(row.completedAt),
    }
}

function mapRequestDebugRecord(row: typeof requestDebugRecords.$inferSelect) {
    return {
        id: row.id,
        generationId: row.generationId,
        conversationId: row.conversationId,
        provider: row.provider,
        modelId: row.modelId,
        parameters: parseJson<GenerationParameters>(row.parametersJson, {}),
        request: parseJson<RequestDebugSnapshot>(row.requestJson, {
            endpoint: '',
            method: 'POST',
            headers: {},
            body: null,
        }),
        createdAt: iso(row.createdAt),
    }
}
