import type {
    LongTermMemoryMetrics,
    LongTermMemorySettings,
    LongTermMemorySettingsPatch,
    LongTermMemoryState,
    LongTermMemorySummary,
} from '@malang/shared'
import { LongTermMemoryMetricsSchema, LongTermMemorySettingsSchema } from '@malang/shared'
import { and, asc, eq } from 'drizzle-orm'

import type { DatabaseHandle } from '../db'
import { conversationMemorySettings, conversationMemorySummaries } from '../schema'
import { iso, parseJson, RepositoryBase, requireValue } from './base'

export type SparseVector = Record<string, number>

export interface MemorySummaryRecord extends LongTermMemorySummary {
    vector: SparseVector
}

const defaultSettings = (): LongTermMemorySettings => LongTermMemorySettingsSchema.parse({})
const defaultMetrics = (): LongTermMemoryMetrics => LongTermMemoryMetricsSchema.parse({})

export class MemoryRepository extends RepositoryBase {
    constructor(handle: DatabaseHandle) {
        super(handle)
    }

    getSettings(conversationId: string): LongTermMemorySettings {
        const row = this.db
            .select()
            .from(conversationMemorySettings)
            .where(eq(conversationMemorySettings.conversationId, conversationId))
            .get()
        return row
            ? LongTermMemorySettingsSchema.parse({
                  ...defaultSettings(),
                  ...parseJson(row.settingsJson, {}),
              })
            : defaultSettings()
    }

    updateSettings(
        conversationId: string,
        patch: LongTermMemorySettingsPatch,
    ): LongTermMemorySettings {
        const settings = LongTermMemorySettingsSchema.parse({
            ...this.getSettings(conversationId),
            ...patch,
        })
        if (settings.recentMemoryRatio + settings.similarMemoryRatio > 1) {
            throw new Error('Recent and similar memory ratios must add up to at most 1')
        }
        const current = this.db
            .select({ metricsJson: conversationMemorySettings.metricsJson })
            .from(conversationMemorySettings)
            .where(eq(conversationMemorySettings.conversationId, conversationId))
            .get()
        this.db
            .insert(conversationMemorySettings)
            .values({
                conversationId,
                settingsJson: JSON.stringify(settings),
                metricsJson: current?.metricsJson || JSON.stringify(defaultMetrics()),
                updatedAt: Date.now(),
            })
            .onConflictDoUpdate({
                target: conversationMemorySettings.conversationId,
                set: { settingsJson: JSON.stringify(settings), updatedAt: Date.now() },
            })
            .run()
        return settings
    }

    getMetrics(conversationId: string): LongTermMemoryMetrics {
        const row = this.db
            .select({ metricsJson: conversationMemorySettings.metricsJson })
            .from(conversationMemorySettings)
            .where(eq(conversationMemorySettings.conversationId, conversationId))
            .get()
        return row
            ? LongTermMemoryMetricsSchema.parse({
                  ...defaultMetrics(),
                  ...parseJson(row.metricsJson, {}),
              })
            : defaultMetrics()
    }

    setMetrics(conversationId: string, metrics: LongTermMemoryMetrics): void {
        const settings = this.getSettings(conversationId)
        this.db
            .insert(conversationMemorySettings)
            .values({
                conversationId,
                settingsJson: JSON.stringify(settings),
                metricsJson: JSON.stringify(LongTermMemoryMetricsSchema.parse(metrics)),
                updatedAt: Date.now(),
            })
            .onConflictDoUpdate({
                target: conversationMemorySettings.conversationId,
                set: { metricsJson: JSON.stringify(metrics), updatedAt: Date.now() },
            })
            .run()
    }

    state(conversationId: string): LongTermMemoryState {
        return {
            settings: this.getSettings(conversationId),
            summaries: this.listSummaries(conversationId),
            metrics: this.getMetrics(conversationId),
        }
    }

    listSummaryRecords(conversationId: string): MemorySummaryRecord[] {
        return this.db
            .select()
            .from(conversationMemorySummaries)
            .where(eq(conversationMemorySummaries.conversationId, conversationId))
            .orderBy(asc(conversationMemorySummaries.createdAt))
            .all()
            .map((row) => ({
                id: row.id,
                conversationId: row.conversationId,
                text: row.text,
                sourceMessageIds: parseJson<string[]>(row.sourceMessageIdsJson, []),
                vector: parseJson<SparseVector>(row.vectorJson, {}),
                isImportant: row.isImportant,
                createdAt: iso(row.createdAt),
                updatedAt: iso(row.updatedAt),
            }))
    }

    listSummaries(conversationId: string): LongTermMemorySummary[] {
        return this.listSummaryRecords(conversationId).map(
            ({ vector: _vector, ...summary }) => summary,
        )
    }

    createSummary(input: {
        conversationId: string
        text: string
        sourceMessageIds: string[]
        vector: SparseVector
    }): LongTermMemorySummary {
        const now = Date.now()
        const id = crypto.randomUUID()
        this.db
            .insert(conversationMemorySummaries)
            .values({
                id,
                conversationId: input.conversationId,
                text: input.text,
                sourceMessageIdsJson: JSON.stringify(input.sourceMessageIds),
                vectorJson: JSON.stringify(input.vector),
                isImportant: false,
                createdAt: now,
                updatedAt: now,
            })
            .run()
        return requireValue(
            this.listSummaries(input.conversationId).find((summary) => summary.id === id),
            'Failed to create memory summary',
        )
    }

    updateSummary(
        conversationId: string,
        summaryId: string,
        patch: { text?: string; isImportant?: boolean; vector?: SparseVector },
    ): LongTermMemorySummary | null {
        const current = this.db
            .select()
            .from(conversationMemorySummaries)
            .where(
                and(
                    eq(conversationMemorySummaries.id, summaryId),
                    eq(conversationMemorySummaries.conversationId, conversationId),
                ),
            )
            .get()
        if (!current) return null
        this.db
            .update(conversationMemorySummaries)
            .set({
                text: patch.text ?? current.text,
                vectorJson:
                    patch.vector === undefined ? current.vectorJson : JSON.stringify(patch.vector),
                isImportant: patch.isImportant ?? current.isImportant,
                updatedAt: Date.now(),
            })
            .where(eq(conversationMemorySummaries.id, summaryId))
            .run()
        return (
            this.listSummaries(conversationId).find((summary) => summary.id === summaryId) ?? null
        )
    }

    deleteSummary(conversationId: string, summaryId: string): boolean {
        return (
            this.db
                .delete(conversationMemorySummaries)
                .where(
                    and(
                        eq(conversationMemorySummaries.id, summaryId),
                        eq(conversationMemorySummaries.conversationId, conversationId),
                    ),
                )
                .returning({ id: conversationMemorySummaries.id })
                .all().length > 0
        )
    }

    clear(conversationId: string): number {
        const deleted = this.db
            .delete(conversationMemorySummaries)
            .where(eq(conversationMemorySummaries.conversationId, conversationId))
            .returning({ id: conversationMemorySummaries.id })
            .all().length
        this.setMetrics(conversationId, defaultMetrics())
        return deleted
    }
}
