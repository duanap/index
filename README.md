# Kanade + EmDash

保留 Kanade 界面，用 EmDash 管理文章、页面和图片。发布后前台、RSS、站点地图立即更新，无需重建。默认中文，域名 `https://duanap.cn`。

2026-10-08 核实版本：Kanade `main` 提交 `4cc05cc61c58abc4f5ff8c3426fea56550f393e5`、EmDash **1.2.0**、Astro **7.3.7**。依赖由锁文件固定。上游：[Kanade](https://github.com/sudoriaa/Kanade-Astro)、[EmDash](https://github.com/emdash-cms/emdash)。保留上游作者和字体资源说明。

## 开发

需要 Node 24、pnpm 10.33.0：

```bash
pnpm install --frozen-lockfile
cp .env.example .env
# 本地将 .env 中 SITE_URL 与 EMDASH_SITE_URL 均改为 http://localhost:4321
pnpm run setup
pnpm dev
```

`setup` 用官方 CLI 生成密钥，导入 24 篇中英日示例文章及 3 个关于页面。重复执行跳过已有内容，不覆盖编辑或密钥。`.env` 和 `data/` 不进入 Git。不要随意更换生成的密钥。

后台入口 `/_emdash/admin/`。生产在有效 HTTPS 下完成官方初始化并注册管理员/passkey，没有预置生产账号。生产禁止开发认证绕过变量。

## 写作

在后台 `posts` 中填写标题、摘要、日期、正文、slug、分类和标签，选择 `zh-CN` 后发布。保存草稿不会替换已发布内容，发布后立即生效，撤回后公开文章返回 404。`pages` 管理 `/pages/{slug}/`；`about` 同时是 `/about/` 的正文。

静态 JPEG/PNG 上传后自动生成 WebP，前台正文和上传封面优先使用。默认质量 82、最长边 2560，修正方向、保留透明度及原图。GIF、动画图片、SVG、已有 WebP 保留原格式。限制 10 MiB 和 4000 万像素，转换失败保留原图并记日志。替换、删除和重启检查衍生图有效性。通过 `KANADE_WEBP_QUALITY` 和 `KANADE_IMAGE_MAX_EDGE` 调整设置。

主题、作者、导航、友链和语言在 [src/site.config.json](src/site.config.json)，修改后重建。默认只展示一种语言。留言墙仍使用浏览器本地存储。

## 验证与部署

```bash
pnpm exec playwright install --with-deps chromium
pnpm test
pnpm format:check
```

测试包括单元测试、类型检查、生产构建、桌面/手机浏览器及真实 CMS API 和上传流程，使用独立临时数据库。已有 Chromium 可设置 `PLAYWRIGHT_EXECUTABLE_PATH`。

适用于阿里云 2C4G、Ubuntu 24.04、宝塔 12 和 EdgeOne 免费版，单个 Node 服务、SQLite、本地媒体，没有 Docker。见 [完整部署与备份说明](docs/deployment.md) 和 `deploy/`。生产运行 `pnpm build` 后 `pnpm start`，需要生产 origin、持久化目录与密钥。

[设计文档](docs/superpowers/specs/2026-10-08-kanade-emdash-design.md) · [实施记录](docs/implementation-log.md)
