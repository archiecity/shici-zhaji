import { NextResponse } from 'next/server'
import { DEFAULT_AI_BASE_URL, DEFAULT_AI_IMAGE_MODEL, DEFAULT_AI_MODEL, normalizeAiBaseUrl, normalizeAiModel } from '@/lib/ai/compatible'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    hasApiKey: Boolean(process.env.AI_API_KEY?.trim()),
    baseUrl: normalizeAiBaseUrl(process.env.AI_BASE_URL?.trim() || DEFAULT_AI_BASE_URL),
    model: normalizeAiModel(process.env.AI_MODEL?.trim() || DEFAULT_AI_MODEL),
    imageModel: normalizeAiModel(process.env.AI_IMAGE_MODEL?.trim() || DEFAULT_AI_IMAGE_MODEL),
    source: 'server',
    editable: false,
    secure: true,
    warning: 'Web 版本使用服务端环境变量配置 API Key。',
  })
}
