import { DEFAULT_AI_BASE_URL, DEFAULT_AI_MODEL, normalizeAiBaseUrl, normalizeAiModel, toChatMessages } from '@/lib/ai/compatible'
import { getDesktopAiSettingsBridge } from '@/lib/ai/desktop-bridge'
import { requestNativeChatCompletion } from '@/lib/ai/native-client'
import { AiSettings, AiSettingsInput, AiSettingsStatus, AiTestResult } from '@/lib/ai/types'

const STORAGE_PREFIX = 'shici-ai_'
const API_KEY_KEY = 'api-key'
const BASE_URL_KEY = 'base-url'
const MODEL_KEY = 'model'

type ServerStatusPayload = Partial<AiSettingsStatus> & {
  error?: string
}

async function isNativeRuntime(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  try {
    const { Capacitor } = await import('@capacitor/core')
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

async function getSecureStorage() {
  const { SecureStorage } = await import('@aparajita/capacitor-secure-storage')
  await SecureStorage.setKeyPrefix(STORAGE_PREFIX)
  return SecureStorage
}

async function getNativeSettings(): Promise<AiSettings> {
  const storage = await getSecureStorage()
  const [apiKey, baseUrl, model] = await Promise.all([
    storage.getItem(API_KEY_KEY),
    storage.getItem(BASE_URL_KEY),
    storage.getItem(MODEL_KEY),
  ])
  return {
    apiKey: apiKey || '',
    baseUrl: normalizeAiBaseUrl(baseUrl || DEFAULT_AI_BASE_URL),
    model: normalizeAiModel(model || DEFAULT_AI_MODEL),
  }
}

async function getNativeStatus(): Promise<AiSettingsStatus> {
  const settings = await getNativeSettings()
  return {
    hasApiKey: Boolean(settings.apiKey),
    baseUrl: settings.baseUrl,
    model: settings.model,
    source: 'native',
    editable: true,
    secure: true,
  }
}

async function saveNativeSettings(input: AiSettingsInput): Promise<AiSettingsStatus> {
  const storage = await getSecureStorage()
  const baseUrl = normalizeAiBaseUrl(input.baseUrl)
  const model = normalizeAiModel(input.model)
  await Promise.all([
    input.apiKey?.trim() ? storage.setItem(API_KEY_KEY, input.apiKey.trim()) : Promise.resolve(),
    storage.setItem(BASE_URL_KEY, baseUrl),
    storage.setItem(MODEL_KEY, model),
  ])
  return getNativeStatus()
}

async function clearNativeSettings(): Promise<AiSettingsStatus> {
  const storage = await getSecureStorage()
  await Promise.all([
    storage.removeItem(API_KEY_KEY),
    storage.removeItem(BASE_URL_KEY),
    storage.removeItem(MODEL_KEY),
  ])
  return getNativeStatus()
}

async function getServerStatus(): Promise<AiSettingsStatus> {
  try {
    const res = await fetch('/api/ai/settings')
    if (!res.ok) throw new Error('server unavailable')
    const payload = await res.json() as ServerStatusPayload
    return {
      hasApiKey: Boolean(payload.hasApiKey),
      baseUrl: payload.baseUrl || DEFAULT_AI_BASE_URL,
      model: payload.model || DEFAULT_AI_MODEL,
      source: 'server',
      editable: false,
      secure: true,
      warning: payload.warning,
    }
  } catch {
    return {
      hasApiKey: false,
      baseUrl: DEFAULT_AI_BASE_URL,
      model: DEFAULT_AI_MODEL,
      source: 'unsupported',
      editable: false,
      secure: false,
      warning: '当前运行环境不支持在页面中保存 API Key。',
    }
  }
}

export async function getAiSettingsStatus(): Promise<AiSettingsStatus> {
  const desktop = getDesktopAiSettingsBridge()
  if (desktop) return desktop.getStatus()
  if (await isNativeRuntime()) return getNativeStatus()
  return getServerStatus()
}

export async function saveAiSettings(input: AiSettingsInput): Promise<AiSettingsStatus> {
  const desktop = getDesktopAiSettingsBridge()
  if (desktop) return desktop.save(input)
  if (await isNativeRuntime()) return saveNativeSettings(input)
  throw new Error('当前运行环境不支持在页面中保存 API Key。')
}

export async function clearAiSettings(): Promise<AiSettingsStatus> {
  const desktop = getDesktopAiSettingsBridge()
  if (desktop) return desktop.clear()
  if (await isNativeRuntime()) return clearNativeSettings()
  throw new Error('当前运行环境不支持清除页面中的 API Key。')
}

export async function getNativeAiSettingsForRequest(): Promise<AiSettings | null> {
  if (!(await isNativeRuntime())) return null
  const settings = await getNativeSettings()
  if (!settings.apiKey) throw new Error('请先到“我的”页配置 API Key。')
  return settings
}

export async function testAiSettings(input?: Partial<AiSettingsInput>): Promise<AiTestResult> {
  const desktop = getDesktopAiSettingsBridge()
  if (desktop) return desktop.test(input)

  if (await isNativeRuntime()) {
    const existing = await getNativeSettings()
    const settings = {
      apiKey: input?.apiKey?.trim() || existing.apiKey,
      baseUrl: normalizeAiBaseUrl(input?.baseUrl || existing.baseUrl),
      model: normalizeAiModel(input?.model || existing.model),
    }
    if (!settings.apiKey) return { ok: false, message: '请先填写并保存 API Key。' }
    await requestNativeChatCompletion(
      settings,
      toChatMessages('你是连通性测试助手。', '请只回复 OK。'),
      16
    )
    return { ok: true, message: '连接测试通过。' }
  }

  const res = await fetch('/api/ai/settings/test', { method: 'POST' })
  const payload = await res.json().catch(() => ({})) as Partial<AiTestResult> & { error?: string }
  if (!res.ok || !payload.ok) {
    return { ok: false, message: payload.message || payload.error || '连接测试失败。' }
  }
  return { ok: true, message: payload.message || '连接测试通过。' }
}
