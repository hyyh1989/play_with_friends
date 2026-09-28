/**
 * **Cloudflare Pages 的入口**，构建后变成 `dist/_worker.js`。
 *
 * 存在的理由只有一个：**中国大陆能不连 VPN 打开 `*.pages.dev`，打不开 `*.workers.dev`。**
 * 小朋友在哪个域名玩都行，朋友只能走 pages.dev。
 *
 * ⚠️ **和 `index.ts` 的唯一区别：这里不 export Room。**
 * Pages 项目**没有能力定义** Durable Object 类，只能绑定已经存在的命名空间 ——
 * 所以 `wrangler.pages.jsonc` 里那条绑定必须带 `script_name: "play"`
 * （指向定义了 `Room` 的那个 Worker）。这是 Pages 和 Workers 的硬性差别，
 * 不带 script_name 会部署失败。
 *
 * 绑到**同一个**命名空间，是「两个域名的人能进同一个房间」的全部秘密 ——
 * 千万别图省事新建一个，那样就是两个互不相通的世界。
 *
 * Pages 的 advanced mode（根目录放 `_worker.js`）会把**所有**请求交给这个函数，
 * 包括静态资源 —— 所以 `app.ts` 末尾那句 `env.ASSETS.fetch(req)` 是必需的，
 * 少了它整个站点一个文件都出不来。
 */
import { handleRequest } from './app'
import type { Env } from './env'

export default {
  fetch(req: Request, env: Env): Promise<Response> {
    return handleRequest(req, env)
  },
}
