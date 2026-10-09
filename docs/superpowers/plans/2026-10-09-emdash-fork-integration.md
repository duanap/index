# EmDash Fork Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for native execution, or superpowers:subagent-driven-development if explicitly selected. Steps use checkbox syntax for tracking.

**Goal:** 将已确认的 duanap/emdash 新增功能接入现有 Kanade 站点并通过隔离回归验证。

**Architecture:** 固定 fork core/admin 与 native 会员插件，沿用 Kanade 的 SSR 内容适配与 Vue 组件。新增项目数据结构通过显式、可重复的升级工具添加；原图转换继续由现有服务端插件完成。

**Tech Stack:** Astro 7.3.7、EmDash 1.2.0、Node 24、pnpm 10.33.0、Vue、React、SQLite、Sharp、Playwright。

**Spec:** `docs/superpowers/specs/2026-10-09-emdash-fork-integration-design.md`

**Execution:** 用户已回复“按计划直接实现”。当前助手在本会话执行，完成后一次独立整体审查；沿用当前目录的 `codex/emdash-fork-integration` 功能分支。保留现有未提交修改，不推送或变更生产数据。

## Global Constraints

- 来源：`bb448eaf26e76a6d6ff55042f9031222dd010239`；core/admin 都为 1.2.0。
- 保留 Kanade 风格、现有文章 URL、配置语言隔离和发布即时可见。
- `KANADE_DATA_DIR`、内容、管理员、上传文件、密钥和历史本机留言不得重置。
- 静态 JPEG/PNG 服务端生成 WebP：质量 82、最长边 2560；保留原字节和现有动画/SVG 策略。
- 单 Node 服务、SQLite、本地磁盘；无新增 Docker、CI 或付费服务。
- 使用独立测试数据；正式数据库迁移与发布需要明确操作范围和恢复点。

## Review Focus

- 同版本官方包与 fork 包混用：core/admin 必须同时解析到固定同源产物。
- 新模型添加中途失败：重复执行不能覆盖原内容或遗留被误判为完成的状态。
- 不同语言、草稿和已撤回目标：公开列表、地图、互动和归档不可泄漏。
- 并发互动、过期会话和恶意 returnTo：结果一致，私有资料不串号，不能越权跳转。
- 轮播/备案 URL、未知媒体和设置部分保存：拒绝危险值并保留不相关设置及原图。

## Task 1: 固定并验证自定义框架包

**Files:** 创建 `scripts/build-emdash-fork.mjs`、`vendor/manifest.json`、`vendor/admin-icons.tsx` 与两个 core/admin 本地 tgz；修改 `package.json`、`pnpm-lock.yaml`、`astro.config.mjs`；测试 `tests/unit/fork-runtime.test.mjs`、`tests/fork-admin.spec.ts`。

**Interfaces:** 产出 `verifyForkPackages(root: string): Promise<void>`，检查来源/版本/哈希与实际 admin 解析；框架产出 fork 的 footerLinks、heroSlides、heroCarousel、messageBoardCollection、trusted raw Cookie 支持。图标兼容入口由 Vite alias 使用。

- [ ] RED：真实安装包中 footerLinks/轮播设置 schema、native 多 Set-Cookie 和自定义后台入口尚不可用；原图上传测试保持有效。
- [ ] 构建脚本只读取固定提交，在独立本机目录按 fork 工具链构建 core/admin；移除两处上传前 WebP 转换调用，并记录专用补丁。
- [ ] 打包同源产物和图标适配，配置本地依赖与 admin override；冻结锁文件安装校验 hash 与解析来源。
- [ ] GREEN：`pnpm test:unit`、`pnpm check`、`pnpm build`；运行 fork 后台与现有上传 CMS 测试，JPEG/PNG 原字节保留，真实 WebP 正常。
- [ ] 提交经过验证的依赖交付及文档，保留其他工作。

## Task 2: 内容模型与安全升级

**Files:** 创建 `seed/features.json`、`scripts/migrate-fork-features.mjs`；修改 `scripts/setup.mjs`、`scripts/seed.mjs`、`scripts/content/seed.ts`、`seed/seed.json`、`package.json`；测试 `tests/unit/feature-migration.test.mjs`。

**Interfaces:** `planFeatureMigration({database: string}): Promise<MigrationPlan>`；`applyFeatureMigration({database: string, uploads: string, keyFile: string, backupDestination: string}): Promise<MigrationResult>`。命令提供 dry-run 和显式 apply，应用结果列出新增结构。内容集合及字段遵循 spec 表格，帖子原结构保持兼容。

- [ ] RED：基线库缺少 life/projects/wall/friends；准备编辑过的原帖子、页面、站点设置和管理员记录，验证迁移不能覆盖它们。
- [ ] 实现 dry-run、备份前置检查和仅添加缺失结构；不兼容现有字段失败。只添加新的缺失初始记录，使用稳定标识。
- [ ] GREEN：`pnpm exec tsx --test tests/unit/feature-migration.test.mjs tests/unit/seed.test.mjs tests/unit/backup.test.mjs`；验证首次、重跑、失败、备份恢复读回、原密钥和内容保持。
- [ ] 生成当前模型的官方类型文件，类型检查与构建通过；提交模型与工具。

## Task 3: 生活、作品、归档与 CMS 友链

**Files:** 创建纯适配 `src/lib/feature-content.ts` 和请求查询 `src/lib/features.ts`、`src/components/content/FeatureCard.astro`、`src/components/content/FeatureList.astro`、共享详情/归档组件与 `src/pages/life/index.astro`、`src/pages/life/[slug].astro`、`src/pages/projects/index.astro`、`src/pages/projects/[slug].astro`、`src/pages/archives/index.astro`、`src/pages/archives/[year]/index.astro`、`src/pages/archives/[year]/[month].astro`；修改 `src/pages/index.astro`、`src/pages/friends.astro`、`src/lib/sitemap.ts`、`src/pages/rss.xml.ts`、导航配置和三个 locale；测试 `tests/unit/feature-content.test.ts`、`tests/features.spec.ts`。

**Interfaces:** `getFeatureEntries(collection: "life" | "projects" | "friends", locals: object): Promise<FeatureEntry[]>`；`getFeatureEntry(collection, slug): Promise<FeatureEntry | undefined>`；`archiveEntries(entries, year?, month?): ArchiveGroup[]`。条目同时保留数据库 ID、slug、locale、日期、SEO、Portable Text 与 media；公开查询通过现有 publicContent 运行。

- [ ] RED：配置语言、跨 100 条游标、草稿/预览、无效日期、撤回、年/月边界、缺失详情的真实 404；危险友链协议被拒绝。
- [ ] 接入 SSR 查询与 Kanade 卡片，详情使用当前 Content 渲染器；归档整合帖子和生活条目；原文章列表与筛选保持兼容。
- [ ] CMS 友链渲染现有卡片并按 order 排列，提供明确空状态。
- [ ] RSS/sitemap 纳入可公开的新内容，维持旧入口与语言/noindex 规则。
- [ ] GREEN：相关单元测试、`pnpm test:e2e`、`pnpm check` 与 build；桌面/手机及无 JavaScript 阅读正常；提交页面与内容适配。

## Task 4: 会员插件与资料中心

**Files:** 创建 `src/plugins/members/index.ts`、`src/plugins/members/qq-navigation.ts`、`src/lib/members.ts`、`src/pages/login.astro`、`src/pages/member.astro`、`src/pages/oauth/qq/callback.ts`、会员表单组件；修改 `astro.config.mjs`、导航和 locale；测试 `tests/member-auth.spec.ts`、`tests/member-profile.spec.ts`。

**Interfaces:** 插件 descriptor 使用规范绝对 entrypoint 与 native 格式；`getMemberFromRequest(request: Request): Promise<PublicMember | null>`；客户端 auth/status、auth/qq/start、auth/qq/callback、auth/logout、member/overview、member/profile 保持来源路由语义。PublicMember 不返回 QQ openid、Secret 或会话值。

- [ ] RED：真实 SQLite + 模拟 QQ 服务验证 state 双校验、过期/重用、跨站 returnTo、会话 Cookie 转发、登出与 CSRF；未登录/禁用会员不可获取私有数据。
- [ ] 迁移固定源码 native 插件，设置本项目 origin、回调入口、默认头像和 descriptor；会员 SSR helper 连接同一插件上下文。
- [ ] 实现 Kanade 登录与资料中心，表单使用安全 DOM；保留手动修改资料，收藏/本人评论独立分页。
- [ ] GREEN：会员测试、类型检查、生产构建；通过浏览器会话证明 Cookie 与私有分页，不创建生产测试管理员；提交插件及会员页面。

## Task 5: 点赞收藏、评论与同步留言墙

**Files:** 创建 `src/components/members/Activity.vue`、`src/components/comments/Comments.astro`、`src/lib/message-board.ts`；修改 `src/pages/posts/[...id].astro`、生活/作品详情、`src/pages/messages.astro`、`src/components/Guestbook.vue`、会员插件与 locale；测试 `tests/member-activity.spec.ts`、`tests/message-board.spec.ts`。

**Interfaces:** `resolveMessageBoard(locals): Promise<{id: string; slug: string} | null>` 使用最早已发布的配置语言 wall 条目；互动 API 用 collection + 数据库 ID。后端持久化留言 DTO 与本地历史数据分开，不自动上传历史 localStorage。

- [ ] RED：公开目标存在性/语言/发布状态；重复与并发 toggle；点赞和收藏计数独立；留言容器改名；待审核留言与滚动副本无泄漏；匿名提交不能绕过审核。
- [ ] 页面接入 native 插件互动和原生评论，保留 Kanade 色彩卡片与移动端行为。
- [ ] 后台启用 messageBoardCollection；站主可新增、编辑和管理留言，访客新提交按审核流程公开。
- [ ] 对超过 100 条的会员列表与批量管理验证分页、部分失败刷新和权限。
- [ ] GREEN：互动/留言浏览器与真实 API 测试，现有阅读与媒体回归保持通过；提交互动和评论集成。

## Task 6: 轮播、备案页脚与地图管理

**Files:** 创建 `src/lib/site-settings.ts`、`src/components/header/HeroCarousel.vue`、`src/components/FooterLinks.astro`；修改 `src/layouts/BaseLayout.astro`、`src/components/header/Welcome.astro`、`src/pages/index.astro`、地图路由与 locale；测试 `tests/unit/site-settings.test.ts`、`tests/site-settings.spec.ts`。

**Interfaces:** `getKanadeSiteSettings(locals: object): Promise<SiteSettings>` 每请求复用；`heroSlides(settings, fallback): HeroSlide[]` 最大 8；媒体 URL 经过当前 webpUrl，链接经过协议验证。

- [ ] RED：后台保存轮播后公开页面即生效，常规设置保存不清空轮播；非法链接和媒体失败回退；空轮播、单图、桌面/手机高度、减少动态效果、焦点和隐藏暂停。
- [ ] 按 fork 字段实现 Vue 轮播和 Kanade 页脚，空设置使用当前界面；备案内容只显示真实设置。
- [ ] 地图管理按钮对接实际存在的动态索引/子地图，并保留管理权限、CSRF 和 noindex 规则。
- [ ] GREEN：设置/交互测试、桌面/手机无溢出检查，上传原图和 WebP 回归；提交设置与界面集成。

## Task 7: 整体验证、审查与交付

**Files:** 更新 README、implementation-log、deployment 和本次 fork 审核记录；保存包来源、实际命令结果、迁移与回滚说明。

- [ ] 在隔离 Linux 环境执行冻结安装、`pnpm test`、`pnpm format:check`；原有与新增测试全部运行。
- [ ] 验证已有 SQLite 和密钥的非破坏性升级以及同版应用恢复读回；不在正式库上做实验。
- [ ] 最终整体独立审查覆盖 Review Focus；重要发现用 RED→GREEN 修复并跑完整回归。
- [ ] 交付本地集成、测试证据和未完成的外部 QQ/passkey 验收项。提交/推送/生产迁移只在授权范围内执行。
