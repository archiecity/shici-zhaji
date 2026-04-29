import { AiChatMessage, AiPoemResponse, AiSettings } from '@/lib/ai/types'

export const DEFAULT_AI_BASE_URL = 'https://api.openai.com/v1'
export const DEFAULT_AI_MODEL = 'gpt-4o-mini'
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

export function normalizeAiBaseUrl(value: string): string {
  const trimmed = value.trim() || DEFAULT_AI_BASE_URL
  return trimmed.replace(/\/+$/, '')
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
  return {
    model: normalizeAiModel(settings.model),
    messages,
    temperature: 0.35,
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

export async function requestCompatibleChatCompletion(
  settings: AiSettings,
  messages: AiChatMessage[],
  maxTokens = 900
): Promise<AiPoemResponse> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS)

  try {
    const res = await fetch(`${normalizeAiBaseUrl(settings.baseUrl)}/chat/completions`, {
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

export function toChatMessages(system: string, user: string): AiChatMessage[] {
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}
