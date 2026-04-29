'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { readAiCache, writeAiCache } from '@/lib/ai/cache'
import { requestPoemAi } from '@/lib/ai/client'
import { AiPoemInput, AiPoemTask, AiReciteContext, AiStudyContext } from '@/lib/ai/types'

type AiAssistBlockProps = {
  task: AiPoemTask
  title: string
  buttonLabel: string
  poem: AiPoemInput
  studyRecord?: AiStudyContext | null
  recite?: AiReciteContext
  className?: string
}

export default function AiAssistBlock({
  task,
  title,
  buttonLabel,
  poem,
  studyRecord,
  recite,
  className = '',
}: AiAssistBlockProps) {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setContent(readAiCache(poem.id, task) || '')
    setError('')
    setLoading(false)
  }, [poem.id, task])

  const handleGenerate = async () => {
    setLoading(true)
    setError('')
    try {
      const result = await requestPoemAi({ task, poem, studyRecord, recite })
      setContent(result.text)
      writeAiCache(poem.id, task, result.text)
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成失败，请稍后再试。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`card p-4 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-sm text-ink/75 dark:text-night-text/75">
          <Sparkles size={14} />
          <span>{title}</span>
        </div>
        <button
          type="button"
          onClick={() => { void handleGenerate() }}
          disabled={loading}
          className={`btn-ghost px-3 py-1.5 inline-flex items-center gap-1.5 text-xs ${
            loading ? 'opacity-60 cursor-not-allowed' : ''
          }`}
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : content ? <RefreshCw size={13} /> : <Sparkles size={13} />}
          {loading ? '生成中' : content ? '重新生成' : buttonLabel}
        </button>
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
          <AlertCircle size={14} className="mt-0.5 flex-none" />
          <span>{error}</span>
        </div>
      )}

      {content && (
        <div className="mt-3 border-t border-stone/20 dark:border-stone/10 pt-3">
          <p className="whitespace-pre-wrap text-sm text-ink/70 dark:text-night-text/70 leading-relaxed">
            {content}
          </p>
          <p className="mt-3 text-xs text-ash">AI 内容仅供辅助学习。</p>
        </div>
      )}
    </div>
  )
}
