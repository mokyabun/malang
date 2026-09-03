import { createHash } from 'node:crypto'

import { CHAIN_MAIN_NODE_ID, planChainExecution } from '@malang/shared'
import type {
    ApiError,
    ChainExecutionNode,
    CompiledMessage,
    GenerationEvent,
    GenerationParameters,
    GenerationRequest,
    ModelChainAgent,
    ModelChainPreset,
    PromptPreview,
    RequestDebugSnapshot,
} from '@malang/shared'
import type { Logger } from 'pino'

import type { Store } from '@/db'
import { ConflictError, ValidationError } from '@/errors/app-error'
import { normalizeError } from '@/errors/normalize'
import type { LuaRuntime } from '@/services/lua'
import type { HypaMemoryV3Service } from '@/services/memory'
import { compilePrompt, mergeGenerationParameters } from '@/services/prompt/compiler'
import { selectLoreEntries } from '@/services/prompt/lorebook'
import { collectRegexScripts, processRegexText } from '@/services/prompt/regex-runtime'
import { renderTemplate, type TemplateContext } from '@/services/prompt/template-engine'
import { providerFor } from '@/services/providers'
import type { ProviderUsage } from '@/services/providers/types'
import type { RuntimeProviderConfig } from '@/services/providers/types'

import type { PersonaService } from './personas'
import type { ProviderService } from './providers'

export class GenerationConflictError extends ConflictError {}
export class GenerationNotConfiguredError extends ValidationError {}

export class GenerationService {
    private readonly active = new Map<string, AbortController>()

    constructor(
        private readonly store: Store,
        private readonly providers: ProviderService,
        private readonly personas: PersonaService,
        private readonly lua: LuaRuntime,
        private readonly memory: HypaMemoryV3Service,
        private readonly log: Logger,
    ) {}

    async preview(conversationId: string) {
        const context = this.context(conversationId)
        const provider = this.providers.configForConversation(conversationId)
        const parameters = mergeGenerationParameters(
            provider?.defaults || {},
            context.preset.parameters,
        )
        const longTermMemory = this.memory.recall(
            conversationId,
            context.messages,
            parameters.maxContextTokens,
        )
        const preview = compilePrompt({ ...context, parameters, longTermMemory })
        return this.applyEditProcess(preview, context)
    }

    async start(conversationId: string, request: GenerationRequest, requestId: string) {
        const prior = this.store.generations.findGenerationByIdempotency(
            conversationId,
            request.idempotencyKey,
        )
        if (prior) {
            if (request.clientInstanceId && prior.status === 'running') {
                return reconnectGeneration(this.store, prior.id, requestId)
            }
            if (request.clientInstanceId && prior.status === 'complete' && prior.messageId) {
                const message = this.store.conversations.getMessage(prior.messageId)
                if (message) return replayGeneration(prior.id, message)
            }
            throw new GenerationConflictError(
                prior.status === 'running'
                    ? 'This generation request is still running'
                    : 'This generation request already failed or was cancelled',
            )
        }
        if (this.store.generations.findRunningGeneration(conversationId))
            throw new GenerationConflictError('A generation is already running')
        const providerConfig = await this.providers.requireRuntimeForConversation(conversationId)
        let context = this.context(conversationId)
        const modelChain = context.conversation.modelChainPresetId
            ? this.store.modelChains.get(context.conversation.modelChainPresetId)
            : null
        const clientInstanceId = request.clientInstanceId ?? crypto.randomUUID()
        const luaScriptSnapshot = this.lua.snapshotScripts(conversationId)
        const parameters = mergeGenerationParameters(
            providerConfig.defaults,
            context.preset.parameters,
        )
        const generationId = crypto.randomUUID()
        this.store.generations.createGeneration({
            id: generationId,
            conversationId,
            messageId: null,
            idempotencyKey: request.idempotencyKey,
            provider: providerConfig.provider,
            modelId: providerConfig.modelId,
            parameters,
        })
        const targetMessage =
            request.mode === 'regenerate'
                ? this.store.conversations.getLastAssistantMessage(conversationId)
                : null
        let addedUserMessage: ReturnType<Store['conversations']['createMessage']> | null = null
        let compileMessages = context.messages
        let scripts = collectRegexScripts(context.preset, context.character, context.modules)
        let templateContext = regexTemplateContext(context)
        let preview: PromptPreview
        let chainContext: ChainExecutionContext | null = null
        let stoppedBeforeProvider = false
        try {
            if (request.mode === 'reply') {
                await this.lua.executeEvent({
                    conversationId,
                    eventKey: request.idempotencyKey,
                    phase: 'onInput',
                    mode: 'input',
                    clientInstanceId,
                    scriptSnapshot: luaScriptSnapshot,
                })
                const editedInput = await this.lua.executeEvent({
                    conversationId,
                    eventKey: request.idempotencyKey,
                    phase: 'editInput',
                    mode: 'editInput',
                    data: request.content,
                    clientInstanceId,
                    scriptSnapshot: luaScriptSnapshot,
                })
                context = this.context(conversationId)
                scripts = collectRegexScripts(context.preset, context.character, context.modules)
                templateContext = regexTemplateContext(context)
                const processedInput = await processRegexText({
                    text: String(editedInput.data ?? ''),
                    phase: 'editinput',
                    scripts,
                    templateContext,
                })
                addedUserMessage = this.store.conversations.createMessage(
                    conversationId,
                    'user',
                    processedInput.text,
                    'complete',
                )
            } else if (!targetMessage) {
                throw new GenerationConflictError('There is no assistant message to regenerate')
            }

            const started = await this.lua.executeEvent({
                conversationId,
                eventKey: request.idempotencyKey,
                phase: 'onStart',
                mode: 'start',
                clientInstanceId,
                scriptSnapshot: luaScriptSnapshot,
            })
            stoppedBeforeProvider = started.stopSending
            context = this.context(conversationId)
            scripts = collectRegexScripts(context.preset, context.character, context.modules)
            templateContext = regexTemplateContext(context)
            compileMessages = targetMessage
                ? context.messages.filter((message) => message.id !== targetMessage.id)
                : context.messages
            const preliminary = compilePrompt({
                ...context,
                messages: compileMessages,
                parameters,
            })
            const longTermMemory = await this.memory.prepare(
                conversationId,
                compileMessages,
                parameters.maxContextTokens,
                preliminary.trimmedMessageIds,
            )
            preview = compilePrompt({
                ...context,
                messages: compileMessages,
                parameters,
                longTermMemory,
            })
            preview = await this.applyEditProcess(preview, {
                ...context,
                messages: compileMessages,
            })
            chainContext = buildChainExecutionContext(
                context,
                compileMessages,
                longTermMemory.content,
            )
            const editedRequest = await this.lua.executeEvent({
                conversationId,
                eventKey: request.idempotencyKey,
                phase: 'editRequest',
                mode: 'editRequest',
                data: preview.messages,
                clientInstanceId,
                scriptSnapshot: luaScriptSnapshot,
            })
            if (Array.isArray(editedRequest.data)) {
                preview = {
                    ...preview,
                    messages: editedRequest.data.map((message) => ({
                        role:
                            message && typeof message === 'object' && 'role' in message
                                ? normalizeCompiledRole(String(message.role))
                                : 'user',
                        content:
                            message && typeof message === 'object' && 'content' in message
                                ? String(message.content ?? '')
                                : '',
                    })),
                }
            }
        } catch (error) {
            if (addedUserMessage) this.store.conversations.deleteMessage(addedUserMessage.id)
            const normalized = normalizeError(error, requestId)
            this.store.generations.finishGeneration(generationId, {
                status: 'failed',
                errorCode: normalized.apiError.code,
                errorMessage: normalized.apiError.message,
            })
            throw error
        }

        const streamingMessage = targetMessage
            ? this.store.conversations.updateMessage(targetMessage.id, {
                  content: '',
                  status: 'streaming',
              })
            : this.store.conversations.createMessage(conversationId, 'assistant', '', 'streaming')
        if (!streamingMessage) throw new Error('Failed to create assistant message')
        const messageId = streamingMessage.id
        this.store.generations.attachGenerationMessage(generationId, messageId)
        const abortController = new AbortController()
        this.active.set(generationId, abortController)
        const startedAt = performance.now()
        let clientConnected = true

        const stream = new ReadableStream<Uint8Array>({
            start: async (controller) => {
                const send = (event: GenerationEvent) => {
                    if (!clientConnected) return
                    try {
                        controller.enqueue(encodeSse(event))
                    } catch {
                        clientConnected = false
                    }
                }
                const close = () => {
                    if (!clientConnected) return
                    clientConnected = false
                    try {
                        controller.close()
                    } catch {}
                }
                send({ type: 'generation.started', generationId, messageId })
                let content = ''
                let processedContent = ''
                let checkpointLength = 0
                let checkpointAt = Date.now()
                let usage: ProviderUsage | undefined
                try {
                    if (stoppedBeforeProvider) {
                        const stopped = this.store.conversations.updateMessage(messageId, {
                            content: '',
                            status: 'cancelled',
                        })
                        this.store.generations.finishGeneration(generationId, {
                            status: 'cancelled',
                            outputText: '',
                            processedOutputText: '',
                            errorCode: 'cancelled',
                            errorMessage: 'Lua onStart stopped generation',
                        })
                        if (stopped)
                            send({ type: 'message.completed', generationId, message: stopped })
                        close()
                        return
                    }
                    const runtimeProvider =
                        await this.providers.requireRuntimeForConversation(conversationId)
                    const adapter = providerFor(runtimeProvider)
                    const generateMain = async (notes: ChainNote[]) => {
                        for await (const chunk of adapter.streamChat(runtimeProvider, {
                            messages: injectChainNotes(preview.messages, notes),
                            parameters,
                            signal: abortController.signal,
                            ...(context.settings.requestDebugEnabled
                                ? {
                                      onRequest: (snapshot) => {
                                          try {
                                              this.store.generations.createRequestDebugRecord({
                                                  generationId,
                                                  conversationId,
                                                  provider: providerConfig.provider,
                                                  modelId: providerConfig.modelId,
                                                  parameters,
                                                  request: snapshot,
                                              })
                                          } catch (error) {
                                              this.log.warn(
                                                  { event: 'request_debug.capture_failed', error },
                                                  'Failed to capture provider request',
                                              )
                                          }
                                      },
                                  }
                                : {}),
                        })) {
                            if (chunk.delta) {
                                content += chunk.delta
                                send({
                                    type: 'message.delta',
                                    generationId,
                                    messageId,
                                    delta: chunk.delta,
                                })
                            }
                            if (chunk.usage) usage = chunk.usage
                            if (
                                content.length - checkpointLength >= 512 ||
                                Date.now() - checkpointAt >= 1_000
                            ) {
                                this.store.conversations.updateMessage(messageId, {
                                    content,
                                    status: 'streaming',
                                })
                                checkpointLength = content.length
                                checkpointAt = Date.now()
                            }
                        }
                        return content
                    }
                    content = modelChain
                        ? await this.runModelChain({
                              preset: modelChain,
                              context: chainContext!,
                              generationId,
                              conversationId,
                              requestDebugEnabled: context.settings.requestDebugEnabled,
                              signal: abortController.signal,
                              generateMain,
                          })
                        : await generateMain([])
                    const luaOutput = await this.lua.executeEvent({
                        conversationId,
                        eventKey: request.idempotencyKey,
                        phase: 'editOutput',
                        mode: 'editOutput',
                        data: content,
                        clientInstanceId,
                        scriptSnapshot: luaScriptSnapshot,
                    })
                    processedContent = (
                        await processRegexText({
                            text: String(luaOutput.data ?? ''),
                            phase: 'editoutput',
                            scripts,
                            templateContext,
                        })
                    ).text
                    let completed = this.store.conversations.updateMessage(messageId, {
                        content: processedContent,
                        status: 'complete',
                    })
                    if (!completed)
                        throw new Error('Assistant message disappeared during generation')
                    await this.lua.executeEvent({
                        conversationId,
                        eventKey: request.idempotencyKey,
                        phase: 'onOutput',
                        mode: 'output',
                        clientInstanceId,
                        scriptSnapshot: luaScriptSnapshot,
                    })
                    completed =
                        this.store.conversations.getMessage(messageId) ??
                        this.store.conversations.getLastAssistantMessage(conversationId)
                    if (!completed) throw new Error('Lua onOutput removed the assistant message')
                    processedContent = completed.content
                    this.store.generations.attachGenerationMessage(generationId, completed.id)
                    this.store.generations.finishGeneration(generationId, {
                        status: 'complete',
                        outputText: content,
                        processedOutputText: processedContent,
                        inputTokens: usage?.inputTokens || preview.estimatedInputTokens,
                        outputTokens: usage?.outputTokens,
                    })
                    logGeneration(
                        this.log,
                        generationId,
                        providerConfig.provider,
                        providerConfig.modelId,
                        startedAt,
                        'complete',
                    )
                    send({
                        type: 'message.snapshot',
                        generationId,
                        messageId: completed.id,
                        content: completed.content,
                    })
                    send({ type: 'message.completed', generationId, message: completed, usage })
                    close()
                } catch (error) {
                    const cancelled = abortController.signal.aborted
                    this.store.conversations.updateMessage(messageId, {
                        content: processedContent || content,
                        status: cancelled ? 'cancelled' : 'failed',
                    })
                    const normalized = normalizeError(error, requestId, { cancelled })
                    const apiError = normalized.apiError
                    this.store.generations.finishGeneration(generationId, {
                        status: cancelled ? 'cancelled' : 'failed',
                        outputText: content,
                        processedOutputText: processedContent || content,
                        errorCode: apiError.code,
                        errorMessage: apiError.message,
                    })
                    logGeneration(
                        this.log,
                        generationId,
                        providerConfig.provider,
                        providerConfig.modelId,
                        startedAt,
                        cancelled ? 'cancelled' : 'failed',
                        apiError.code,
                    )
                    if (normalized.unexpected) {
                        this.log.error(
                            {
                                event: 'generation.unhandled_error',
                                requestId,
                                generationId,
                                conversationId,
                                err: normalized.cause,
                            },
                            'Unhandled generation error',
                        )
                    }
                    if (!cancelled) {
                        send({
                            type: 'generation.failed',
                            generationId,
                            messageId,
                            error: apiError,
                        })
                    }
                    close()
                } finally {
                    this.active.delete(generationId)
                }
            },
            cancel: () => {
                clientConnected = false
            },
        })

        return { generationId, stream }
    }

    cancel(generationId: string): boolean {
        const controller = this.active.get(generationId)
        if (!controller) return false
        controller.abort()
        return true
    }

    private async runModelChain(input: {
        preset: ModelChainPreset
        context: ChainExecutionContext
        generationId: string
        conversationId: string
        requestDebugEnabled: boolean
        signal: AbortSignal
        generateMain: (notes: ChainNote[]) => Promise<string>
    }): Promise<string> {
        const plan = planChainExecution(input.preset)
        if (!plan.batches.flat().some((node) => node.agent === null)) {
            throw new Error('The model chain cannot reach the main response due to a cycle')
        }
        let mainResponse = ''
        const completed: { node: ChainExecutionNode; output: string }[] = []
        for (const batch of plan.batches) {
            input.signal.throwIfAborted()
            const results = await Promise.all(
                batch.map(async (node) => {
                    const previous = completed.filter((result) =>
                        node.ancestors.has(result.node.id),
                    )
                    const notes = previous
                        .filter((result) => !result.node.ancestors.has(CHAIN_MAIN_NODE_ID))
                        .map(({ node: { agent, layer }, output }) => ({
                            agentId: agent.id,
                            agentName: agent.name,
                            layerId: layer.id,
                            layerName: layer.name,
                            content: output,
                        }))
                    if (node.agent === null) {
                        mainResponse = await input.generateMain(notes)
                        return null
                    }
                    const { agent, layer, ancestors } = node
                    if (!agent.enabled) return null
                    const receivesResponse = ancestors.has(CHAIN_MAIN_NODE_ID)
                    const response = receivesResponse
                        ? previous
                              .filter((result) => result.node.ancestors.has(CHAIN_MAIN_NODE_ID))
                              .reduce(
                                  (text, result) =>
                                      applyPostMode(
                                          result.node.agent.postMode,
                                          text,
                                          result.output,
                                      ),
                                  mainResponse,
                              )
                        : undefined
                    try {
                        const memory = agent.memoryEnabled
                            ? this.store.modelChains.getAgentMemory(input.conversationId, agent.id)
                            : ''
                        const raw = await this.completeChainAgent(
                            agent,
                            chainAgentMessages(agent, input.context, notes, memory, response),
                            {
                                ...input,
                                chain: {
                                    presetId: input.preset.id,
                                    presetName: input.preset.name,
                                    // Retain the debug contract; graph ancestry determines the input.
                                    phase: receivesResponse ? 'post' : 'pre',
                                    layerId: layer.id,
                                    layerName: layer.name,
                                    agentId: agent.id,
                                    agentName: agent.name,
                                },
                            },
                        )
                        input.signal.throwIfAborted()
                        const result = parseAgentMemoryOutput(raw, agent.memoryEnabled)
                        if (agent.memoryEnabled && result.memoryUpdate) {
                            this.store.modelChains.setAgentMemory(
                                input.conversationId,
                                agent.id,
                                result.memoryUpdate,
                            )
                        }
                        return result.note ? { node, output: result.note } : null
                    } catch (error) {
                        if (input.signal.aborted) throw error
                        this.log.warn(
                            {
                                event: 'model_chain.agent_failed',
                                generationId: input.generationId,
                                chainPresetId: input.preset.id,
                                layerId: layer.id,
                                agentId: agent.id,
                                error,
                            },
                            'Model-chain agent failed; continuing along the graph',
                        )
                        return null
                    }
                }),
            )
            // Commit in graph order, independent of provider completion timing.
            for (const result of results) {
                if (result) completed.push(result)
            }
        }
        return completed
            .filter((result) => result.node.ancestors.has(CHAIN_MAIN_NODE_ID))
            .reduce(
                (text, result) => applyPostMode(result.node.agent.postMode, text, result.output),
                mainResponse,
            )
    }

    private async completeChainAgent(
        agent: ModelChainAgent,
        messages: CompiledMessage[],
        input: {
            generationId: string
            conversationId: string
            requestDebugEnabled: boolean
            signal: AbortSignal
            chain: NonNullable<RequestDebugSnapshot['chain']>
        },
    ): Promise<string> {
        const runtime = await this.providers.requireRuntimeForModelPreset(agent.modelPresetId)
        const parameters = runtime.defaults
        let content = ''
        for await (const chunk of providerFor(runtime).streamChat(runtime, {
            messages,
            parameters,
            signal: input.signal,
            ...(input.requestDebugEnabled
                ? {
                      onRequest: (snapshot) =>
                          this.captureChainRequest(
                              input.generationId,
                              input.conversationId,
                              runtime,
                              parameters,
                              { ...snapshot, chain: input.chain },
                          ),
                  }
                : {}),
        })) {
            content += chunk.delta
        }
        return content.trim()
    }

    private captureChainRequest(
        generationId: string,
        conversationId: string,
        runtime: RuntimeProviderConfig,
        parameters: GenerationParameters,
        request: RequestDebugSnapshot,
    ) {
        try {
            this.store.generations.createRequestDebugRecord({
                generationId,
                conversationId,
                provider: runtime.provider,
                modelId: runtime.modelId,
                parameters,
                request,
            })
        } catch (error) {
            this.log.warn(
                { event: 'request_debug.capture_failed', error },
                'Failed to capture model-chain request',
            )
        }
    }

    async messagesWithDisplay(conversationId: string) {
        const context = this.context(conversationId)
        const scripts = collectRegexScripts(context.preset, context.character, context.modules)
        const scriptSetHash = createHash('sha256')
            .update('pocketrisu-display-assets-v1')
            .update(this.lua.scriptSetHash(conversationId))
            .update(JSON.stringify(scripts.filter((script) => script.phase === 'editdisplay')))
            .digest('hex')
        const epoch = context.conversation.displayEpoch
        const cached = this.store.sqlite
            .query<
                { status: string; result_json: string | null; error_json: string | null },
                [string, number, string]
            >(
                `SELECT status, result_json, error_json FROM lua_display_batches
                 WHERE conversation_id = ? AND display_epoch = ? AND script_set_hash = ?`,
            )
            .get(conversationId, epoch, scriptSetHash)
        if (cached?.status === 'complete' && cached.result_json) {
            return JSON.parse(cached.result_json) as ReturnType<
                GenerationService['context']
            >['messages']
        }
        if (cached?.status === 'failed') throw new Error('The cached Lua display batch failed')
        if (!cached) {
            this.store.sqlite
                .query(
                    `INSERT INTO lua_display_batches
                     (conversation_id, display_epoch, script_set_hash, status, created_at)
                     VALUES (?, ?, ?, 'running', ?)`,
                )
                .run(conversationId, epoch, scriptSetHash, Date.now())
        }
        try {
            const eventKey = `display:${epoch}:${scriptSetHash}`
            const output = []
            for (const [index, message] of context.messages.entries()) {
                const luaDisplay = await this.lua.executeEvent({
                    conversationId,
                    eventKey,
                    phase: `editDisplay:${index}`,
                    mode: 'editDisplay',
                    data: message.content,
                    meta: { index },
                    // A display GET has no initiating UI command target. editDisplay cannot use alerts.
                    clientInstanceId: '00000000-0000-4000-8000-000000000000',
                })
                const perMessageContext = {
                    ...context,
                    messages: context.messages.slice(0, index + 1),
                    conversation:
                        this.store.conversations.getConversation(conversationId) ??
                        context.conversation,
                }
                const templateContext = regexTemplateContext(perMessageContext)
                const regex = await processRegexText({
                    text: String(luaDisplay.data ?? ''),
                    phase: 'editdisplay',
                    scripts,
                    templateContext,
                })
                const rendered = renderTemplate(regex.text, {
                    ...templateContext,
                    assetRenderMode: 'display',
                }).text
                output.push({
                    ...message,
                    ...(rendered === message.content ? {} : { displayContent: rendered }),
                })
            }
            this.store.sqlite
                .query(
                    `UPDATE lua_display_batches SET status = 'complete', result_json = ?, completed_at = ?
                     WHERE conversation_id = ? AND display_epoch = ? AND script_set_hash = ?`,
                )
                .run(JSON.stringify(output), Date.now(), conversationId, epoch, scriptSetHash)
            return output
        } catch (error) {
            this.store.sqlite
                .query(
                    `UPDATE lua_display_batches SET status = 'failed', error_json = ?, completed_at = ?
                     WHERE conversation_id = ? AND display_epoch = ? AND script_set_hash = ?`,
                )
                .run(
                    JSON.stringify({
                        message: error instanceof Error ? error.message : String(error),
                    }),
                    Date.now(),
                    conversationId,
                    epoch,
                    scriptSetHash,
                )
            throw error
        }
    }

    private async applyEditProcess(
        preview: PromptPreview,
        context: ReturnType<GenerationService['context']>,
    ): Promise<PromptPreview> {
        const scripts = collectRegexScripts(context.preset, context.character, context.modules)
        const templateContext = regexTemplateContext(context)
        const results = await Promise.all(
            preview.messages.map((message) =>
                processRegexText({
                    text: message.content,
                    phase: 'editprocess',
                    scripts,
                    templateContext,
                }),
            ),
        )
        return {
            ...preview,
            messages: preview.messages.map((message, index) => ({
                ...message,
                content: results[index]?.text ?? message.content,
            })),
            warnings: [
                ...new Set([...preview.warnings, ...results.flatMap((result) => result.warnings)]),
            ],
        }
    }

    private context(conversationId: string) {
        const conversation = this.store.conversations.getConversation(conversationId)
        if (!conversation) throw new Error('Conversation not found')
        const character = this.store.characters.getCharacter(conversation.characterId)
        if (!character) throw new Error('Character not found')
        const settings = this.store.settings.getSettings()
        const preset = this.store.prompts.getPromptPreset(
            this.store.conversations.effectivePromptPresetId(conversation),
        )
        if (!preset) throw new Error('Prompt preset not found')
        const moduleStates = this.store.conversations
            .listConversationModuleStates(conversationId)
            .filter((state) => state.enabled)
        const characterAssets = this.store.characters
            .getCharacterAssetLinks(character.id)
            .map((link) => ({
                name: link.name,
                type: link.type,
                extension: link.extension,
                url: `/api/v1/assets/${link.assetId}`,
            }))
        const moduleAssets = moduleStates.flatMap((state) =>
            this.store.prompts.getPromptModuleAssetLinks(state.module.id).map((link) => ({
                name: link.name,
                type: link.type,
                extension: link.extension,
                url: `/api/v1/assets/${link.assetId}`,
                moduleNamespace: state.module.namespace,
            })),
        )
        return {
            conversation,
            character,
            preset,
            messages: this.store.conversations.listMessages(conversationId),
            settings,
            modelId: this.store.providers.getProvider()?.modelId,
            persona: this.personas.effectiveFor(conversation, settings),
            modules: moduleStates.map((state) => state.module),
            assets: [...characterAssets, ...moduleAssets],
            moduleActivationSources: Object.fromEntries(
                moduleStates.map((state) => [state.module.id, state.activationSource]),
            ),
        }
    }
}

interface ChainNote {
    agentId: string
    agentName: string
    layerId: string
    layerName: string
    content: string
}

interface ChainExecutionContext {
    settingInfo: string
    globalNote: string
    longTermMemory: string
    recentChat: string
    currentUserInput: string
}

function chainAgentMessages(
    agent: ModelChainAgent,
    context: ChainExecutionContext,
    notes: ChainNote[],
    memory: string,
    response?: string,
): CompiledMessage[] {
    const outputInstruction =
        response === undefined
            ? '지시된 작업의 결과를 출력하세요. 결과는 연결된 다음 노드에 전달됩니다.'
            : agent.postMode === 'prepend'
              ? '현재 응답 앞에 붙일 텍스트만 출력하고 현재 응답은 반복하지 마세요.'
              : agent.postMode === 'append'
                ? '현재 응답 뒤에 붙일 텍스트만 출력하고 현재 응답은 반복하지 마세요.'
                : '사용자에게 보일 최종 응답 전체만 출력하세요. 분석이나 변경 설명은 쓰지 마세요.'
    const systemPrompt = [
        agent.systemPrompt || '당신은 연결된 모델 흐름에서 지시된 작업을 수행하는 에이전트입니다.',
        outputInstruction,
        agent.memoryEnabled
            ? [
                  '응답을 반드시 아래 두 태그로 나누세요.',
                  '[AGENT_NOTE]다음 노드에 전달할 이번 작업 결과[/AGENT_NOTE]',
                  '[MEMORY_UPDATE]다음 턴에 유지할 최신 기억 전체[/MEMORY_UPDATE]',
              ].join('\n')
            : '',
    ]
        .filter(Boolean)
        .join('\n\n')
    const sections = contextSections(agent, context, notes)
    if (response !== undefined) sections.push(`[현재 응답]\n${response}`)
    if (agent.memoryEnabled) {
        sections.push(`[에이전트 기억]\n${memory || '(저장된 기억 없음)'}`)
        if (agent.memoryInstruction) {
            sections.push(`[기억 갱신 지시]\n${agent.memoryInstruction}`)
        }
        if (agent.memoryFormat) sections.push(`[기억 포맷]\n${agent.memoryFormat}`)
    }
    return appendAgentInstruction(
        [
            { role: 'system', content: systemPrompt },
            {
                role: 'user',
                content: sections.join('\n\n') || '현재 요청에 대해 지시된 작업을 수행하세요.',
            },
        ],
        agent,
    )
}

function appendAgentInstruction(
    messages: CompiledMessage[],
    agent: ModelChainAgent,
): CompiledMessage[] {
    if (!agent.instruction.trim()) return messages
    return [
        ...messages,
        {
            role: agent.assistantPrefill ? 'assistant' : 'user',
            content: agent.instruction,
        },
    ]
}

function contextSections(
    agent: ModelChainAgent,
    context: ChainExecutionContext,
    notes: ChainNote[],
): string[] {
    return [
        agent.includeSettingInfo && context.settingInfo
            ? `[설정 정보]\n${context.settingInfo}`
            : '',
        agent.includeGlobalNote && context.globalNote ? `[글로벌 노트]\n${context.globalNote}` : '',
        agent.includeLongTermMemory && context.longTermMemory
            ? `[Hypa 장기기억]\n${context.longTermMemory}`
            : '',
        agent.includeRecentChat && context.recentChat ? `[최근 대화]\n${context.recentChat}` : '',
        agent.includeCurrentUserInput && context.currentUserInput
            ? `[현재 유저 입력]\n${context.currentUserInput}`
            : '',
        agent.includePreviousNotes && notes.length
            ? `[이전 연결 노드의 결과]\n${formatChainNotes(notes)}`
            : '',
    ].filter(Boolean)
}

function buildChainExecutionContext(
    context: ReturnType<GenerationService['context']>,
    messages: ReturnType<GenerationService['context']>['messages'],
    longTermMemory: string,
): ChainExecutionContext {
    const lore = selectLoreEntries(
        [
            ...(context.character.lorebook || []),
            ...context.modules.flatMap((module) => module.lorebook),
        ],
        messages,
        context.character.loreSettings,
    ).entries
    const currentUserIndex = messages.findLastIndex((message) => message.role === 'user')
    const recentMessages = messages
        .filter((_message, index) => index !== currentUserIndex)
        .slice(-10)
    return {
        settingInfo: [
            context.character.description ? `[캐릭터 설명]\n${context.character.description}` : '',
            context.character.personality ? `[캐릭터 성격]\n${context.character.personality}` : '',
            context.character.scenario ? `[시나리오]\n${context.character.scenario}` : '',
            context.persona.description
                ? `[페르소나: ${context.persona.name}]\n${context.persona.description}`
                : '',
            context.conversation.authorNote
                ? `[작가 노트]\n${context.conversation.authorNote}`
                : '',
            lore.length ? `[활성 로어북]\n${lore.map((entry) => entry.content).join('\n\n')}` : '',
        ]
            .filter(Boolean)
            .join('\n\n'),
        globalNote: context.character.postHistoryInstructions,
        longTermMemory,
        recentChat: serializeCompiledMessages(recentMessages),
        currentUserInput: currentUserIndex >= 0 ? messages[currentUserIndex]!.content : '',
    }
}

function parseAgentMemoryOutput(
    output: string,
    memoryEnabled: boolean,
): { note: string; memoryUpdate: string } {
    const text = output.trim()
    if (!memoryEnabled) return { note: text, memoryUpdate: '' }
    const note = taggedBlock(text, 'AGENT_NOTE')
    const memoryUpdate = taggedBlock(text, 'MEMORY_UPDATE')
    return { note: note || text, memoryUpdate }
}

function taggedBlock(text: string, tag: string): string {
    const match = text.match(new RegExp(`\\[${tag}\\]([\\s\\S]*?)\\[\\/${tag}\\]`, 'i'))
    return match?.[1]?.trim() ?? ''
}

function injectChainNotes(messages: CompiledMessage[], notes: ChainNote[]): CompiledMessage[] {
    if (!notes.length) return messages
    return [
        ...messages,
        {
            role: 'system',
            content: [
                '[이전 연결 노드의 결과]',
                formatChainNotes(notes),
                '위 메모를 참고하되 사용자에게 분석 과정은 노출하지 말고 최종 답변만 작성하세요.',
            ].join('\n\n'),
        },
    ]
}

function formatChainNotes(notes: ChainNote[]): string {
    return notes
        .map((note) => `[${note.layerName} · ${note.agentName}]\n${note.content}`)
        .join('\n\n')
}

function serializeCompiledMessages(messages: CompiledMessage[]): string {
    return messages
        .map((message) => `${message.role.toUpperCase()}:\n${message.content}`)
        .join('\n\n')
}

function applyPostMode(mode: ModelChainAgent['postMode'], current: string, output: string): string {
    const next = output.trim()
    if (!next) return current
    if (mode === 'prepend') return [next, current.trim()].filter(Boolean).join('\n\n')
    if (mode === 'append') return [current.trim(), next].filter(Boolean).join('\n\n')
    return next
}

function regexTemplateContext(context: ReturnType<GenerationService['context']>): TemplateContext {
    const toggleValues = Object.fromEntries(
        [...context.preset.toggles, ...context.modules.flatMap((module) => module.toggles)]
            .filter((toggle) => ['boolean', 'select', 'text', 'textarea'].includes(toggle.type))
            .map((toggle) => [
                toggle.key,
                context.settings.promptToggleValues[toggle.key] ?? toggle.defaultValue,
            ]),
    )
    const last = context.messages.at(-1)?.content || ''
    return {
        values: {
            user: context.persona.name,
            char: context.character.name,
            bot: context.character.name,
            persona: context.persona.description,
            description: context.character.description,
            personality: context.character.personality,
            scenario: context.character.scenario,
            exampledialogue: context.character.exampleMessage,
            examplemessage: context.character.exampleMessage,
            firstmessage: context.character.firstMessage,
            authornote: context.conversation.authorNote,
            globalnote: context.character.postHistoryInstructions,
            lastmessage: last,
            lastusermessage:
                [...context.messages].reverse().find((message) => message.role === 'user')
                    ?.content || '',
            lastcharmessage:
                [...context.messages].reverse().find((message) => message.role === 'assistant')
                    ?.content || '',
            lastmessageid: String(context.messages.length - 1),
        },
        variables: context.conversation.variables,
        globalVariables: {
            ...context.character.defaultVariables,
            ...context.preset.defaultVariables,
            ...context.settings.globalVariables,
            ...Object.fromEntries(
                Object.entries(toggleValues).map(([key, value]) => [`toggle_${key}`, value]),
            ),
        },
        toggles: Object.fromEntries(
            Object.entries(toggleValues).map(([key, value]) => [
                key,
                value === '1' || value.toLocaleLowerCase() === 'true',
            ]),
        ),
        messages: context.messages.map((message) => ({
            role: message.role,
            content: message.content,
            createdAt: message.createdAt,
        })),
        modelId: context.modelId,
        moduleNamespaces: context.modules.map((module) => module.namespace).filter(Boolean),
        assets: context.assets,
    }
}

function normalizeCompiledRole(role: string): 'system' | 'user' | 'assistant' {
    if (role === 'system' || role === 'sys') return 'system'
    if (role === 'user') return 'user'
    return 'assistant'
}

function replayGeneration(
    generationId: string,
    message: NonNullable<ReturnType<Store['conversations']['getMessage']>>,
) {
    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            controller.enqueue(
                encodeSse({ type: 'generation.started', generationId, messageId: message.id }),
            )
            controller.enqueue(encodeSse({ type: 'message.completed', generationId, message }))
            controller.close()
        },
    })
    return { generationId, stream }
}

function reconnectGeneration(store: Store, generationId: string, requestId: string) {
    let cancelled = false
    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            let started = false
            let lastContent = ''
            while (!cancelled) {
                const run = store.generations.getGeneration(generationId)
                if (!run) break
                if (run.messageId) {
                    const message = store.conversations.getMessage(run.messageId)
                    if (!started) {
                        controller.enqueue(
                            encodeSse({
                                type: 'generation.started',
                                generationId,
                                messageId: run.messageId,
                            }),
                        )
                        started = true
                    }
                    if (message && message.content !== lastContent && run.status === 'running') {
                        lastContent = message.content
                        controller.enqueue(
                            encodeSse({
                                type: 'message.snapshot',
                                generationId,
                                messageId: message.id,
                                content: message.content,
                            }),
                        )
                    }
                    if (run.status === 'complete' && message) {
                        controller.enqueue(
                            encodeSse({ type: 'message.completed', generationId, message }),
                        )
                        break
                    }
                    if (run.status === 'failed') {
                        controller.enqueue(
                            encodeSse({
                                type: 'generation.failed',
                                generationId,
                                messageId: message?.id,
                                error: {
                                    code: apiErrorCode(run.errorCode),
                                    message: run.errorMessage || 'Generation failed',
                                    requestId,
                                },
                            }),
                        )
                        break
                    }
                    if (run.status === 'cancelled') break
                }
                await Bun.sleep(200)
            }
            if (!cancelled) controller.close()
        },
        cancel() {
            cancelled = true
        },
    })
    return { generationId, stream }
}

function apiErrorCode(value: string | null): ApiError['code'] {
    const allowed: ApiError['code'][] = [
        'bad_request',
        'unauthorized',
        'forbidden',
        'not_found',
        'conflict',
        'validation_failed',
        'provider_auth',
        'provider_unreachable',
        'model_not_found',
        'rate_limited',
        'context_too_large',
        'safety_blocked',
        'cancelled',
        'invalid_provider_response',
        'internal_error',
    ]
    return allowed.includes(value as ApiError['code'])
        ? (value as ApiError['code'])
        : 'internal_error'
}

function logGeneration(
    log: Logger,
    generationId: string,
    provider: string,
    modelId: string,
    startedAt: number,
    status: string,
    errorCode?: string,
): void {
    log.info(
        {
            event: 'generation.completed',
            generationId,
            provider,
            modelId,
            status,
            durationMs: Math.round(performance.now() - startedAt),
            ...(errorCode ? { errorCode } : {}),
        },
        'Generation completed',
    )
}

function encodeSse(event: GenerationEvent): Uint8Array {
    return new TextEncoder().encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
}
