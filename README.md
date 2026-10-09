# Kanade + EmDash

保留 Kanade 界面，用 EmDash 管理文章、页面和图片。发布后前台、RSS、站点地图立即更新，无需重建。默认中文，域名 `https://duanap.cn`。

2026-10-09 接入：EmDash core/admin 使用 duanap/emdash 固定提交 `bb448eaf26e76a6d6ff55042f9031222dd010239` 的同源本地包，见 [来源与补丁记录](vendor/manifest.json)。

原始界面来源：Kanade `main` 提交 `4cc05cc61c58abc4f5ff8c3426fea56550f393e5`、EmDash **1.2.0**、Astro **7.3.7**。依赖由锁文件固定。上游：[Kanade](https://github.com/sudoriaa/Kanade-Astro)、[EmDash](https://github.com/emdash-cms/emdash)。保留上游作者和字体资源说明。

## 开发

需要 Node 24、pnpm 10.33.0：

```bash
pnpm install --frozen-lockfile
cp .env.example .env
# 本地将 .env 中 SITE_URL 与 EMDASH_SITE_URL 均改为 http://localhost:4321
pnpm run setup
pnpm dev
```

`setup` 用官方 CLI 生成密钥，导入 24 篇中英日示例文章及 3 个关于页面。已建立的站点不会重放示例；缺少新模型时，`setup` 会要求先显式备份迁移，不覆盖编辑或密钥。`.env` 和 `data/` 不进入 Git。不要随意更换生成的密钥。

后台入口 `/_emdash/admin/`。生产在有效 HTTPS 下完成官方初始化并注册管理员/passkey，没有预置生产账号。生产禁止开发认证绕过变量。

## 写作

在后台 `posts` 中填写标题、摘要、日期、正文、slug、分类和标签，选择 `zh-CN` 后发布。保存草稿不会替换已发布内容，发布后立即生效，撤回后公开文章返回 404。`pages` 管理 `/pages/{slug}/`；`about` 同时是 `/about/` 的正文。

静态 JPEG/PNG 上传后自动生成 WebP，前台正文和上传封面优先使用。默认质量 82、最长边 2560，修正方向、保留透明度及原图。GIF、动画图片、SVG、已有 WebP 保留原格式。限制 10 MiB 和 4000 万像素，转换失败保留原图并记日志。替换、删除和重启检查衍生图有效性。通过 `KANADE_WEBP_QUALITY` 和 `KANADE_IMAGE_MAX_EDGE` 调整设置。

主题、作者、导航和语言在 [src/site.config.json](src/site.config.json)，修改后重建。默认只展示一种语言。友链改为 CMS `friends` 集合，生活/作品/归档入口分别为 `/life/`、`/projects/`、`/archives/`。

会员入口 `/login/`、`/member/`，QQ 参数在后台的 duanap-members 插件设置中维护，回调为 `https://duanap.cn/oauth/qq/callback`，Secret 加密保存。会员与 CMS 管理员身份分开。QQ 登录只返回本站；登录态、资料、收藏和本人评论由服务端会话隔离。真实 QQ 授权需要有效应用与回调配置。

文章、生活、作品支持点赞、收藏和原生评论。留言墙的新留言进入 CMS 审核，站主可在后台新增、编辑、审核和管理留言；审核结果即时可见。本机旧留言保留在本机，不自动上传，删除按钮只作用于本机历史。

后台轮播与备案页脚设置即时生效，空轮播保留原欢迎区域。轮播最多 8 张，支持手机高度、键盘/触摸及焦点、悬停、后台页面和减少动态效果时暂停。地图管理使用本项目真实动态索引，私有页面和 noindex 内容不进入地图。

## 验证与部署

```bash
pnpm exec playwright install --with-deps chromium
pnpm test
pnpm format:check
```

测试包括单元测试、类型检查、生产构建、桌面/手机浏览器及真实 CMS API 和上传流程，使用独立临时数据库。已有 Chromium 可设置 `PLAYWRIGHT_EXECUTABLE_PATH`。

适用于阿里云 2C4G、Ubuntu 24.04、宝塔 12 和 EdgeOne 免费版，单个 Node 服务、SQLite、本地媒体，没有 Docker。见 [完整部署与备份说明](docs/deployment.md) 和 `deploy/`。在 Linux 构建机完成 `pnpm build` 后，把完整运行包部署到服务器再启动服务，需要生产 origin、持久化目录与密钥。

[原始设计](docs/superpowers/specs/2026-10-08-kanade-emdash-design.md) · [Fork 接入设计](docs/superpowers/specs/2026-10-09-emdash-fork-integration-design.md) · [实施记录](docs/implementation-log.md)

已有站点升级先执行只读计划，再在停服务和私有备份条件下显式应用：

```bash
pnpm migrate:fork -- --dry-run --database /absolute/data/emdash.db
pnpm migrate:fork -- --apply --database /absolute/data/emdash.db --key-file /absolute/data/site.env --backup-destination /absolute/private/backup-before-fork
node scripts/build-emdash-fork.mjs --verify
```

数据库、uploads、WebP、site.env 与原加密密钥须作为同一恢复点保留。详见部署文档；不要对生产库运行示例 seed 或覆盖数据库。
