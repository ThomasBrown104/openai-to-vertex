# OpenAI-to-Vertex

A production-grade OpenAI-compatible API proxy that forwards requests to **Google Vertex AI** via the official `@google/genai` SDK.

Drop this service in front of any tool that speaks the OpenAI API (Cursor, Continue, LangChain, LlamaIndex, etc.) and point it at Gemini models on Vertex AI — **no model mapping, no format conversion on the client side**.

---

## Features

| Feature                                                 | Status |
| ------------------------------------------------------- | ------ |
| `POST /v1/chat/completions` (streaming + non-streaming) | ✅     |
| `POST /v1/embeddings`                                   | ✅     |
| `GET /v1/models`                                        | ✅     |
| Transparent model pass-through (no name mapping)        | ✅     |
| SSE streaming with `data: [DONE]` terminator            | ✅     |
| System messages → Google `systemInstruction`            | ✅     |
| Tool / function calling support                         | ✅     |
| JSON mode / structured output                           | ✅     |
| Optional API key authentication                         | ✅     |
| CORS support                                            | ✅     |
| Rate limiting                                           | ✅     |
| Application Default Credentials (ADC) fallback          | ✅     |

---

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy the example file and edit it:

```bash
cp .env.example .env
```

At minimum you need:

```env
GOOGLE_PROJECT_ID=your-gcp-project-id
```

### 3. Authenticate with Google

Choose **one** of the following methods (in order of priority):

| Method          | Env Var                           | Description                                     |
| --------------- | --------------------------------- | ----------------------------------------------- |
| **JSON inline** | `GOOGLE_SERVICE_ACCOUNT_KEY_JSON` | Paste the full service-account JSON as a string |
| **File path**   | `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` | Path to the `service-account.json` file         |
| **ADC**         | _(none)_                          | Uses `gcloud auth application-default login`    |

### 4. Run

```bash
# Development (hot reload)
npm run dev

# Production
npm run build
npm start
```

---

## Environment Variables

| Variable                          | Default       | Description                                                                                                             |
| --------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `PORT`                            | `3000`        | Server port                                                                                                             |
| `HOST`                            | `0.0.0.0`     | Bind address                                                                                                            |
| `GOOGLE_PROJECT_ID`               | _(required)_  | GCP project ID                                                                                                          |
| `GOOGLE_LOCATION`                 | `us-central1` | Vertex AI region                                                                                                        |
| `GOOGLE_API_VERSION`              | `v1beta1`     | Google API version (`v1` or `v1beta1`)                                                                                  |
| `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` |               | Path to service-account JSON file                                                                                       |
| `GOOGLE_SERVICE_ACCOUNT_KEY_JSON` |               | Service-account JSON content (higher priority than path)                                                                |
| `API_KEY`                         |               | Custom API key for client auth. If set, clients must send `Authorization: Bearer <key>`. If empty, no auth is enforced. |
| `RATE_LIMIT_MAX`                  | `100`         | Max requests per time window                                                                                            |
| `RATE_LIMIT_TIME_WINDOW`          | `60000`       | Rate limit window in ms                                                                                                 |
| `LOG_LEVEL`                       | `info`        | Pino log level                                                                                                          |

---

## Usage Examples

### Chat Completion (non-streaming)

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-2.5-flash",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Explain quantum computing in one sentence."}
    ],
    "temperature": 0.7,
    "max_tokens": 200
  }'
```

### Chat Completion (streaming)

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-2.5-flash",
    "messages": [
      {"role": "user", "content": "Write a haiku about coding."}
    ],
    "stream": true
  }'
```

### Embeddings

```bash
curl http://localhost:3000/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{
    "model": "text-embedding-005",
    "input": "Hello, world!"
  }'
```

### List Models

```bash
curl http://localhost:3000/v1/models
```

### With API Key Authentication

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-custom-sk" \
  -d '{
    "model": "gemini-2.5-flash",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

---

## Architecture

```
src/
├── index.ts                 # Entry point — starts Fastify
├── app.ts                   # Fastify app factory (for testing reuse)
├── config/
│   ├── env.ts               # @fastify/env schema + registration
│   └── env.d.ts             # Type augmentation for fastify.config
├── types/
│   ├── openai.ts            # OpenAI-compatible request/response types
│   └── index.ts             # Re-exports
├── services/
│   └── google-genai.ts      # GoogleGenAI client singleton
├── transformers/
│   ├── request.ts           # OpenAI → Google GenAI format
│   └── response.ts          # Google GenAI → OpenAI format
├── middlewares/
│   └── auth.ts              # API key authentication hook
├── routes/
│   ├── chat-completions.ts  # POST /v1/chat/completions
│   ├── embeddings.ts        # POST /v1/embeddings
│   └── models.ts            # GET /v1/models
└── utils/
    └── errors.ts            # OpenAI-format error responses
```

### Request Flow

```
Client Request
  │
  ▼
[CORS] → [Rate Limit] → [Auth Hook] → [Route Handler]
                                              │
                                              ▼
                                   [Transform Request]
                                              │
                                              ▼
                                   [Google GenAI SDK]
                                              │
                                              ▼
                                   [Transform Response]
                                              │
                                              ▼
                                        Client Response
```

---

## Using with OpenAI SDKs

Point any OpenAI-compatible client at this proxy:

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:3000/v1",
    api_key="your-custom-sk",  # or "unused" if API_KEY is not set
)

response = client.chat.completions.create(
    model="gemini-2.5-flash",
    messages=[{"role": "user", "content": "Hello!"}],
)
print(response.choices[0].message.content)
```

```typescript
import OpenAI from 'openai'

const client = new OpenAI({
    baseURL: 'http://localhost:3000/v1',
    apiKey: 'your-custom-sk'
})

const response = await client.chat.completions.create({
    model: 'gemini-2.5-flash',
    messages: [{ role: 'user', content: 'Hello!' }]
})
console.log(response.choices[0].message.content)
```

---

## License

MIT
