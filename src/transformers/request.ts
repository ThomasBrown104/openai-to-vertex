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
 *  - temperature, max_tokens, top_p, stop → config fields
 *  - tools / tool_choice → config.tools / config.toolConfig
 */
export function transformChatRequest(body: ChatCompletionRequest): TransformedChatRequest {
    const systemParts: { text: string }[] = []
    const contents: { role: string; parts: { text: string }[] }[] = []

    for (const msg of body.messages) {
        if (msg.role === 'system') {
            // Accumulate all system messages into a single systemInstruction
            const text = extractTextContent(msg)
            if (text) systemParts.push({ text })
            continue
        }

        const role = msg.role === 'assistant' ? 'model' : 'user'
        const text = extractTextContent(msg)
        if (!text) continue

        // Merge consecutive messages from the same role (Google requires alternating roles)
        const last = contents[contents.length - 1]
        if (last && last.role === role) {
            last.parts.push({ text })
        } else {
            contents.push({ role, parts: [{ text }] })
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
