/**
 * 两个部署共用的绑定类型。
 *
 * ⚠️ **单独一个文件，是为了让 `app.ts` 不必 import `room.ts`。**
 * Pages 那份入口（`pages.ts`）**不能**把 `Room` 类打包进去 ——
 * Pages 项目没有能力定义 Durable Object 类（只能绑定别人定义好的）。
 * `Env` 放在这里，两边都只拿类型，拿不到实现。
 */
export interface Env {
  /** 房间。**类定义在 `play` 这个 Worker 里**，Pages 通过 script_name 绑过来 */
  ROOM: DurableObjectNamespace
  /** 静态资源。Workers 和 Pages 都提供这个绑定，名字也一样 */
  ASSETS: Fetcher
}
