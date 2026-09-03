import type {
    ModelChainAgent,
    ModelChainGraph,
    ModelChainLayer,
    ModelChainPresetInput,
} from './index'

export const CHAIN_MAIN_NODE_ID = 'main-response'
export const chainAgentNodeId = (id: string) => `agent:${id}`
type Chain = Pick<ModelChainPresetInput, 'layers' | 'graph'>

/** Missing graph means a legacy layered chain; an explicitly empty graph stays empty. */
export function getChainGraph(chain: Chain): ModelChainGraph {
    if (chain.graph) return chain.graph
    const stages = [
        ...chain.layers
            .filter((layer) => layer.phase === 'pre')
            .map((layer) => layer.agents.map((agent) => chainAgentNodeId(agent.id))),
        [CHAIN_MAIN_NODE_ID],
        ...chain.layers
            .filter((layer) => layer.phase === 'post')
            .map((layer) => layer.agents.map((agent) => chainAgentNodeId(agent.id))),
    ].filter((stage) => stage.length)
    return {
        edges: stages.slice(1).flatMap((stage, index) =>
            stages[index]!.flatMap((source) =>
                stage.map((target) => ({
                    id: `${source}:${target}`,
                    source,
                    target,
                })),
            ),
        ),
        positions: {},
    }
}

function adjacency(edges: ModelChainGraph['edges'], reverse = false) {
    const result = new Map<string, string[]>()
    for (const edge of edges) {
        const from = reverse ? edge.target : edge.source
        const to = reverse ? edge.source : edge.target
        result.set(from, [...(result.get(from) ?? []), to])
    }
    return result
}

function reachable(start: string, links: Map<string, string[]>) {
    const found = new Set<string>()
    const pending = [...(links.get(start) ?? [])]
    while (pending.length) {
        const id = pending.pop()!
        if (found.has(id)) continue
        found.add(id)
        pending.push(...(links.get(id) ?? []))
    }
    return found
}

export function chainGraphError(chain: Chain): string | null {
    const graph = getChainGraph(chain)
    const ids = new Set([
        CHAIN_MAIN_NODE_ID,
        ...chain.layers.flatMap((layer) => layer.agents.map((agent) => chainAgentNodeId(agent.id))),
    ])
    const edgeIds = new Set<string>()
    const pairs = new Set<string>()
    for (const edge of graph.edges) {
        if (!ids.has(edge.source) || !ids.has(edge.target)) return '연결 대상 노드가 없습니다.'
        if (edge.source === edge.target) return '노드를 자기 자신에 연결할 수 없습니다.'
        const pair = `${edge.source}:${edge.target}`
        if (edgeIds.has(edge.id) || pairs.has(pair))
            return '같은 연결을 중복해서 추가할 수 없습니다.'
        edgeIds.add(edge.id)
        pairs.add(pair)
    }
    if (Object.keys(graph.positions).some((id) => !ids.has(id)))
        return '배치 정보에 없는 노드가 포함되어 있습니다.'
    const links = adjacency(graph.edges)
    for (const id of ids) {
        if (reachable(id, links).has(id)) return '순환 연결은 실행할 수 없습니다.'
    }
    return null
}

export type ChainExecutionNode = {
    id: string
    agent: ModelChainAgent
    layer: ModelChainLayer
    ancestors: Set<string>
}

export type ChainExecutionStep =
    | ChainExecutionNode
    | { id: typeof CHAIN_MAIN_NODE_ID; agent: null; ancestors: Set<string> }

/** Connectivity decides participation; directed dependencies decide execution order. */
export function planChainExecution(chain: Chain) {
    const graph = getChainGraph(chain)
    const incoming = adjacency(graph.edges, true)
    const connected = reachable(
        CHAIN_MAIN_NODE_ID,
        adjacency([
            ...graph.edges,
            ...graph.edges.map((edge) => ({ ...edge, source: edge.target, target: edge.source })),
        ]),
    )
    connected.add(CHAIN_MAIN_NODE_ID)
    const entries: ChainExecutionNode[] = chain.layers.flatMap((layer) =>
        layer.agents.map((agent) => {
            const id = chainAgentNodeId(agent.id)
            return { id, agent, layer, ancestors: reachable(id, incoming) }
        }),
    )
    const nodes = entries.filter((entry) => connected.has(entry.id))
    let pending: ChainExecutionStep[] = [
        ...nodes,
        { id: CHAIN_MAIN_NODE_ID, agent: null, ancestors: reachable(CHAIN_MAIN_NODE_ID, incoming) },
    ]
    const remaining = new Set(pending.map((entry) => entry.id))
    const batches: ChainExecutionStep[][] = []
    while (pending.length) {
        const ready = pending.filter(
            (entry) => !(incoming.get(entry.id) ?? []).some((id) => remaining.has(id)),
        )
        // Defensive guard for malformed stored data; never loop indefinitely.
        if (!ready.length) break
        batches.push(ready)
        ready.forEach((entry) => remaining.delete(entry.id))
        pending = pending.filter((entry) => remaining.has(entry.id))
    }
    return { nodes, batches, orphans: entries.filter((entry) => !connected.has(entry.id)) }
}
