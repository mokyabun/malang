import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { AppConfig } from '../src/config'
import { type AppContext, createContext } from '../src/services'

describe('PocketRisu Lua runtime', () => {
    const directory = mkdtempSync(join(tmpdir(), 'malang-lua-'))
    const config: AppConfig = {
        nodeEnv: 'test',
        autoBackupEnabled: false,
        host: '127.0.0.1',
        dataDir: directory,
        databasePath: join(directory, 'data.sqlite'),
        adminPassword: 'correct horse battery staple',
        sessionSecret: 'lua-test-session-secret-with-enough-entropy',
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
    let conversationId: string

    beforeAll(async () => {
        context = await createContext(config)
        const character = context.characters.create({
            name: 'Lua fixture',
            description: '',
            personality: '',
            scenario: '',
            firstMessage: 'Start',
            alternateGreetings: [],
            exampleMessage: '',
            systemPrompt: '',
            postHistoryInstructions: '',
            creator: '',
            characterVersion: '',
            tags: [],
            lorebook: [],
            loreSettings: {},
            regexScripts: [],
            moduleReferences: [],
            defaultVariables: { fallback_value: 'character-default' },
            luaScript: {
                code: readFileSync(join(import.meta.dir, '../../example.lua'), 'utf8'),
                enabled: true,
                lowLevelAccess: true,
            },
        })
        conversationId = context.store.conversation.create({
            characterId: character.id,
            greetingIndex: -1,
        }).id
    })

    afterAll(() => {
        context.close()
        rmSync(directory, { recursive: true, force: true })
    })

    test('runs the complete example fixture and deduplicates a manual invocation', async () => {
        const key = crypto.randomUUID()
        const request = {
            type: 'manual' as const,
            name: 'initEroTrapDungeon',
            idempotencyKey: key,
            clientInstanceId: crypto.randomUUID(),
            sourceMessageId: null,
            triggerElementId: 'init',
        }
        await context.lua.trigger(conversationId, request)
        expect(context.store.conversation.get(conversationId)?.variables).toMatchObject({
            ero_Init: '0',
            ero_Language: '1',
            ero_startHP: '1000',
            ero_floor_max: '26',
        })
        await context.lua.trigger(conversationId, request)
        expect(
            context.store.sqlite
                .query<{ count: number }, [string, string]>(
                    'SELECT count(*) as count FROM lua_event_runs WHERE conversation_id = ? AND event_key = ?',
                )
                .get(conversationId, key)?.count,
        ).toBe(1)
    })

    test('supports named triggers, button data, and one display batch per epoch', async () => {
        const before = context.store.conversation.get(conversationId)?.variables.ero_choice_flag
        await context.lua.trigger(conversationId, {
            type: 'manual',
            name: 'setChoiceFlag',
            idempotencyKey: crypto.randomUUID(),
            clientInstanceId: crypto.randomUUID(),
            triggerElementId: 'choice',
        })
        expect(context.store.conversation.get(conversationId)?.variables.ero_choice_flag).not.toBe(
            before,
        )
        await context.lua.trigger(conversationId, {
            type: 'button',
            data: 'choice^Take the silver key',
            idempotencyKey: crypto.randomUUID(),
            clientInstanceId: crypto.randomUUID(),
            triggerElementId: 'button',
        })
        expect(context.store.message.list(conversationId).at(-1)).toMatchObject({
            role: 'user',
        })
        expect(context.store.message.list(conversationId).at(-1)?.content).toContain(
            'Take the silver key',
        )
        context.store.message.create(conversationId, 'assistant', 'Status', 'complete')
        const first = await context.generations.messagesWithDisplay(conversationId)
        const second = await context.generations.messagesWithDisplay(conversationId)
        expect(first.at(-1)?.displayContent).toContain('ERO STATUS')
        expect(second).toEqual(first)
        expect(
            context.store.sqlite
                .query<{ count: number }, [string]>(
                    'SELECT count(*) as count FROM lua_display_batches WHERE conversation_id = ?',
                )
                .get(conversationId)?.count,
        ).toBe(1)
    })

    test('round-trips a blocking alert only through the initiating tab', async () => {
        const clientInstanceId = crypto.randomUUID()
        const stream = context.lua.remote.subscribe(clientInstanceId)
        const reader = stream.getReader()
        await reader.read() // connection comment
        const invocation = context.lua.trigger(conversationId, {
            type: 'manual',
            name: 'setStartHP',
            idempotencyKey: crypto.randomUUID(),
            clientInstanceId,
            triggerElementId: 'hp',
        })
        const commandChunk = await reader.read()
        const commandText = new TextDecoder().decode(commandChunk.value)
        const command = JSON.parse(commandText.match(/data: (.+)\n\n/)![1]!) as {
            commandId: string
            kind: string
        }
        expect(command.kind).toBe('alertInput')
        expect(
            context.lua.remote.resolve(command.commandId, {
                clientInstanceId,
                result: '250',
            }),
        ).toBe('ok')
        // The success alert is fire-and-forget and does not block completion.
        await invocation
        expect(context.store.conversation.get(conversationId)?.variables.ero_startHP).toBe('250')
        await reader.cancel()
    })

    test('fails a blocking invocation when its initiating tab is unavailable', async () => {
        expect(
            context.lua.trigger(conversationId, {
                type: 'manual',
                name: 'setStartHP',
                idempotencyKey: crypto.randomUUID(),
                clientInstanceId: crypto.randomUUID(),
            }),
        ).rejects.toThrow(/initiating client/i)
    })

    test('commits pre-error callback changes but discards a timed-out invocation', async () => {
        const makeConversation = (code: string) => {
            const character = context.characters.create({
                name: 'Lua policy fixture',
                description: '',
                personality: '',
                scenario: '',
                firstMessage: '',
                alternateGreetings: [],
                exampleMessage: '',
                systemPrompt: '',
                postHistoryInstructions: '',
                creator: '',
                characterVersion: '',
                tags: [],
                lorebook: [],
                loreSettings: {},
                regexScripts: [],
                moduleReferences: [],
                defaultVariables: {},
                luaScript: { code, enabled: true, lowLevelAccess: false },
            })
            return context.store.conversation.create({
                characterId: character.id,
                greetingIndex: -1,
            }).id
        }
        const callbackConversation = makeConversation(`
            function partial(id)
                setChatVar(id, 'before_error', 'saved')
                error('expected callback failure')
            end
        `)
        const callback = await context.lua.trigger(callbackConversation, {
            type: 'manual',
            name: 'partial',
            idempotencyKey: crypto.randomUUID(),
            clientInstanceId: crypto.randomUUID(),
        })
        expect(callback.warnings.join('\n')).toContain('expected callback failure')
        expect(context.store.conversation.get(callbackConversation)?.variables.before_error).toBe(
            'saved',
        )

        const timeoutConversation = makeConversation(`
            function spin(id)
                setChatVar(id, 'must_not_commit', '1')
                while true do end
            end
        `)
        expect(
            context.lua.trigger(timeoutConversation, {
                type: 'manual',
                name: 'spin',
                idempotencyKey: crypto.randomUUID(),
                clientInstanceId: crypto.randomUUID(),
            }),
        ).rejects.toThrow(/timeout/i)
        expect(
            context.store.conversation.get(timeoutConversation)?.variables.must_not_commit,
        ).toBeUndefined()
    })
})
