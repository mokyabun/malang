import type {
    Conversation,
    ConversationModuleState,
    GenerationEvent,
    Message,
} from '@malang/shared'
import { atom } from 'jotai'

import { api, getClientInstanceId, streamGeneration } from '@/lib/api'

import {
    conversationsAtom,
    selectedCharacterIdAtom,
    selectedConversationIdAtom,
    workspaceErrorAtom,
} from '../atom'
import { mobileSidebarOpenAtom } from '../sidebar/atom'

export interface ActiveGeneration {
    generationId?: string
}

export const messagesAtom = atom<Message[]>([])
export const conversationModuleStatesAtom = atom<ConversationModuleState[]>([])
export const activeGenerationsAtom = atom<Record<string, ActiveGeneration>>({})
export const messageLoadingAtom = atom(false)
export const inspectorOpenAtom = atom(false)
export const conversationCreatingAtom = atom(false)

export const hasStreamingMessageAtom = atom((get) =>
    get(messagesAtom).some((message) => message.status === 'streaming'),
)

export const generatingConversationIdsAtom = atom(
    (get) => new Set(Object.keys(get(activeGenerationsAtom))),
)

export const loadConversationAtom = atom(null, async (get, set, conversationId: string) => {
    set(messageLoadingAtom, true)
    try {
        const [messageResult, activeResult, moduleResult] = await Promise.all([
            api.messages(conversationId),
            api.activeGeneration(conversationId),
            api.conversationModules(conversationId),
        ])
        if (get(selectedConversationIdAtom) === conversationId) {
            set(messagesAtom, messageResult.messages)
            set(conversationModuleStatesAtom, moduleResult.modules)
        }
        set(activeGenerationsAtom, (current) => {
            const next = { ...current }
            if (activeResult.generation) {
                next[conversationId] = { generationId: activeResult.generation.id }
            } else {
                delete next[conversationId]
            }
            return next
        })
    } catch (cause) {
        set(
            workspaceErrorAtom,
            cause instanceof Error ? cause.message : '메시지를 불러오지 못했습니다.',
        )
    } finally {
        set(messageLoadingAtom, false)
    }
})

export const createConversationAtom = atom(
    null,
    async (
        get,
        set,
        input: {
            characterId?: string
            title?: string
            promptPresetId?: string
            greetingIndex?: number
        } = {},
    ) => {
        if (get(conversationCreatingAtom)) return null
        const { characterId: requestedCharacterId, ...conversationInput } = input
        const characterId = requestedCharacterId ?? get(selectedCharacterIdAtom)
        if (!characterId) return null
        set(conversationCreatingAtom, true)
        set(workspaceErrorAtom, '')
        try {
            const conversation = await api.createConversation(characterId, conversationInput)
            set(conversationsAtom, (current) => [conversation, ...current])
            set(selectedCharacterIdAtom, characterId)
            set(selectedConversationIdAtom, conversation.id)
            set(mobileSidebarOpenAtom, false)
            return conversation
        } catch (cause) {
            set(
                workspaceErrorAtom,
                cause instanceof Error ? cause.message : '대화를 만들지 못했습니다.',
            )
            return null
        } finally {
            set(conversationCreatingAtom, false)
        }
    },
)

export const updateConversationAtom = atom(
    null,
    async (
        _get,
        set,
        {
            conversationId,
            input,
        }: {
            conversationId: string
            input: Partial<
                Pick<
                    Conversation,
                    | 'title'
                    | 'authorNote'
                    | 'variables'
                    | 'promptPresetId'
                    | 'promptPresetLocked'
                    | 'boundPersonaId'
                    | 'personaLocked'
                    | 'greetingIndex'
                    | 'modelPresetId'
                    | 'auxiliaryModelPresetId'
                    | 'modelChainPresetId'
                >
            >
        },
    ) => {
        try {
            const conversation = await api.updateConversation(conversationId, input)
            set(conversationsAtom, (current) =>
                current.map((item) => (item.id === conversation.id ? conversation : item)),
            )
            return conversation
        } catch (cause) {
            set(
                workspaceErrorAtom,
                cause instanceof Error ? cause.message : '대화 설정을 저장하지 못했습니다.',
            )
            return null
        }
    },
)

export const toggleConversationModuleAtom = atom(
    null,
    async (
        _get,
        set,
        {
            conversationId,
            moduleId,
            enabled,
        }: { conversationId: string; moduleId: string; enabled: boolean | null },
    ) => {
        try {
            const result = await api.updateConversationModule(conversationId, moduleId, enabled)
            set(conversationModuleStatesAtom, result.modules)
        } catch (cause) {
            set(
                workspaceErrorAtom,
                cause instanceof Error ? cause.message : '모듈 설정을 저장하지 못했습니다.',
            )
        }
    },
)

export const archiveConversationAtom = atom(null, async (get, set, conversationId: string) => {
    try {
        await api.archiveConversation(conversationId)
        const next = get(conversationsAtom).filter((item) => item.id !== conversationId)
        const nextConversation =
            next.find((item) => item.characterId === get(selectedCharacterIdAtom)) ?? null
        set(conversationsAtom, next)
        set(selectedConversationIdAtom, nextConversation?.id ?? null)
        set(inspectorOpenAtom, false)
        return { ok: true as const, nextConversation }
    } catch (cause) {
        set(
            workspaceErrorAtom,
            cause instanceof Error ? cause.message : '대화를 보관하지 못했습니다.',
        )
        return { ok: false as const, nextConversation: null }
    }
})

export const deleteConversationAtom = atom(null, async (get, set, conversationId: string) => {
    try {
        await api.deleteConversation(conversationId)
        const conversations = get(conversationsAtom).filter((item) => item.id !== conversationId)
        const nextConversation =
            conversations.find(
                (item) => !item.archivedAt && item.characterId === get(selectedCharacterIdAtom),
            ) ?? null
        set(conversationsAtom, conversations)
        if (get(selectedConversationIdAtom) === conversationId) {
            set(selectedConversationIdAtom, nextConversation?.id ?? null)
            set(messagesAtom, [])
            set(conversationModuleStatesAtom, [])
        }
        set(activeGenerationsAtom, (current) => {
            const next = { ...current }
            delete next[conversationId]
            return next
        })
        set(inspectorOpenAtom, false)
        return { ok: true as const, nextConversation }
    } catch (cause) {
        set(
            workspaceErrorAtom,
            cause instanceof Error ? cause.message : '대화를 삭제하지 못했습니다.',
        )
        return { ok: false as const, nextConversation: null }
    }
})

export const generateReplyAtom = atom(
    null,
    async (
        get,
        set,
        {
            conversationId,
            content,
            regenerate = false,
        }: { conversationId: string; content?: string; regenerate?: boolean },
    ) => {
        if (get(activeGenerationsAtom)[conversationId]) return
        set(workspaceErrorAtom, '')
        set(activeGenerationsAtom, (current) => ({ ...current, [conversationId]: {} }))

        if (content && get(selectedConversationIdAtom) === conversationId) {
            const now = new Date().toISOString()
            set(messagesAtom, (current) => [
                ...current,
                {
                    id: `pending-${crypto.randomUUID()}`,
                    conversationId,
                    role: 'user',
                    content,
                    position: current.length,
                    status: 'complete',
                    createdAt: now,
                    updatedAt: now,
                },
            ])
        }

        const applyEvent = (event: GenerationEvent) => {
            if (event.type === 'generation.started') {
                set(activeGenerationsAtom, (current) => ({
                    ...current,
                    [conversationId]: { generationId: event.generationId },
                }))
                void set(loadConversationAtom, conversationId)
                return
            }
            if (get(selectedConversationIdAtom) !== conversationId) return

            if (event.type === 'message.delta' || event.type === 'message.snapshot') {
                set(messagesAtom, (current) => {
                    const existing = current.find((message) => message.id === event.messageId)
                    const contentValue =
                        event.type === 'message.delta'
                            ? (existing?.content ?? '') + event.delta
                            : event.content
                    if (existing) {
                        return current.map((message) =>
                            message.id === event.messageId
                                ? { ...message, content: contentValue }
                                : message,
                        )
                    }
                    const now = new Date().toISOString()
                    return [
                        ...current,
                        {
                            id: event.messageId,
                            conversationId,
                            role: 'assistant',
                            content: contentValue,
                            position: current.length,
                            status: 'streaming',
                            createdAt: now,
                            updatedAt: now,
                        },
                    ]
                })
                return
            }
            if (event.type === 'message.completed') {
                set(messagesAtom, (current) => {
                    const withoutReplacedStream = current.filter(
                        (message) =>
                            message.id === event.message.id || message.status !== 'streaming',
                    )
                    return withoutReplacedStream.some((message) => message.id === event.message.id)
                        ? withoutReplacedStream.map((message) =>
                              message.id === event.message.id ? event.message : message,
                          )
                        : [...withoutReplacedStream, event.message]
                })
                return
            }
            set(workspaceErrorAtom, event.error.message)
        }

        try {
            await streamGeneration(
                conversationId,
                regenerate
                    ? {
                          mode: 'regenerate',
                          idempotencyKey: crypto.randomUUID(),
                          clientInstanceId: getClientInstanceId(),
                      }
                    : {
                          mode: 'reply',
                          content: content ?? '',
                          idempotencyKey: crypto.randomUUID(),
                          clientInstanceId: getClientInstanceId(),
                      },
                applyEvent,
            )
            const result = await api.conversations()
            set(conversationsAtom, result.conversations)
        } catch (cause) {
            set(
                workspaceErrorAtom,
                cause instanceof Error ? cause.message : '답변을 생성하지 못했습니다.',
            )
            await set(loadConversationAtom, conversationId)
        } finally {
            set(activeGenerationsAtom, (current) => {
                const next = { ...current }
                delete next[conversationId]
                return next
            })
        }
    },
)

export const cancelGenerationAtom = atom(null, async (get, set, conversationId: string) => {
    const generationId = get(activeGenerationsAtom)[conversationId]?.generationId
    if (!generationId) return
    try {
        await api.cancelGeneration(generationId)
    } catch (cause) {
        set(
            workspaceErrorAtom,
            cause instanceof Error ? cause.message : '생성을 중단하지 못했습니다.',
        )
    }
})
