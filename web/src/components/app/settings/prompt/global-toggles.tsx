import type { AppSettings } from '@malang/shared'

import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { api } from '@/lib/api'

export function PromptGlobalToggles({
    settings,
    onSettingsChange,
}: {
    settings: AppSettings | null
    onSettingsChange: (settings: AppSettings) => void
}) {
    if (!settings) return null
    return (
        <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-2 border-b border-border px-8 py-3 max-sm:px-4">
            <Label className="flex items-center gap-2 text-xs">
                <Switch
                    checked={settings.jailbreakToggle}
                    onCheckedChange={(checked) =>
                        void api.updateSettings({ jailbreakToggle: checked }).then(onSettingsChange)
                    }
                />
                Jailbreak 토글
            </Label>
            <Label className="flex items-center gap-2 text-xs">
                <Switch
                    checked={settings.chainOfThought}
                    onCheckedChange={(checked) =>
                        void api.updateSettings({ chainOfThought: checked }).then(onSettingsChange)
                    }
                />
                Chain of Thought 토글
            </Label>
        </div>
    )
}
