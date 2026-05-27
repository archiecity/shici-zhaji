import { NextResponse } from 'next/server'
import {
  DEFAULT_AI_BASE_URL,
  DEFAULT_AI_IMAGE_MODEL,
  DEFAULT_AI_MODEL,
  normalizeAiBaseUrl,
  normalizeAiModel,
  requestCompatibleImageTask,
} from '@/lib/ai/compatible'
import { guardAiRoute, readLimitedJsonBody } from '@/lib/ai/server-guard'
import { AiImageRequest } from '@/lib/ai/types'

export const runtime = 'nodejs'

function normalizeImageRequest(input: unknown): AiImageRequest | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Record<string, unknown>
  const prompt = typeof raw.prompt === 'string' ? raw.prompt.trim() : ''
  if (!prompt) return null

  const request: AiImageRequest = { prompt }
  if (typeof raw.size === 'string') request.size = raw.size.trim().slice(0, 24)
  if (raw.quality === 'hd') request.quality = 'hd'
  if (typeof raw.model === 'string') request.model = raw.model.trim().slice(0, 64)
  if (typeof raw.userId === 'string') request.userId = raw.userId.trim().slice(0, 128)
  if (typeof raw.watermarkEnabled === 'boolean') request.watermarkEnabled = raw.watermarkEnabled
  return request
}

export async function POST(req: Request) {
  const blocked = guardAiRoute(req, { rateLimitMax: 6 })
  if (blocked) return blocked

  const apiKey = process.env.AI_API_KEY?.trim()
  if (!apiKey) {
    return NextResponse.json(
      { error: 'AI 服务还没有配置，请先设置 AI_API_KEY。' },
      { status: 503 }
    )
  }

  const body = await readLimitedJsonBody(req)
  if (!body.ok) return body.response

  const input = normalizeImageRequest(body.value)
  if (!input) {
    return NextResponse.json({ error: '缺少有效的生图参数（prompt）。' }, { status: 400 })
  }

  try {
    const task = await requestCompatibleImageTask(
      {
        apiKey,
        baseUrl: normalizeAiBaseUrl(process.env.AI_BASE_URL?.trim() || DEFAULT_AI_BASE_URL),
        model: normalizeAiModel(process.env.AI_MODEL?.trim() || DEFAULT_AI_MODEL),
        imageModel: normalizeAiModel(process.env.AI_IMAGE_MODEL?.trim() || DEFAULT_AI_IMAGE_MODEL),
      },
      input
    )
    return NextResponse.json(task)
  } catch (e) {
    const msg = e instanceof Error ? e.message : '生图任务创建失败。'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}

