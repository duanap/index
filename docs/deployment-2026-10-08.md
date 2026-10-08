# 2026-10-08 生产部署实录

已部署 `duanap/index` 的 main 提交 `e58526f201bae103763e5e3b5f7c0749be78c38f`。站点为 <https://duanap.cn>，`https://www.duanap.cn` 返回 301 跳转到主域名。应用采用 systemd、SQLite 和本地媒体，不使用 Docker。

## 实际环境与路径

服务器通过 `ssh duanap-server` 管理，Ubuntu 24.04.5、宝塔 13.1.0。已有 Node 24.12.0 和有效的主域名证书，沿用现有 EdgeOne 免费版接入及主域名动态内容不缓存规则，没有修改 DNS 或 EdgeOne 规则。

| 项目                               | 实际配置                                                 |
| ---------------------------------- | -------------------------------------------------------- |
| 代码与依赖                         | `/srv/apps/duanap/index/releases/e58526f-20261008-linux` |
| 网站入口软链接                     | `/www/wwwroot/duanap.cn`                                 |
| SQLite、图片、WebP、sessions、密钥 | `/www/kanade-data/duanap.cn`                             |
| 服务 / 用户                        | `kanade.service` / `kanade:kanade`                       |
| Node                               | `/www/server/nodejs/v24.12.0/bin/node`                   |
| 监听地址                           | `127.0.0.1:4323`；4321 和 4322 已被其他应用占用          |
| 内存限制                           | Node 堆 512 MiB、systemd MemoryMax 768 MiB               |
| Nginx 配置                         | `/www/server/panel/vhost/nginx/duanap.cn.conf`           |
| 初始备份及回滚脚本                 | `/www/kanade-backups/index-20261008-e58526f`             |
| 后台访问保护                       | `/www/kanade-private/duanap.cn/admin.htpasswd`           |

部署前主域名与 `blog.duanap.cn` 共用原 EmDash 服务。此次仅从原博客 Nginx 配置移除 `duanap.cn` 与 `www.duanap.cn`，原博客仍由 `blog-emdash.service` 提供，旧主页服务和数据也保留。新数据库只导入 Kanade 的 24 篇中英日示例文章及 3 个页面，没有迁移、删除或覆盖旧站数据。默认中文前台与 RSS 展示 8 篇中文文章，作者、导航及配图保持 main 中的默认配置。

## 构建与验证

本机用 Git 拉取 main，在 WSL Ubuntu 24.04 中使用与服务器相同的 Node 24.12.0 和 pnpm 10.33.0，冻结安装、构建及打包 Linux 生产依赖；服务器只解包运行。

首次检出缺少 `emdash-env.d.ts`，使用当前固定版本 EmDash 自带的 `generateProjectEnvTypes` 从 seed 生成后，类型检查通过。原生 Windows 的 POSIX 权限断言和 EmDash 反斜杠路径构建不适用本次 Linux 验证。WSL 原有回环连接阻塞，通过独立测试网络运行测试；补齐 Chromium 缺失的系统库后，浏览器测试正常启动。

本次验证：13 项单元测试、63 个文件的 Astro 类型检查和 Vue 类型检查、生产构建、32 项桌面/手机测试全部通过。5 项 CMS 测试通过，包括发布、草稿、预览、撤回、SEO、页面语言限制，以及真实上传、替换、删除、WebP MIME 与保留原图。后台开发页面挂载超过原五秒断言，本地仅将这条断言上限调整为 30 秒，随后完整 CMS 测试通过；生产运行逻辑仍为上述 main 提交。

源站使用实际域名与 SNI 验证 HTTPS，公网经 EdgeOne 验证：首页、列表、关于页、RSS、站点地图、WebP 图片及抽样哈希资源均正常；未知文章返回 404，`.env` 返回 403，数据库路径返回 404，匿名内容 API 返回 401，后台和初始化 API 有 HTTP 访问保护，开发认证绕过端点返回 403。`www` 跳转正常，原博客返回 200。

服务已启用开机启动并实际重启验证：密钥环境文件校验一致，RSS 元数据与 8 篇已发布内容保持一致。切换瞬间 Nginx 旧 worker 曾返回旧站 RSS，因此持久化比较采用新站回环服务的切换前响应。服务没有异常重启；验证期间进程约 90–180 MiB，服务器最终可用内存约 786 MiB，Swap 未使用。

日志存在 Node 24 的 SQLite 实验性提示、未启用 Astro 页面缓存时的 cache hint 提示；构建有大 chunk 提示。未发现新站致命启动错误，页面采用动态请求，不启用额外页面缓存。

服务器在早期依赖安装期间曾卡死，用户通过控制台重启恢复；可读取的旧启动日志未发现 OOM，原因未确认。此后采用本机 Linux 依赖打包上传，没有继续在服务器安装或构建。

## 管理员初始化与备份

访问 <https://duanap.cn/_emdash/admin/>。先使用部署时生成的 HTTP 访问保护凭据，再按 EmDash 官方流程建立管理员并注册 passkey。凭据保存在服务器私有目录及本次任务的本机文件中，不写入仓库。没有创建测试生产管理员或启用开发认证绕过。

管理员注册、实际 passkey 登录和使用管理员上传生产图片，需要站主完成初始化后验证；生产图片转换能力已在同版本隔离实例通过真实 CMS 上传测试。完成初始化后应再做一次完整备份。

初始一致性备份位于 `/www/kanade-backups/index-20261008-e58526f/new-site-initial`，包括 SQLite backup API 生成的数据库、uploads、webp 和权限 600 的 site.env。没有配置每日定时备份、保留自动清理或站外副本。后续手动备份仍按通用文档操作，但使用实际 Node 路径和新的目标目录，并在完整媒体备份期间停服务。

```bash
(
  set -e
  trap 'systemctl start kanade.service' EXIT
  systemctl stop kanade.service
  cd /www/wwwroot/duanap.cn
  /www/server/nodejs/v24.12.0/bin/node --env-file=/www/kanade-data/duanap.cn/site.env scripts/backup.mjs --destination /www/kanade-backups/新备份名称 --key-file /www/kanade-data/duanap.cn/site.env
)
```

备份失败也要重新启动服务，解决原因后再继续升级；保留已有加密密钥。此命令不能覆盖已有备份。

## 回滚到此次部署前的域名入口

```bash
ssh duanap-server 'bash /www/kanade-backups/index-20261008-e58526f/rollback.sh'
```

脚本恢复此次变更前的两份 Nginx 配置，检查并重载 Nginx，停用新站服务并检查原入口。原博客服务一直保留运行。新站代码、数据库、图片和密钥全部保留，不执行数据库恢复或清空；此后新站中新增的数据仍在独立持久化目录。回滚前如已进一步修改 Nginx 配置，应先备份并评估这些后续修改。
