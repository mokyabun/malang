import { GoogleGenAI, HarmBlockThreshold, HarmCategory } from '@google/genai'

import { pocketRisuProfileHeaders } from './pocketrisu-profile'
import {
    type ProviderAdapter,
    type ProviderChunk,
    ProviderError,
    type ProviderModel,
    type RuntimeProviderConfig,
} from './types'

export class VertexAdapter implements ProviderAdapter {
    readonly kind = 'vertex' as const

    validateConfig(config: RuntimeProviderConfig): void {
        if (config.provider !== 'vertex')
            throw new ProviderError('invalid_provider_response', 'Expected a Vertex configuration')
        if (
            !config.modelId ||
            (!config.apiKey && !config.serviceAccount && (!config.projectId || !config.location))
        )
            throw new ProviderError(
                'provider_unreachable',
                'Vertex requires a model and an API key, service-account JSON, or project/location with ADC',
            )
    }

    async healthCheck(config: RuntimeProviderConfig) {
        this.validateConfig(config)
        if (config.provider !== 'vertex')
            return { ok: false, message: 'Invalid Vertex configuration' }
        try {
            const client = vertexClient(config)
            await client.models.countTokens({ model: config.modelId, contents: 'ping' })
            return { ok: true, message: 'Vertex AI credentials and model are available' }
        } catch (error) {
            throw mapVertexError(error)
        }
    }

    async listModels(config: RuntimeProviderConfig): Promise<ProviderModel[]> {
        this.validateConfig(config)
        if (config.provider !== 'vertex') return []
        return [{ id: config.modelId, name: config.modelId }]
    }

    async *streamChat(
        config: RuntimeProviderConfig,
        request: Parameters<ProviderAdapter['streamChat']>[1],
    ): AsyncGenerator<ProviderChunk> {
        this.validateConfig(config)
        if (config.provider !== 'vertex') return
        const { systemInstruction, contents } = toGeminiContents(request.messages)
        const generationConfig: Record<string, unknown> = {}
        if (request.parameters.temperature !== undefined)
            generationConfig.temperature = request.parameters.temperature
        if (request.parameters.topP !== undefined) generationConfig.topP = request.parameters.topP
        if (request.parameters.topK !== undefined) generationConfig.topK = request.parameters.topK
        if (request.parameters.frequencyPenalty !== undefined)
            generationConfig.frequencyPenalty = request.parameters.frequencyPenalty
        if (request.parameters.presencePenalty !== undefined)
            generationConfig.presencePenalty = request.parameters.presencePenalty
        if (request.parameters.maxOutputTokens !== undefined)
            generationConfig.maxOutputTokens = request.parameters.maxOutputTokens
        if (request.parameters.stopSequences !== undefined)
            generationConfig.stopSequences = request.parameters.stopSequences

        const options = config.providerOptions ?? {}
        if (typeof options.seed === 'number') generationConfig.seed = options.seed
        if (typeof options.responseMimeType === 'string' && options.responseMimeType) {
            generationConfig.responseMimeType = options.responseMimeType
        }
        const thinkingConfig: Record<string, unknown> = {}
        if (typeof options.thinkingLevel === 'string' && options.thinkingLevel) {
            thinkingConfig.thinkingLevel = options.thinkingLevel
        }
        if (typeof options.includeThoughts === 'boolean') {
            thinkingConfig.includeThoughts = options.includeThoughts
        }
        if (Object.keys(thinkingConfig).length) generationConfig.thinkingConfig = thinkingConfig

        const configuredSafety = Array.isArray(options.safetySettings)
            ? options.safetySettings
            : null

        const body = {
            model: config.modelId,
            contents,
            config: {
                ...generationConfig,
                ...(systemInstruction ? { systemInstruction } : {}),
                // Matches PocketRisu's default (uncensored) safety posture so identical prompts
                // aren't blocked here when they wouldn't be there.
                safetySettings:
                    configuredSafety ??
                    safetyCategories.map((category) => ({
                        category,
                        threshold: HarmBlockThreshold.BLOCK_NONE,
                    })),
            },
        }
        request.onRequest?.({
            endpoint: vertexDebugEndpoint(config),
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body,
        })

        try {
            const stream = await vertexClient(config).models.generateContentStream({
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
            throw mapVertexError(error)
        }
    }
}

function vertexClient(config: Extract<RuntimeProviderConfig, { provider: 'vertex' }>) {
    const headers = pocketRisuProfileHeaders(config.providerOptions)
    const httpOptions =
        config.baseUrl || Object.keys(headers).length
            ? { ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}), headers }
            : undefined
    if (config.apiKey)
        return new GoogleGenAI({ vertexai: true, apiKey: config.apiKey, httpOptions })
    return new GoogleGenAI({
        vertexai: true,
        project: config.projectId || config.serviceAccount?.project_id,
        location: config.location,
        httpOptions,
        ...(config.serviceAccount
            ? { googleAuthOptions: { credentials: config.serviceAccount } }
            : {}),
    })
}

function vertexDebugEndpoint(config: Extract<RuntimeProviderConfig, { provider: 'vertex' }>) {
    const location = config.location || 'global'
    const project = config.projectId || config.serviceAccount?.project_id || 'express-api'
    return `vertex://${location}/${project}/models/${config.modelId}:streamGenerateContent`
}

const safetyCategories: HarmCategory[] = [
    HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    HarmCategory.HARM_CATEGORY_HARASSMENT,
    HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY,
]

// Mirrors PocketRisu's requestGoogleCloudVertex message-shaping exactly (its text-only path):
// only the very first message is hoisted into systemInstruction, even if later ones are also
// role 'system' — those instead fold into the chat as a "system:"-prefixed user turn, merging
// into an immediately preceding user turn rather than starting a new one. A final backward pass
// then collapses any consecutive same-role turns.
export function toGeminiContents(messages: Array<{ role: string; content: string }>): {
    systemInstruction: string
    contents: Array<{ role: string; parts: Array<{ text: string }> }>
} {
    const queue = [...messages]
    const systemInstruction = queue[0]?.role === 'system' ? (queue.shift()?.content ?? '') : ''

    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = []
    for (const message of queue) {
        const previous = contents.at(-1)
        if (message.role === 'system') {
            if (previous?.role === 'user' && previous.parts[0]) {
                previous.parts[0].text += `\nsystem:${message.content}`
            } else {
                contents.push({ role: 'user', parts: [{ text: `system:${message.content}` }] })
            }
            continue
        }
        contents.push({
            role: message.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: message.content }],
        })
    }

    for (let index = contents.length - 1; index >= 1; index -= 1) {
        const current = contents[index]
        const previous = contents[index - 1]
        if (!current || !previous || current.role !== previous.role) continue
        const previousPart = previous.parts.at(-1)
        if (previousPart) previousPart.text += `\n\n${current.parts[0]?.text || ''}`
        contents.splice(index, 1)
    }

    return { systemInstruction, contents }
}

function mapVertexError(error: unknown): ProviderError {
    const message = error instanceof Error ? error.message : String(error)
    if (/401|403|credential|permission/i.test(message))
        return new ProviderError('provider_auth', 'Vertex AI authentication failed')
    if (/404|not found/i.test(message))
        return new ProviderError('model_not_found', 'Vertex AI model was not found')
    if (/429|quota|rate/i.test(message))
        return new ProviderError('rate_limited', 'Vertex AI quota exceeded')
    if (/safety|blocked/i.test(message))
        return new ProviderError('safety_blocked', 'Vertex AI blocked the response')
    return new ProviderError('provider_unreachable', message)
}
