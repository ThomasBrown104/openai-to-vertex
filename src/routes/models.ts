import type { FastifyPluginAsync } from 'fastify'
import type { ModelListResponse, ModelData } from '../types/openai.js'
import { getGenAIClient } from '../services/google-genai.js'

/**
 * Fallback static list — used only if the dynamic list API fails.
 */
const FALLBACK_MODELS: ModelData[] = [
    { id: 'gemini-3.1-pro-preview', object: 'model', created: 1712000000, owned_by: 'google' },
    { id: 'gemini-3-pro-image', object: 'model', created: 1712000000, owned_by: 'google' },
    { id: 'gemini-3-flash-preview', object: 'model', created: 1712000000, owned_by: 'google' },
    { id: 'gemini-2.5-pro', object: 'model', created: 1712000000, owned_by: 'google' },
    { id: 'gemini-2.5-flash', object: 'model', created: 1712000000, owned_by: 'google' },
    { id: 'gemini-2.0-flash', object: 'model', created: 1712000000, owned_by: 'google' },
    { id: 'gemini-2.0-flash-lite', object: 'model', created: 1712000000, owned_by: 'google' },
    { id: 'gemini-1.5-flash', object: 'model', created: 1712000000, owned_by: 'google' },
    { id: 'gemini-1.5-pro', object: 'model', created: 1712000000, owned_by: 'google' },
    { id: 'text-embedding-005', object: 'model', created: 1712000000, owned_by: 'google' },
    { id: 'text-embedding-004', object: 'model', created: 1712000000, owned_by: 'google' },
    { id: 'text-multilingual-embedding-002', object: 'model', created: 1712000000, owned_by: 'google' },
    { id: 'gemini-embedding-2-exp-11-2025', object: 'model', created: 1712000000, owned_by: 'google' }
]

const modelsRoute: FastifyPluginAsync = async app => {
    app.get('/', async () => {
        try {
            const ai = getGenAIClient(app)
            const pager = await ai.models.list({ config: { pageSize: 200 } })

            const data: ModelData[] = []
            for await (const model of pager) {
                // Extract short model ID from resource name
                // e.g. "projects/xxx/locations/global/publishers/google/models/gemini-2.5-pro"
                const id = model.name?.split('/').pop() ?? model.displayName ?? 'unknown'
                data.push({
                    id,
                    object: 'model',
                    created: 1712000000,
                    owned_by: 'google'
                })
            }

            // If API returned zero models, fall back to static list
            if (data.length === 0) {
                app.log.warn('Model list API returned 0 models, using fallback')
                return { object: 'list', data: FALLBACK_MODELS } satisfies ModelListResponse
            }

            return { object: 'list', data } satisfies ModelListResponse
        } catch (err: unknown) {
            app.log.warn({ err }, 'Failed to list models from API, using fallback')
            return { object: 'list', data: FALLBACK_MODELS } satisfies ModelListResponse
        }
    })
}

export default modelsRoute
