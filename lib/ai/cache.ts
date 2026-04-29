import { AiPoemTask } from '@/lib/ai/types'

const AI_CACHE_PREFIX = 'shici-ai-cache'
const AI_CACHE_VERSION = 'v1'

function getAiCacheKey(poemId: string, task: AiPoemTask): string {
  return `${AI_CACHE_PREFIX}:${AI_CACHE_VERSION}:${task}:${poemId}`
}

export function readAiCache(poemId: string, task: AiPoemTask): string | null {
  if (typeof window === 'undefined') return null
  const key = getAiCacheKey(poemId, task)
  const value = localStorage.getItem(key)
  return value?.trim() || null
}

export function writeAiCache(poemId: string, task: AiPoemTask, text: string): void {
  if (typeof window === 'undefined') return
  const normalized = text.trim()
  if (!normalized) return
  localStorage.setItem(getAiCacheKey(poemId, task), normalized)
}
