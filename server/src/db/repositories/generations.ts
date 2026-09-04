import type { GenerationParameters, Message } from '@malang/shared'
import { and, asc, eq } from 'drizzle-orm'

import type { DatabaseHandle } from '../db'
import { generationRuns } from '../schema'
import { iso, RepositoryBase } from './base'
import { MessageRepository } from './messages'

export class GenerationRepository extends RepositoryBase {
    constructor(
        handle: DatabaseHandle,
        private readonly message: MessageRepository,
    ) {
        super(handle)
    }

    recoverInterrupted(): void {
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

    findRunning(conversationId: string) {
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

    active(conversationId: string) {
        const row = this.findRunning(conversationId)
        return row ? mapGenerationRun(row) : null
    }

    findByIdempotency(conversationId: string, key: string) {
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

    create(input: {
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
                parametersJson: input.parameters,
                outputText: '',
                processedOutputText: '',
                startedAt: Date.now(),
            })
            .run()
    }

    attachMessage(id: string, messageId: string): void {
        this.db.update(generationRuns).set({ messageId }).where(eq(generationRuns.id, id)).run()
    }

    finish(
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

    get(id: string) {
        return this.db.select().from(generationRuns).where(eq(generationRuns.id, id)).get()
    }

    listByMessage(messageId: string) {
        return this.db
            .select()
            .from(generationRuns)
            .where(eq(generationRuns.messageId, messageId))
            .orderBy(asc(generationRuns.startedAt))
            .all()
            .map(mapGenerationRun)
    }

    selectOutput(messageId: string, generationId: string): Message | null {
        const run = this.db
            .select()
            .from(generationRuns)
            .where(
                and(eq(generationRuns.id, generationId), eq(generationRuns.messageId, messageId)),
            )
            .get()
        if (!run || run.status !== 'complete') return null
        return this.message.update(messageId, {
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
        parameters: row.parametersJson,
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
