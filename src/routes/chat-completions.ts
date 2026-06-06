import type { FastifyPluginAsync } from 'fastify'
import { randomUUID } from 'node:crypto'
import { transformChatRequest } from '../transformers/request.js'
import { transformChatResponse, transformStreamChunk } from '../transformers/response.js'
import { generateContent, generateContentStream } from '../services/google-genai.js'
import { sendOpenAIError, mapGoogleErrorToStatus, extractErrorMessage } from '../utils/errors.js'
import type { ChatCompletionRequest } from '../types/openai.js'

const chatCompletionsRoute: FastifyPluginAsync = async app => {
    app.post<{ Body: ChatCompletionRequest }>('/', async (request, reply) => {
        const body = request.body

        // Validate required fields
        if (!body.model) {
            sendOpenAIError(reply, 400, 'invalid_request_error', 'model is required', 'invalid_request')
            return
        }
        if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
            sendOpenAIError(
                reply,
                400,
                'invalid_request_error',
                'messages must be a non-empty array',
                'invalid_request'
            )
            return
        }

        const { model, contents, config } = transformChatRequest(body)

        try {
            if (body.stream) {
                // ── Streaming response ──────────────────────────────────────────────
                reply.raw.writeHead(200, {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    Connection: 'keep-alive',
                    'X-Request-Id': request.id
                })

                const streamId = `chatcmpl-${randomUUID().replace(/-/g, '').slice(0, 24)}`
                const stream = await generateContentStream(app, model, contents, config)

                for await (const chunk of stream) {
                    const sseChunk = transformStreamChunk(chunk, model, streamId)
                    reply.raw.write(`data: ${JSON.stringify(sseChunk)}\n\n`)
                }

                reply.raw.write('data: [DONE]\n\n')
                reply.raw.end()
                // Return reply to signal Fastify we've handled the response ourselves
                return reply
            }

            // ── Non-streaming response ────────────────────────────────────────────
            const response = await generateContent(app, model, contents, config)
            const openaiResponse = transformChatResponse(response, model)
            return openaiResponse
        } catch (err: unknown) {
            const status = mapGoogleErrorToStatus(err)
            const message = extractErrorMessage(err)

            if (body.stream && !reply.sent) {
                // If streaming has started, write the error as a final SSE event
                reply.raw.write(`data: ${JSON.stringify({ error: { message, type: 'server_error' } })}\n\n`)
                reply.raw.write('data: [DONE]\n\n')
                reply.raw.end()
                return reply
            }

            sendOpenAIError(reply, status, 'server_error', message, 'server_error')
            return
        }
    })
}

export default chatCompletionsRoute
