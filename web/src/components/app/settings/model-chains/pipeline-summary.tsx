import type { ModelChainLayer } from '@malang/shared'
import { ArrowRight } from '@phosphor-icons/react'

import { Badge } from '@/components/ui/badge'

import { agentCount } from './model'

export function PipelineSummary({ layers }: { layers: ModelChainLayer[] }) {
    const pre = layers.filter((layer) => layer.phase === 'pre')
    const post = layers.filter((layer) => layer.phase === 'post')
    return (
        <span className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="font-mono text-[9px]">
                사전 {pre.length}단계 · {agentCount(pre)}개
            </Badge>
            <ArrowRight className="size-3 text-muted-foreground" />
            <Badge variant="outline" className="font-mono text-[9px]">
                기본 응답
            </Badge>
            <ArrowRight className="size-3 text-muted-foreground" />
            <Badge variant="secondary" className="font-mono text-[9px]">
                후처리 {post.length}단계 · {agentCount(post)}개
            </Badge>
        </span>
    )
}
