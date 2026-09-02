import { atom } from 'jotai'

import { api } from '@/lib/api'

import {
    modelApiKeysAtom,
    modelChainPresetsAtom,
    modelPresetsAtom,
    promptModulesAtom,
    promptPresetsAtom,
    providerAtom,
    settingsAtom,
} from '../atom'
import { personaListAtom, selectedPersonaIdAtom } from './persona/atom'

export const settingsInitializedAtom = atom(false)

export const settingsLoadingAtom = atom(false)

export const settingsErrorAtom = atom('')

export const loadSettingsAtom = atom(null, async (get, set) => {
    if (get(settingsLoadingAtom)) return

    set(settingsLoadingAtom, true)
    set(settingsErrorAtom, '')
    try {
        const [
            settings,
            provider,
            presetResult,
            moduleResult,
            personaResult,
            modelCatalog,
            chains,
        ] = await Promise.all([
            api.settings(),
            api.provider(),
            api.promptPresets(),
            api.promptModules(),
            api.personas(),
            api.modelCatalog(),
            api.modelChains(),
        ])
        set(settingsAtom, settings)
        set(providerAtom, provider)
        set(modelPresetsAtom, modelCatalog.presets)
        set(modelApiKeysAtom, modelCatalog.apiKeys)
        set(modelChainPresetsAtom, chains.presets)
        set(promptPresetsAtom, presetResult.promptPresets)
        set(promptModulesAtom, moduleResult.modules)
        set(personaListAtom, personaResult.personas)
        set(selectedPersonaIdAtom, settings.selectedPersonaId)
    } catch (cause) {
        set(
            settingsErrorAtom,
            cause instanceof Error ? cause.message : '설정을 불러오지 못했습니다.',
        )
    } finally {
        set(settingsInitializedAtom, true)
        set(settingsLoadingAtom, false)
    }
})
