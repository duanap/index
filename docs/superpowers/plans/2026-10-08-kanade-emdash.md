# Kanade + EmDash Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Execute inline in the existing isolated cloud checkout.

**Goal:** Deliver Kanade backed by EmDash with automatic WebP derivatives and deployment instructions for duanap.cn.

**Architecture:** Astro server output with Vue public components and React admin; SQLite and local media. EmDash live queries feed a shared post adapter. A bounded sharp worker generates persistent derivatives selected through the authenticated media route.

**Tech Stack:** Node 24, pnpm 10.33.0, Astro 7.3.7, EmDash 1.2.0, Vue 3, React, sharp, Playwright, Node test runner via tsx.

**Spec:** `docs/superpowers/specs/2026-10-08-kanade-emdash-design.md`

## Global Constraints

- Work in `/workspace/index`; no additional Git worktree.
- Preserve latest Kanade visuals and all 24 example posts in zh-CN/en/ja.
- Domain https://duanap.cn, Node single instance on Ubuntu 24.04 + BaoTa 12.0; no Docker.
- Local persistent SQLite/media; separate production data and code directories.
- WebP quality 82, longest edge 2560, one conversion at a time; preserve originals, alpha, animation and SVG.
- No production administrator credentials, remote push, deployment or publication without explicit authorization.

## Review Focus

- More than 100 entries: consume all cursor pages without leaking drafts.
- Same slug in several locales: route lookup must respect configured language without fallback.
- Replacement/deletion and restart: stale derivative must never replace fresh or deleted content.
- Corrupt/oversized/animated images: original remains intact; conversion is bounded and format-correct.
- Reverse proxy and feed requests: preserve HTTPS origin and keep preview content out of public feeds.

### Task 1: Runtime and bootstrap

Files: `package.json`, `pnpm-lock.yaml`, `astro.config.mjs`, `src/live.config.ts`, `scripts/setup.mjs`, `tests/unit/bootstrap.test.ts`.
Interfaces: emits reproducible pnpm install, persistent data paths, official CMS seed registration; later tasks consume runtime via `Astro.locals.emdash`.

- [x] Import current Kanade files without replacing local design docs or Git metadata; record upstream SHA.
- [x] Write bootstrap tests for preserving existing encryption key and data paths; observe failure before implementation.
- [x] Register Node/React/EmDash with scoped renderer includes and single-language public routing.
- [x] Install pinned dependencies; implement idempotent local setup; run bootstrap tests and Astro sync.

### Task 2: Content conversion and seed

Files: `scripts/content/markdown.ts`, `scripts/content/seed.ts`, `seed/seed.json`, `tests/unit/content.test.ts`.
Interfaces: `markdownToBlocks(markdown: string): Block[]`; seed posts contain excerpt, date, cover, featured, Portable Text, locale and native taxonomies.

- [x] Write tests for actual example headings, lists, marks, code and all 24 language/slug/date mappings; observe RED.
- [x] Convert Markdown using its parsed syntax tree; create collection model and deterministic seed entries.
- [x] Seed fresh test SQLite and repeat with conflict skipping; verify all entries and preservation of edits.

### Task 3: Live public pages

Files: `src/lib/cms-posts.ts`, `src/lib/posts.ts`, `src/components/content/*`, `src/pages/posts/[...id].astro`, `src/pages/pages/[slug].astro`, `src/pages/about.astro`, feeds/sitemaps, `tests/unit/posts.test.ts`, `tests/cms.spec.ts`.
Interfaces: `loadPosts(query, locale): Promise<Post[]>`, `summarize(post): PostSummary`, normalized `Post.data` matching Kanade; headings and media components for Portable Text.

- [x] Write tests for cursor exhaustion, sorting, locale isolation, error propagation and summary serialization; observe RED.
- [x] Implement official live queries and request-local reuse, adapt all consumers and article rendering.
- [x] Implement CMS pages and dynamic published-only RSS/sitemaps with compatible URLs.
- [x] Add functional tests for missing post, draft privacy, publish/update/unpublish and HTTPS metadata; verify via real server.

### Task 4: Persistent WebP media processing

Files: `src/lib/media/{convert,derivatives}.ts`, `src/middleware.ts`, media plugin, Portable Text image and cover, `tests/unit/media.test.ts`, media integration tests.
Interfaces: `convertImage(bytes, options): Promise<ConvertedImage | null>`; derivative store resolves only current source content; original media route provides authorization before derivative response.

- [x] Write real-byte conversion tests for JPEG, PNG alpha, orientation, WebP/GIF/SVG passthrough, malformed input and limits; observe RED.
- [x] Implement sharp encoding, content-hash files, atomic writes, bounded worker and regeneration after replacements; no dependency source patches.
- [x] Cover restart, same-path replacement, deletion, concurrency and unauthorized/absent media with tests.
- [x] Verify actual upload triggers generation and front-end requests serve WebP while original bytes remain accessible for backup.

### Task 5: Deployment and backups

Files: `deploy/kanade.service`, `deploy/nginx.conf`, `.env.example`, `scripts/backup.mjs`, `README.md`, `docs/deployment.md`, `tests/unit/backup.test.ts`.
Interfaces: one Node process from `dist/server/entry.mjs`; `KANADE_DATA_DIR`, public origin and encryption key via environment; consistent SQLite backup outside web root.

- [x] Write backup/restore tests on real SQLite with WAL and uploads; observe RED.
- [x] Implement backup tooling preserving files and key without outputting secrets; never modify live repository files.
- [x] Document BaoTa Nginx fragment, dedicated systemd user, EdgeOne exclusions, certificate/DNS checks and resource limits.
- [x] Remove obsolete upstream Docker/static-host deployment files and document updates and recovery.

### Task 6: Verification and review

Files: Playwright config/fixtures, CI, setup/start configuration draft, implementation log.

- [x] Run meaningful Node unit tests, formatting, type check, server build, desktop/mobile browser tests and live CMS/media checks.
- [x] Restart services and repeat frozen dependency installation/setup to check reproducibility.
- [x] Save tested install_script/start_skill; preserve unrelated draft fields.
- [x] Request one whole-project fresh-context code review; address material findings with regression tests.
- [x] Report passing evidence, repository/runtime limitations and server instructions without claiming production deployment.
