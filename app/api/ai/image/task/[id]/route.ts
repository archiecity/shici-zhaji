import { NextResponse } from 'next/server'
import {
  DEFAULT_AI_BASE_URL,
  DEFAULT_AI_IMAGE_MODEL,
  DEFAULT_AI_MODEL,
  normalizeAiBaseUrl,
  normalizeAiModel,
  queryCompatibleAsyncResult,
} from '@/lib/ai/compatible'
import { guardAiRoute } from '@/lib/ai/server-guard'

export const runtime = 'nodejs'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const blocked = guardAiRoute(req, { rateLimitMax: 12 })
  if (blocked) return blocked

  const apiKey = process.env.AI_API_KEY?.trim()
  if (!apiKey) {
    return NextResponse.json(
      { error: 'AI 服务还没有配置，请先设置 AI_API_KEY。' },
      { status: 503 }
    )
  }

  try {
    const { id } = await params
    const taskId = decodeURIComponent(id || '').trim()
    if (!taskId) {
      return NextResponse.json({ error: '缺少任务 ID。' }, { status: 400 })
    }

    const result = await queryCompatibleAsyncResult(
      {
        apiKey,
        baseUrl: normalizeAiBaseUrl(process.env.AI_BASE_URL?.trim() || DEFAULT_AI_BASE_URL),
        model: normalizeAiModel(process.env.AI_MODEL?.trim() || DEFAULT_AI_MODEL),
        imageModel: normalizeAiModel(process.env.AI_IMAGE_MODEL?.trim() || DEFAULT_AI_IMAGE_MODEL),
      },
      taskId
    )
    return NextResponse.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : '查询生图任务失败。'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}

