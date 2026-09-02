import { Plus } from '@phosphor-icons/react'

import { Button } from '@/components/ui/button'

import type { Phase } from './model'

export function LaneHeader({
    phase,
    onAdd,
    disabled,
}: {
    phase: Phase
    onAdd: () => void
    disabled: boolean
}) {
    return (
        <div className="mb-2 flex items-end justify-between gap-3">
            <div>
                <p className="font-mono text-[9px] font-semibold tracking-[0.14em] text-primary">
                    {phase === 'pre' ? '사전 처리 레이어' : '후처리 레이어'}
                </p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                    같은 행의 에이전트는 동시에 요청됩니다.
                </p>
            </div>
            <Button variant="ghost" size="xs" onClick={onAdd} disabled={disabled}>
                <Plus />
                레이어 추가
            </Button>
        </div>
    )
}
