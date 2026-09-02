import { TabsContent } from '@/components/ui/tabs'

import { PromptToggleAdvancedEditor } from '../shared/prompt-toggle-advanced-editor'
import type { ModuleEditorProps } from './types'

export function ModuleAdvancedSection({
    value,
    onChange,
}: Pick<ModuleEditorProps, 'value' | 'onChange'>) {
    return (
        <TabsContent value="advanced" className="my-6 min-w-0">
            <PromptToggleAdvancedEditor
                value={value.toggles}
                maxCount={200}
                onChange={(toggles) => onChange({ ...value, toggles })}
            />
        </TabsContent>
    )
}
