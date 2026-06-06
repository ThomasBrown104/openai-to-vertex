/// <reference path="./config/env.d.ts" />
import { buildApp } from './app.js'

async function main() {
    const app = await buildApp()

    const port = Number(app.config.PORT) || 3000
    const host = app.config.HOST || '0.0.0.0'

    try {
        await app.listen({ port, host })
        app.log.info(`Server listening on ${host}:${port}`)
        app.log.info('Endpoints:')
        app.log.info('  POST /v1/chat/completions')
        app.log.info('  POST /v1/embeddings')
        app.log.info('  GET  /v1/models')
        app.log.info('  GET  /health')
    } catch (err) {
        app.log.error(err, 'Failed to start server')
        process.exit(1)
    }
}

main()
