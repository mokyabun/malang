import type {
    ModelChainAgent,
    ModelChainLayer,
    ModelChainPreset,
    ModelChainPresetInput,
} from '@malang/shared'
import { and, asc, eq, max } from 'drizzle-orm'

import type { DatabaseHandle } from '../db'
import { conversations, modelChainAgentMemories, modelChainPresets } from '../schema'
import { iso, parseJson, RepositoryBase, requireValue } from './base'

export class ModelChainRepository extends RepositoryBase {
    constructor(handle: DatabaseHandle) {
        super(handle)
    }

    list(): ModelChainPreset[] {
        return this.db
            .select()
            .from(modelChainPresets)
            .orderBy(asc(modelChainPresets.sortOrder), asc(modelChainPresets.createdAt))
            .all()
            .map(mapModelChainPreset)
    }

    get(id: string): ModelChainPreset | null {
        const row = this.db
            .select()
            .from(modelChainPresets)
            .where(eq(modelChainPresets.id, id))
            .get()
        return row ? mapModelChainPreset(row) : null
    }

    create(input: ModelChainPresetInput): ModelChainPreset {
        const now = Date.now()
        const id = crypto.randomUUID()
        const last = this.db
            .select({ value: max(modelChainPresets.sortOrder) })
            .from(modelChainPresets)
            .get()
        this.db
            .insert(modelChainPresets)
            .values({
                id,
                name: input.name,
                description: input.description,
                stepsJson: serializeChainConfig(input),
                sortOrder: (last?.value ?? -1) + 1,
                createdAt: now,
                updatedAt: now,
            })
            .run()
        return requireValue(this.get(id), 'Failed to create model chain preset')
    }

    update(id: string, input: ModelChainPresetInput): ModelChainPreset | null {
        if (!this.get(id)) return null
        this.db
            .update(modelChainPresets)
            .set({
                name: input.name,
                description: input.description,
                stepsJson: serializeChainConfig(input),
                updatedAt: Date.now(),
            })
            .where(eq(modelChainPresets.id, id))
            .run()
        return this.get(id)
    }

    getAgentMemory(conversationId: string, agentId: string): string {
        return (
            this.db
                .select({ content: modelChainAgentMemories.content })
                .from(modelChainAgentMemories)
                .where(
                    and(
                        eq(modelChainAgentMemories.conversationId, conversationId),
                        eq(modelChainAgentMemories.agentId, agentId),
                    ),
                )
                .get()?.content ?? ''
        )
    }

    setAgentMemory(conversationId: string, agentId: string, content: string): void {
        this.db
            .insert(modelChainAgentMemories)
            .values({ conversationId, agentId, content, updatedAt: Date.now() })
            .onConflictDoUpdate({
                target: [modelChainAgentMemories.conversationId, modelChainAgentMemories.agentId],
                set: { content, updatedAt: Date.now() },
            })
            .run()
    }

    delete(id: string): 'deleted' | 'in_use' | 'not_found' {
        if (!this.get(id)) return 'not_found'
        if (
            this.db
                .select({ id: conversations.id })
                .from(conversations)
                .where(eq(conversations.modelChainPresetId, id))
                .limit(1)
                .get()
        ) {
            return 'in_use'
        }
        this.db.delete(modelChainPresets).where(eq(modelChainPresets.id, id)).run()
        return 'deleted'
    }
}

function mapModelChainPreset(row: typeof modelChainPresets.$inferSelect): ModelChainPreset {
    const config = parseChainConfig(row.stepsJson)
    return {
        id: row.id,
        name: row.name,
        description: row.description,
        layers: config.layers,
        sortOrder: row.sortOrder,
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
    }
}

function serializeChainConfig(input: ModelChainPresetInput): string {
    return JSON.stringify({
        version: 2,
        layers: input.layers,
    })
}

function parseChainConfig(raw: string): Pick<ModelChainPreset, 'layers'> {
    const parsed = parseJson<unknown>(raw, [])
    if (!Array.isArray(parsed) && Array.isArray((parsed as { layers?: unknown[] }).layers)) {
        return {
            layers: (parsed as { layers: ModelChainLayer[] }).layers.map(normalizeLayer),
        }
    }

    const config = Array.isArray(parsed)
        ? {
              steps: parsed,
              preRequestMode: 'parallel' as const,
              postRequestMode: 'sequential' as const,
          }
        : (parsed as {
              steps?: LegacyStep[]
              preRequestMode?: 'sequential' | 'parallel'
              postRequestMode?: 'sequential' | 'parallel'
          })
    const steps = Array.isArray(config.steps) ? config.steps : []
    return {
        layers: [
            ...legacyLayers(steps, 'pre', config.preRequestMode ?? 'parallel'),
            ...legacyLayers(steps, 'post', config.postRequestMode ?? 'sequential'),
        ],
    }
}

type LegacyStep = Partial<ModelChainAgent> & {
    id: string
    name: string
    phase: 'pre' | 'post'
    modelPresetId: string
}

function legacyLayers(
    steps: LegacyStep[],
    phase: ModelChainLayer['phase'],
    mode: 'sequential' | 'parallel',
): ModelChainLayer[] {
    const agents = steps
        .filter((step) => step.phase === phase)
        .map((step) => ({
            ...normalizeAgent(step),
            memoryEnabled: phase === 'pre' && step.memoryEnabled === true,
        }))
    if (!agents.length) return []
    if (mode === 'parallel') {
        return [
            {
                id: agents[0]!.id,
                name: phase === 'pre' ? '사전 분석' : '후처리',
                phase,
                agents,
            },
        ]
    }
    return agents.map((agent, index) => ({
        id: agent.id,
        name: `${phase === 'pre' ? '사전 분석' : '후처리'} ${index + 1}`,
        phase,
        agents: [agent],
    }))
}

function normalizeLayer(layer: ModelChainLayer): ModelChainLayer {
    return {
        id: layer.id,
        name: layer.name,
        phase: layer.phase,
        agents: Array.isArray(layer.agents)
            ? layer.agents.map((agent) => ({
                  ...normalizeAgent(agent),
                  memoryEnabled: layer.phase === 'pre' && agent.memoryEnabled === true,
              }))
            : [],
    }
}

function normalizeAgent(
    agent: Partial<ModelChainAgent> & Pick<ModelChainAgent, 'id' | 'name' | 'modelPresetId'>,
): ModelChainAgent {
    return {
        id: agent.id,
        name: agent.name,
        modelPresetId: agent.modelPresetId,
        systemPrompt: agent.systemPrompt ?? '',
        instruction: agent.instruction ?? '',
        enabled: agent.enabled !== false,
        postMode: agent.postMode ?? 'replace',
        assistantPrefill: agent.assistantPrefill === true,
        includeSettingInfo: agent.includeSettingInfo !== false,
        includeGlobalNote: agent.includeGlobalNote === true,
        includeLongTermMemory: agent.includeLongTermMemory !== false,
        includeRecentChat: agent.includeRecentChat !== false,
        includeCurrentUserInput: agent.includeCurrentUserInput !== false,
        includePreviousNotes: agent.includePreviousNotes !== false,
        memoryEnabled: agent.memoryEnabled === true,
        memoryInstruction: agent.memoryInstruction ?? '',
        memoryFormat: agent.memoryFormat ?? '',
    }
}
