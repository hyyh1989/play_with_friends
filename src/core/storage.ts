/**
 * localStorage 读写。
 *
 * 每个访问都包 try/catch：Safari 隐私模式下 localStorage 会直接抛异常，
 * 而"存不了设置"绝不能导致游戏打不开。
 */

const PREFIX = 'pwf:'

export function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function write<T>(key: string, value: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // 存不下就算了
  }
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key)
  } catch {
    /* noop */
  }
}

/** 家长端的"清空记录" */
export function clearAll(): void {
  try {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith(PREFIX))
    keys.forEach((k) => localStorage.removeItem(k))
  } catch {
    /* noop */
  }
}
