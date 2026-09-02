import type { PromptPresetInput, RegexPhase, RegexScript } from '@malang/shared'

import type { Store } from '@/db'
import { ValidationError } from '@/errors/app-error'
import { exportPromptPreset, importPromptPreset } from '@/services/prompt/preset-codec'
import { processRegexText } from '@/services/prompt/regex-runtime'
import { normalizeRegexScripts, toRisuRegexScripts } from '@/services/prompt/risu'

export class PromptService {
    constructor(private readonly store: Store) {}

    list() {
        return this.store.prompts.listPromptPresets()
    }

    get(id: string) {
        return this.store.prompts.getPromptPreset(id)
    }

    create(input: PromptPresetInput) {
        return this.store.prompts.createPromptPreset(input)
    }

    update(id: string, input: PromptPresetInput) {
        return this.store.prompts.updatePromptPreset(id, input)
    }

    delete(id: string) {
        return this.store.prompts.deletePromptPreset(id)
    }

    async import(bytes: Uint8Array, filename: string) {
        const decoded = await importPromptPreset(bytes, filename)
        return this.store.prompts.createPromptPreset(
            decoded.input,
            decoded.source,
            decoded.warnings,
        )
    }

    async export(id: string, format: 'json' | 'risupreset' | 'risup') {
        const preset = this.store.prompts.getPromptPreset(id)
        if (!preset) return null
        return exportPromptPreset(
            {
                name: preset.name,
                blocks: preset.blocks,
                parameters: preset.parameters,
                defaultVariables: preset.defaultVariables,
                toggles: preset.toggles,
                regexScripts: preset.regexScripts,
                moduleIntegrations: preset.moduleIntegrations,
                promptSettings: preset.promptSettings,
            },
            format,
        )
    }

    importRegex(id: string, bytes: Uint8Array, mode: 'append' | 'replace') {
        const preset = this.store.prompts.getPromptPreset(id)
        if (!preset) return null
        let source: unknown
        try {
            source = JSON.parse(new TextDecoder().decode(bytes))
        } catch {
            throw new ValidationError('Invalid Risu regex JSON')
        }
        const record =
            source && typeof source === 'object' ? (source as Record<string, unknown>) : {}
        if (record.type !== 'regex' || !Array.isArray(record.data)) {
            throw new ValidationError('Expected a Risu regex export')
        }
        const imported = normalizeRegexScripts(record.data)
        return this.update(id, {
            ...presetInput(preset),
            regexScripts: mode === 'replace' ? imported : [...preset.regexScripts, ...imported],
        })
    }

    exportRegex(id: string) {
        const preset = this.store.prompts.getPromptPreset(id)
        if (!preset) return null
        return new TextEncoder().encode(
            JSON.stringify(
                { type: 'regex', name: preset.name, data: toRisuRegexScripts(preset.regexScripts) },
                null,
                2,
            ),
        )
    }

    previewRegex(input: { text: string; phase: RegexPhase; scripts: RegexScript[] }) {
        return processRegexText({
            ...input,
            templateContext: { values: {}, variables: {}, globalVariables: {}, toggles: {} },
        })
    }
}

function presetInput(preset: ReturnType<Store['prompts']['getPromptPreset']> & {}) {
    if (!preset) throw new Error('Prompt preset not found')
    return {
        name: preset.name,
        blocks: preset.blocks,
        parameters: preset.parameters,
        defaultVariables: preset.defaultVariables,
        toggles: preset.toggles,
        regexScripts: preset.regexScripts,
        moduleIntegrations: preset.moduleIntegrations,
        promptSettings: preset.promptSettings,
    }
}
