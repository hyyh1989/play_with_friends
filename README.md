# Play Together · 一起玩

A small collection of board and card games for 5-6 year olds, played on an iPad.

给 5-6 岁小朋友的桌游/卡牌游戏合集，在 iPad 上玩。

**▶ https://play.xiaotangyuan.workers.dev** — open it on an iPad and "Add to Home Screen".

---

## What this is

A parent-built game collection with one goal: **a child can open it, understand it, and
finish a game on their own** — without an adult explaining the rules, and without ads,
in-app purchases, or engagement loops.

It runs as a PWA: open it in Safari on an iPad, "Add to Home Screen", and it behaves like
an app — fullscreen, offline-capable.

## Status

**Memory Match and Snakes & Ladders are playable.** See [docs/ROADMAP.md](docs/ROADMAP.md).

| Stage | What | State |
|---|---|---|
| 0 | Foundations: PWA shell, game module interface, audio, settings | done |
| 1 | Memory Match — solo or vs AI, 4/6/8 pairs | built, awaiting the real test (a child) |
| 2 | Snakes & Ladders — 2-4 players, ladders and slides | built, awaiting the real test (a child) |
| 3 | UNO (full rules, configurable card set) | planned |

"Built" is not "done" here: a stage is finished when a 5-year-old plays it through without
asking an adult for help.

## Quick start

```bash
npm install
npm run dev      # prints a LAN URL — open it on the iPad, then Add to Home Screen
npm run test     # unit tests for the rules engines
npm run build    # type check + production build with service worker
```

Node 22+. No backend, no accounts, no network calls — everything is local.

## Design rules

These are not style preferences; they come from what a 5-6 year old can actually do.
[docs/DESIGN.md](docs/DESIGN.md) explains the reasoning.

1. **No reading required.** Cover every label and the UI still works. Text is always paired
   with audio.
2. **Tap, don't drag.** Core actions never require precise dragging. Touch targets ≥ 80px.
3. **Rules engines are pure functions** — `(state, action) => newState`. No mutation, no DOM,
   no `Math.random` (randomness comes from a seeded RNG held in the state). This is what makes
   the rules unit-testable, lets the AI simulate moves, and would let a server validate moves
   if online play is ever added.
4. **No failure narrative.** No "you lost", no leaderboards, no countdown pressure.
5. **The AI makes mistakes on purpose.** Difficulty is a probability of choosing a
   deliberately suboptimal move, not search depth. The child needs to be able to win.
6. **Never stuck.** Something on screen always highlights what to tap next.
7. **No ads, no purchases, no external links, no strangers.**

## Adding a game

Implement `GameModule` ([src/core/types.ts](src/core/types.ts)) and register it in
[src/games/index.ts](src/games/index.ts). Nothing in the core needs to change.

```ts
interface GameModule<S, A> {
  meta: GameMeta
  createInitialState(config: GameConfig): S
  applyAction(state: S, action: A): S          // pure
  getLegalActions(state: S, playerId: string): A[]
  currentPlayer(state: S): string | null
  isFinished(state: S): boolean
  getWinner(state: S): string | null
  chooseAiAction(state: S, playerId: string, difficulty: Difficulty): A | null
  component: Component
}
```

## Languages

UI text is in `zh-CN`, `en` and `ko` ([src/i18n/locales](src/i18n/locales)). Add a language by
dropping in a new JSON file and listing it in `SUPPORTED_LOCALES`.

Two caveats:

- **The English and Korean strings were written by an AI and have not been reviewed by a
  native speaker.** Corrections very welcome — especially whether the tone suits a
  5-year-old rather than an adult.
- **Voice audio exists for Chinese only.** Voice clips are pre-generated files under
  `public/audio/voice/{locale}/`, and missing files are skipped silently, so other languages
  simply run without narration. Nothing breaks.

Dialogue will keep changing through stages 1-3 as we watch how the child actually reacts, so
generating voice for every language now would mean redoing it every time.

## Repo layout

```
src/core/      game module interface, seeded RNG, audio, storage
src/games/     one folder per game (rules.ts / ai.ts / index.vue / meta.ts)
src/views/     home, parent settings, result
docs/          DESIGN.md (why it works this way), ROADMAP.md (stages and acceptance)
CLAUDE.md      working agreements for AI coding sessions
```

Built with Vue 3 + TypeScript + Vite. Most of the code is written by Claude; `CLAUDE.md`
holds the conventions it follows.
