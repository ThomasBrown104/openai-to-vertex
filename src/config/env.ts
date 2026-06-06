import type { FastifyInstance } from 'fastify'
import fastifyEnv from '@fastify/env'

const schema = {
    type: 'object' as const,
    required: ['GOOGLE_PROJECT_ID'],
    properties: {
        PORT: { type: 'string', default: '3000' },
        HOST: { type: 'string', default: '0.0.0.0' },
        GOOGLE_PROJECT_ID: { type: 'string' },
        GOOGLE_LOCATION: { type: 'string', default: 'us-central1' },
        GOOGLE_API_VERSION: { type: 'string', default: 'v1beta1' },
        GOOGLE_SERVICE_ACCOUNT_KEY_PATH: { type: 'string', default: '' },
        GOOGLE_SERVICE_ACCOUNT_KEY_JSON: { type: 'string', default: '' },
        API_KEY: { type: 'string', default: '' },
        RATE_LIMIT_MAX: { type: 'integer', default: 100 },
        RATE_LIMIT_TIME_WINDOW: { type: 'integer', default: 60000 },
        LOG_LEVEL: { type: 'string', default: 'info' }
    }
}

export async function registerEnv(app: FastifyInstance): Promise<void> {
    await app.register(fastifyEnv, {
        confKey: 'config',
        schema,
        dotenv: true
    })
}
