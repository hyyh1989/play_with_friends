import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { read, write, clearAll } from '../core/storage'
import { setVoiceLocale, setVolume } from '../core/audio'
import { i18n, DEFAULT_LOCALE, type LocaleCode } from '../i18n'
import type { Difficulty } from '../core/types'
import type { CoachProgress } from '../games/uno/coach'

/** UNO 牌组等级：用"牌组里放哪些牌"调难度，见 docs/DESIGN.md 5.3 */
export type UnoLevel = 1 | 2 | 3 | 4

export const AVATARS = ['🐻', '🐰', '🐱', '🦊', '🐼', '🐯', '🐶', '🐨'] as const

export const useSettingsStore = defineStore('settings', () => {
  const locale = ref<LocaleCode>(i18n.global.locale.value as LocaleCode)
  const volume = ref(read('volume', 0.8))
  const avatar = ref(read('avatar', AVATARS[0] as string))
  const difficulty = ref<Difficulty>(read('difficulty', 'easy' as Difficulty))
  /** 新手辅助：高亮可以点的牌。默认开，玩熟了可以关掉（可撤掉的脚手架） */
  const assistHighlight = ref(read('assistHighlight', true))
  const unoLevel = ref<UnoLevel>(read('unoLevel', 1 as UnoLevel))
  /** 游戏时长提醒，单位分钟；0 = 不提醒 */
  const playtimeReminder = ref(read('playtimeReminder', 0))
  /** UNO 教学引导总开关 */
  const tutorialEnabled = ref(read('tutorialEnabled', true))
  /** 每条规则已经做对几次。到 MASTERY 就不再提示（见 games/uno/coach.ts） */
  const coachProgress = ref<CoachProgress>(read('coachProgress', {} as CoachProgress))

  watch(locale, (value) => {
    i18n.global.locale.value = value
    setVoiceLocale(value)
    write('locale', value)
  })
  watch(volume, (value) => {
    setVolume(value)
    write('volume', value)
  })
  watch(avatar, (value) => write('avatar', value))
  watch(difficulty, (value) => write('difficulty', value))
  watch(assistHighlight, (value) => write('assistHighlight', value))
  watch(unoLevel, (value) => write('unoLevel', value))
  watch(playtimeReminder, (value) => write('playtimeReminder', value))
  watch(tutorialEnabled, (value) => write('tutorialEnabled', value))
  watch(coachProgress, (value) => write('coachProgress', value), { deep: true })

  function reset(): void {
    clearAll()
    locale.value = DEFAULT_LOCALE
    volume.value = 0.8
    avatar.value = AVATARS[0]
    difficulty.value = 'easy'
    assistHighlight.value = true
    unoLevel.value = 1
    playtimeReminder.value = 0
    tutorialEnabled.value = true
    coachProgress.value = {}
  }

  /** 家长端的"重新开始教学"：清掉熟练度，引导会重新出现 */
  function restartTutorial(): void {
    coachProgress.value = {}
    tutorialEnabled.value = true
  }

  return {
    locale,
    volume,
    avatar,
    difficulty,
    assistHighlight,
    unoLevel,
    playtimeReminder,
    tutorialEnabled,
    coachProgress,
    restartTutorial,
    reset,
  }
})
