/**
 * 请求路由 —— **两个部署共用的唯一一份**。
 *
 * ── 为什么要抽出来 ──
 * 现在同一个应用挂在两个域名上：
 *   • `play.xiaotangyuan.workers.dev` —— 定义 `Room` 这个 Durable Object（房间的"房子"）
 *   • `play-with-friends.pages.dev`   —— 中国大陆能直连的那个（朋友用）
 * 两边绑的是**同一个房间命名空间**，所以两个域名上的人能进同一个房间。
 *
 * ⚠️ **路由逻辑只能写在这里。** 抄一份到另一个入口里，就等着两边慢慢长歪 ——
 * 而联机是有协议的，**两边版本不一致会以很难查的方式坏掉**（一边发的动作
 * 另一边不认识，表现是"偶尔卡住"而不是报错）。入口文件只负责"带不带 Room"。
 */
import { CODE_ICONS, CODE_LEN, isValidCode } from '../src/net/protocol'
import type { Env } from './env'

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

export async function handleRequest(req: Request, env: Env): Promise<Response> {
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
}
