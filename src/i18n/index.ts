import { createI18n } from 'vue-i18n'
import zhCN from './locales/zh-CN.json'
import en from './locales/en.json'
import ko from './locales/ko.json'
import { read } from '../core/storage'

export const SUPPORTED_LOCALES = [
  { code: 'zh-CN', label: '中文' },
  { code: 'en', label: 'English' },
  { code: 'ko', label: '한국어' },
] as const

export type LocaleCode = (typeof SUPPORTED_LOCALES)[number]['code']

export const DEFAULT_LOCALE: LocaleCode = 'zh-CN'

function detectLocale(): LocaleCode {
  const saved = read<LocaleCode | null>('locale', null)
  if (saved && SUPPORTED_LOCALES.some((l) => l.code === saved)) return saved
  const nav = navigator.language.toLowerCase()
  if (nav.startsWith('ko')) return 'ko'
  if (nav.startsWith('zh')) return 'zh-CN'
  if (nav.startsWith('en')) return 'en'
  return DEFAULT_LOCALE
}

export const i18n = createI18n({
  legacy: false,
  locale: detectLocale(),
  fallbackLocale: DEFAULT_LOCALE,
  messages: { 'zh-CN': zhCN, en, ko },
})
