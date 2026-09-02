import type { RequestDebugRecord } from '@malang/shared'
import { Check, ClipboardText, Code } from '@phosphor-icons/react'

import { Button } from '@/components/ui/button'

import { chainPhaseLabel } from './format'

export function RequestDebugDetail({
    selected,
    copied,
    copy,
}: {
    selected: RequestDebugRecord
    copied: 'object' | 'body' | null
    copy: (kind: 'object' | 'body') => Promise<void>
}) {
    return (
        <article className="min-w-0 p-4 sm:p-5">
            <header className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
                <div className="min-w-0">
                    {selected.request.chain ? (
                        <p className="mb-1 text-[10px] font-medium text-primary">
                            {selected.request.chain.presetName} ·{' '}
                            {chainPhaseLabel(selected.request.chain.phase)} ·{' '}
                            {selected.request.chain.layerName} / {selected.request.chain.agentName}
                        </p>
                    ) : null}
                    <p className="font-mono text-[9px] text-primary">
                        {selected.request.method} · {selected.provider}
                    </p>
                    <h3 className="mt-1 truncate text-sm font-semibold">{selected.modelId}</h3>
                    <p className="mt-1 break-all font-mono text-[9px] leading-4 text-muted-foreground">
                        {selected.request.endpoint}
                    </p>
                </div>
                <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="outline" onClick={() => void copy('object')}>
                        {copied === 'object' ? <Check /> : <ClipboardText />}
                        {copied === 'object' ? '복사됨' : '객체 복사'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void copy('body')}>
                        {copied === 'body' ? <Check /> : <Code />}
                        {copied === 'body' ? '복사됨' : '본문 JSON'}
                    </Button>
                </div>
            </header>

            <section className="mb-4">
                <h4 className="mb-2 text-[10px] font-medium text-muted-foreground">
                    적용 파라미터
                </h4>
                <pre className="max-h-48 overflow-auto border border-border bg-muted/50 p-3 font-mono text-[10px] leading-5 text-foreground">
                    {JSON.stringify(selected.parameters, null, 2)}
                </pre>
            </section>
            <section>
                <h4 className="mb-2 text-[10px] font-medium text-muted-foreground">
                    Provider 요청 본문
                </h4>
                <pre className="max-h-[30rem] overflow-auto border border-border bg-muted/50 p-3 font-mono text-[10px] leading-5 text-foreground">
                    {JSON.stringify(selected.request.body, null, 2)}
                </pre>
            </section>
        </article>
    )
}
