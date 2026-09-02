import { RequestDebugSection } from './debug/request-debug-section'
import { ModelChainSection } from './model-chains/model-chain-section'
import { ModelPresetSection } from './model-presets/model-preset-section'
import { ModulesSection } from './modules/modules-section'
import { PersonaSection } from './persona/persona-section'
import { PromptPresetSection } from './prompt/prompt-preset-section'
import { ThemeSection } from './theme/theme-section'
import type { SettingsPanelProps } from './types'

export function SettingsContent({ section, ...props }: SettingsPanelProps) {
    switch (section) {
        case 'theme':
            return <ThemeSection />
        case 'provider':
            return (
                <ModelPresetSection
                    presets={props.modelPresets}
                    apiKeys={props.modelApiKeys}
                    settings={props.settings}
                    onCatalogChanged={props.onModelCatalogChanged}
                    onSettingsChange={props.onSettingsChange}
                />
            )
        case 'chains':
            return (
                <ModelChainSection
                    presets={props.modelChains}
                    modelPresets={props.modelPresets}
                    onChanged={props.onModelChainsChanged}
                />
            )
        case 'persona':
            return (
                <PersonaSection
                    settings={props.settings}
                    presets={props.presets}
                    onSettingsChange={props.onSettingsChange}
                />
            )
        case 'debug':
            return (
                <RequestDebugSection
                    settings={props.settings}
                    onSettingsChange={props.onSettingsChange}
                />
            )
        case 'prompts':
            return (
                <PromptPresetSection
                    settings={props.settings}
                    presets={props.presets}
                    onSettingsChange={props.onSettingsChange}
                    onChanged={(presets) => props.onPromptsChanged(presets, props.modules)}
                />
            )
        case 'modules':
            return (
                <ModulesSection
                    modules={props.modules}
                    onChanged={(modules) => props.onPromptsChanged(props.presets, modules)}
                />
            )
    }
}
