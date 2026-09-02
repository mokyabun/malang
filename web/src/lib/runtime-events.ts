import { api, API_BASE, getClientInstanceId } from './api'

interface RuntimeCommand {
    type: 'runtime.command'
    commandId: string
    kind: string
    payload: Record<string, unknown>
    blocking: boolean
}

const handled = new Set<string>()
const commandResults = new Map<string, { result: unknown; error?: string }>()

export function connectRuntimeEvents(onReload: () => void | Promise<void>) {
    const clientInstanceId = getClientInstanceId()
    const source = new EventSource(
        `${API_BASE}/runtime/events?clientInstanceId=${encodeURIComponent(clientInstanceId)}`,
        { withCredentials: true },
    )
    source.onmessage = (event) => {
        const command = JSON.parse(event.data) as RuntimeCommand
        if (handled.has(command.commandId)) {
            const saved = commandResults.get(command.commandId)
            if (saved)
                void api.resolveRuntimeCommand(command.commandId, {
                    clientInstanceId,
                    ...saved,
                })
            return
        }
        handled.add(command.commandId)
        if (handled.size > 1_000) {
            const oldest = handled.values().next().value!
            handled.delete(oldest)
            commandResults.delete(oldest)
        }
        void handleCommand(command, clientInstanceId, onReload)
    }
    return () => source.close()
}

async function handleCommand(
    command: RuntimeCommand,
    clientInstanceId: string,
    onReload: () => void | Promise<void>,
) {
    let saved: { result: unknown; error?: string }
    try {
        let result: unknown = null
        const rawMessage = command.payload.message
        const message =
            typeof rawMessage === 'string'
                ? rawMessage
                : rawMessage === undefined
                  ? ''
                  : JSON.stringify(rawMessage)
        if (command.kind === 'alertNormal' || command.kind === 'alertError') {
            window.alert(message)
        } else if (command.kind === 'alertInput') {
            result = window.prompt(message) ?? ''
        } else if (command.kind === 'alertConfirm') {
            result = window.confirm(message)
        } else if (command.kind === 'alertSelect') {
            const options = Array.isArray(command.payload.options)
                ? command.payload.options.map(String)
                : []
            const selected = window.prompt(
                options.map((option, index) => `${index + 1}. ${option}`).join('\n'),
            )
            const index = Number(selected) - 1
            result = Number.isInteger(index) && options[index] !== undefined ? options[index] : ''
        } else if (command.kind === 'reloadChat') {
            await onReload()
        }
        saved = { result }
    } catch (error) {
        saved = {
            result: null,
            error: error instanceof Error ? error.message : String(error),
        }
    }
    commandResults.set(command.commandId, saved)
    await api
        .resolveRuntimeCommand(command.commandId, { clientInstanceId, ...saved })
        .catch(() => undefined)
}
