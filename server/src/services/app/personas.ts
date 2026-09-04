import type {
    AppSettings,
    Conversation,
    EffectivePersona,
    PersonaCreate,
    PersonaUpdate,
} from '@malang/shared'

import type { Store } from '@/db'
import { ValidationError } from '@/errors/app-error'

import type { AssetStore } from './assets'

export class PersonaService {
    constructor(
        private readonly store: Store,
        private readonly assetStore: AssetStore,
    ) {}

    list() {
        return this.store.personas.listPersonas()
    }

    get(id: string) {
        return this.store.personas.getPersona(id)
    }

    create(input: PersonaCreate) {
        return this.store.personas.createPersona(input)
    }

    update(id: string, input: PersonaUpdate) {
        return this.store.personas.updatePersona(id, input)
    }

    delete(id: string) {
        return this.store.personas.deletePersona(id)
    }

    async setAvatar(id: string, bytes: Uint8Array, mimeType: string) {
        if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mimeType)) {
            throw new ValidationError('Avatar must be a PNG, JPEG, WebP, or GIF image')
        }
        if (!this.store.personas.getPersona(id)) return null
        const asset = await this.assetStore.put(bytes, mimeType)
        return this.store.personas.setPersonaAvatar(id, asset.id)
    }

    removeAvatar(id: string) {
        return this.store.personas.setPersonaAvatar(id, null)
    }

    effectiveFor(conversation: Conversation | null, settings: AppSettings): EffectivePersona {
        if (conversation?.personaLocked) {
            const selected = conversation.boundPersonaId
                ? this.store.personas.getPersona(conversation.boundPersonaId)
                : null
            if (selected) {
                return {
                    id: selected.id,
                    name: selected.name,
                    description: selected.description,
                    avatarAssetId: selected.avatarAssetId,
                    source: 'conversation',
                }
            }
            return {
                id: null,
                name: settings.userName,
                description: '',
                avatarAssetId: null,
                source: 'conversation',
            }
        }
        if (settings.selectedPersonaId) {
            const selected = this.store.personas.getPersona(settings.selectedPersonaId)
            if (selected) {
                return {
                    id: selected.id,
                    name: selected.name,
                    description: selected.description,
                    avatarAssetId: selected.avatarAssetId,
                    source: 'global',
                }
            }
        }
        return {
            id: null,
            name: settings.userName,
            description: '',
            avatarAssetId: null,
            source: 'default',
        }
    }
}
