export type AiProviderPresetId = 'zhipu-free' | 'deepseek-v4-flash'

export type AiProviderPreset = {
  id: AiProviderPresetId
  label: string
  baseUrl: string
  model: string
  imageModel: string
  note?: string
}

export const AI_PROVIDER_PRESETS: AiProviderPreset[] = [
  {
    id: 'zhipu-free',
    label: '智谱免费（默认）',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4.7-flash',
    imageModel: 'cogview-3-flash',
    note: 'GLM-4.7-Flash + CogView-3-Flash（均为免费模型）',
  },
  {
    id: 'deepseek-v4-flash',
    label: 'DeepSeek V4 Flash（兼容）',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-v4-flash',
    imageModel: 'cogview-3-flash',
    note: 'OpenAI 兼容写法（chat/completions）',
  },
]

export const DEFAULT_PROVIDER_PRESET_ID: AiProviderPresetId = 'zhipu-free'
export const DEFAULT_PROVIDER_PRESET = AI_PROVIDER_PRESETS.find(p => p.id === DEFAULT_PROVIDER_PRESET_ID) || AI_PROVIDER_PRESETS[0]

export const DEFAULT_AI_BASE_URL = DEFAULT_PROVIDER_PRESET.baseUrl
export const DEFAULT_AI_MODEL = DEFAULT_PROVIDER_PRESET.model
export const DEFAULT_AI_IMAGE_MODEL = DEFAULT_PROVIDER_PRESET.imageModel

export function getAiProviderPresetById(id: string | undefined | null): AiProviderPreset | null {
  const value = typeof id === 'string' ? id.trim() : ''
  if (!value) return null
  return AI_PROVIDER_PRESETS.find(item => item.id === value) || null
}

