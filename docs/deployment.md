# duanap.cn 部署与恢复

适用于阿里云轻量服务器 2C4G、Ubuntu 24.04、宝塔 12.0、EdgeOne 免费版。单个 Node 实例，SQLite 和图片存本地磁盘。2026-10-08 已完成生产部署；实际服务器使用宝塔 13.1.0，端口与 Node 路径按现有环境调整，见 [部署实录与回滚命令](deployment-2026-10-08.md)。以下保留通用安装步骤。

## 目录与工具

| 路径                         | 内容                                      |
| ---------------------------- | ----------------------------------------- |
| `/www/wwwroot/duanap.cn`     | 代码、依赖和构建产物                      |
| `/www/kanade-data/duanap.cn` | 数据库、uploads、webp、sessions、site.env |
| `/www/kanade-backups`        | 私有备份                                  |
| `/opt/node24`                | Node 24 安装目录，systemd 默认使用此路径  |

安装 Node 24 LTS，可使用宝塔的 Node 24 或 [Node 官方安装包](https://nodejs.org/en/download)。使用官方 SHA256 和签名校验，保持 HTTPS 验证。确认 `node --version` 为 24，执行 `npm install -g pnpm@10.33.0`。若采用宝塔 Node 路径，把 systemd 的 `ExecStart` 修改为实际的 Node 绝对路径；不要使用 Ubuntu 默认旧版本，也不要依赖登录 shell 的 nvm。

管理员创建专用运行用户和目录：

```bash
sudo useradd --system --user-group --home-dir /www/kanade-data/duanap.cn --shell /usr/sbin/nologin kanade
sudo install -d -o kanade -g kanade -m 750 /www/wwwroot/duanap.cn /www/kanade-data/duanap.cn
sudo install -d -m 700 /www/kanade-backups
```

代码和冻结依赖应在隔离 Linux 构建机准备，并把完整运行包复制到服务器。2C4G 生产机只运行服务，不安装依赖或执行构建。以下依赖安装、setup 与构建命令在构建机执行；服务器数据初始化与升级另按明确备份范围处理。数据库、环境文件和备份不得通过 Nginx 静态开放。

## 初始化、构建和启动

```bash
cd /www/wwwroot/duanap.cn
pnpm install --frozen-lockfile
cp .env.example .env
chmod 600 .env
```

编辑 `.env`，设置如下非秘密项：

```dotenv
SITE_URL=https://duanap.cn
EMDASH_SITE_URL=https://duanap.cn
KANADE_DATA_DIR=/www/kanade-data/duanap.cn
```

```bash
pnpm run setup
# 首次干净检出需要生成未跟踪的 CMS 集合类型（现有 seed 模型）。
node --input-type=module -e 'import {writeFile} from "node:fs/promises"; import {generateProjectEnvTypes} from "./node_modules/emdash/dist/schema/project-env-types.mjs"; await writeFile("emdash-env.d.ts", await generateProjectEnvTypes(process.cwd()));'
# 完整复制生成密钥后的 .env；此文件只允许服务用户读取。
install -m 600 .env /www/kanade-data/duanap.cn/site.env
NODE_OPTIONS=--max-old-space-size=2048 pnpm build
```

`setup` 导入示例内容但不创建管理员，重复执行跳过已有内容。保留生成的 `EMDASH_ENCRYPTION_KEY`，升级或恢复不能换密钥。不要设置开发认证绕过变量。构建和运行时的 SITE_URL 均需为生产 HTTPS 地址，修改域名或主题配置后重新构建。修改运行配置后同步更新 `site.env`。

```bash
sudo cp deploy/kanade.service /etc/systemd/system/kanade.service
sudo systemctl daemon-reload
sudo systemctl enable --now kanade
sudo systemctl status kanade --no-pager
curl -fsS http://127.0.0.1:4321/rss.xml >/dev/null
sudo journalctl -u kanade -n 80 --no-pager
```

服务模板将 Node 堆限制为 1536 MiB、进程内存 2 GiB，写权限限于数据目录。只使用这一套进程管理，不同时启动 PM2 或宝塔 Node 项目。EmDash 的 Node 运行时自带定时任务，服务持续运行即可，无需开放 cron 接口。

## 宝塔 Nginx 和 HTTPS

在宝塔建立 `duanap.cn` 网站，配置有效的源站 HTTPS 证书，把 [deploy/nginx.conf](../deploy/nginx.conf) 合并到 HTTPS `server` 块。保留宝塔证书、ACME 续签配置；删除冲突的 `location /`、PHP 和静态扩展名缓存规则。Nginx 只做代理，不直接提供仓库文件。

先执行宝塔 Nginx 配置检查，再重载。通常路径为 `/www/server/nginx/sbin/nginx -t`，以面板实际路径为准。HTTP 入口跳转 HTTPS，ACME 续签按宝塔原配置处理。不要用片段覆盖完整配置。

模板固定 Host 与 HTTPS 转发信息，覆盖客户端传入的 X-Real-IP。Node 只监听回环地址，公网不开放 4321。检查页面 canonical、Open Graph、RSS 与 sitemap 均使用 `https://duanap.cn`；验证登录、passkey、保存及上传没有 origin 错误。

## 阿里云 DNS 与 EdgeOne

在 EdgeOne 添加域名，源站填阿里云 IP，源站协议 HTTPS、Host 和 TLS SNI 为 `duanap.cn`，校验源站证书。阿里云 DNS 使用 EdgeOne 控制台实际给出的接入记录，不猜测 CNAME。修改前核对现有业务记录。可将 `www` 301 重定向到主域名。

推荐默认不缓存，只缓存 `/_astro/*`，避免强制缓存整站：

| 请求                                      | 缓存       |
| ----------------------------------------- | ---------- |
| `/_astro/*` 哈希资源                      | 可缓存一年 |
| `/_emdash/*`，包括图片和后台 API          | 不缓存     |
| HTML、RSS、sitemap                        | 不缓存     |
| 带 `_preview`、认证/session Cookie 的请求 | 不缓存     |
| POST、PUT、DELETE 等写入                  | 不缓存     |

保留查询参数，特别是 `format=webp` 和 `_preview`。检查动态响应 `Cache-Control: no-store`。上传静态 JPEG/PNG 后，前台图片返回 `image/webp`，原图 URL 保留原始字节；替换后客户端必须拿到新图片。WebP 在本地生成，不依赖 EdgeOne 付费图片处理。

未配置 real_ip 时 Nginx 日志和限流可能看到 EdgeOne 节点 IP。若需真实访客 IP，仅信任 EdgeOne 官方当前公布的回源网段和头部配置，不信任全网转发头。可按官方列表限制源站 80/443，保留自己的管理通道与证书续签；官方网段变化时更新。

在有效 HTTPS 下访问 `https://duanap.cn/_emdash/admin/` 完成官方管理员初始化和 passkey 注册。首次初始化期间限制管理入口访问，完成后再开放。不要使用测试开发绕过流程建立生产账号。

## 备份与升级

备份使用 SQLite backup API，包含已提交 WAL 数据。为保证数据库与媒体目录处于同一时点，完整备份时先停服务。以下命令由管理员执行，Node 路径必须与实际安装一致，每次使用新的目标目录：

```bash
sudo systemctl stop kanade
cd /www/wwwroot/duanap.cn
sudo /opt/node24/bin/node --env-file=/www/kanade-data/duanap.cn/site.env scripts/backup.mjs \
  --destination /www/kanade-backups/2026-10-08-before-update \
  --key-file /www/kanade-data/duanap.cn/site.env
sudo systemctl start kanade
```

备份含 `emdash.db`、`uploads/`、`webp/`、权限 600 的 `site.env`。sessions 不备份，恢复后重新登录。目标不得在数据目录内部，不覆盖已有备份。备份失败时先解决错误再升级，并重新启动服务。定时任务需要 shell trap 保证失败也启动服务。至少保留一个站外副本，同盘备份不能抵御整盘损坏。

升级时备份、停服务、更新代码、冻结安装并构建，再启动。保留外部数据目录和密钥。不要在生产直接使用无锁的 `pnpm update --latest`。

## 恢复

停服务，把当前数据目录移动到另一个私有位置保留现场。创建新数据目录，复制备份中的数据库、uploads、webp、site.env。不要混入旧的 `emdash.db-wal` 或 `emdash.db-shm`。数据归属设为 `kanade:kanade`，数据库与密钥权限设为 600。

保持备份原密钥，启动匹配版本代码；域名变化时重新构建。WebP 缺失可从原图重建。检查文章数量、原图、WebP、后台登录和新内容发布，验证后再清理旧现场。

## 故障检查

502：检查 service 日志、Node 路径和 4321 监听。权限错误：检查数据归属与 site.env 权限。数据库锁：关闭重复服务实例。登录/origin 错误：核对 HTTPS、Host、SITE_URL 和 EMDASH_SITE_URL。发布后旧内容：检查宝塔与 EdgeOne 强制缓存。WebP 回退：查看转换日志、体积、像素与图片格式。

## 2026-10-09 Fork 功能升级

本次接入仍为本地交付，没有执行生产库迁移或发布。固定 core/admin 来源和专用原图补丁记录在 vendor/manifest.json；服务器不能临时改装回官方 core 或 admin 包。

升级前检查当前服务、运行目录、Git diff 与当前版本，保存 Nginx、服务配置和原 site.env。当前已部署版本及回滚路径记录在 [2026-10-08 部署记录](deployment-2026-10-08.md)，实际状态发布前重新核对。

1. 在 Linux 构建机冻结安装、核验包来源、生成类型并通过测试/构建，准备含 Linux 依赖的运行包。
2. 针对生产 emdash.db 运行 migrate:fork dry-run，核对只增加缺失集合/字段/初始记录；发现不兼容结构即停止。
3. 停止 kanade.service，保留现有数据目录和密钥。用已有私有备份工具保存 SQLite、uploads、webp、site.env。使用新版本迁移工具显式 apply 并指定另一未存在的备份目录：工具先备份再升级，不重放原文章、页面、管理员或站点设置。
4. 启动新版本的同一个 Node 服务。核验服务状态、回环 RSS/页面、源站 Nginx HTTPS 和 EdgeOne 公网；检查历史文章 ID/数量、媒体原字节、WebP、登录与审核，不仅检查缓存首页 200。

命令示例（具体目录以当前服务配置为准）：

```bash
node --env-file=/www/kanade-data/duanap.cn/site.env scripts/migrate-fork-features.mjs --dry-run --database /www/kanade-data/duanap.cn/emdash.db
# 仅在发布步骤已获授权、服务已停且恢复点已确认后执行
node --env-file=/www/kanade-data/duanap.cn/site.env scripts/migrate-fork-features.mjs --apply --database /www/kanade-data/duanap.cn/emdash.db --key-file /www/kanade-data/duanap.cn/site.env --backup-destination /www/kanade-backups/index-before-fork
```

QQ 回调设置为本站 /oauth/qq/callback，生产 Origin 与 SITE_URL/EMDASH_SITE_URL 一致。Secret 由插件后台写入加密设置，保留原 EMDASH_ENCRYPTION_KEY；管理员 passkey 和会员 QQ 是两套身份。真实 QQ 登录、HTTPS Cookie 和站主 passkey 仍需有效配置及本人验收。

回滚优先停新服务并切回原代码链接，保留新增数据现场。若需要恢复数据，先保存升级后的完整目录，然后按本文“恢复”步骤，用匹配版本的数据库/媒体/site.env 整体恢复；覆盖生产库需另获明确确认。不要混用新旧 WAL 文件、密钥或管理员 Cookie。没有异常时不删除恢复点、原图或本机历史留言。
