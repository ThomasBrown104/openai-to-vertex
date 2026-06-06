/// <reference path="./config/env.d.ts" />
import Fastify from 'fastify'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import { registerEnv } from './config/env.js'
import { authMiddleware } from './middlewares/auth.js'
import chatCompletionsRoute from './routes/chat-completions.js'
import embeddingsRoute from './routes/embeddings.js'
import modelsRoute from './routes/models.js'
import { sendOpenAIError, extractErrorMessage } from './utils/errors.js'

/**
 * Build and configure the Fastify application.
 * Factored out so it can be used by both the entry point and tests.
 */
export async function buildApp() {
    const app = Fastify({
        logger: {
            level: process.env.LOG_LEVEL ?? 'info'
        },
        requestIdHeader: 'x-request-id',
        genReqId: () => crypto.randomUUID()
    })

    // ── 1. Environment variables ────────────────────────────────────────────
    await registerEnv(app)

    // ── 2. CORS ─────────────────────────────────────────────────────────────
    await app.register(cors, {
        origin: '*',
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization']
    })

    // ── 3. Rate limiting ────────────────────────────────────────────────────
    await app.register(rateLimit, {
        max: app.config.RATE_LIMIT_MAX,
        timeWindow: app.config.RATE_LIMIT_TIME_WINDOW,
        ban: 0,
        keyGenerator: request => request.ip,
        errorResponseBuilder: (_request, context) => ({
            error: {
                message: `Rate limit exceeded. Retry after ${context.after}ms.`,
                type: 'rate_limit_error',
                param: null,
                code: 'rate_limit_exceeded'
            }
        })
    })

    // ── 4. Health check (no auth, no rate limit) ────────────────────────────
    app.get('/health', { config: { rateLimit: false } }, async () => ({ status: 'ok' }))

    // ── 5. API routes under /v1 ─────────────────────────────────────────────
    await app.register(
        async v1 => {
            // Auth hook only for /v1 routes
            v1.addHook('preHandler', authMiddleware)

            await v1.register(chatCompletionsRoute, { prefix: '/chat/completions' })
            await v1.register(embeddingsRoute, { prefix: '/embeddings' })
            await v1.register(modelsRoute, { prefix: '/models' })
        },
        { prefix: '/v1' }
    )

    // ── 6. Global error handler ─────────────────────────────────────────────
    app.setErrorHandler((err, _request, reply) => {
        const error = err as Error & { statusCode?: number }
        const statusCode = error.statusCode ?? 500
        const message = extractErrorMessage(err)

        // Use the Fastify logger for internal errors
        if (statusCode >= 500) {
            app.log.error({ err }, 'Internal server error')
        }

        sendOpenAIError(reply, statusCode, statusCode >= 500 ? 'server_error' : 'invalid_request_error', message)
    })

    return app
}
