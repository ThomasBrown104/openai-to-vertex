// ─── Request Types ───────────────────────────────────────────────────────────

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool'
    content: string | ContentPart[] | null
    name?: string
    tool_calls?: ToolCall[]
    tool_call_id?: string
}

export interface ContentPart {
    type: 'text' | 'image_url'
    text?: string
    image_url?: { url: string; detail?: string }
}

export interface ToolCall {
    id: string
    type: 'function'
    function: { name: string; arguments: string }
}

export interface ToolDefinition {
    type: 'function'
    function: {
        name: string
        description?: string
        parameters?: Record<string, unknown>
    }
}

export interface ChatCompletionRequest {
    model: string
    messages: ChatMessage[]
    temperature?: number
    top_p?: number
    n?: number
    stream?: boolean
    stop?: string | string[]
    max_tokens?: number
    max_completion_tokens?: number
    presence_penalty?: number
    frequency_penalty?: number
    tools?: ToolDefinition[]
    tool_choice?: string | { type: string; function?: { name: string } }
    response_format?: { type: string; json_schema?: Record<string, unknown> }
    user?: string
}

export interface EmbeddingRequest {
    model: string
    input: string | string[]
    encoding_format?: string
    dimensions?: number
    user?: string
}

// ─── Response Types ──────────────────────────────────────────────────────────

export interface ChatCompletionResponse {
    id: string
    object: 'chat.completion'
    created: number
    model: string
    choices: ChatChoice[]
    usage: Usage
    system_fingerprint?: string
}

export interface ChatChoice {
    index: number
    message: ChatMessage
    finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null
}

export interface Usage {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
}

// ─── Streaming Types ─────────────────────────────────────────────────────────

export interface ChatCompletionChunk {
    id: string
    object: 'chat.completion.chunk'
    created: number
    model: string
    choices: ChatChunkChoice[]
    usage?: Usage
    system_fingerprint?: string
}

export interface ChatChunkChoice {
    index: number
    delta: ChatDelta
    finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null
}

export interface ChatDelta {
    role?: string
    content?: string | null
    tool_calls?: ToolCallDelta[]
}

export interface ToolCallDelta {
    index: number
    id?: string
    type?: 'function'
    function?: { name?: string; arguments?: string }
}

// ─── Embedding Types ─────────────────────────────────────────────────────────

export interface EmbeddingResponse {
    object: 'list'
    data: EmbeddingData[]
    model: string
    usage: Usage
}

export interface EmbeddingData {
    object: 'embedding'
    embedding: number[]
    index: number
}

// ─── Model List Types ────────────────────────────────────────────────────────

export interface ModelListResponse {
    object: 'list'
    data: ModelData[]
}

export interface ModelData {
    id: string
    object: 'model'
    created: number
    owned_by: string
}

// ─── Error Types ─────────────────────────────────────────────────────────────

export interface OpenAIErrorResponse {
    error: {
        message: string
        type: string
        param: string | null
        code: string | null
    }
}
