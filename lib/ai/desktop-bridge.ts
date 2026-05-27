import { AiChatMessage, AiImageRequest, AiImageTask, AiImageTaskResult, AiPoemResponse, AiSettingsInput, AiSettingsStatus, AiTestResult } from '@/lib/ai/types'

export type DesktopAiSettingsBridge = {
  getStatus: () => Promise<AiSettingsStatus>
  save: (input: AiSettingsInput) => Promise<AiSettingsStatus>
  clear: () => Promise<AiSettingsStatus>
  test: (input?: Partial<AiSettingsInput>) => Promise<AiTestResult>
}

export type DesktopAiBridge = {
  generatePoem: (payload: { messages: AiChatMessage[] }) => Promise<AiPoemResponse>
  createImageTask: (payload: AiImageRequest) => Promise<AiImageTask>
  getAsyncResult: (taskId: string) => Promise<AiImageTaskResult>
}

declare global {
  interface Window {
    desktopAiSettings?: DesktopAiSettingsBridge
    desktopAi?: DesktopAiBridge
  }
}

export function getDesktopAiSettingsBridge(): DesktopAiSettingsBridge | null {
  if (typeof window === 'undefined') return null
  return window.desktopAiSettings || null
}

export function getDesktopAiBridge(): DesktopAiBridge | null {
  if (typeof window === 'undefined') return null
  return window.desktopAi || null
}
