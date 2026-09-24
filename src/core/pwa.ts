import { ref } from 'vue'
import { registerSW } from 'virtual:pwa-register'

/**
 * 「添加到主屏幕」之后怎么拿到新版本。
 *
 * 踩过的坑（2026-09-24 用户实测）：iPad 上把网页加到主屏幕后，**再也更新不了**。
 * 原因是几件事叠在一起：
 *   1. 项目原来用 registerType: 'autoUpdate'，而且没有引入注册模块 ——
 *      只靠 vite-plugin-pwa 注入 index.html 的那段脚本注册，它**不会**在有新版本时刷新页面
 *   2. 就算新 Service Worker 装上了，当前这次打开看到的仍是旧缓存，要**下一次启动**才生效
 *   3. iOS 上从多任务切回来是「恢复挂起的页面」，根本不算一次新启动 ——
 *      于是那个"下一次"永远不会到来
 *
 * 现在改成 registerType: 'prompt' + 这个模块：
 *   - 新版本装好后**原地等着**，不抢在对局中间接管（换 SW 会换掉预缓存，
 *     正在玩的那一局可能因此裂掉）
 *   - 检测到就把 updateReady 置起来，设置页显示"有新版本"，家长点一下才更新
 *   - 从后台切回前台时主动去问一次服务器，这是 iOS 上唯一可靠的检查时机
 */

/** 装好了、等着被启用的新版本 */
export const updateReady = ref(false)
/** 正在去服务器问 */
export const checking = ref(false)
/** 这个包是什么时候构建的，设置页显示出来，好确认到底更没更上 */
export const BUILD_TIME = __BUILD_TIME__

let registration: ServiceWorkerRegistration | undefined

export function setupPwa(): void {
  registerSW({
    immediate: true,
    onNeedRefresh() {
      updateReady.value = true
    },
    onRegisteredSW(_url, reg) {
      registration = reg
      // 已经有一个装好在等了（上次没更新就关掉了）
      if (reg?.waiting) updateReady.value = true
    },
  })

  // iOS 从多任务切回来不会重新启动，只会触发这个 —— 是那边唯一可靠的检查时机
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void checkForUpdate()
  })
}

/** 给任何一个可能吊死的 promise 套一个上限，到点就当它没成功 */
function withTimeout<T>(task: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([task, new Promise<undefined>((done) => setTimeout(done, ms))])
}

/**
 * 去服务器问一次有没有新版本。返回"有没有"。
 *
 * ⚠️ 这里的每一步都必须有超时。实测中招（2026-09-24）：`registration.update()`
 * 在 iOS 上网络一卡就**永远不返回**，`checking` 于是卡在 true，
 * 而按钮写了 `:disabled="checking"` —— 家长看到"有新版本"的小红点，
 * 按钮却永远点不动。这个函数还挂在 visibilitychange 上，切一次 app 就可能中招。
 */
export async function checkForUpdate(): Promise<boolean> {
  if (!registration || checking.value) return updateReady.value
  checking.value = true
  try {
    await withTimeout(registration.update(), 8000)
    // update() 返回时新版本可能还在装，等它装完
    const installing = registration.installing
    if (installing) {
      await withTimeout(
        new Promise<void>((resolve) => {
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' || installing.state === 'redundant') resolve()
          })
        }),
        8000,
      )
    }
    if (registration.waiting) updateReady.value = true
  } catch {
    // 离线或者服务器没响应 —— 当作"没有新版本"，别打扰家长
  } finally {
    checking.value = false
  }
  return updateReady.value
}

/** 压根没有 Service Worker（普通浏览器 / 注册失败）。这时"检查更新"只能硬刷新 */
export function hasServiceWorker(): boolean {
  return registration !== undefined
}

/**
 * 拿到新版本。**这一步必须不可能失败** —— 它是家长手里唯一的救生索，
 * 一旦它不灵，人就被锁在旧版本里，连"修好了更新按钮"的那一版都拿不到。
 *
 * 所以不走"礼貌"的那条路（给等着的 SW 发 SKIP_WAITING 再等它接管）：
 * 那条路依赖 workbox 内部状态和 controllerchange 事件，任何一环不响应就静默卡住，
 * 从家长的角度就是"点了没反应"。改成直接**把 SW 和缓存全清掉再刷新**：
 * 代价是要重新下载一次预缓存（几 MB，家里 Wi-Fi 几秒），换来的是它不会失败。
 */
export async function applyUpdate(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const all = await withTimeout(navigator.serviceWorker.getRegistrations(), 4000)
      await withTimeout(Promise.all((all ?? []).map((one) => one.unregister())), 4000)
    }
    if ('caches' in window) {
      const names = await withTimeout(caches.keys(), 4000)
      await withTimeout(Promise.all((names ?? []).map((name) => caches.delete(name))), 4000)
    }
  } catch {
    // 清不掉也照样刷新 —— 至少试一次，总比卡在这里强
  }
  window.location.reload()
}
