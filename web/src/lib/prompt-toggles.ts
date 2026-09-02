import type { ConversationModuleState, PromptPreset, PromptToggle } from '@malang/shared'

/** Match PocketRisu: preset controls first, followed by controls from active modules. */
export function activePromptToggles(
    preset: PromptPreset | null | undefined,
    moduleStates: ConversationModuleState[],
): PromptToggle[] {
    return [
        ...(preset?.toggles || []),
        ...moduleStates
            .filter((state) => state.enabled)
            .flatMap((state) => state.module.toggles || []),
    ]
}
