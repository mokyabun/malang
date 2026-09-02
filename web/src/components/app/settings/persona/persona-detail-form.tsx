import type { Persona } from '@malang/shared'
import { Star, Trash, UploadSimple } from '@phosphor-icons/react'
import { useSetAtom } from 'jotai'
import { type ChangeEvent, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useDebouncedSave } from '@/lib/use-debounced-save'

import { removePersonaAvatarAtom, setPersonaAvatarAtom, updatePersonaAtom } from './atom'
import { personaDraftFrom } from './model'
import { PersonaAvatar } from './persona-avatar'

export function PersonaDetailForm({
    persona,
    isActive,
    onSetActive,
    onDelete,
}: {
    persona: Persona
    isActive: boolean
    onSetActive: () => void
    onDelete: () => void
}) {
    const [draft, setDraft] = useState(() => personaDraftFrom(persona))
    const updatePersona = useSetAtom(updatePersonaAtom)
    const setAvatar = useSetAtom(setPersonaAvatarAtom)
    const removeAvatar = useSetAtom(removePersonaAvatarAtom)
    const autoSave = useDebouncedSave(
        draft,
        async (next) => {
            await updatePersona({ id: persona.id, input: next })
        },
        { enabled: Boolean(draft.name?.trim()) },
    )

    function saveField(field: 'name' | 'description' | 'note', value: string) {
        setDraft((current) => ({ ...current, [field]: value }))
    }

    async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (!file) return
        await setAvatar({ id: persona.id, file })
    }

    return (
        <div
            className="grid gap-4 rounded-md border border-border bg-background/25 p-4"
            onBlurCapture={() => void autoSave.flush()}
        >
            <div className="flex flex-wrap items-center gap-3 [&_.avatar]:size-16 [&>label]:min-h-9 [&>label]:flex-1">
                <PersonaAvatar persona={persona} />
                <Label className="relative grid gap-2 [&>input]:sr-only [&>span]:flex [&>span]:min-h-12 [&>span]:items-center [&>span]:gap-2 [&>span]:border [&>span]:border-dashed [&>span]:border-border [&>span]:p-3">
                    <UploadSimple aria-hidden="true" />
                    <span>아바타 업로드</span>
                    <Input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        onChange={(event) => void handleAvatarChange(event)}
                    />
                </Label>
                {persona.avatarAssetId ? (
                    <Button variant="ghost" onClick={() => void removeAvatar(persona.id)}>
                        아바타 제거
                    </Button>
                ) : null}
            </div>
            <Label className="grid items-start gap-2 text-xs font-medium leading-normal text-muted-foreground">
                이름
                <Input
                    value={draft.name}
                    onChange={(event) => saveField('name', event.target.value)}
                    required
                />
            </Label>
            <Label className="grid items-start gap-2 text-xs font-medium leading-normal text-muted-foreground">
                설명 (프롬프트에 삽입됨)
                <Textarea
                    rows={6}
                    value={draft.description}
                    onChange={(event) => saveField('description', event.target.value)}
                    placeholder="이 페르소나가 어떤 사람인지 설명하세요."
                />
            </Label>
            <Label className="grid items-start gap-2 text-xs font-medium leading-normal text-muted-foreground">
                메모
                <Textarea
                    rows={2}
                    value={draft.note}
                    onChange={(event) => saveField('note', event.target.value)}
                    placeholder="모델에 전송되지 않습니다."
                />
                <span className="text-[10px] leading-5 text-muted-foreground">
                    모델에 전송되지 않습니다.
                </span>
            </Label>
            <div className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
                <Button disabled={isActive} onClick={onSetActive}>
                    <Star aria-hidden="true" /> 전역 페르소나로 지정
                </Button>
                <Button variant="destructive" onClick={onDelete}>
                    <Trash aria-hidden="true" /> 삭제
                </Button>
            </div>
        </div>
    )
}
