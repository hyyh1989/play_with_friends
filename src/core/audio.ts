/**
 * 音频系统。
 *
 * 两个硬约束：
 * 1. iOS 要求首次播放必须由用户触摸触发，否则 AudioContext 是 suspended 状态。
 *    所以首页有一次"点击开始"的交互来 unlock()。
 * 2. 设计原则要求每次触摸 100ms 内有听觉反馈 —— 所以用 WebAudio 而非
 *    HTMLAudioElement（后者首次播放有明显延迟），且音效预加载。
 *
 * 语音走 speak()，按当前语言解析到 {base}audio/voice/{locale}/{key}.wav。
 * 缺文件时静默跳过 —— 阶段 0 只有音效、没有语音，其他语言的语音资产也还是空的，
 * 界面不能因为缺音频就不能用。
 */

export type SfxKey = 'tap' | 'success' | 'flip' | 'celebrate' | 'nope'

/*
 * 路径必须带上构建时的 base，不能写死成 /audio/...。
 * 这个站同时部署在两个地方：Cloudflare 在根路径，GitHub Pages 在
 * /play_with_friends/ 子路径下。写死绝对路径的话镜像版所有音频都是 404。
 */
const BASE = import.meta.env.BASE_URL

const SFX_FILES: Record<SfxKey, string> = {
  tap: `${BASE}audio/sfx/tap.wav`,
  flip: `${BASE}audio/sfx/flip.wav`,
  success: `${BASE}audio/sfx/success.wav`,
  celebrate: `${BASE}audio/sfx/celebrate.wav`,
  nope: `${BASE}audio/sfx/nope.wav`,
}

/*
 * 同一时刻只允许一句语音。
 * 首页点游戏卡片会念游戏名，进游戏又会念"要我教你玩吗" —— 两句会叠在一起
 * （用户实测反馈）。现在新的一句会掐掉旧的，voiceRemaining() 则让调用方
 * 可以选择"等上一句说完再说"。
 */
let currentVoice: AudioBufferSourceNode | null = null
let voiceEndsAt = 0
/** 正在加载中的语音数。只看"还要播多久"是不够的 —— 上一句可能还没加载完就被问了 */
let voiceLoading = 0

let ctx: AudioContext | null = null
let masterGain: GainNode | null = null
let unlocked = false
let voiceLocale = 'zh-CN'
const buffers = new Map<string, AudioBuffer>()
/** 记住取不到的文件，避免每次播放都重新请求一遍 404 */
const missing = new Set<string>()

export function setVoiceLocale(locale: string): void {
  voiceLocale = locale
}

export function setVolume(volume: number): void {
  if (masterGain) masterGain.gain.value = Math.max(0, Math.min(1, volume))
}

export function isUnlocked(): boolean {
  return unlocked
}

/** 必须在用户触摸事件里调用 */
export async function unlock(volume = 1): Promise<void> {
  if (unlocked) return
  try {
    const Ctor = window.AudioContext ?? (window as any).webkitAudioContext
    if (!Ctor) return
    ctx = new Ctor()
    masterGain = ctx.createGain()
    masterGain.gain.value = volume
    masterGain.connect(ctx.destination)

    // 播一段无声 buffer，这是 iOS 解锁音频的标准做法
    const silent = ctx.createBuffer(1, 1, 22050)
    const source = ctx.createBufferSource()
    source.buffer = silent
    source.connect(masterGain)
    source.start(0)

    if (ctx.state === 'suspended') await ctx.resume()
    unlocked = true
    await preloadSfx()
  } catch {
    // 音频不可用不应该让游戏玩不了
    unlocked = false
  }
}

async function load(url: string): Promise<AudioBuffer | null> {
  if (!ctx || missing.has(url)) return null
  const cached = buffers.get(url)
  if (cached) return cached
  try {
    const res = await fetch(url)
    if (!res.ok) {
      missing.add(url)
      return null
    }
    const buffer = await ctx.decodeAudioData(await res.arrayBuffer())
    buffers.set(url, buffer)
    return buffer
  } catch {
    missing.add(url)
    return null
  }
}

async function preloadSfx(): Promise<void> {
  await Promise.all(Object.values(SFX_FILES).map(load))
}

function playBuffer(buffer: AudioBuffer, rate = 1): AudioBufferSourceNode | null {
  if (!ctx || !masterGain) return null
  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.playbackRate.value = rate
  source.connect(masterGain)
  source.start(0)
  return source
}

/**
 * 播音效。同步返回，不 await —— 触摸反馈不能等网络。
 * 预加载过的音效走内存里的 buffer，延迟可忽略。
 */
export function playSfx(key: SfxKey, rate = 1): void {
  if (!unlocked) return
  const url = SFX_FILES[key]
  const buffer = buffers.get(url)
  if (buffer) {
    playBuffer(buffer, rate)
  } else {
    void load(url).then((b) => b && playBuffer(b, rate))
  }
}

/**
 * 播语音。**会掐掉正在播的上一句**，保证任何时候只有一个人在说话。
 * 缺文件静默跳过（某些语言的资产可能还没做）。
 * 返回这段语音有多长（秒），教学导览靠它决定什么时候进下一拍；缺文件返回 0。
 */
export async function speak(key: string): Promise<number> {
  if (!unlocked) return 0
  voiceLoading++
  let buffer: AudioBuffer | null
  try {
    buffer = await load(`${BASE}audio/voice/${voiceLocale}/${key}.wav`)
  } finally {
    voiceLoading--
  }
  if (!buffer) return 0
  stopVoice()
  currentVoice = playBuffer(buffer)
  voiceEndsAt = performance.now() + buffer.duration * 1000
  if (currentVoice) currentVoice.onended = () => (currentVoice = null)
  return buffer.duration
}

/** 掐掉正在播的语音 */
export function stopVoice(): void {
  try {
    currentVoice?.stop()
  } catch {
    /* 已经播完了 */
  }
  currentVoice = null
  voiceEndsAt = 0
}

/** 当前这句还要说多久（秒）。 */
export function voiceRemaining(): number {
  return Math.max(0, (voiceEndsAt - performance.now()) / 1000)
}

/**
 * 等到"没有语音在播、也没有语音在加载"。
 *
 * 只看 voiceRemaining 不够：首页刚念完游戏名就跳进游戏，那句可能还在加载，
 * 这时问"还要播多久"会得到 0，结果两句叠在一起（用户实测到的）。
 */
export function whenVoiceIdle(timeoutMs = 6000): Promise<void> {
  const deadline = performance.now() + timeoutMs
  return new Promise((resolve) => {
    const check = () => {
      const idle = voiceLoading === 0 && voiceRemaining() === 0
      if (idle || performance.now() > deadline) resolve()
      else setTimeout(check, 100)
    }
    check()
  })
}
