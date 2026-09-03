import { describe, expect, test } from 'bun:test'

import {
    ModelChainPresetInputSchema,
    CHAIN_MAIN_NODE_ID as main,
    chainAgentNodeId as nodeId,
    chainGraphError,
    getChainGraph,
    planChainExecution,
    type ModelChainPresetInput,
} from '../src'

function fixture() {
    return ModelChainPresetInputSchema.parse({
        name: 'Graph',
        description: '',
        layers: Array.from({ length: 6 }, (_, i) => ({
            id: crypto.randomUUID(),
            name: `Layer ${i}`,
            phase: 'pre',
            agents: [
                { id: crypto.randomUUID(), name: `Agent ${i}`, modelPresetId: crypto.randomUUID() },
            ],
        })),
        graph: { edges: [], positions: {} },
    })
}
const edge = (source: string, target: string) => ({ id: crypto.randomUUID(), source, target })

describe('model chain graph contract and execution plan', () => {
    test('accepts main-only graphs and detached subgraphs without making implicit connections', () => {
        const draft = fixture()
        const ids = draft.layers.map((layer) => nodeId(layer.agents[0]!.id))
        draft.graph!.edges = [edge(ids[0]!, ids[1]!)]
        expect(ModelChainPresetInputSchema.safeParse(draft).success).toBe(true)
        expect(planChainExecution(draft).orphans).toHaveLength(6)
        expect(getChainGraph({ ...draft, graph: { edges: [], positions: {} } }).edges).toEqual([])
        expect(
            ModelChainPresetInputSchema.safeParse({
                ...draft,
                layers: [],
                graph: { edges: [], positions: {} },
            }).success,
        ).toBe(true)
    })

    test('runs every node connected to main and orders the whole directed graph', () => {
        const draft = fixture()
        const [a, b, c, d, e, f] = draft.layers.map((layer) => nodeId(layer.agents[0]!.id)) as [
            string,
            string,
            string,
            string,
            string,
            string,
        ]
        draft.graph!.edges = [
            edge(a, b),
            edge(a, c),
            edge(b, d),
            edge(c, d),
            edge(d, main),
            edge(main, e),
            edge(a, f),
        ]
        const plan = planChainExecution(draft)
        expect(plan.batches.map((batch) => batch.map((node) => node.id))).toEqual([
            [a],
            [b, c, f],
            [d],
            [main],
            [e],
        ])
        expect(plan.orphans).toEqual([])
        expect(plan.nodes.find((node) => node.id === b)!.ancestors.has(c)).toBe(false)
        expect(plan.nodes.find((node) => node.id === d)!.ancestors).toEqual(new Set([a, b, c]))
    })

    test('retains disabled nodes as routing points', () => {
        const draft = fixture()
        const [a, b] = draft.layers.map((layer) => nodeId(layer.agents[0]!.id))
        draft.layers[1]!.agents[0]!.enabled = false
        draft.graph!.edges = [edge(a!, b!), edge(b!, main)]
        expect(planChainExecution(draft).batches.map((batch) => batch[0]!.id)).toEqual([
            a!,
            b!,
            main,
        ])
    })

    test('rejects bad endpoints, duplicate edges, cycles and invalid coordinates at the API boundary', () => {
        const draft = fixture()
        const a = nodeId(draft.layers[0]!.agents[0]!.id)
        const b = nodeId(draft.layers[1]!.agents[0]!.id)
        for (const edges of [
            [edge('missing', main)],
            [edge(a, a)],
            [edge(a, b), edge(b, a)],
            [edge(a, main), edge(a, main)],
            [edge(main, a), edge(a, b), edge(b, main)],
        ]) {
            expect(
                ModelChainPresetInputSchema.safeParse({ ...draft, graph: { edges, positions: {} } })
                    .success,
            ).toBe(false)
        }
        expect(
            ModelChainPresetInputSchema.safeParse({
                ...draft,
                graph: { edges: [], positions: { [a]: { x: Infinity, y: 1 } } },
            }).success,
        ).toBe(false)
        expect(
            chainGraphError({
                ...draft,
                graph: { edges: [], positions: { missing: { x: 0, y: 0 } } },
            }),
        ).not.toBeNull()
        // Even corrupted persisted cycles cannot hang execution planning.
        const corrupt: ModelChainPresetInput = {
            ...draft,
            graph: { edges: [edge(a, b), edge(b, a), edge(b, main)], positions: {} },
        }
        expect(planChainExecution(corrupt).batches).toEqual([])
    })
})
