import type { FastifyReply } from 'fastify'
import type { OpenAIErrorResponse } from '../types/openai.js'

/**
 * Create an OpenAI-compatible error response and send it.
 */
export function sendOpenAIError(
    reply: FastifyReply,
    statusCode: number,
    type: string,
    message: string,
    code: string | null = null,
    param: string | null = null
): void {
    const body: OpenAIErrorResponse = {
        error: {
            message,
            type,
            param,
            code
        }
    }
    reply.code(statusCode).send(body)
}

/**
 * Map common Google API error codes to HTTP status codes.
 */
export function mapGoogleErrorToStatus(err: unknown): number {
    if (err && typeof err === 'object' && 'status' in err) {
        const status = (err as { status: unknown }).status
        if (typeof status === 'number') return status
        if (status === 'INVALID_ARGUMENT') return 400
        if (status === 'UNAUTHENTICATED') return 401
        if (status === 'PERMISSION_DENIED') return 403
        if (status === 'NOT_FOUND') return 404
        if (status === 'RESOURCE_EXHAUSTED') return 429
        if (status === 'INTERNAL') return 500
        if (status === 'UNAVAILABLE') return 503
    }
    return 500
}

/**
 * Extract a human-readable error message from an unknown error.
 */
export function extractErrorMessage(err: unknown): string {
    if (err instanceof Error) return err.message
    if (typeof err === 'string') return err
    if (err && typeof err === 'object' && 'message' in err) {
        return String((err as { message: unknown }).message)
    }
    return 'An unexpected error occurred'
}
