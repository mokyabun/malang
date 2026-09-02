import type {
    ModelChainAgent,
    ModelChainLayer,
    ModelChainPreset,
    ModelChainPresetInput,
    ModelPreset,
} from '@malang/shared'

export type Phase = ModelChainLayer['phase']

export function newLayer(phase: Phase, modelPresetId: string, index: number): ModelChainLayer {
    return {
        id: crypto.randomUUID(),
        name: `${phase === 'pre' ? '사전 분석' : '후처리'} ${index}`,
        phase,
        agents: [newAgent(phase, modelPresetId, 1)],
    }
}

export function newAgent(phase: Phase, modelPresetId: string, index: number): ModelChainAgent {
    return {
        id: crypto.randomUUID(),
        name: phase === 'pre' ? `분석 에이전트 ${index}` : `후처리 에이전트 ${index}`,
        modelPresetId,
        systemPrompt: '',
        instruction: '',
        enabled: true,
        postMode: 'replace',
        assistantPrefill: false,
        includeSettingInfo: true,
        includeGlobalNote: false,
        includeLongTermMemory: true,
        includeRecentChat: true,
        includeCurrentUserInput: true,
        includePreviousNotes: true,
        memoryEnabled: false,
        memoryInstruction: '',
        memoryFormat: '',
    }
}

export function starterChain(modelPresetId: string): ModelChainPresetInput {
    const analysis = newLayer('pre', modelPresetId, 1)
    analysis.name = '장면 분석'
    analysis.agents = [
        {
            ...newAgent('pre', modelPresetId, 1),
            name: '맥락과 세계관',
            systemPrompt: '당신은 장면과 세계관의 연속성을 분석하는 에이전트입니다.',
            instruction: '이번 응답에서 반드시 유지할 사실과 제약을 간결하게 정리하세요.',
        },
        {
            ...newAgent('pre', modelPresetId, 2),
            name: '인물 심리와 의도',
            systemPrompt:
                '당신은 현재 장면에 등장하는 인물의 심리와 의도를 분석하는 에이전트입니다.',
            instruction: '현재 유저 입력에 대한 인물별 감정, 의도와 행동 제약을 정리하세요.',
        },
    ]
    const polish = newLayer('post', modelPresetId, 1)
    polish.name = '최종 검수'
    polish.agents[0] = {
        ...polish.agents[0]!,
        name: '문체와 설정 검수',
        systemPrompt: '당신은 메인 응답을 설정과 문체에 맞게 다듬는 편집 에이전트입니다.',
        instruction: '설정 충돌과 반복을 고치고 사용자에게 보일 최종 응답만 출력하세요.',
    }
    return {
        name: '새 모델 파이프라인',
        description: '장면을 병렬 분석한 뒤 메인 응답을 최종 검수합니다.',
        layers: [analysis, polish],
    }
}

export function chainInput(preset: ModelChainPreset): ModelChainPresetInput {
    return {
        name: preset.name,
        description: preset.description,
        layers: preset.layers.map((layer) => ({
            ...layer,
            agents: layer.agents.map((agent) => ({ ...agent })),
        })),
    }
}

export function copyChain(source: ModelChainPresetInput): ModelChainPresetInput {
    return {
        ...source,
        name: `${source.name} 복사본`,
        layers: source.layers.map((layer) => ({
            ...layer,
            id: crypto.randomUUID(),
            agents: layer.agents.map((agent) => ({ ...agent, id: crypto.randomUUID() })),
        })),
    }
}

export function firstAgent(draft: ModelChainPresetInput) {
    return draft.layers.flatMap((layer) => layer.agents)[0]
}

export function totalAgents(draft: ModelChainPresetInput) {
    return draft.layers.reduce((sum, layer) => sum + layer.agents.length, 0)
}

export function agentCount(layers: ModelChainLayer[]) {
    return layers.reduce(
        (sum, layer) => sum + layer.agents.filter((agent) => agent.enabled).length,
        0,
    )
}

export function findAgent(draft: ModelChainPresetInput, id: string | null) {
    for (const layer of draft.layers) {
        const agent = layer.agents.find((item) => item.id === id)
        if (agent) return { layer, agent }
    }
    return null
}

export function updateAgent(
    draft: ModelChainPresetInput,
    agent: ModelChainAgent,
): ModelChainPresetInput {
    return {
        ...draft,
        layers: draft.layers.map((layer) => ({
            ...layer,
            agents: layer.agents.map((item) => (item.id === agent.id ? agent : item)),
        })),
    }
}

export function moveAgentToLayer(
    draft: ModelChainPresetInput,
    agentId: string | null,
    targetLayerId: string,
): ModelChainPresetInput {
    const selection = findAgent(draft, agentId)
    const target = draft.layers.find((layer) => layer.id === targetLayerId)
    if (!selection || !target || selection.layer.id === target.id || target.agents.length >= 8)
        return draft
    const moved = {
        ...selection.agent,
        memoryEnabled: target.phase === 'pre' ? selection.agent.memoryEnabled : false,
    }
    return {
        ...draft,
        layers: draft.layers
            .map((layer) => {
                if (layer.id === selection.layer.id)
                    return {
                        ...layer,
                        agents: layer.agents.filter((agent) => agent.id !== agentId),
                    }
                if (layer.id === targetLayerId)
                    return { ...layer, agents: [...layer.agents, moved] }
                return layer
            })
            .filter((layer) => layer.agents.length),
    }
}

export function deleteAgent(
    draft: ModelChainPresetInput,
    agentId: string | null,
): ModelChainPresetInput {
    if (totalAgents(draft) <= 1 || !agentId) return draft
    return {
        ...draft,
        layers: draft.layers
            .map((layer) => ({
                ...layer,
                agents: layer.agents.filter((agent) => agent.id !== agentId),
            }))
            .filter((layer) => layer.agents.length),
    }
}

export function validDraft(draft: ModelChainPresetInput) {
    return Boolean(
        draft.name.trim() &&
        draft.layers.length &&
        draft.layers.every(
            (layer) =>
                layer.name.trim() &&
                layer.agents.length &&
                layer.agents.every((agent) => agent.name.trim() && agent.modelPresetId),
        ),
    )
}

export function postModeLabel(mode: ModelChainAgent['postMode']) {
    if (mode === 'append') return '뒤에 추가'
    if (mode === 'prepend') return '앞에 추가'
    return '대체'
}

export function normalizeImportedChain(
    value: unknown,
    modelPresets: ModelPreset[],
): ModelChainPresetInput {
    if (!value || typeof value !== 'object') throw new Error('올바른 모델 체인 JSON이 아닙니다.')
    const source = value as Partial<ModelChainPresetInput>
    if (!Array.isArray(source.layers) || !source.layers.length)
        throw new Error('레이어가 없는 모델 체인입니다.')
    const available = new Set(modelPresets.map((preset) => preset.id))
    const fallback = modelPresets[0]?.id
    if (!fallback) throw new Error('먼저 모델 프리셋을 만들어 주세요.')
    return {
        name: String(source.name || '가져온 모델 파이프라인'),
        description: String(source.description || ''),
        layers: source.layers
            .map((layer, layerIndex): ModelChainLayer => ({
                id: crypto.randomUUID(),
                name: String(layer.name || `레이어 ${layerIndex + 1}`),
                phase: layer.phase === 'post' ? 'post' : 'pre',
                agents: (Array.isArray(layer.agents) ? layer.agents : []).map(
                    (agent, agentIndex) => ({
                        ...newAgent(
                            layer.phase === 'post' ? 'post' : 'pre',
                            available.has(agent.modelPresetId) ? agent.modelPresetId : fallback,
                            agentIndex + 1,
                        ),
                        ...agent,
                        id: crypto.randomUUID(),
                        modelPresetId: available.has(agent.modelPresetId)
                            ? agent.modelPresetId
                            : fallback,
                        memoryEnabled:
                            layer.phase === 'post' ? false : agent.memoryEnabled === true,
                    }),
                ),
            }))
            .filter((layer) => layer.agents.length),
    }
}

export function safeFilename(value: string) {
    return value.replace(/[\\/:*?"<>|]/g, '-').trim() || 'model-chain'
}

export function errorText(cause: unknown, fallback: string) {
    return cause instanceof Error ? cause.message : fallback
}
