import { Poem, ReciteMode, ReciteScopeId, StudyRecord } from '@/lib/types'

export type AiPoemTask = 'analysis' | 'annotation' | 'recitation'

export type AiPoemInput = Pick<
  Poem,
  'id' | 'title' | 'author' | 'dynasty' | 'content' | 'annotation' | 'translation' | 'appreciation' | 'tags'
>

export type AiStudyContext = Pick<
  StudyRecord,
  'viewedAt' | 'memorized' | 'reviewCount' | 'favorite'
>

export type AiReciteContext = {
  mode?: ReciteMode
  scope?: ReciteScopeId
  scopeName?: string
}

export type AiPoemRequest = {
  task: AiPoemTask
  poem: AiPoemInput
  studyRecord?: AiStudyContext | null
  recite?: AiReciteContext
}

export type AiPoemResponse = {
  text: string
  model: string
}

export type AiPromptMessages = {
  system: string
  user: string
}

export type AiChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type AiSettings = {
  apiKey: string
  baseUrl: string
  model: string
}

export type AiSettingsInput = {
  apiKey?: string
  baseUrl: string
  model: string
}

export type AiSettingsSource = 'server' | 'desktop' | 'native' | 'unsupported'

export type AiSettingsStatus = {
  hasApiKey: boolean
  baseUrl: string
  model: string
  source: AiSettingsSource
  editable: boolean
  secure: boolean
  warning?: string
}

export type AiTestResult = {
  ok: boolean
  message: string
}
