import { and, eq } from 'drizzle-orm'

import { modelChainAgentMemories } from '../schema'
import { RepositoryBase } from './base'

export class ModelChainMemoryRepository extends RepositoryBase {
    get(conversationId: string, agentId: string): string {
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

    set(conversationId: string, agentId: string, content: string): void {
        this.db
            .insert(modelChainAgentMemories)
            .values({ conversationId, agentId, content, updatedAt: Date.now() })
            .onConflictDoUpdate({
                target: [modelChainAgentMemories.conversationId, modelChainAgentMemories.agentId],
                set: { content, updatedAt: Date.now() },
            })
            .run()
    }
}
