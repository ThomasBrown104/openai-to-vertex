/// <reference path="../config/env.d.ts" />
import { GoogleGenAI } from '@google/genai'
import type { GenerateContentConfig, ContentListUnion } from '@google/genai'
import { readFileSync } from 'node:fs'
import type { FastifyInstance } from 'fastify'

let client: GoogleGenAI | null = null

/**
 * Initialize and return the singleton GoogleGenAI client.
 *
 * Auth priority:
 *  1. GOOGLE_SERVICE_ACCOUNT_KEY_JSON (env var, parsed inline)
 *  2. GOOGLE_SERVICE_ACCOUNT_KEY_PATH  (file path, read from disk)
 *  3. Application Default Credentials (ADC) — no explicit creds
 */
export function getGenAIClient(app: FastifyInstance): GoogleGenAI {
    if (client) return client

    const {
        GOOGLE_PROJECT_ID,
        GOOGLE_LOCATION,
        GOOGLE_API_VERSION,
        GOOGLE_SERVICE_ACCOUNT_KEY_JSON,
        GOOGLE_SERVICE_ACCOUNT_KEY_PATH
    } = app.config

    let credentials: { client_email: string; private_key: string } | undefined

    if (GOOGLE_SERVICE_ACCOUNT_KEY_JSON) {
        // Priority 1: JSON content from env var
        const parsed = JSON.parse(GOOGLE_SERVICE_ACCOUNT_KEY_JSON)
        credentials = {
            client_email: parsed.client_email,
            private_key: parsed.private_key
        }
        app.log.info('Using Google credentials from GOOGLE_SERVICE_ACCOUNT_KEY_JSON')
    } else if (GOOGLE_SERVICE_ACCOUNT_KEY_PATH) {
        // Priority 2: Service account file
        const raw = readFileSync(GOOGLE_SERVICE_ACCOUNT_KEY_PATH, 'utf-8')
        const parsed = JSON.parse(raw)
        credentials = {
            client_email: parsed.client_email,
            private_key: parsed.private_key
        }
        app.log.info('Using Google credentials from file: %s', GOOGLE_SERVICE_ACCOUNT_KEY_PATH)
    } else {
        // Priority 3: ADC
        app.log.info('No explicit credentials — falling back to Application Default Credentials')
    }

    client = new GoogleGenAI({
        vertexai: true,
        project: GOOGLE_PROJECT_ID,
        location: GOOGLE_LOCATION || 'us-central1',
        apiVersion: GOOGLE_API_VERSION || 'v1beta1',
        ...(credentials ? { googleAuthOptions: { credentials } } : {})
    })

    return client
}

// ─── Typed wrappers ──────────────────────────────────────────────────────────

/**
 * Non-streaming text generation.
 */
export async function generateContent(
    app: FastifyInstance,
    model: string,
    contents: ContentListUnion,
    config?: GenerateContentConfig
) {
    const ai = getGenAIClient(app)
    return ai.models.generateContent({ model, contents, config })
}

/**
 * Streaming text generation — returns an async iterable of chunks.
 */
export async function generateContentStream(
    app: FastifyInstance,
    model: string,
    contents: ContentListUnion,
    config?: GenerateContentConfig
) {
    const ai = getGenAIClient(app)
    return ai.models.generateContentStream({ model, contents, config })
}

/**
 * Generate embeddings for one or more texts.
 */
export async function embedContent(
    app: FastifyInstance,
    model: string,
    contents: ContentListUnion,
    config?: { outputDimensionality?: number; taskType?: string }
) {
    const ai = getGenAIClient(app)
    return ai.models.embedContent({ model, contents, config })
}
