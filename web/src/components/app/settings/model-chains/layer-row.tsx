import type { ModelChainLayer } from '@malang/shared'
import { ArrowDown, ArrowUp, Plus, Trash } from '@phosphor-icons/react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

import { postModeLabel } from './model'

export function LayerRow({
    layer,
    selectedAgentId,
    onSelect,
    onAdd,
    onRename,
    onDelete,
    onMove,
    canMoveUp,
    canMoveDown,
    canAdd,
}: {
    layer: ModelChainLayer
    selectedAgentId: string | null
    onSelect: (id: string) => void
    onAdd: () => void
    onRename: (name: string) => void
    onDelete: () => void
    onMove: (id: string, direction: -1 | 1) => void
    canMoveUp: boolean
    canMoveDown: boolean
    canAdd: boolean
}) {
    return (
        <article className="border border-border bg-muted/20">
            <header className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
                <div className="min-w-0">
                    <Input
                        className="h-6 border-0 bg-transparent px-0 text-xs font-medium shadow-none focus-visible:ring-0"
                        value={layer.name}
                        onChange={(event) => onRename(event.target.value)}
                        aria-label={`${layer.phase.toUpperCase()} 레이어 이름`}
                    />
                    <span className="font-mono text-[9px] text-muted-foreground">
                        {layer.agents.length > 1
                            ? `동시 실행 · ${layer.agents.length}개`
                            : '단일 실행'}
                    </span>
                </div>
                <div className="flex items-center">
                    <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => onMove(layer.id, -1)}
                        disabled={!canMoveUp}
                        aria-label={`${layer.name} 위로`}
                    >
                        <ArrowUp />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => onMove(layer.id, 1)}
                        disabled={!canMoveDown}
                        aria-label={`${layer.name} 아래로`}
                    >
                        <ArrowDown />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={onDelete}
                        aria-label={`${layer.name} 삭제`}
                    >
                        <Trash />
                    </Button>
                </div>
            </header>
            <div className="flex gap-2 overflow-x-auto p-2">
                {layer.agents.map((agent) => (
                    <button
                        key={agent.id}
                        type="button"
                        className={cn(
                            'min-w-40 max-w-52 border border-border bg-background px-3 py-2.5 text-left hover:border-primary/40',
                            agent.id === selectedAgentId &&
                                'border-primary bg-primary/5 ring-1 ring-primary/25',
                            !agent.enabled && 'opacity-45',
                        )}
                        onClick={() => onSelect(agent.id)}
                    >
                        <strong className="block truncate text-xs font-medium">{agent.name}</strong>
                        <span className="mt-1 block truncate font-mono text-[9px] text-muted-foreground">
                            {layer.phase === 'post'
                                ? postModeLabel(agent.postMode)
                                : agent.memoryEnabled
                                  ? '기억 노트'
                                  : '분석 노트'}
                        </span>
                    </button>
                ))}
                <button
                    type="button"
                    className="grid min-w-20 place-items-center border border-dashed border-border text-[10px] text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-40"
                    onClick={onAdd}
                    disabled={!canAdd}
                >
                    <span>
                        <Plus className="mx-auto mb-1 size-3" />
                        에이전트
                    </span>
                </button>
            </div>
        </article>
    )
}
