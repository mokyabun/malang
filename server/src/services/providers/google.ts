import { GoogleGenAI, HarmBlockThreshold, HarmCategory } from '@google/genai'

import {
    type ProviderAdapter,
    type ProviderChunk,
    ProviderError,
    type ProviderModel,
    type RuntimeProviderConfig,
} from './types'
import { toGeminiContents } from './vertex'

export class GoogleAIStudioAdapter implements ProviderAdapter {
    readonly kind = 'google' as const

    validateConfig(config: RuntimeProviderConfig): void {
        if (!config.modelId) throw new ProviderError('model_not_found', 'A model ID is required')
        if (!config.apiKey)
            throw new ProviderError('provider_auth', 'Google AI Studio requires an API key')
    }

    async healthCheck(config: RuntimeProviderConfig) {
        this.validateConfig(config)
        try {
            await client(config).models.countTokens({ model: config.modelId, contents: 'ping' })
            return { ok: true, message: 'Google AI Studio credentials and model are available' }
        } catch (error) {
            throw mapError(error)
        }
    }

    async listModels(config: RuntimeProviderConfig): Promise<ProviderModel[]> {
        this.validateConfig(config)
        try {
            const pager = await client(config).models.list()
            const models: ProviderModel[] = []
            for await (const model of pager) {
                if (!model.name) continue
                const id = model.name.replace(/^models\//, '')
                models.push({ id, name: model.displayName || id })
            }
            return models
        } catch (error) {
            throw mapError(error)
        }
    }

    async *streamChat(
        config: RuntimeProviderConfig,
        request: Parameters<ProviderAdapter['streamChat']>[1],
    ): AsyncGenerator<ProviderChunk> {
        this.validateConfig(config)
        const { systemInstruction, contents } = toGeminiContents(request.messages)
        const body = {
            model: config.modelId,
            contents,
            config: {
                ...(systemInstruction ? { systemInstruction } : {}),
                temperature: request.parameters.temperature,
                topP: request.parameters.topP,
                topK: request.parameters.topK,
                frequencyPenalty: request.parameters.frequencyPenalty,
                presencePenalty: request.parameters.presencePenalty,
                maxOutputTokens: request.parameters.maxOutputTokens,
                stopSequences: request.parameters.stopSequences,
                safetySettings: safetyCategories.map((category) => ({
                    category,
                    threshold: HarmBlockThreshold.BLOCK_NONE,
                })),
            },
        }
        request.onRequest?.({
            endpoint: `https://generativelanguage.googleapis.com/v1beta/models/${config.modelId}:streamGenerateContent`,
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-goog-api-key': '[redacted]' },
            body,
        })
        try {
            const stream = await client(config).models.generateContentStream({
                ...body,
                config: { ...body.config, abortSignal: request.signal },
            })
            for await (const chunk of stream) {
                const usage = chunk.usageMetadata
                    ? {
                          inputTokens: chunk.usageMetadata.promptTokenCount,
                          outputTokens: chunk.usageMetadata.candidatesTokenCount,
                      }
                    : undefined
                if (chunk.text || usage) yield { delta: chunk.text || '', usage }
            }
        } catch (error) {
            if (request.signal.aborted) throw error
            throw mapError(error)
        }
    }
}

function client(config: RuntimeProviderConfig) {
    return new GoogleGenAI({ apiKey: config.apiKey })
}

const safetyCategories: HarmCategory[] = [
    HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    HarmCategory.HARM_CATEGORY_HARASSMENT,
    HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY,
]

function mapError(error: unknown): ProviderError {
    const message = error instanceof Error ? error.message : String(error)
    if (/401|403|api.?key|credential/i.test(message))
        return new ProviderError('provider_auth', 'Google AI Studio authentication failed')
    if (/404|not found/i.test(message))
        return new ProviderError('model_not_found', 'Google model was not found')
    if (/429|quota|rate/i.test(message))
        return new ProviderError('rate_limited', 'Google AI Studio quota exceeded')
    if (/safety|blocked/i.test(message))
        return new ProviderError('safety_blocked', 'Google blocked the response')
    return new ProviderError('provider_unreachable', message)
}
