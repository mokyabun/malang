import { createApp } from './app'
import { createContext } from './services'

const context = await createContext()
const app = createApp(context)
const log = context.logger.child({ module: 'server' })

log.info(
    {
        event: 'server.started',
        hostname: context.config.host,
        port: context.config.port,
        environment: context.config.nodeEnv,
        logLevel: context.config.logLevel,
    },
    'Server started',
)

const shutdown = () => {
    context.close()
    process.exit(0)
}
process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)

export default {
    hostname: context.config.host,
    port: context.config.port,
    fetch: app.fetch,
}
