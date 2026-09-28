/**
 * **workers.dev 的入口** —— 也是 `Room` 这个 Durable Object 的**唯一定义处**。
 *
 * 这个部署有两个身份，别混：
 *   1. **房间的"房子"**。`Room` 类定义在这里，Pages 那个域名只是绑过来用。
 *      ⚠️ **所以这个 Worker 不能删。** 就算以后大家都只用 pages.dev，
 *      删掉它 = 所有房间的实现没了 = 联机全挂。
 *   2. 一个能直接玩的域名（开发和备用）。中国大陆连不上，日常给朋友的是 pages.dev。
 *
 * 路由本身在 `app.ts`，两个部署共用 —— 这里只负责"把 Room 带上"。
 *
 * ⚠️ **单机模式完全不经过这里。** 联机挂了、免费额度用光了、Cloudflare 抽风了，
 * 一个人玩的部分照常工作 —— 这是有意的：多人是加法，不能变成单机的前置依赖。
 */
import { handleRequest } from './app'
import { Room, type Env } from './room'

export { Room }

export default {
  fetch(req: Request, env: Env): Promise<Response> {
    return handleRequest(req, env)
  },
}
