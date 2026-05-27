const fs = require('node:fs')
const path = require('node:path')
const { safeStorage } = require('electron')

const DEFAULT_AI_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4'
const DEFAULT_AI_MODEL = 'glm-4.7-flash'
const DEFAULT_AI_IMAGE_MODEL = 'cogview-3-flash'
const REQUEST_TIMEOUT_MS = 45000

function normalizeBaseUrl(value) {
  const trimmed = typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_AI_BASE_URL
  return trimmed.replace(/\/+$/, '')
}

function isLoopbackHost(hostname) {
  return (
    hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname.startsWith('127.')
    || hostname === '::1'
    || hostname === '[::1]'
  )
}

function assertSafeBaseUrl(value) {
  const normalized = normalizeBaseUrl(value)
  let parsed
  try {
    parsed = new URL(normalized)
  } catch {
    throw new Error('Base URL 格式不正确，请填写完整的 https:// 地址。')
  }
  if (parsed.username || parsed.password) {
    throw new Error('Base URL 不能包含用户名或密码。')
  }
  if (parsed.search || parsed.hash) {
    throw new Error('Base URL 不能包含查询参数或片段。')
  }
  if (parsed.protocol === 'https:') return normalized
  if (parsed.protocol === 'http:' && isLoopbackHost(parsed.hostname)) return normalized
  throw new Error('Base URL 必须使用 https://，本机 localhost 调试地址除外。')
}

function normalizeModel(value, fallback = DEFAULT_AI_MODEL) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function safeReadJson(filePath) {
  if (!fs.existsSync(filePath)) return {}
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return {}
  }
}

function safeWriteJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(value), 'utf8')
}

function getStorageWarning() {
  if (!safeStorage.isEncryptionAvailable()) {
    return '当前系统没有可用的安全存储，无法保存 API Key。'
  }
  if (
    typeof safeStorage.getSelectedStorageBackend === 'function'
    && safeStorage.getSelectedStorageBackend() === 'basic_text'
  ) {
    return '当前 Linux 环境使用 basic_text 存储后端，安全性弱于系统密钥环。'
  }
  return undefined
}

function getProviderError(status, payload) {
  const providerMessage = payload && payload.error && typeof payload.error.message === 'string'
    ? payload.error.message.trim()
    : ''
  if (providerMessage) return providerMessage
  if (status === 401 || status === 403) return 'AI 服务认证失败，请检查 API Key。'
  if (status === 429) return 'AI 服务请求受限或额度不足，请稍后再试。'
  if (status >= 500) return 'AI 服务暂时不可用，请稍后再试。'
  return 'AI 生成失败，请稍后再试。'
}

async function readProviderPayload(res) {
  try {
    return await res.json()
  } catch {
    return {}
  }
}

function normalizeTaskStatus(value) {
  const status = typeof value === 'string' ? value.toUpperCase() : ''
  if (status === 'PROCESSING' || status === 'SUCCESS' || status === 'FAIL') return status
  return 'UNKNOWN'
}

function extractImageUrls(input, out = new Set()) {
  if (!input) return out
  if (Array.isArray(input)) {
    for (const item of input) extractImageUrls(item, out)
    return out
  }
  if (typeof input !== 'object') return out

  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string') {
      const lcKey = key.toLowerCase()
      const text = value.trim()
      if (
        text.startsWith('http')
        && (
          lcKey === 'url'
          || lcKey.endsWith('_url')
          || lcKey.includes('image')
          || lcKey.includes('media')
        )
      ) {
        out.add(text)
      }
      continue
    }
    extractImageUrls(value, out)
  }

  return out
}

function createAiSettingsService({ userDataDir }) {
  const settingsPath = path.join(userDataDir, 'ai-settings.json')
  const state = {
    encryptedApiKey: '',
    baseUrl: DEFAULT_AI_BASE_URL,
    model: DEFAULT_AI_MODEL,
    imageModel: DEFAULT_AI_IMAGE_MODEL,
    ...safeReadJson(settingsPath),
  }

  function persist() {
    safeWriteJson(settingsPath, {
      encryptedApiKey: state.encryptedApiKey || '',
      baseUrl: assertSafeBaseUrl(state.baseUrl),
      model: normalizeModel(state.model, DEFAULT_AI_MODEL),
      imageModel: normalizeModel(state.imageModel, DEFAULT_AI_IMAGE_MODEL),
    })
  }

  function encryptApiKey(apiKey) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('当前系统没有可用的安全存储，无法保存 API Key。')
    }
    return safeStorage.encryptString(apiKey).toString('base64')
  }

  function decryptApiKey() {
    if (!state.encryptedApiKey) return ''
    if (!safeStorage.isEncryptionAvailable()) return ''
    try {
      return safeStorage.decryptString(Buffer.from(state.encryptedApiKey, 'base64'))
    } catch {
      return ''
    }
  }

  function getBuiltInApiKey() {
    const envValue = process.env.SHICI_BIGMODEL_API_KEY || process.env.AI_API_KEY || ''
    return typeof envValue === 'string' ? envValue.trim() : ''
  }

  function getStatus() {
    const warning = getStorageWarning()
    const hasStored = Boolean(decryptApiKey())
    const hasBuiltIn = Boolean(getBuiltInApiKey())
    return {
      hasApiKey: hasStored || hasBuiltIn,
      baseUrl: normalizeBaseUrl(state.baseUrl),
      model: normalizeModel(state.model, DEFAULT_AI_MODEL),
      imageModel: normalizeModel(state.imageModel, DEFAULT_AI_IMAGE_MODEL),
      source: 'desktop',
      editable: safeStorage.isEncryptionAvailable(),
      secure: safeStorage.isEncryptionAvailable() && warning === undefined,
      warning,
    }
  }

  function saveSettings(input) {
    if (!input || typeof input !== 'object') {
      throw new Error('AI 设置格式不正确。')
    }
    const nextKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : ''
    if (nextKey) state.encryptedApiKey = encryptApiKey(nextKey)
    state.baseUrl = assertSafeBaseUrl(input.baseUrl)
    state.model = normalizeModel(input.model, DEFAULT_AI_MODEL)
    state.imageModel = normalizeModel(input.imageModel, DEFAULT_AI_IMAGE_MODEL)
    persist()
    return getStatus()
  }

  function clearSettings() {
    state.encryptedApiKey = ''
    state.baseUrl = DEFAULT_AI_BASE_URL
    state.model = DEFAULT_AI_MODEL
    state.imageModel = DEFAULT_AI_IMAGE_MODEL
    persist()
    return getStatus()
  }

  function getPrivateSettings(override = {}) {
    const overrideKey = typeof override.apiKey === 'string' ? override.apiKey.trim() : ''
    const apiKey = overrideKey || decryptApiKey() || getBuiltInApiKey()
    if (!apiKey) throw new Error('请先到“我的”页配置 API Key。')
    return {
      apiKey,
      baseUrl: assertSafeBaseUrl(override.baseUrl || state.baseUrl),
      model: normalizeModel(override.model || state.model, DEFAULT_AI_MODEL),
      imageModel: normalizeModel(override.imageModel || state.imageModel, DEFAULT_AI_IMAGE_MODEL),
    }
  }

  async function requestChatCompletion(settings, messages, maxTokens = 900) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const baseUrl = assertSafeBaseUrl(settings.baseUrl)
      const normalizedModel = normalizeModel(settings.model, DEFAULT_AI_MODEL)
      const isDeepSeekStyle = /deepseek/i.test(normalizedModel)
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${settings.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: normalizedModel,
          messages: Array.isArray(messages) ? messages : [],
          temperature: isDeepSeekStyle ? 0.3 : 0.35,
          top_p: isDeepSeekStyle ? 0.95 : 0.9,
          max_tokens: maxTokens,
        }),
        signal: controller.signal,
      })

      const payload = await readProviderPayload(res)
      if (!res.ok) throw new Error(getProviderError(res.status, payload))
      const text = payload && payload.choices && payload.choices[0]?.message?.content?.trim()
      if (!text) throw new Error('AI 没有返回可用内容，请重新生成。')
      return { text, model: normalizedModel }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('AI 生成超时，请稍后再试。')
      }
      throw error
    } finally {
      clearTimeout(timer)
    }
  }

  async function requestImageTask(settings, payload = {}) {
    const prompt = typeof payload.prompt === 'string' ? payload.prompt.trim() : ''
    if (!prompt) throw new Error('图片提示词不能为空。')

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const baseUrl = assertSafeBaseUrl(settings.baseUrl)
      const res = await fetch(`${baseUrl}/async/images/generations`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${settings.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: normalizeModel(payload.model || settings.imageModel, DEFAULT_AI_IMAGE_MODEL),
          prompt,
          size: typeof payload.size === 'string' && payload.size.trim() ? payload.size.trim() : '1024x1024',
          quality: 'hd',
          watermark_enabled: payload.watermarkEnabled === true,
          user_id: typeof payload.userId === 'string' ? payload.userId.trim().slice(0, 128) : undefined,
        }),
        signal: controller.signal,
      })
      const body = await readProviderPayload(res)
      if (!res.ok) throw new Error(getProviderError(res.status, body))

      const taskId = typeof body.id === 'string' ? body.id.trim() : ''
      if (!taskId) throw new Error('生图任务创建失败，未返回任务 ID。')

      return {
        id: taskId,
        requestId: typeof body.request_id === 'string' ? body.request_id : taskId,
        taskStatus: normalizeTaskStatus(body.task_status),
        model: normalizeModel(body.model || payload.model || settings.imageModel, DEFAULT_AI_IMAGE_MODEL),
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('生图请求超时，请稍后再试。')
      }
      throw error
    } finally {
      clearTimeout(timer)
    }
  }

  async function queryAsyncResult(settings, taskId) {
    const id = typeof taskId === 'string' ? taskId.trim() : ''
    if (!id) throw new Error('缺少任务 ID。')

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const baseUrl = assertSafeBaseUrl(settings.baseUrl)
      const res = await fetch(`${baseUrl}/async-result/${encodeURIComponent(id)}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${settings.apiKey}`,
        },
        signal: controller.signal,
      })
      const body = await readProviderPayload(res)
      if (!res.ok) throw new Error(getProviderError(res.status, body))
      const imageUrls = [...extractImageUrls(body)]
      return {
        id: typeof body.id === 'string' ? body.id : id,
        requestId: typeof body.request_id === 'string' ? body.request_id : id,
        taskStatus: normalizeTaskStatus(body.task_status),
        model: normalizeModel(body.model || state.imageModel, DEFAULT_AI_IMAGE_MODEL),
        imageUrls,
        raw: body,
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('查询生图结果超时，请稍后再试。')
      }
      throw error
    } finally {
      clearTimeout(timer)
    }
  }

  async function generatePoem(payload) {
    const settings = getPrivateSettings()
    return requestChatCompletion(settings, payload && payload.messages)
  }

  async function createImageTask(payload) {
    const settings = getPrivateSettings(payload || {})
    return requestImageTask(settings, payload || {})
  }

  async function getAsyncResult(taskId) {
    const settings = getPrivateSettings()
    return queryAsyncResult(settings, taskId)
  }

  async function testSettings(input = {}) {
    const settings = getPrivateSettings(input)
    await requestChatCompletion(
      settings,
      [
        { role: 'system', content: '你是连通性测试助手。' },
        { role: 'user', content: '请只回复 OK。' },
      ],
      16
    )
    return { ok: true, message: '连接测试通过。' }
  }

  return {
    getStatus,
    saveSettings,
    clearSettings,
    generatePoem,
    createImageTask,
    getAsyncResult,
    testSettings,
  }
}

module.exports = { createAiSettingsService }

