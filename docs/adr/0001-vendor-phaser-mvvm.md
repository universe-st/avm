# ADR-0001：把 phaser-mvvm 源码复制进仓库

- 状态：Accepted
- 日期：2026-10-24

## 背景

项目要长期依赖 phaser-mvvm，并且预计会改它（输入、触摸、返回键、性能）。上游以源码 TS 导出（`exports` 指向 `src/index.ts`），Vite 可直接编译。

## 决策

把 `packages/{core,layout,phaser,widgets}`、`tsconfig.base.json`、`LICENSE` 复制到 `vendor/phaser-mvvm/`，作为第一方代码纳入 pnpm workspace：

```yaml
packages:
  - 'vendor/phaser-mvvm/packages/*'
```

不使用 git submodule，避免「以为不可改」；也不在 npm 上发布私有分支。

## 后果

- 正面：可直接改；构建无需预构建 dist；单测可跑；升级路径是 diff + 手工合并。
- 负面：与上游漂移；每次改动要记 `PATCHES.md`；升级要跑框架测试。
- 约束：`UPSTREAM.md` 固定来源 commit；`PATCHES.md` 记录每处改动与原因。

## 相关

- `vendor/phaser-mvvm/UPSTREAM.md`
- `vendor/phaser-mvvm/PATCHES.md`
- `docs/ARCHITECTURE.md`
