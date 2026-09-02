import type { ModelChainPresetInput } from '@malang/shared'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { LaneHeader } from './lane-header'
import { LayerRow } from './layer-row'
import { type Phase, newLayer, newAgent, firstAgent, totalAgents } from './model'

export function PipelineCanvas({
    draft,
    selectedAgentId,
    modelPresetId,
    onChange,
    onSelect,
}: {
    draft: ModelChainPresetInput
    selectedAgentId: string | null
    modelPresetId: string
    onChange: (draft: ModelChainPresetInput) => void
    onSelect: (id: string) => void
}) {
    function addLayer(phase: Phase) {
        if (draft.layers.length >= 12) return
        const layer = newLayer(
            phase,
            modelPresetId,
            draft.layers.filter((item) => item.phase === phase).length + 1,
        )
        const firstPost = draft.layers.findIndex((item) => item.phase === 'post')
        const insertAt = phase === 'pre' && firstPost >= 0 ? firstPost : draft.layers.length
        const layers = [...draft.layers]
        layers.splice(insertAt, 0, layer)
        onChange({ ...draft, layers })
        onSelect(layer.agents[0]!.id)
    }

    function addAgent(layerId: string) {
        const layer = draft.layers.find((item) => item.id === layerId)
        if (!layer || layer.agents.length >= 8 || totalAgents(draft) >= 32) return
        const agent = newAgent(layer.phase, modelPresetId, layer.agents.length + 1)
        onChange({
            ...draft,
            layers: draft.layers.map((item) =>
                item.id === layerId ? { ...item, agents: [...item.agents, agent] } : item,
            ),
        })
        onSelect(agent.id)
    }

    function deleteLayer(layerId: string) {
        const layer = draft.layers.find((item) => item.id === layerId)
        if (!layer || draft.layers.length === 1) return
        if (
            !window.confirm(
                `“${layer.name}” 레이어와 에이전트 ${layer.agents.length}개를 삭제할까요?`,
            )
        )
            return
        const layers = draft.layers.filter((item) => item.id !== layerId)
        onChange({ ...draft, layers })
        if (layer.agents.some((agent) => agent.id === selectedAgentId)) {
            onSelect(firstAgent({ ...draft, layers })!.id)
        }
    }

    function moveLayer(layerId: string, direction: -1 | 1) {
        const source = draft.layers.find((item) => item.id === layerId)
        if (!source) return
        const lane = draft.layers.filter((item) => item.phase === source.phase)
        const laneIndex = lane.findIndex((item) => item.id === layerId)
        const target = lane[laneIndex + direction]
        if (!target) return
        const from = draft.layers.findIndex((item) => item.id === layerId)
        const to = draft.layers.findIndex((item) => item.id === target.id)
        const layers = [...draft.layers]
        ;[layers[from], layers[to]] = [layers[to]!, layers[from]!]
        onChange({ ...draft, layers })
    }

    return (
        <section className="min-w-0 border-b border-border p-4 sm:p-5 lg:overflow-y-auto lg:border-b-0 lg:border-r">
            <div className="mb-5 grid gap-3 sm:grid-cols-2">
                <Label className="grid gap-1.5 text-xs text-muted-foreground">
                    <span>파이프라인 이름</span>
                    <Input
                        value={draft.name}
                        onChange={(event) => onChange({ ...draft, name: event.target.value })}
                    />
                </Label>
                <Label className="grid gap-1.5 text-xs text-muted-foreground">
                    <span>설명</span>
                    <Input
                        value={draft.description}
                        onChange={(event) =>
                            onChange({ ...draft, description: event.target.value })
                        }
                    />
                </Label>
            </div>

            <LaneHeader
                phase="pre"
                onAdd={() => addLayer('pre')}
                disabled={draft.layers.length >= 12}
            />
            <div className="grid gap-2">
                {draft.layers
                    .filter((layer) => layer.phase === 'pre')
                    .map((layer, index, lane) => (
                        <LayerRow
                            key={layer.id}
                            layer={layer}
                            selectedAgentId={selectedAgentId}
                            onSelect={onSelect}
                            onAdd={() => addAgent(layer.id)}
                            onRename={(name) =>
                                onChange({
                                    ...draft,
                                    layers: draft.layers.map((item) =>
                                        item.id === layer.id ? { ...item, name } : item,
                                    ),
                                })
                            }
                            onDelete={() => deleteLayer(layer.id)}
                            onMove={moveLayer}
                            canMoveUp={index > 0}
                            canMoveDown={index < lane.length - 1}
                            canAdd={layer.agents.length < 8 && totalAgents(draft) < 32}
                        />
                    ))}
            </div>

            <div className="my-4 flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <div className="border border-primary/35 bg-primary/5 px-8 py-3 text-center">
                    <strong className="block font-serif text-base">기본 응답 모델</strong>
                </div>
                <span className="h-px flex-1 bg-border" />
            </div>

            <LaneHeader
                phase="post"
                onAdd={() => addLayer('post')}
                disabled={draft.layers.length >= 12}
            />
            <div className="grid gap-2">
                {draft.layers
                    .filter((layer) => layer.phase === 'post')
                    .map((layer, index, lane) => (
                        <LayerRow
                            key={layer.id}
                            layer={layer}
                            selectedAgentId={selectedAgentId}
                            onSelect={onSelect}
                            onAdd={() => addAgent(layer.id)}
                            onRename={(name) =>
                                onChange({
                                    ...draft,
                                    layers: draft.layers.map((item) =>
                                        item.id === layer.id ? { ...item, name } : item,
                                    ),
                                })
                            }
                            onDelete={() => deleteLayer(layer.id)}
                            onMove={moveLayer}
                            canMoveUp={index > 0}
                            canMoveDown={index < lane.length - 1}
                            canAdd={layer.agents.length < 8 && totalAgents(draft) < 32}
                        />
                    ))}
            </div>
            <p className="mt-4 text-[10px] text-muted-foreground">
                최대 12개 레이어 · 레이어당 8개 · 전체 32개 에이전트
            </p>
        </section>
    )
}
