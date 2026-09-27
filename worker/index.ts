/**
 * Worker 入口。
 *
 * 只管两件事：
 *   1. `/api/*` —— 联机。开房、连房间（WebSocket 转交给对应的 Durable Object）
 *   2. 其余全部 —— 原样交给静态资源（就是原来那个纯静态站，一点没变）
 *
 * ⚠️ **单机模式完全不经过这里。** 联机挂了、免费额度用光了、Cloudflare 抽风了，
 * 一个人玩的部分照常работа —— 这是有意的：多人是加法，不能变成单机的前置依赖。
 */
import { CODE_ICONS, CODE_LEN, isValidCode } from '../src/net/protocol'
import { Room, type Env } from './room'

export { Room }

/** 随机一个房间号（存的是下标，不是 emoji 本身 —— 下标到哪儿都一样） */
function randomCode(): string {
  const out: number[] = []
  for (let i = 0; i < CODE_LEN; i++) out.push(Math.floor(Math.random() * CODE_ICONS.length))
  return out.join('-')
}

async function freshCode(env: Env): Promise<string> {
  /* 1728 种组合，同时在玩的房间撑死几个，撞号概率极低；
     但撞上就是「进了别人家的房间」，所以还是查一下。查 6 次还撞就认了。 */
  for (let i = 0; i < 6; i++) {
    const code = randomCode()
    const stub = env.ROOM.get(env.ROOM.idFromName(code))
    const res = await stub.fetch('https://room/peek')
    const { occupied } = (await res.json()) as { occupied: boolean }
    if (!occupied) return code
  }
  return randomCode()
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)

    if (url.pathname === '/api/new') {
      return Response.json({ code: await freshCode(env) })
    }

    const m = url.pathname.match(/^\/api\/room\/([^/]+)\/connect$/)
    if (m) {
      const code = decodeURIComponent(m[1])
      // 别信客户端传上来的东西：房间号格式不对就直接挡掉
      if (!isValidCode(code)) return new Response('bad code', { status: 400 })
      const stub = env.ROOM.get(env.ROOM.idFromName(code))
      return stub.fetch(new Request('https://room/connect', req))
    }

    if (url.pathname.startsWith('/api/')) return new Response('not found', { status: 404 })

    // 其余交给静态资源
    return env.ASSETS.fetch(req)
  },
}
