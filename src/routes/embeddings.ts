import type { FastifyPluginAsync } from 'fastify'
import { transformEmbeddingRequest } from '../transformers/request.js'
import { transformEmbeddingResponse } from '../transformers/response.js'
import { embedContent } from '../services/google-genai.js'
import { sendOpenAIError, mapGoogleErrorToStatus, extractErrorMessage } from '../utils/errors.js'
import type { EmbeddingRequest } from '../types/openai.js'

const embeddingsRoute: FastifyPluginAsync = async app => {
    app.post<{ Body: EmbeddingRequest }>('/', async (request, reply) => {
        const body = request.body

        // Validate required fields
        if (!body.model) {
            sendOpenAIError(reply, 400, 'invalid_request_error', 'model is required', 'invalid_request')
            return
        }
        if (body.input == null || (typeof body.input === 'string' && body.input.length === 0)) {
            sendOpenAIError(reply, 400, 'invalid_request_error', 'input is required', 'invalid_request')
            return
        }

        try {
            const { model, contents, config } = transformEmbeddingRequest(body)
            const response = await embedContent(app, model, contents, config)
            const openaiResponse = transformEmbeddingResponse(response, model)
            return openaiResponse
        } catch (err: unknown) {
            const status = mapGoogleErrorToStatus(err)
            const message = extractErrorMessage(err)
            sendOpenAIError(reply, status, 'server_error', message, 'server_error')
            return
        }
    })
}

export default embeddingsRoute
