#!/usr/bin/env bun

const MAX_PORT = 65_535
const ports = process.argv.slice(2).map(parsePort)

if (ports.length === 0) {
    console.error('Usage: bun scripts/kill-port.js <port> [port...]')
    process.exit(1)
}

let failed = false

for (const port of new Set(ports)) {
    try {
        const killedPids =
            process.platform === 'win32' ? await killWindows(port) : await killUnix(port)

        if (killedPids.size === 0) {
            console.log(`Port ${port}: no listening process found`)
        } else {
            console.log(
                `Port ${port}: killed PID ${[...killedPids].sort((a, b) => a - b).join(', ')}`,
            )
        }
    } catch (error) {
        failed = true
        console.error(`Port ${port}: ${error instanceof Error ? error.message : String(error)}`)
    }
}

if (failed) process.exitCode = 1

function parsePort(value) {
    if (!/^\d+$/.test(value)) fail(`Invalid port: ${value}`)

    const port = Number(value)
    if (!Number.isSafeInteger(port) || port < 1 || port > MAX_PORT) {
        fail(`Port must be between 1 and ${MAX_PORT}: ${value}`)
    }

    return port
}

function fail(message) {
    console.error(message)
    console.error('Usage: bun scripts/kill-port.js <port> [port...]')
    process.exit(1)
}

async function killUnix(port) {
    const killedPids = new Set()

    for (let attempt = 0; attempt < 3; attempt++) {
        const pids = await findUnixPids(port)
        if (pids.length === 0) return killedPids

        const signal = attempt === 0 ? 'SIGTERM' : 'SIGKILL'
        for (const pid of pids) {
            if (pid === process.pid) continue

            try {
                process.kill(pid, signal)
                killedPids.add(pid)
            } catch (error) {
                if (error?.code !== 'ESRCH') throw error
            }
        }

        await Bun.sleep(250)
    }

    const remainingPids = await findUnixPids(port)
    if (remainingPids.length > 0) {
        throw new Error(`still in use by PID ${remainingPids.join(', ')}`)
    }

    return killedPids
}

async function findUnixPids(port) {
    const lsof = await run(['lsof', '-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'])
    if (!lsof.error) {
        if (lsof.exitCode === 0) return parsePids(lsof.stdout)
        if (lsof.exitCode === 1) return []
        throw new Error(commandError('lsof', lsof))
    }

    const fuser = await run(['fuser', '-n', 'tcp', String(port)])
    if (!fuser.error) {
        if (fuser.exitCode === 0) return parsePids(fuser.stdout)
        if (fuser.exitCode === 1) return []
        throw new Error(commandError('fuser', fuser))
    }

    throw new Error('cannot inspect ports because neither lsof nor fuser is installed')
}

async function killWindows(port) {
    const killedPids = new Set()

    for (let attempt = 0; attempt < 3; attempt++) {
        const pids = await findWindowsPids(port)
        if (pids.length === 0) return killedPids

        for (const pid of pids) {
            if (pid === process.pid) continue

            const result = await run(['taskkill', '/PID', String(pid), '/T', '/F'])
            if (result.error) throw new Error(`failed to start taskkill: ${result.error.message}`)

            if (result.exitCode !== 0) {
                const remainingPids = await findWindowsPids(port)
                if (remainingPids.includes(pid)) throw new Error(commandError('taskkill', result))
            }

            killedPids.add(pid)
        }

        await Bun.sleep(250)
    }

    const remainingPids = await findWindowsPids(port)
    if (remainingPids.length > 0) {
        throw new Error(`still in use by PID ${remainingPids.join(', ')}`)
    }

    return killedPids
}

async function findWindowsPids(port) {
    const result = await run(['netstat', '-ano', '-p', 'tcp'])
    if (result.error) throw new Error(`failed to start netstat: ${result.error.message}`)
    if (result.exitCode !== 0) throw new Error(commandError('netstat', result))

    const pids = result.stdout
        .split(/\r?\n/)
        .map((line) => line.trim().split(/\s+/))
        .filter((fields) => {
            if (fields.length < 4 || fields[0]?.toUpperCase() !== 'TCP') return false

            const localPort = addressPort(fields[1])
            const remotePort = addressPort(fields[2])
            const state = fields.at(-2)?.toUpperCase()
            return localPort === port && (state === 'LISTENING' || remotePort === 0)
        })
        .map((fields) => Number(fields.at(-1)))

    return uniquePids(pids)
}

function addressPort(address) {
    const match = address?.match(/:(\d+)$/)
    return match ? Number(match[1]) : undefined
}

function parsePids(output) {
    return uniquePids(output.match(/\d+/g)?.map(Number) ?? [])
}

function uniquePids(values) {
    return [...new Set(values.filter((pid) => Number.isSafeInteger(pid) && pid > 0))]
}

async function run(cmd) {
    try {
        const child = Bun.spawn({
            cmd,
            stdin: 'ignore',
            stdout: 'pipe',
            stderr: 'pipe',
            windowsHide: true,
        })
        const [stdout, stderr, exitCode] = await Promise.all([
            child.stdout.text(),
            child.stderr.text(),
            child.exited,
        ])

        return { exitCode, stdout: stdout.trim(), stderr: stderr.trim() }
    } catch (error) {
        return {
            error: error instanceof Error ? error : new Error(String(error)),
            exitCode: -1,
            stdout: '',
            stderr: '',
        }
    }
}

function commandError(command, result) {
    return `${command} exited with code ${result.exitCode}${result.stderr ? `: ${result.stderr}` : ''}`
}
