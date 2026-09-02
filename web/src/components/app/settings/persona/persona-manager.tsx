import type { AppSettings, Persona } from '@malang/shared'
import { Plus, Star } from '@phosphor-icons/react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useEffect, useState } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { ConfirmDialog } from '../../dialogs/confirm-dialog'
import {
    activePersonaAtom,
    createPersonaAtom,
    deletePersonaAtom,
    editingPersonaIdAtom,
    loadPersonasAtom,
    personaErrorAtom,
    personaListAtom,
    selectPersonaAtom,
} from './atom'
import { blankPersonaDraft, personaLabel } from './model'
import { PersonaAvatar } from './persona-avatar'
import { PersonaDetailForm } from './persona-detail-form'

export function PersonaManager({
    onSettingsChange,
}: {
    onSettingsChange: (settings: AppSettings) => void
}) {
    const personas = useAtomValue(personaListAtom)
    const activePersona = useAtomValue(activePersonaAtom)
    const [editingId, setEditingId] = useAtom(editingPersonaIdAtom)
    const error = useAtomValue(personaErrorAtom)
    const loadPersonas = useSetAtom(loadPersonasAtom)
    const createPersona = useSetAtom(createPersonaAtom)
    const deletePersona = useSetAtom(deletePersonaAtom)
    const selectPersona = useSetAtom(selectPersonaAtom)
    const [confirmDelete, setConfirmDelete] = useState(false)

    useEffect(() => {
        if (!personas.length) void loadPersonas()
    }, [loadPersonas, personas.length])

    const editing = personas.find((persona) => persona.id === editingId) || null

    async function handleCreate() {
        const persona = await createPersona(blankPersonaDraft())
        if (persona) setEditingId(persona.id)
    }

    async function handleSetActive(persona: Persona) {
        const settings = await selectPersona(persona.id)
        if (settings) onSettingsChange(settings)
    }

    return (
        <div className="grid gap-5">
            <div className="flex flex-wrap gap-2 rounded-md border border-border bg-background/30 p-4">
                {personas.map((persona) => (
                    <Button
                        variant="ghost"
                        key={persona.id}
                        className={cn(
                            `relative grid w-[5.5rem] place-items-center gap-1.5 rounded-md border border-border bg-background/70 p-2.5 text-center text-xs text-muted-foreground hover:border-ring [&_.avatar]:size-14 [&.active]:border-selection-border [&.active]:text-foreground ${editingId === persona.id ? 'border-selection-border bg-selection-strong text-foreground ring-1 ring-selection-border hover:border-selection-border hover:bg-selection-strong hover:text-foreground' : ''}`,
                        )}
                        onClick={() => setEditingId(persona.id)}
                    >
                        <PersonaAvatar persona={persona} />
                        <span>{personaLabel(persona)}</span>
                        {activePersona?.id === persona.id ? (
                            <span className="absolute -top-2 right-1 flex items-center gap-1 rounded-full bg-primary px-1.5 py-0.5 text-[9px] text-primary-foreground">
                                <Star aria-hidden="true" weight="fill" /> 전역
                            </span>
                        ) : null}
                    </Button>
                ))}
                <Button
                    variant="ghost"
                    className="relative grid w-[5.5rem] place-items-center gap-1.5 rounded-md border border-dashed border-border bg-background/40 p-2.5 text-center text-xs text-muted-foreground hover:border-ring hover:text-foreground [&_svg]:size-5"
                    onClick={() => void handleCreate()}
                    aria-label="페르소나 추가"
                >
                    <Plus aria-hidden="true" />
                    <span>새 페르소나</span>
                </Button>
            </div>

            {editing ? (
                <PersonaDetailForm
                    key={editing.id}
                    persona={editing}
                    isActive={activePersona?.id === editing.id}
                    onSetActive={() => void handleSetActive(editing)}
                    onDelete={() => setConfirmDelete(true)}
                />
            ) : null}

            {error ? (
                <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            ) : null}

            <ConfirmDialog
                open={confirmDelete}
                title="페르소나를 삭제할까요?"
                description="이 페르소나를 사용하던 대화는 기본 활성 페르소나로 대체됩니다."
                confirmLabel="페르소나 삭제"
                onOpenChange={setConfirmDelete}
                onConfirm={() => {
                    if (editing) void deletePersona(editing.id)
                }}
            />
        </div>
    )
}
