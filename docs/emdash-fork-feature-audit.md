# duanap/emdash 功能差异核对

日期：2026-10-09。状态：已完成来源与兼容性核对，功能接入尚未开始。

## 已核实的来源

当前 index 使用 npm `emdash@1.2.0`，基于上游 `b5f37c646f3639f07ebdc090e0ffcf48bdb4d684`。Kanade 页面已接入 posts/pages 与本地媒体，JPEG/PNG 在服务端生成 WebP 衍生文件并保留原图。

用户提供的仓库有三个分支：

| 分支                       | 已核实提交                                 | 状态                                           |
| -------------------------- | ------------------------------------------ | ---------------------------------------------- |
| main                       | `40ca8540ae3a1567b3a468c1b971bf68ceb2bc8d` | core 1.0.1，基础生活/作品/归档，会员为早期 POC |
| feat/blog-phase5-members   | `f0c58f005cd40bcca42b39acca4a1e1c366e3d13` | 完整会员域、前台与自定义后台                   |
| codex/upgrade-emdash-1.2.0 | `bb448eaf26e76a6d6ff55042f9031222dd010239` | 合并上游 1.2.0，并保留自定义后台和会员功能     |

接入来源应固定到升级分支的上述提交。core 和 admin 的版本均为 1.2.0，但内容不同于 npm 官方同版本；仅调整现有 npm 版本号不会获得这些新增功能。

## 新增功能与当前项目差异

| 功能         | fork 的具体能力                                                        | 当前 index                   |
| ------------ | ---------------------------------------------------------------------- | ---------------------------- |
| 管理后台     | 分组导航、搜索入口、仪表盘快捷入口、完整中文错误提示、Lucide 图标      | 官方后台                     |
| 内容管理     | 内容列表操作、分页和表单改进，可选自定义多选标签，回收站批量恢复/删除  | 官方通用内容管理             |
| 生活与作品   | life/projects 独立集合、列表与详情、生活标签、作品类型与推荐           | posts/pages 两个集合         |
| 时间归档     | 时间线、年度/月度入口，整合文章与生活内容                              | 文章列表及侧栏月度筛选       |
| 会员         | QQ OAuth、Cookie 会话、登出、资料编辑、会员中心、收藏与本人评论列表    | 无前台会员域                 |
| 内容互动     | 文章/生活/作品点赞与收藏，评论点赞与归属                               | 无会员互动                   |
| 评论与留言墙 | 原生评论存储、访客审核、站主新增/编辑留言、批量管理                    | 留言墙仅保存在浏览器本地     |
| 首页轮播     | 后台图片/链接排序、播放间隔、模糊与遮罩、文字位置、桌面/手机高度和字号 | Kanade 固定首页欢迎区域      |
| 页脚         | 备案文字、链接、图标的后台管理与预览                                   | 静态主题页脚                 |
| 网站地图     | 管理后台生成与检查入口，设置更新记录                                   | 已有动态 RSS 和 sitemap 路由 |
| 友链         | CMS 页面维护友链                                                       | 源码中的静态友链配置         |

## 必须保留的现有行为

- Kanade 主题、配色、布局和 Vue 交互作为界面基础，新功能按现有组件样式接入。
- EmDash 保持 1.2.0；自定义 core/admin 必须同源、固定提交，并有可复现的构建和依赖记录。
- 当前正式文章 URL、单语言展示、SEO、动态 RSS/sitemap 和发布后即时可见。
- SQLite、上传文件、加密密钥与管理员数据继续使用现有持久化目录。
- JPEG/PNG 原图保留，WebP 在服务端生成；SVG 和动画格式保持现有策略。

## 已确认的兼容性取舍

1. **图片上传冲突。** fork 的 `packages/admin/src/lib/api/media.ts` 在上传前调用 `prepareWebpUpload`，在浏览器中将 JPEG/PNG/BMP/AVIF/SVG 替换为 WebP。直接使用会丢失当前流程承诺保留的上传原图。接入自定义后台时，需要跳过这层上传前转换，继续由 index 的服务端衍生图插件处理。
2. **缓存时效冲突。** fork 的站点示例为公开页面配置 60 秒 TTL、300 秒 SWR；与 index 发布后立即可见的要求不一致。保留现有动态页面缓存策略，图片衍生文件继续独立缓存。
3. **URL 改写为可选项。** fork 新增 `publicPageSuffix: ".html"`，示例启用了对应路由转换。index 已有正式 URL，接入其他能力不要求开启此选项。
4. **会员 Cookie 支持。** 升级分支修改了 trusted native plugin 的 raw response 转发，允许保留多个 Set-Cookie 和 OAuth 外部跳转；sandboxed plugin 仍受限制。会员插件需要这一套 core 支持，不能只复制页面代码。
5. **内容模型必须显式升级。** 相对上游 1.2.0，核对没有发现新增 core 数据库迁移文件；但 life/projects/wall 等集合、字段及会员插件存储仍是项目层面的新增数据结构。现有部署不能靠重复跑 seed 来假定结构已经升级，更不能重建正式库。
6. **QQ 配置与验证。** 会员插件已有回调/state/会话和跨域返回的实现与测试。当前项目应以自己的公开 origin 与 QQ 登记配置接入；真实 QQ 授权需要实际账号与有效配置，不能从模拟测试推断已完成。
7. **历史数据。** 不导入旧博客数据库。浏览器历史本地留言不自动发布到公共留言墙；新留言走 CMS 存储与审核。

## 接入与验证的建议顺序

先准备固定提交的自定义 core/admin，再接后台设置与数据模型；随后实现生活/作品/归档和 CMS 友链，最后接会员、互动、评论与留言墙。轮播、备案页脚和地图管理接入 Kanade 现有布局。

隔离数据库验证新增模型、已有内容保留、权限和审核；浏览器验证桌面/手机布局、后台保存、草稿/发布/撤回、会员登录登出、点赞收藏、留言管理以及上传后原图和 WebP。保持现有全部回归测试，并新增会员 Cookie、CSRF、OAuth state、returnTo 与批量操作的实际运行测试。

当前工作区还保留上一轮部署文档与后台测试等待修正。本次核对只读取远端与本机源码，没有升级依赖、改写业务代码、访问或修改生产数据库。V:/EmdashBlog 的本地未提交工作没有用于接入来源；来源使用远端固定提交。

## 来源定位

- [升级分支固定提交](https://github.com/duanap/emdash/tree/bb448eaf26e76a6d6ff55042f9031222dd010239)
- `demos/blog/member-plugin/index.ts`、`src/pages/member.astro`、`src/pages/messages.astro`
- `packages/admin/src/components/settings/CarouselSettings.tsx`、`FooterSettings.tsx`、`SitemapSettings.tsx`
- `packages/admin/src/components/comments/MessageDialog.tsx`、`CommentInbox.tsx`
- `packages/core/src/plugins/route-wire.ts`、`packages/admin/src/lib/api/media.ts`、`packages/admin/src/lib/webp-upload.ts`
- `.changeset/admin-navigation-and-chinese.md`、`message-board-tags-and-bulk.md`、`footer-links-settings.md`、`trusted-plugin-route-cookies.md`

## 2026-10-09 接入结果

上述只读核对是接入前状态。实现基于固定提交 bb448eaf，core/admin 同源 tarball 已置于 vendor，并通过哈希及安装来源核验。会员插件由该提交的 demos/blog/member-plugin/index.ts 和 qq-navigation.ts 迁入 src/plugins/members，按本站独立数据库收紧跳转，修复 OAuth state 并发消费和评论归属校验。

生活/作品/归档、CMS 友链、会员资料和私有分页、点赞收藏/评论点赞、审核留言墙、轮播与备案页脚、动态地图管理均已接入 Kanade。没有导入 V:/EmdashBlog 或旧博客的数据。原图与服务端 WebP 流程保持不变。

验证在独立本机 Linux 数据目录进行：冻结离线安装、固定包来源校验、35 个单元测试、零类型诊断、生产构建、32 个桌面/手机测试与 13 个 CMS/会员/设置测试通过。额外语言构建与最终审查结论将在实施记录中保存。

QQ-provider 单元测试使用固定的模拟 QQ 响应；真实浏览器用独立 SQLite 会话验证原生插件 Cookie、CSRF、登出、资料保存、收藏/本人评论分页和评论归属。这些不能代替有效 QQ 应用的真实授权，也没有创建生产测试管理员。

最终验收补充：用户要求整体粉色改暖色，已覆盖浅色/深色页面、装饰与网站图标；本机截图经视觉检查。最终独立审查的三项重要问题（异常重复提交、同名标签结构、100 条公开留言上限）已通过失败回归修复。当前最终套件为 39 个单元、32 个桌面/手机和 14 个 CMS 测试；英文与日文分别另通过 32 个浏览器测试。已知小项：减少动态效果模式下首次手动播放轮播需两次点击；未把该小项标记为已修复。
