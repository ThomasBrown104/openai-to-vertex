/// <reference path="../config/env.d.ts" />
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { sendOpenAIError } from '../utils/errors.js'

/**
 * Authentication preHandler hook.
 *
 * - If API_KEY is configured in the environment, the client MUST send
 *   `Authorization: Bearer <API_KEY>`.  Otherwise 401 is returned.
 * - If API_KEY is empty / not set, the hook is a no-op (open access).
 */
export async function authMiddleware(
    this: FastifyInstance,
    request: FastifyRequest,
    reply: FastifyReply
): Promise<void> {
    const apiKey = this.config.API_KEY
    if (!apiKey) return // no key configured → open access

    const authHeader = request.headers.authorization
    if (!authHeader) {
        sendOpenAIError(reply, 401, 'authentication_error', 'Missing Authorization header', 'invalid_api_key')
        return
    }

    const parts = authHeader.split(' ')
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
        sendOpenAIError(
            reply,
            401,
            'authentication_error',
            'Invalid Authorization format. Expected: Bearer <key>',
            'invalid_api_key'
        )
        return
    }

    if (parts[1] !== apiKey) {
        sendOpenAIError(reply, 401, 'authentication_error', 'Invalid API key', 'invalid_api_key')
        return
    }
}
