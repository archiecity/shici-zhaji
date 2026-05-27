import { DEFAULT_AI_BASE_URL, DEFAULT_AI_IMAGE_MODEL, DEFAULT_AI_MODEL } from '@/lib/ai/presets'
import { AiChatMessage, AiImageRequest, AiImageTask, AiImageTaskResult, AiPoemResponse, AiSettings } from '@/lib/ai/types'

export { DEFAULT_AI_BASE_URL, DEFAULT_AI_MODEL, DEFAULT_AI_IMAGE_MODEL }
export const AI_REQUEST_TIMEOUT_MS = 45000

type CompatibleChatResponse = {
  choices?: {
    message?: {
      content?: string
    }
  }[]
  error?: {
    message?: string
  }
}

type CompatibleImageTaskResponse = {
  id?: string
  request_id?: string
  task_status?: string
  model?: string
  error?: {
    message?: string
  }
}

export function normalizeAiBaseUrl(value: string): string {
  const trimmed = value.trim() || DEFAULT_AI_BASE_URL
  return trimmed.replace(/\/+$/, '')
}

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname.startsWith('127.')
    || hostname === '::1'
    || hostname === '[::1]'
  )
}

export function assertSafeAiBaseUrl(value: string): string {
  const normalized = normalizeAiBaseUrl(value)
  let parsed: URL
  try {
    parsed = new URL(normalized)
  } catch {
    throw new Error('Base URL 格式不正确，请填写完整的 https:// 地址。')
  }

  if (parsed.username || parsed.password) {
    throw new Error('Base URL 不能包含用户名或密码。')
  }
  if (parsed.search || parsed.hash) {
    throw new Error('Base URL 不能包含查询参数或片段。')
  }
  if (parsed.protocol === 'https:') return normalized
  if (parsed.protocol === 'http:' && isLoopbackHost(parsed.hostname)) return normalized
  throw new Error('Base URL 必须使用 https://，本机 localhost 调试地址除外。')
}

export function normalizeAiModel(value: string): string {
  return value.trim() || DEFAULT_AI_MODEL
}

export function mapAiHttpError(status: number, fallback?: string): string {
  if (fallback) return fallback
  if (status === 404) return '当前运行环境没有可用的 AI 服务。'
  if (status === 503) return 'AI 服务还没有配置，请先到“我的”页配置。'
  if (status === 401 || status === 403) return 'AI 服务认证失败，请检查 API Key。'
  if (status === 429) return 'AI 服务请求过于频繁或额度不足，请稍后再试。'
  if (status >= 500) return 'AI 服务暂时不可用，请稍后再试。'
  return '生成失败，请稍后再试。'
}

export function getProviderError(status: number, payload?: CompatibleChatResponse): string {
  const providerMessage = payload?.error?.message?.trim()
  return mapAiHttpError(status, providerMessage)
}

export function buildChatCompletionBody(
  settings: Pick<AiSettings, 'model'>,
  messages: AiChatMessage[],
  maxTokens = 900
) {
  const normalizedModel = normalizeAiModel(settings.model)
  const isDeepSeekStyle = /deepseek/i.test(normalizedModel)

  return {
    model: normalizedModel,
    messages,
    temperature: isDeepSeekStyle ? 0.3 : 0.35,
    top_p: isDeepSeekStyle ? 0.95 : 0.9,
    max_tokens: maxTokens,
  }
}

export function parseCompatiblePayload(data: unknown): CompatibleChatResponse {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as CompatibleChatResponse
    } catch {
      return {}
    }
  }
  if (data && typeof data === 'object') return data as CompatibleChatResponse
  return {}
}

export function extractAiText(payload: CompatibleChatResponse): string {
  return payload.choices?.[0]?.message?.content?.trim() || ''
}

function normalizeImageTaskStatus(raw: unknown): AiImageTask['taskStatus'] {
  const status = typeof raw === 'string' ? raw.toUpperCase() : ''
  if (status === 'PROCESSING' || status === 'SUCCESS' || status === 'FAIL') return status
  return 'UNKNOWN'
}

function buildImageGenerationBody(settings: Pick<AiSettings, 'imageModel'>, input: AiImageRequest) {
  const prompt = input.prompt.trim()
  if (!prompt) {
    throw new Error('图片提示词不能为空。')
  }

  const body: Record<string, unknown> = {
    model: normalizeAiModel(input.model || settings.imageModel || DEFAULT_AI_IMAGE_MODEL),
    prompt,
    size: (input.size || '1024x1024').trim(),
    quality: input.quality || 'hd',
  }

  if (typeof input.watermarkEnabled === 'boolean') {
    body.watermark_enabled = input.watermarkEnabled
  }
  if (input.userId && input.userId.trim()) {
    body.user_id = input.userId.trim().slice(0, 128)
  }

  return body
}

function extractImageUrlsFromUnknown(input: unknown, out: Set<string>) {
  if (!input) return
  if (Array.isArray(input)) {
    for (const item of input) extractImageUrlsFromUnknown(item, out)
    return
  }
  if (typeof input !== 'object') return

  const record = input as Record<string, unknown>
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === 'string') {
      const lcKey = key.toLowerCase()
      const text = value.trim()
      if (
        text.startsWith('http')
        && (
          lcKey === 'url'
          || lcKey.endsWith('_url')
          || lcKey.includes('image')
          || lcKey.includes('media')
        )
      ) {
        out.add(text)
      }
      continue
    }
    extractImageUrlsFromUnknown(value, out)
  }
}

function toImageTask(payload: CompatibleImageTaskResponse): AiImageTask {
  return {
    id: String(payload.id || '').trim(),
    requestId: String(payload.request_id || payload.id || '').trim(),
    taskStatus: normalizeImageTaskStatus(payload.task_status),
    model: normalizeAiModel(String(payload.model || DEFAULT_AI_IMAGE_MODEL)),
  }
}

export async function requestCompatibleChatCompletion(
  settings: AiSettings,
  messages: AiChatMessage[],
  maxTokens = 900
): Promise<AiPoemResponse> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS)

  try {
    const baseUrl = assertSafeAiBaseUrl(settings.baseUrl)
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildChatCompletionBody(settings, messages, maxTokens)),
      signal: controller.signal,
    })

    const payload = parseCompatiblePayload(await res.text())
    if (!res.ok) throw new Error(getProviderError(res.status, payload))

    const text = extractAiText(payload)
    if (!text) throw new Error('AI 没有返回可用内容，请重新生成。')
    return { text, model: normalizeAiModel(settings.model) }
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('AI 生成超时，请稍后再试。')
    }
    if (e instanceof Error) throw e
    throw new Error('生成失败，请稍后再试。')
  } finally {
    clearTimeout(timer)
  }
}

export async function requestCompatibleImageTask(
  settings: AiSettings,
  input: AiImageRequest
): Promise<AiImageTask> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS)

  try {
    const baseUrl = assertSafeAiBaseUrl(settings.baseUrl)
    const res = await fetch(`${baseUrl}/async/images/generations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildImageGenerationBody(settings, input)),
      signal: controller.signal,
    })

    const payload = parseCompatiblePayload(await res.text()) as CompatibleImageTaskResponse
    if (!res.ok) throw new Error(getProviderError(res.status, payload as CompatibleChatResponse))

    const task = toImageTask(payload)
    if (!task.id) throw new Error('生图任务创建失败，未返回任务 ID。')
    return task
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('生图请求超时，请稍后再试。')
    }
    if (e instanceof Error) throw e
    throw new Error('生图请求失败，请稍后再试。')
  } finally {
    clearTimeout(timer)
  }
}

export async function queryCompatibleAsyncResult(
  settings: AiSettings,
  taskId: string
): Promise<AiImageTaskResult> {
  const normalizedTaskId = taskId.trim()
  if (!normalizedTaskId) throw new Error('缺少任务 ID。')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS)

  try {
    const baseUrl = assertSafeAiBaseUrl(settings.baseUrl)
    const res = await fetch(`${baseUrl}/async-result/${encodeURIComponent(normalizedTaskId)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
      },
      signal: controller.signal,
    })

    const payload = parseCompatiblePayload(await res.text()) as Record<string, unknown>
    if (!res.ok) throw new Error(getProviderError(res.status, payload as CompatibleChatResponse))

    const urls = new Set<string>()
    extractImageUrlsFromUnknown(payload, urls)

    return {
      id: String(payload.id || normalizedTaskId),
      requestId: String(payload.request_id || payload.id || normalizedTaskId),
      taskStatus: normalizeImageTaskStatus(payload.task_status),
      model: normalizeAiModel(String(payload.model || DEFAULT_AI_IMAGE_MODEL)),
      imageUrls: [...urls],
      raw: payload,
    }
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('查询生图结果超时，请稍后再试。')
    }
    if (e instanceof Error) throw e
    throw new Error('查询生图结果失败，请稍后再试。')
  } finally {
    clearTimeout(timer)
  }
}

export function toChatMessages(system: string, user: string): AiChatMessage[] {
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}

