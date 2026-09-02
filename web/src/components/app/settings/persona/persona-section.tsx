import type { AppSettings, PromptPreset } from '@malang/shared'
import { useMemo, useState } from 'react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { api } from '@/lib/api'
import { useDebouncedSave } from '@/lib/use-debounced-save'

import { SectionHeading } from '../../page-heading'
import { PersonaManager } from './persona-manager'

export function PersonaSection({
    settings,
    presets,
    onSettingsChange,
}: {
    settings: AppSettings | null
    presets: PromptPreset[]
    onSettingsChange: (settings: AppSettings) => void
}) {
    const [userName, setUserName] = useState(settings?.userName || 'User')
    const [defaultPresetId, setDefaultPresetId] = useState(settings?.defaultPromptPresetId || '')
    const settingsDraft = useMemo(
        () => ({ userName, defaultPromptPresetId: defaultPresetId || null }),
        [defaultPresetId, userName],
    )
    const autoSave = useDebouncedSave(
        settingsDraft,
        async (next) => {
            const updated = await api.updateSettings(next)
            onSettingsChange(updated)
        },
        { enabled: Boolean(userName.trim()) },
    )

    return (
        <div className="h-full min-h-0 min-w-0 overflow-y-auto px-8 pb-16 pt-7 max-sm:px-4 max-sm:pt-5">
            <div className="w-full">
                <SectionHeading
                    className="mb-6 pr-12 [&_h2]:text-2xl"
                    title="페르소나"
                    description="대화에서 당신을 나타내는 프로필입니다. 활성 페르소나의 설명이 프롬프트에 삽입됩니다."
                />
                <div
                    className="mb-6 grid gap-4 border-b border-border pb-6"
                    onBlurCapture={() => void autoSave.flush()}
                >
                    <div className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
                        <Label className="grid items-start gap-2 text-xs font-medium leading-normal text-muted-foreground">
                            표시 이름
                            <Input
                                value={userName}
                                onChange={(event) => setUserName(event.target.value)}
                                required
                            />
                        </Label>
                        <Label className="grid items-start gap-2 text-xs font-medium leading-normal text-muted-foreground">
                            전역 프롬프트
                            <Select
                                value={defaultPresetId || '__automatic__'}
                                onValueChange={(next) =>
                                    setDefaultPresetId(next === '__automatic__' ? '' : String(next))
                                }
                            >
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="프롬프트 선택" />
                                </SelectTrigger>
                                <SelectContent align="start">
                                    <SelectItem value="__automatic__">서버 자동 선택</SelectItem>
                                    {presets.map((preset) => (
                                        <SelectItem key={preset.id} value={preset.id}>
                                            {preset.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Label>
                    </div>
                </div>
                <PersonaManager onSettingsChange={onSettingsChange} />
            </div>
        </div>
    )
}
