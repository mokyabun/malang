import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { GENERAL_CHAT_CHARACTER_ID, type ModelChainAgent } from '@malang/shared'

import type { AppConfig } from '../src/config'
import { type AppContext, createContext } from '../src/services'

describe('server-side model chains', () => {
    const directory = mkdtempSync(join(tmpdir(), 'malang-model-chains-'))
    const config: AppConfig = {
        nodeEnv: 'test',
        host: '127.0.0.1',
        dataDir: directory,
        databasePath: join(directory, 'data.sqlite'),
        adminPassword: 'correct horse battery staple',
        sessionSecret: 'model-chain-test-secret-with-enough-entropy',
        allowedOrigins: new Set(),
        cookieSecure: false,
        port: 3000,
        logLevel: 'silent',
        logPretty: false,
        logColorize: false,
        limits: {
            importBytes: 128 << 20,
            jsonBytes: 8 << 20,
            assetBytes: 32 << 20,
            archiveEntries: 4096,
        },
    }
    let context: AppContext

    beforeAll(async () => {
        context = await createContext(config)
    })

    afterAll(() => {
        context.close()
        rmSync(directory, { recursive: true, force: true })
    })

    test('keeps single-model generation as the default and runs selected chains on the server', async () => {
        const createEcho = (name: string, message: string) =>
            context.store.providers.createModelPreset({
                name,
                apiKeyId: null,
                config: {
                    provider: 'echo',
                    modelId: name.toLocaleLowerCase().replaceAll(' ', '-'),
                    defaults: {},
                    providerOptions: { message },
                },
            })
        const main = createEcho('Main', 'MAIN BODY')
        const analyst = createEcho('Analyst', 'PRE NOTE')
        const editor = createEcho('Editor', 'POST BODY')

        const single = context.store.conversations.createConversation({
            characterId: GENERAL_CHAT_CHARACTER_ID,
            modelPresetId: main.id,
            greetingIndex: -1,
        })
        expect(single.modelChainPresetId).toBeNull()
        await runGeneration(context, single.id, 'single request')
        expect(context.store.conversations.getLastAssistantMessage(single.id)?.content).toBe(
            'MAIN BODY',
        )

        const chain = context.store.modelChains.create({
            name: 'Review chain',
            description: 'Pre and post',
            layers: [
                {
                    id: crypto.randomUUID(),
                    name: 'Analysis',
                    phase: 'pre',
                    agents: [chainAgent('Analyze', analyst.id)],
                },
                {
                    id: crypto.randomUUID(),
                    name: 'Polish',
                    phase: 'post',
                    agents: [chainAgent('Edit', editor.id)],
                },
            ],
        })
        const chained = context.store.conversations.createConversation({
            characterId: GENERAL_CHAT_CHARACTER_ID,
            modelPresetId: main.id,
            modelChainPresetId: chain.id,
            greetingIndex: -1,
        })
        context.store.generations.clearRequestDebugRecords()
        context.store.settings.updateSettings({ requestDebugEnabled: true })
        await runGeneration(context, chained.id, 'chained request')
        context.store.settings.updateSettings({ requestDebugEnabled: false })
        const message = context.store.conversations.getLastAssistantMessage(chained.id)
        expect(message?.content).toBe('POST BODY')
        expect(context.store.generations.listMessageGenerations(message!.id)[0]).toMatchObject({
            outputText: 'POST BODY',
            processedOutputText: 'POST BODY',
        })
        expect(context.store.modelChains.delete(chain.id)).toBe('in_use')
        expect(context.store.providers.deleteModelPreset(analyst.id)).toBe('in_use')

        const debugRecords = context.store.generations
            .listRequestDebugRecords()
            .filter((record) => record.conversationId === chained.id)
        expect(debugRecords).toHaveLength(3)
        expect(debugRecords.find((record) => !record.request.chain)).toMatchObject({
            modelId: main.config.modelId,
        })
        expect(debugRecords.find((record) => record.request.chain?.phase === 'pre')).toMatchObject({
            modelId: analyst.config.modelId,
            request: {
                chain: {
                    presetId: chain.id,
                    presetName: 'Review chain',
                    phase: 'pre',
                    layerName: 'Analysis',
                    agentName: 'Analyze',
                },
            },
        })
        expect(debugRecords.find((record) => record.request.chain?.phase === 'post')).toMatchObject(
            {
                modelId: editor.config.modelId,
                request: {
                    chain: {
                        phase: 'post',
                        layerName: 'Polish',
                        agentName: 'Edit',
                    },
                },
            },
        )
    })

    test('runs multiple pre and post agents concurrently and applies post results in order', async () => {
        const createEcho = (name: string, message: string, delayMs = 0) =>
            context.store.providers.createModelPreset({
                name,
                apiKeyId: null,
                config: {
                    provider: 'echo',
                    modelId: name.toLocaleLowerCase().replaceAll(' ', '-'),
                    defaults: {},
                    providerOptions: { message, delayMs },
                },
            })
        const main = createEcho('Parallel Main', 'MAIN')
        const preA = createEcho('Parallel Pre A', 'PRE A', 160)
        const preB = createEcho('Parallel Pre B', 'PRE B', 160)
        const postA = createEcho('Parallel Post A', 'POST A', 160)
        const postB = createEcho('Parallel Post B', 'POST B', 160)
        const chain = context.store.modelChains.create({
            name: 'Parallel review chain',
            description: 'Multiple concurrent agents',
            layers: [
                {
                    id: crypto.randomUUID(),
                    name: 'Parallel analysis',
                    phase: 'pre',
                    agents: [chainAgent('Pre A', preA.id), chainAgent('Pre B', preB.id)],
                },
                {
                    id: crypto.randomUUID(),
                    name: 'Parallel polish',
                    phase: 'post',
                    agents: [
                        chainAgent('Post A', postA.id, { postMode: 'append' }),
                        chainAgent('Post B', postB.id, { postMode: 'append' }),
                    ],
                },
            ],
        })
        const conversation = context.store.conversations.createConversation({
            characterId: GENERAL_CHAT_CHARACTER_ID,
            modelPresetId: main.id,
            modelChainPresetId: chain.id,
            greetingIndex: -1,
        })

        const startedAt = performance.now()
        await runGeneration(context, conversation.id, 'parallel request')
        const elapsedMs = performance.now() - startedAt

        expect(context.store.conversations.getLastAssistantMessage(conversation.id)?.content).toBe(
            'MAIN\n\nPOST A\n\nPOST B',
        )
        expect(elapsedMs).toBeLessThan(520)
    })

    test('persists tagged pre-agent memory per conversation', async () => {
        const createEcho = (name: string, message: string) =>
            context.store.providers.createModelPreset({
                name,
                apiKeyId: null,
                config: {
                    provider: 'echo',
                    modelId: name.toLocaleLowerCase().replaceAll(' ', '-'),
                    defaults: {},
                    providerOptions: { message },
                },
            })
        const main = createEcho('Memory Main', 'MAIN')
        const memoryModel = createEcho(
            'Memory Agent',
            '[AGENT_NOTE]remember this[/AGENT_NOTE][MEMORY_UPDATE]persistent state[/MEMORY_UPDATE]',
        )
        const agent = chainAgent('Memory keeper', memoryModel.id, {
            memoryEnabled: true,
            memoryInstruction: 'Keep durable facts.',
            memoryFormat: '- fact',
        })
        const chain = context.store.modelChains.create({
            name: 'Memory chain',
            description: 'Persistent agent memory',
            layers: [
                {
                    id: crypto.randomUUID(),
                    name: 'Memory layer',
                    phase: 'pre',
                    agents: [agent],
                },
            ],
        })
        const conversation = context.store.conversations.createConversation({
            characterId: GENERAL_CHAT_CHARACTER_ID,
            modelPresetId: main.id,
            modelChainPresetId: chain.id,
            greetingIndex: -1,
        })

        await runGeneration(context, conversation.id, 'remember')

        expect(context.store.modelChains.getAgentMemory(conversation.id, agent.id)).toBe(
            'persistent state',
        )
    })
})

function chainAgent(
    name: string,
    modelPresetId: string,
    overrides: Partial<ModelChainAgent> = {},
): ModelChainAgent {
    return {
        id: crypto.randomUUID(),
        name,
        modelPresetId,
        systemPrompt: '',
        instruction: '',
        enabled: true,
        postMode: 'replace',
        assistantPrefill: false,
        includeSettingInfo: true,
        includeGlobalNote: false,
        includeLongTermMemory: true,
        includeRecentChat: true,
        includeCurrentUserInput: true,
        includePreviousNotes: true,
        memoryEnabled: false,
        memoryInstruction: '',
        memoryFormat: '',
        ...overrides,
    }
}

async function runGeneration(context: AppContext, conversationId: string, content: string) {
    const result = await context.generations.start(
        conversationId,
        {
            mode: 'reply',
            content,
            idempotencyKey: crypto.randomUUID(),
            clientInstanceId: crypto.randomUUID(),
        },
        crypto.randomUUID(),
    )
    await new Response(result.stream).text()
}
