import type { RequestDebugRecord } from '@malang/shared'

import { chainPhaseLabel, formatTimestamp } from './format'

export function RequestDebugList({
    requests,
    selectedId,
    onSelect,
}: {
    requests: RequestDebugRecord[]
    selectedId: string | null
    onSelect: (id: string) => void
}) {
    return (
        <div className="max-h-[42rem] overflow-y-auto border-r border-border bg-card/30 max-[760px]:max-h-56 max-[760px]:border-b max-[760px]:border-r-0">
            {requests.map((request, index) => (
                <button
                    key={request.id}
                    type="button"
                    className="grid w-full grid-cols-[2rem_minmax(0,1fr)] gap-2 border-b border-border px-3 py-3 text-left hover:bg-muted/50 data-active:bg-muted"
                    data-active={selectedId === request.id ? '' : undefined}
                    onClick={() => onSelect(request.id)}
                >
                    <span className="font-mono text-[9px] text-muted-foreground">
                        {String(requests.length - index).padStart(2, '0')}
                    </span>
                    <span className="min-w-0">
                        {request.request.chain ? (
                            <small className="mb-1 block truncate text-[9px] font-medium text-primary">
                                모델 체인 · {chainPhaseLabel(request.request.chain.phase)} ·{' '}
                                {request.request.chain.agentName}
                            </small>
                        ) : (
                            <small className="mb-1 block text-[9px] text-muted-foreground">
                                기본 응답
                            </small>
                        )}
                        <strong className="block truncate text-xs">
                            {request.provider} · {request.modelId}
                        </strong>
                        <small className="mt-1 block font-mono text-[9px] text-muted-foreground">
                            {formatTimestamp(request.createdAt)}
                        </small>
                    </span>
                </button>
            ))}
        </div>
    )
}
