import type { LongTermMemoryMetrics } from '@malang/shared'
import { LongTermMemoryMetricsSchema } from '@malang/shared'
import { eq } from 'drizzle-orm'

import type { DatabaseHandle } from '../db'
import { conversationMemorySettings } from '../schema'
import { RepositoryBase } from './base'
import { MemorySettingsRepository } from './memory-settings'

export const defaultMemoryMetrics = (): LongTermMemoryMetrics =>
    LongTermMemoryMetricsSchema.parse({})

export class MemoryMetricsRepository extends RepositoryBase {
    constructor(
        handle: DatabaseHandle,
        private readonly settings: MemorySettingsRepository,
    ) {
        super(handle)
    }

    get(conversationId: string): LongTermMemoryMetrics {
        const row = this.db
            .select({ metricsJson: conversationMemorySettings.metricsJson })
            .from(conversationMemorySettings)
            .where(eq(conversationMemorySettings.conversationId, conversationId))
            .get()
        return row
            ? LongTermMemoryMetricsSchema.parse({ ...defaultMemoryMetrics(), ...row.metricsJson })
            : defaultMemoryMetrics()
    }

    set(conversationId: string, metrics: LongTermMemoryMetrics): void {
        this.db
            .insert(conversationMemorySettings)
            .values({
                conversationId,
                settingsJson: this.settings.get(conversationId),
                metricsJson: LongTermMemoryMetricsSchema.parse(metrics),
                updatedAt: Date.now(),
            })
            .onConflictDoUpdate({
                target: conversationMemorySettings.conversationId,
                set: { metricsJson: metrics, updatedAt: Date.now() },
            })
            .run()
    }
}
