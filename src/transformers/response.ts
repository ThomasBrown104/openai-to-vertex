import type { GenerateContentResponse, EmbedContentResponse } from '@google/genai'
import { randomUUID } from 'node:crypto'
import type {
    ChatCompletionResponse,
    ChatCompletionChunk,
    ChatChoice,
    ChatChunkChoice,
    EmbeddingResponse,
    EmbeddingData,
    Usage
} from '../types/openai.js'

// ─── Chat Completion Response (non-streaming) ────────────────────────────────

/**
 * Convert a Google GenAI GenerateContentResponse to an OpenAI ChatCompletionResponse.
 */
export function transformChatResponse(response: GenerateContentResponse, model: string): ChatCompletionResponse {
    const candidate = response.candidates?.[0]
    const textContent = candidate?.content?.parts?.map(p => p.text ?? '').join('') ?? ''
    const finishReason = mapFinishReason(candidate?.finishReason ?? '')

    const choice: ChatChoice = {
        index: 0,
        message: {
            role: 'assistant',
            content: textContent
        },
        finish_reason: finishReason
    }

    // Map function calls if present
    const functionCalls = candidate?.content?.parts?.filter(p => p.functionCall)
    if (functionCalls && functionCalls.length > 0) {
        choice.message.tool_calls = functionCalls.map((part, i) => ({
            id: `call_${randomUUID().replace(/-/g, '').slice(0, 24)}`,
            type: 'function' as const,
            function: {
                name: part.functionCall!.name ?? '',
                arguments: JSON.stringify(part.functionCall!.args ?? {})
            }
        }))
        // If there are function calls, the content is typically null
        if (choice.message.tool_calls.length > 0 && !textContent) {
            choice.message.content = null
        }
        // Override finish_reason to 'tool_calls' when function calls are present
        // This is critical - OpenAI clients expect this to know the model wants tool results
        choice.finish_reason = 'tool_calls'
    }

    return {
        id: `chatcmpl-${randomUUID().replace(/-/g, '').slice(0, 24)}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [choice],
        usage: mapUsage(response)
    }
}

// ─── Chat Completion Chunk (streaming) ───────────────────────────────────────

/**
 * Convert a single streaming chunk from Google GenAI to an OpenAI ChatCompletionChunk.
 */
export function transformStreamChunk(
    response: GenerateContentResponse,
    model: string,
    id: string
): ChatCompletionChunk {
    const candidate = response.candidates?.[0]
    const textContent = candidate?.content?.parts?.map(p => p.text ?? '').join('') ?? ''
    const finishReason = candidate?.finishReason ? mapFinishReason(candidate.finishReason) : null

    const delta: ChatChunkChoice['delta'] = {}
    if (textContent) {
        delta.content = textContent
    }

    // Check for function call deltas
    const functionCalls = candidate?.content?.parts?.filter(p => p.functionCall)
    if (functionCalls && functionCalls.length > 0) {
        delta.tool_calls = functionCalls.map((part, i) => ({
            index: i,
            id: `call_${randomUUID().replace(/-/g, '').slice(0, 24)}`,
            type: 'function' as const,
            function: {
                name: part.functionCall!.name ?? '',
                arguments: JSON.stringify(part.functionCall!.args ?? {})
            }
        }))
    }

    const choice: ChatChunkChoice = {
        index: 0,
        delta,
        // Override finish_reason to 'tool_calls' when function calls are present
        finish_reason: functionCalls && functionCalls.length > 0 ? 'tool_calls' : finishReason
    }

    const chunk: ChatCompletionChunk = {
        id,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [choice]
    }

    // Include usage in the final chunk if available
    if (response.usageMetadata) {
        chunk.usage = mapUsage(response)
    }

    return chunk
}

// ─── Embedding Response ──────────────────────────────────────────────────────

/**
 * Convert a Google GenAI EmbedContentResponse to an OpenAI EmbeddingResponse.
 */
export function transformEmbeddingResponse(response: EmbedContentResponse, model: string): EmbeddingResponse {
    const data: EmbeddingData[] = (response.embeddings ?? []).map((emb, index) => ({
        object: 'embedding' as const,
        embedding: emb.values ?? [],
        index
    }))

    // Estimate token usage from embeddings (Google doesn't always provide this)
    const totalTokens = data.reduce((sum, d) => (sum + d.embedding.length > 0 ? 1 : 0), 0)

    return {
        object: 'list',
        data,
        model,
        usage: {
            prompt_tokens: totalTokens,
            completion_tokens: 0,
            total_tokens: totalTokens
        }
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapFinishReason(reason: string): 'stop' | 'length' | 'tool_calls' | 'content_filter' | null {
    switch (reason) {
        case 'STOP':
            return 'stop'
        case 'MAX_TOKENS':
            return 'length'
        case 'SAFETY':
        case 'RECITATION':
            return 'content_filter'
        default:
            // If Google returns an unknown reason, map to 'stop' for safety
            return reason ? 'stop' : null
    }
}

function mapUsage(response: GenerateContentResponse): Usage {
    const meta = response.usageMetadata
    return {
        prompt_tokens: meta?.promptTokenCount ?? 0,
        completion_tokens: meta?.candidatesTokenCount ?? 0,
        total_tokens: meta?.totalTokenCount ?? 0
    }
}
