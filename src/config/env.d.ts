import 'fastify'

declare module 'fastify' {
    interface FastifyInstance {
        config: {
            PORT: string
            HOST: string
            GOOGLE_PROJECT_ID: string
            GOOGLE_LOCATION: string
            GOOGLE_API_VERSION: string
            GOOGLE_SERVICE_ACCOUNT_KEY_PATH: string
            GOOGLE_SERVICE_ACCOUNT_KEY_JSON: string
            API_KEY: string
            RATE_LIMIT_MAX: number
            RATE_LIMIT_TIME_WINDOW: number
            LOG_LEVEL: string
        }
    }
}
