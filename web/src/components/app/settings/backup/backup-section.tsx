import { useEffect, useState } from 'react'

import { Switch } from '@/components/ui/switch'
import { api } from '@/lib/api'

import { SectionHeading } from '../../page-heading'
import type { SettingsPanelProps } from '../types'

export function BackupSection({
    settings,
    onSettingsChange,
}: Pick<SettingsPanelProps, 'settings' | 'onSettingsChange'>) {
    const [allowed, setAllowed] = useState<boolean | null>(null)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        let active = true
        void api.backupConfig().then(
            (config) => {
                if (active) setAllowed(config.allowed)
            },
            (cause: unknown) => {
                if (active)
                    setError(
                        cause instanceof Error ? cause.message : '백업 설정을 불러오지 못했습니다.',
                    )
            },
        )
        return () => {
            active = false
        }
    }, [])

    async function toggle(enabled: boolean) {
        setSaving(true)
        setError('')
        try {
            onSettingsChange(await api.updateSettings({ autoBackupEnabled: enabled }))
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : '백업 설정을 저장하지 못했습니다.')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="h-full overflow-y-auto px-8 pb-16 pt-7 max-sm:px-4">
            <SectionHeading
                className="mb-6 pr-12 [&_h2]:text-2xl"
                title="백업"
                description="서버에 자동으로 DB 스냅샷을 보관합니다."
            />
            <section className="flex items-center justify-between gap-5 border-y border-border py-4">
                <div>
                    <strong className="text-sm">자동 백업</strong>
                    <p className="mt-1 text-xs leading-6 text-muted-foreground">
                        서버 시작 시와 이후 5분마다 변경된 DB를 백업합니다. 최근 20개·500MB까지
                        보관하며, 최신 백업은 항상 유지합니다.
                    </p>
                </div>
                <Switch
                    aria-label="자동 백업"
                    checked={allowed === true && (settings?.autoBackupEnabled ?? true)}
                    disabled={allowed !== true || !settings || saving}
                    onCheckedChange={(checked) => void toggle(checked)}
                />
            </section>
            {allowed === false && (
                <p className="mt-4 text-sm text-muted-foreground">
                    서버 환경 변수 AUTO_BACKUP_ENABLED=false로 자동 백업이 비활성화되어 있습니다.
                </p>
            )}
            <p className="mt-4 text-xs leading-6 text-muted-foreground">
                DATA_DIR/backups에 저장됩니다. 대화·캐릭터 정보·설정은 포함하지만 이미지 등 에셋
                파일은 포함하지 않습니다. 전체 복구를 위해 assets 폴더도 별도로 보관하세요. 자동
                백업을 꺼도 기존 백업은 유지됩니다.
            </p>
            {error && (
                <p role="alert" className="mt-4 text-sm text-destructive">
                    {error}
                </p>
            )}
        </div>
    )
}
