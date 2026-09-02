import {
    Check,
    Copy,
    DownloadSimple,
    FlowArrow,
    Plus,
    Trash,
    UploadSimple,
    WarningCircle,
} from '@phosphor-icons/react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'

import { SectionHeading } from '../../page-heading'
import { AgentInspector } from './agent-inspector'
import {
    firstAgent,
    findAgent,
    updateAgent,
    moveAgentToLayer,
    deleteAgent,
    validDraft,
} from './model'
import { PipelineCanvas } from './pipeline-canvas'
import { PipelineSummary } from './pipeline-summary'
import { useModelChainEditor, type ModelChainSectionProps } from './use-model-chain-editor'

export function ModelChainSection({ presets, modelPresets, onChanged }: ModelChainSectionProps) {
    const {
        importRef,
        dialogOpen,
        setDialogOpen,
        editingId,
        draft,
        setDraft,
        selectedAgentId,
        setSelectedAgentId,
        saving,
        notice,
        showPreview,
        setShowPreview,
        beginCreate,
        beginEdit,
        savePreset,
        deletePreset,
        exportDraft,
        importDraft,
    } = useModelChainEditor({ presets, modelPresets, onChanged })
    return (
        <div className="h-full min-h-0 min-w-0 overflow-y-auto px-8 pb-16 pt-7 max-sm:px-4 max-sm:pt-5">
            <div className="w-full">
                <SectionHeading
                    className="mb-5 pr-12 [&_h2]:text-2xl"
                    title="모델 체이닝"
                    description="같은 레이어는 동시에, 레이어 사이는 위에서 아래로 실행됩니다. 채팅의 기본 동작은 단일 모델입니다."
                />
                {notice ? (
                    <Alert className="mb-4 border-destructive/30 bg-destructive/5 text-destructive">
                        <WarningCircle aria-hidden="true" />
                        <AlertDescription>{notice}</AlertDescription>
                    </Alert>
                ) : null}
                <div className="overflow-hidden rounded-lg border border-border bg-card">
                    <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
                        <div>
                            <p className="text-xs text-muted-foreground">
                                저장된 실행 흐름 {presets.length}개
                            </p>
                        </div>
                        <Button
                            size="sm"
                            onClick={() => beginCreate()}
                            disabled={!modelPresets.length}
                        >
                            <Plus aria-hidden="true" />새 파이프라인
                        </Button>
                    </div>
                    {presets.length ? (
                        <div className="divide-y divide-border">
                            {presets.map((preset) => (
                                <button
                                    key={preset.id}
                                    type="button"
                                    className="group grid w-full items-center gap-3 px-5 py-4 text-left hover:bg-muted/45 sm:grid-cols-[minmax(0,1fr)_auto_auto]"
                                    onClick={() => beginEdit(preset)}
                                >
                                    <span className="min-w-0">
                                        <strong className="block truncate text-sm font-medium">
                                            {preset.name}
                                        </strong>
                                        <span className="mt-1 block truncate text-xs text-muted-foreground">
                                            {preset.description || '설명 없음'}
                                        </span>
                                    </span>
                                    <PipelineSummary layers={preset.layers} />
                                    <span className="hidden text-xs text-muted-foreground group-hover:text-foreground sm:block">
                                        편집
                                    </span>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <button
                            type="button"
                            className="grid w-full place-items-center px-6 py-16 text-center hover:bg-muted/30"
                            onClick={() => beginCreate()}
                            disabled={!modelPresets.length}
                        >
                            <span>
                                <FlowArrow className="mx-auto mb-3 size-7 text-primary" />
                                <strong className="block text-sm font-medium">
                                    첫 파이프라인을 만들어 보세요
                                </strong>
                                <span className="mt-1 block text-xs text-muted-foreground">
                                    레이어를 추가하고 여러 에이전트를 동시에 배치할 수 있습니다.
                                </span>
                            </span>
                        </button>
                    )}
                </div>
            </div>

            <input
                ref={importRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) void importDraft(file)
                }}
            />

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="h-[min(58rem,calc(100dvh-1rem))] w-[min(86rem,calc(100%-1rem))] max-w-none grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden bg-card p-0 sm:max-w-none">
                    {draft ? (
                        <>
                            <DialogHeader className="border-b border-border px-5 py-4 pr-14 sm:px-6">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <DialogTitle className="font-serif text-xl">
                                            {editingId ? '파이프라인 수정' : '새 파이프라인'}
                                        </DialogTitle>
                                        <DialogDescription>
                                            레이어 내부는 동시 실행되고 다음 레이어는 이전 결과를
                                            이어받습니다.
                                        </DialogDescription>
                                    </div>
                                    <div className="mr-5 flex items-center gap-1">
                                        <Button variant="ghost" size="sm" onClick={exportDraft}>
                                            <DownloadSimple />
                                            내보내기
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => importRef.current?.click()}
                                        >
                                            <UploadSimple />
                                            가져오기
                                        </Button>
                                    </div>
                                </div>
                            </DialogHeader>

                            <div className="grid min-h-0 overflow-y-auto lg:grid-cols-[minmax(0,1.65fr)_minmax(23rem,0.8fr)] lg:overflow-hidden">
                                <PipelineCanvas
                                    draft={draft}
                                    selectedAgentId={selectedAgentId}
                                    modelPresetId={modelPresets[0]?.id ?? ''}
                                    onChange={setDraft}
                                    onSelect={setSelectedAgentId}
                                />
                                <AgentInspector
                                    selection={findAgent(draft, selectedAgentId)}
                                    layers={draft.layers}
                                    modelPresets={modelPresets}
                                    showPreview={showPreview}
                                    onPreview={() => setShowPreview((value) => !value)}
                                    onChange={(agent) => setDraft(updateAgent(draft, agent))}
                                    onMove={(layerId) => {
                                        const next = moveAgentToLayer(
                                            draft,
                                            selectedAgentId,
                                            layerId,
                                        )
                                        setDraft(next)
                                    }}
                                    onDelete={() => {
                                        const next = deleteAgent(draft, selectedAgentId)
                                        setDraft(next)
                                        setSelectedAgentId(firstAgent(next)?.id ?? null)
                                    }}
                                />
                            </div>

                            <DialogFooter className="items-center justify-between border-t border-border bg-muted/25 px-5 py-3 sm:px-6">
                                <div className="flex items-center gap-1 self-stretch sm:self-auto">
                                    {editingId ? (
                                        <Button
                                            variant="destructive"
                                            size="sm"
                                            onClick={() => void deletePreset()}
                                            disabled={saving}
                                        >
                                            <Trash />
                                            파이프라인 삭제
                                        </Button>
                                    ) : null}
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => beginCreate(draft)}
                                    >
                                        <Copy />
                                        복사본
                                    </Button>
                                </div>
                                <div className="flex items-center justify-end gap-2 self-stretch sm:self-auto">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setDialogOpen(false)}
                                    >
                                        취소
                                    </Button>
                                    <Button
                                        size="sm"
                                        onClick={() => void savePreset()}
                                        disabled={saving || !validDraft(draft)}
                                    >
                                        <Check />
                                        {saving ? '저장 중' : '파이프라인 저장'}
                                    </Button>
                                </div>
                            </DialogFooter>
                        </>
                    ) : null}
                </DialogContent>
            </Dialog>
        </div>
    )
}
