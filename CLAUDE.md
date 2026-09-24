# CLAUDE.md

本文件为 Claude Code 在此仓库工作时提供指引。
创建：2026-09-23（项目重启，旧 uni-app 版本已废弃）

## 项目是什么

给一个 5-6 岁小朋友做的桌游/卡牌游戏合集，在 iPad 上玩。

- **早期（当前）**：单人游戏 + 和规则 AI 对战，只给自己孩子玩，不发布
- **长期**：微信登录 + 和朋友联机（触发条件见 `docs/ROADMAP.md`，不提前为它做设计妥协）

设计与技术方案：`docs/DESIGN.md`　排期与验收：`docs/ROADMAP.md`

## 技术栈

Vue 3 + TypeScript + Vite，纯前端 PWA（无后端）。iPad Safari 打开后"添加到主屏幕"即可全屏离线玩。

状态管理 Pinia，本地存储用 localStorage。

## 常用命令

```bash
npm install
npm run dev         # 开发服务器（已开 host:true，iPad 可用局域网地址直接打开实测）
npm run build       # 类型检查 + 产出 dist/（含 PWA service worker）
npm run preview     # 预览构建产物
npm run test        # 单元测试
npm run test:watch  # 单元测试 watch 模式
npm run typecheck   # 只做类型检查
```

**线上地址**（两个，内容一致）：
- 主站 https://play.xiaotangyuan.workers.dev （Cloudflare）—— `npm run deploy` 手动发
- 镜像 https://hyyh1989.github.io/play_with_friends/ （GitHub Pages）—— 推到 main 自动发

**为什么要两个**：`workers.dev` 这个域名在某些网络下被整域名屏蔽（常被拿来搭反向代理），
韩国的朋友要挂 VPN 才能打开主站。镜像是完全不同的域名，哪个能开用哪个。
镜像挂在 `/play_with_friends/` 子路径下，所以**任何资源路径都不能写死成 `/xxx`**，
要用 `import.meta.env.BASE_URL` 前缀（音频就踩过这个坑）。

账号子域名是 `xiaotangyuan`，以后每个应用都是
`<应用名>.xiaotangyuan.workers.dev`；本应用线上名叫 `play`（见 wrangler.jsonc），
和仓库名 play_with_friends 不同是有意缩短。

**在 iPad 上实测**：跑 `npm run dev`，终端会打印一个 Network 地址
（形如 `http://192.168.x.x:5173/`），iPad 和 Mac 连同一个 WiFi，
Safari 打开这个地址 → 分享菜单 → 添加到主屏幕。

## 目录约定

```
src/
  core/              # 与具体游戏无关的地基
    game-registry.ts # 游戏注册表：加新游戏只在这里登记
    types.ts         # GameModule / GameState / GameAction 等接口
    audio.ts         # 音效与语音播放
    storage.ts       # localStorage 读写
  games/
    memory/          # 翻牌配对
      rules.ts       # 纯函数规则引擎（可单测，不碰 UI）
      ai.ts          # 纯函数 AI：chooseAction(state, difficulty) => action
      index.vue      # 游戏界面
      meta.ts        # 元信息（名称、图标、人数、单局时长）
    snakes/          # 蛇梯棋
    uno/             # UNO（完整规则，牌组可配置以调难度）
  views/             # 首页、结算页、家长入口
  assets/
    audio/           # 预生成的语音与音效（不做运行时 TTS）
    images/
docs/
```

## 铁律（违反会直接伤害到孩子的体验）

1. **零阅读依赖**：任何界面把文字全部移除后仍然可操作。必要的文字一律配语音。
2. **点按优先**：不要求拖拽完成核心操作；触控目标 ≥ 80px，可点区域大于视觉区域。
3. **规则引擎必须是纯函数**：`(state, action) => newState`，不可变、不碰 DOM、不读全局。
   这是单元测试、AI 试算、以及将来联机做服务端校验的共同前提。旧版 UNO 用可变类状态，
   导致既难测也无法联机——不要重复这个错误。
4. **不做失败叙事**：没有"你输了"，只有"再来一次"。不做排行榜、倒计时压力、连败提示。
5. **AI 必须会犯错**：难度通过"故意选次优解的概率"调节，而不是搜索深度。孩子需要能赢。
6. **永不卡死**：任何状态下都有明显高亮指出"下一步点哪里"。
7. **无广告、无内购、无外链、无陌生人社交。**

## 踩过的坑

**`<style scoped>` 只隔离组件之间，不隔离组件内部。** 同一个 `.vue` 文件里两处用了
同一个类名就会互相污染。2026-09-23 实际中招：HUD 的返回按钮和卡片背面都叫 `.back`，
返回按钮的 `width:56px; height:56px` 把卡背压成了左上角一个小方块（`inset:0` 拦不住，
宽高和 inset 同时存在时宽高优先）。**通用词（back / front / card / item / title）
要加前缀**：`.exit-btn`、`.card-side.is-back`。

**通用类名要加前缀**（同一个坑第二次犯）：指示手指原本叫 `.hand`，和 UNO 的手牌
容器撞名。scoped 样式不会串，但调试时选择器分不清是哪个。现在叫 `.coach-hand`。

**绝对定位元素的百分比 `padding` 是按【包含块】算的，不是按自己。** 2026-09-24 中招：
四子棋每个格子写 `padding: 7%` 想给棋子留点边，结果 7% 是按整块棋盘（685px）算的
= 48px，把 98px 的格子吃得只剩 2px，棋子小成一个看不见的点。**要按自身留边就用
`inset` 百分比**（`inset` 才是按这个元素的包含块 = 格子本身算的），
或者干脆给子元素 `position:absolute; inset:8%`。

**用 `cq*` 单位前先确认容器是谁、有多大。** 同一个 `.chip` 既出现在棋盘格子里又出现在
HUD 里，把 `container-type` 放在 `.chip` 自己身上，头像就永远是"棋子宽度的 58%"，
不用为每处写一遍 clamp 覆盖。容器塌了的话 `cqw` 会静默算成 0 —— 看到字号异常先量容器。

**`aspect-ratio` 只认宽高里的一个，另一边会溢出。** 写 `width:100%` 的棋盘在横屏算出
比屏幕还高、写 `height:100%` 的在竖屏算出比屏幕还宽（右边一列被切掉），
`max-width`/`max-height` 都拦不住。要同时被两边卡住就显式取小的那个：
父元素 `container-type: size`，自己 `width: min(100cqw, 100cqh * 7 / 6)`。

**图形化的选项必须真的看得出区别。** 三个牌数选项一开始画在同样大小的框里，4/6/8 对牌
看上去几乎一模一样 —— 对不认字的孩子等于没有选项。改成方块大小固定、整块随牌数长高。

## 明确不做的事（第一阶段）

登录、注册、个人资料编辑、游戏大厅、房间列表、好友系统、排行榜、成就系统。

旧版本做了这些，且是照成人小程序的思路做的——这是重启的主要原因。孩子打开 iPad 应该
**直接看到游戏**，不是先看到一个登录页。玩家身份在阶段一只是本地存的一个头像选择。

## 用户背景

**用户是产品经理，不写代码。** 所有代码实现委托给 Claude。

- 先讲结论和影响，再讲技术细节；不要逐行讲代码
- 给选项时用"方案 A 做到什么、代价是什么"的方式，不要贴 diff 让用户对比
- 中英文都流利；**策略/设计讨论默认中文**，代码标识符和文件路径用英文
- 用户会亲自把 iPad 给孩子玩，观察结果后反馈——这是本项目最重要的验收信号

## 协作约定

- **前端改动由 Claude 自己启动 dev server 并在浏览器里验证**（这是 Web 项目，与用户另一个
  quant_system 项目的约定不同）。涉及真机手感的（多点触控、iPad 横屏、添加到主屏）需要
  用户在 iPad 上实测。
- 每个阶段完成后，**验收标准是"孩子能不能自己玩下去"，不是"功能做完了"**。
- git：commit / push 由 Claude 代为执行，但**只在用户明确要求时才 push**。
