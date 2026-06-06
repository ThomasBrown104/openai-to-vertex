import type { GenerateContentConfig, ContentListUnion } from '@google/genai'
import { FunctionCallingConfigMode } from '@google/genai'
import type { ChatCompletionRequest, EmbeddingRequest, ChatMessage } from '../types/openai.js'

// ─── Chat Completion Request Transform ───────────────────────────────────────

interface TransformedChatRequest {
    model: string
    contents: ContentListUnion
    config: GenerateContentConfig
}

/**
 * Convert an OpenAI chat completion request into Google GenAI parameters.
 *
 * Key mappings:
 *  - system messages → config.systemInstruction
 *  - user / assistant messages → contents[]
 *  - tool messages (function results) → functionResponse parts
 *  - assistant tool_calls → functionCall parts
 *  - temperature, max_tokens, top_p, stop → config fields
 *  - tools / tool_choice → config.tools / config.toolConfig
 */
export function transformChatRequest(body: ChatCompletionRequest): TransformedChatRequest {
    const systemParts: { text: string }[] = []
    const contents: { role: string; parts: unknown[] }[] = []

    for (const msg of body.messages) {
        if (msg.role === 'system') {
            // Accumulate all system messages into a single systemInstruction
            const text = extractTextContent(msg)
            if (text) systemParts.push({ text })
            continue
        }

        // Handle tool result messages → Google functionResponse
        if (msg.role === 'tool') {
            const functionName = msg.name ?? 'unknown'
            let responsePayload: unknown
            try {
                responsePayload = JSON.parse(msg.content ?? '{}')
            } catch {
                responsePayload = { result: msg.content ?? '' }
            }

            // Tool results are sent as 'user' role with functionResponse parts
            const functionResponsePart = {
                functionResponse: {
                    name: functionName,
                    response: responsePayload
                }
            }

            // Merge with previous user message or create new one
            const last = contents[contents.length - 1]
            if (last && last.role === 'user') {
                last.parts.push(functionResponsePart)
            } else {
                contents.push({ role: 'user', parts: [functionResponsePart] })
            }
            continue
        }

        // Handle assistant messages
        if (msg.role === 'assistant') {
            const parts: unknown[] = []

            // Add text content if present
            const text = extractTextContent(msg)
            if (text) {
                parts.push({ text })
            }

            // Add functionCall parts if tool_calls present
            if (msg.tool_calls && msg.tool_calls.length > 0) {
                for (const toolCall of msg.tool_calls) {
                    let args: unknown
                    try {
                        args = JSON.parse(toolCall.function.arguments)
                    } catch {
                        args = {}
                    }
                    parts.push({
                        functionCall: {
                            name: toolCall.function.name,
                            args
                        }
                    })
                }
            }

            if (parts.length === 0) continue

            // Assistant maps to 'model' role in Google
            const last = contents[contents.length - 1]
            if (last && last.role === 'model') {
                last.parts.push(...parts)
            } else {
                contents.push({ role: 'model', parts })
            }
            continue
        }

        // Handle user messages
        const text = extractTextContent(msg)
        if (!text) continue

        // Merge consecutive messages from the same role (Google requires alternating roles)
        const last = contents[contents.length - 1]
        if (last && last.role === 'user') {
            last.parts.push({ text })
        } else {
            contents.push({ role: 'user', parts: [{ text }] })
        }
    }

    const config: GenerateContentConfig = {}

    // System instruction
    if (systemParts.length > 0) {
        config.systemInstruction = { parts: systemParts }
    }

    // Generation parameters
    if (body.temperature != null) config.temperature = body.temperature
    if (body.top_p != null) config.topP = body.top_p
    if (body.max_tokens != null) config.maxOutputTokens = body.max_tokens
    if (body.max_completion_tokens != null) config.maxOutputTokens = body.max_completion_tokens
    if (body.stop != null) {
        config.stopSequences = Array.isArray(body.stop) ? body.stop : [body.stop]
    }
    if (body.n != null) config.candidateCount = body.n

    // Response format (JSON mode)
    if (body.response_format?.type === 'json_object') {
        config.responseMimeType = 'application/json'
    } else if (body.response_format?.type === 'json_schema' && body.response_format.json_schema) {
        config.responseMimeType = 'application/json'
        config.responseJsonSchema = body.response_format.json_schema
    }

    // Tool definitions
    if (body.tools && body.tools.length > 0) {
        config.tools = body.tools.map(tool => ({
            functionDeclarations: [
                {
                    name: tool.function.name,
                    description: tool.function.description ?? '',
                    parameters: tool.function.parameters
                        ? (sanitizeSchemaForVertex(tool.function.parameters) as Record<string, unknown>)
                        : undefined
                }
            ]
        }))
    }

    // Tool choice
    if (body.tool_choice != null) {
        if (body.tool_choice === 'none') {
            config.toolConfig = { functionCallingConfig: { mode: FunctionCallingConfigMode.NONE } }
        } else if (body.tool_choice === 'auto') {
            config.toolConfig = { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } }
        } else if (body.tool_choice === 'required') {
            config.toolConfig = { functionCallingConfig: { mode: FunctionCallingConfigMode.ANY } }
        } else if (typeof body.tool_choice === 'object' && body.tool_choice.function?.name) {
            config.toolConfig = {
                functionCallingConfig: {
                    mode: FunctionCallingConfigMode.ANY,
                    allowedFunctionNames: [body.tool_choice.function.name]
                }
            }
        }
    }

    return { model: body.model, contents, config }
}

// ─── Embedding Request Transform ─────────────────────────────────────────────

interface TransformedEmbedRequest {
    model: string
    contents: ContentListUnion
    config: { outputDimensionality?: number }
}

/**
 * Convert an OpenAI embedding request into Google GenAI parameters.
 */
export function transformEmbeddingRequest(body: EmbeddingRequest): TransformedEmbedRequest {
    const contents: ContentListUnion = typeof body.input === 'string' ? body.input : body.input

    const config: { outputDimensionality?: number } = {}
    if (body.dimensions != null) {
        config.outputDimensionality = body.dimensions
    }

    return { model: body.model, contents, config }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Sanitize a JSON Schema object for Google Vertex AI / Gemini.
 * Vertex AI does not support several JSON Schema keywords that OpenAI tools may include:
 *  - patternProperties
 *  - const
 *  - $ref / $defs / definitions  (internal references)
 *  - additionalProperties with complex schemas
 *  - unevaluatedProperties
 *  - if / then / else (conditional schemas)
 *  - dependentSchemas / dependentRequired
 *  - propertyNames
 *  - minProperties / maxProperties (on object schemas)
 *
 * We recursively walk the schema and strip unsupported keys so the API accepts it.
 */
function sanitizeSchemaForVertex(schema: unknown): unknown {
    if (schema == null || typeof schema !== 'object') return schema

    if (Array.isArray(schema)) return schema.map(sanitizeSchemaForVertex)

    const input = schema as Record<string, unknown>
    const output: Record<string, unknown> = {}

    // Keys to skip entirely (not supported by Vertex AI)
    const SKIP_KEYS = new Set([
        'patternProperties',
        'const',
        '$ref',
        '$defs',
        'definitions',
        'unevaluatedProperties',
        'if',
        'then',
        'else',
        'dependentSchemas',
        'dependentRequired',
        'propertyNames'
    ])

    for (const [key, value] of Object.entries(input)) {
        if (SKIP_KEYS.has(key)) continue

        // Recurse into nested schemas
        if (key === 'properties' && typeof value === 'object' && value !== null) {
            const sanitized: Record<string, unknown> = {}
            for (const [propKey, propVal] of Object.entries(value as Record<string, unknown>)) {
                sanitized[propKey] = sanitizeSchemaForVertex(propVal)
            }
            output[key] = sanitized
        } else if (key === 'items' || key === 'additionalProperties') {
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                // Only keep additionalProperties if it's a simple boolean or a simple schema
                output[key] = sanitizeSchemaForVertex(value)
            } else {
                output[key] = value
            }
        } else if (key === 'anyOf' || key === 'oneOf' || key === 'allOf') {
            if (Array.isArray(value)) {
                output[key] = value.map(sanitizeSchemaForVertex)
            }
        } else if (key === 'not') {
            output[key] = sanitizeSchemaForVertex(value)
        } else {
            output[key] = sanitizeSchemaDeep(value)
        }
    }

    return output
}

function sanitizeSchemaDeep(value: unknown): unknown {
    if (value == null || typeof value !== 'object') return value
    if (Array.isArray(value)) return value.map(sanitizeSchemaDeep)
    // For plain objects, recurse
    const obj = value as Record<string, unknown>
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj)) {
        result[k] = sanitizeSchemaForVertex(v)
    }
    return result
}

function extractTextContent(msg: ChatMessage): string {
    if (typeof msg.content === 'string') return msg.content
    if (Array.isArray(msg.content)) {
        return msg.content
            .filter(p => p.type === 'text' && p.text)
            .map(p => p.text!)
            .join('\n')
    }
    return ''
}
