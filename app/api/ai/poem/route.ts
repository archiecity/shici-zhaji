import { NextResponse } from 'next/server'
import {
  DEFAULT_AI_BASE_URL,
  DEFAULT_AI_MODEL,
  normalizeAiBaseUrl,
  normalizeAiModel,
  requestCompatibleChatCompletion,
  toChatMessages,
} from '@/lib/ai/compatible'
import { generatePrompt } from '@/lib/ai/prompts'
import { AiPoemRequest, AiPoemTask } from '@/lib/ai/types'

export const runtime = 'nodejs'

function isTask(input: unknown): input is AiPoemTask {
  return input === 'analysis' || input === 'annotation' || input === 'recitation'
}

function normalizeRequest(input: unknown): AiPoemRequest | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Partial<AiPoemRequest>
  if (!isTask(raw.task)) return null
  const poem = raw.poem
  if (!poem || typeof poem !== 'object') return null
  if (!poem.id || !poem.title || !poem.author || !poem.dynasty) return null
  if (!Array.isArray(poem.content)) return null

  return {
    task: raw.task,
    poem: {
      id: String(poem.id),
      title: String(poem.title),
      author: String(poem.author),
      dynasty: String(poem.dynasty),
      content: poem.content.map(String),
      annotation: Array.isArray(poem.annotation) ? poem.annotation.map(String) : [],
      translation: Array.isArray(poem.translation) ? poem.translation.map(String) : [],
      appreciation: typeof poem.appreciation === 'string' ? poem.appreciation : '',
      tags: Array.isArray(poem.tags) ? poem.tags.map(String) : [],
    },
    studyRecord: raw.studyRecord || null,
    recite: raw.recite || undefined,
  }
}

export async function POST(req: Request) {
  const apiKey = process.env.AI_API_KEY?.trim()
  if (!apiKey) {
    return NextResponse.json(
      { error: 'AI 服务还没有配置，请先设置 AI_API_KEY。' },
      { status: 503 }
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '请求内容格式不正确。' }, { status: 400 })
  }

  const input = normalizeRequest(body)
  if (!input) {
    return NextResponse.json({ error: '缺少生成所需的诗词信息。' }, { status: 400 })
  }

  const model = normalizeAiModel(process.env.AI_MODEL?.trim() || DEFAULT_AI_MODEL)
  const baseUrl = normalizeAiBaseUrl(process.env.AI_BASE_URL?.trim() || DEFAULT_AI_BASE_URL)
  const prompt = generatePrompt(input)

  try {
    const result = await requestCompatibleChatCompletion(
      { apiKey, baseUrl, model },
      toChatMessages(prompt.system, prompt.user)
    )
    return NextResponse.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'AI 服务连接失败，请稍后再试。'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
