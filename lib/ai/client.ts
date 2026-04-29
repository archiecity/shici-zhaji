import { AiPoemRequest, AiPoemResponse } from '@/lib/ai/types'
import { generatePrompt } from '@/lib/ai/prompts'
import { mapAiHttpError, toChatMessages } from '@/lib/ai/compatible'
import { getDesktopAiBridge } from '@/lib/ai/desktop-bridge'
import { requestNativeChatCompletion } from '@/lib/ai/native-client'
import { getNativeAiSettingsForRequest } from '@/lib/ai/settings'

const AI_REQUEST_TIMEOUT_MS = 45000

type ApiErrorPayload = {
  error?: string
}

async function readErrorPayload(res: Response): Promise<ApiErrorPayload> {
  try {
    return await res.json() as ApiErrorPayload
  } catch {
    return {}
  }
}

export async function requestPoemAi(input: AiPoemRequest): Promise<AiPoemResponse> {
  const prompt = generatePrompt(input)
  const messages = toChatMessages(prompt.system, prompt.user)
  const desktop = getDesktopAiBridge()
  if (desktop) return desktop.generatePoem({ messages })

  const nativeSettings = await getNativeAiSettingsForRequest()
  if (nativeSettings) {
    return requestNativeChatCompletion(nativeSettings, messages)
  }

  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS)

  try {
    const res = await fetch('/api/ai/poem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: controller.signal,
    })

    if (!res.ok) {
      const payload = await readErrorPayload(res)
      throw new Error(mapAiHttpError(res.status, payload.error))
    }

    const payload = await res.json() as AiPoemResponse
    const text = payload.text?.trim()
    if (!text) throw new Error('AI 没有返回可用内容，请重新生成。')
    return { text, model: payload.model || '' }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error('AI 生成超时，请稍后再试。')
    }
    if (e instanceof Error) throw e
    throw new Error('生成失败，请稍后再试。')
  } finally {
    window.clearTimeout(timer)
  }
}
