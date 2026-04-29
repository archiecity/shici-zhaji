import { AiPoemRequest, AiPromptMessages, AiStudyContext } from '@/lib/ai/types'

const EMPTY_TEXT = '无'

function joinLines(lines: string[] | undefined, fallback = EMPTY_TEXT): string {
  const value = (lines || [])
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n')
  return value || fallback
}

function joinInline(items: string[] | undefined, fallback = EMPTY_TEXT): string {
  const value = (items || [])
    .map(item => item.trim())
    .filter(Boolean)
    .join('、')
  return value || fallback
}

function formatStudyRecord(record?: AiStudyContext | null): string {
  if (!record) return '暂无学习记录'
  return [
    `最近阅读：${record.viewedAt || '未知'}`,
    `阅读/复习次数：${record.reviewCount}`,
    `已掌握：${record.memorized ? '是' : '否'}`,
    `已收藏：${record.favorite ? '是' : '否'}`,
  ].join('\n')
}

function formatPoemContext(input: AiPoemRequest): string {
  const { poem } = input
  return [
    `题目：${poem.title}`,
    `作者：${poem.author}`,
    `朝代：${poem.dynasty}`,
    `标签：${joinInline(poem.tags)}`,
    `原文：\n${joinLines(poem.content)}`,
    `已有注释：\n${joinLines(poem.annotation)}`,
    `已有译文：\n${joinLines(poem.translation)}`,
    `已有赏析：\n${poem.appreciation?.trim() || EMPTY_TEXT}`,
  ].join('\n\n')
}

const baseSystemPrompt = [
  '你是诗词学习 App 中的内嵌学习助手。',
  '只用中文回答，语气克制、清楚、适合移动端阅读。',
  '内容用于辅助学习，不替代权威注释或教师讲解。',
  '不要编造作者生平、历史背景或典故；不确定时使用“可能”“通常理解为”。',
  '不要输出营销化文案，不要要求用户继续聊天。',
].join('\n')

export function generatePoemAnalysisPrompt(input: AiPoemRequest): AiPromptMessages {
  return {
    system: baseSystemPrompt,
    user: [
      '请基于以下诗词信息，生成一段“AI 补充赏析”。',
      '要求：',
      '1. 不重复替代已有赏析，重点补充理解角度。',
      '2. 关注意象、情感推进、结构和语言特点。',
      '3. 控制在 3-5 个短段落或要点内。',
      '4. 如引用背景信息，必须保持谨慎。',
      '',
      formatPoemContext(input),
    ].join('\n'),
  }
}

export function generatePoemAnnotationPrompt(input: AiPoemRequest): AiPromptMessages {
  return {
    system: baseSystemPrompt,
    user: [
      '请基于以下诗词信息，生成“AI 补充注释”。',
      '要求：',
      '1. 不覆盖原始注释，只补充学习理解。',
      '2. 包含生僻词解释、典故说明、难句通俗解释、上下文理解提示。',
      '3. 若没有明确典故依据，请说明“可能”或“通常理解为”。',
      '4. 控制在 4-6 条要点内，每条尽量简短。',
      '',
      formatPoemContext(input),
    ].join('\n'),
  }
}

export function generateRecitationAdvicePrompt(input: AiPoemRequest): AiPromptMessages {
  const recite = input.recite
  return {
    system: baseSystemPrompt,
    user: [
      '请基于以下诗词和学习记录，生成“AI 背诵建议”。',
      '要求：',
      '1. 包含分段背诵路径、关键词记忆法、意象链记忆法、易混句提醒、复习建议。',
      '2. 建议要贴合当前学习状态，不要泛泛而谈。',
      '3. 控制在 5 条以内，每条适合手机阅读。',
      '',
      `当前背诵模式：${recite?.mode || '未知'}`,
      `当前背诵范围：${recite?.scopeName || recite?.scope || '未知'}`,
      `学习记录：\n${formatStudyRecord(input.studyRecord)}`,
      '',
      formatPoemContext(input),
    ].join('\n'),
  }
}

export function generatePrompt(input: AiPoemRequest): AiPromptMessages {
  if (input.task === 'analysis') return generatePoemAnalysisPrompt(input)
  if (input.task === 'annotation') return generatePoemAnnotationPrompt(input)
  return generateRecitationAdvicePrompt(input)
}
