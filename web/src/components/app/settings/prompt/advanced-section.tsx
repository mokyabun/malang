import { TabsContent } from '@/components/ui/tabs'

import { PromptToggleAdvancedEditor } from '../shared/prompt-toggle-advanced-editor'
import type { PresetEditorSectionProps } from './types'

export function PresetAdvancedSection({
    value,
    onChange,
}: Pick<PresetEditorSectionProps, 'value' | 'onChange'>) {
    return (
        <TabsContent
            value="advanced"
            id="preset-panel-advanced"
            className="my-6 min-w-0"
            aria-labelledby="preset-tab-advanced"
        >
            <PromptToggleAdvancedEditor
                value={value.toggles || []}
                maxCount={1000}
                onChange={(toggles) => onChange({ ...value, toggles })}
            />
        </TabsContent>
    )
}
