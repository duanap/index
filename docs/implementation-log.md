# Implementation log

Plan: docs/superpowers/plans/2026-10-08-kanade-emdash.md
Spec approved: user requested “按文档开始实现”. Execution: inline.
Pre-flight: Tasks 1–3 share seed schema, locales and Post shape; Tasks 3–4 share media URL resolution; Task 5 consumes the same data paths as Task 1. Preserve these interfaces.
Ruling: Execute the implementation plan immediately under the user's explicit implementation instruction; do not add another approval round. The existing cloud checkout supplies isolation. No production actions are authorized.

Tasks 1–2: bootstrap and Markdown/seed tests RED→GREEN (4 tests); seed schema validated, 24 posts and 3 pages generated.
Ruling: Public links retain trailing slashes, but Astro accepts either form (`trailingSlash: ignore`), because always caused injected EmDash API routes to return 404. Disable optional Google admin fonts using the supported fonts:false setting; Kanade fonts remain bundled locally.

Tasks 3–4: CMS lifecycle and media integration failures identified against the actual 1.2.0 package (select string options; PUT updates/replacement; required replacement dimensions; anonymous media lookup via exported MediaRepository/getDb). Fixed without package patches. Added media:read capability required for upload hook. Preview-token RSS regression RED→GREEN by running public queries with preview/edit state cleared.
Task 4: JPEG/WebP size/MIME, PNG alpha and EXIF rotation, animation/SVG/WebP preservation, corrupt/oversized limits, restart/replacement/deletion passed. Original files retained; media route authorization runs first. Actual Kanade avatar sample: 42,622 → 27,048 bytes (37% reduction); no promise that every image shrinks.
Task 5: SQLite WAL backup and restore-readback passed; symlink destination escape regression RED→GREEN. Added standalone systemd/Nginx templates and Ubuntu/BaoTa/EdgeOne/backup/recovery guide. systemd syntax verified using this host's Node path; target BaoTa/Nginx and VPS not accessed.
Task 6: First browser run exposed missing taxonomy translation groups (6 category/tag/search failures). Native SQLite regression showed 8/24 localized category joins; linking category and corresponding sample tags RED→GREEN (24/24). Ruling: sample tags are mapped by matching translated article/tag positions — current Kanade examples preserve those concepts — future unmatched translations fail migration clearly rather than silently lose labels.
Final review: one fresh-context reviewer, gpt-6-astra, inspected the full imported project and installed EmDash source. No follow-up review was dispatched.
Final: fixed ignored src/data/ source — git check-ignore RED (both source files ignored)→GREEN (neither ignored); runtime /data/ remains ignored.
Final: fixed CMS SEO discarded by renderer — real API title/description/canonical/noIndex regression RED→GREEN; installed getSeoMeta drives article/page metadata, with OG image coverage.
Final: fixed other-language page-ID bypass — real published English ID request RED (200)→GREEN (404); exact page slug/locale guard shared with About.
Ruling: use `pnpm run setup` explicitly — bare `pnpm setup` invokes pnpm's shell initialization, not the repository script — wrong command would fail or change shell startup files. All user instructions and CI corrected.
Ruling: browser asset checks poll completed image decoding after requesting eager loading — SSR hydration/lazy images can still be pending after navigation/fonts — missing/invalid images still fail, with a bounded wait.
Final: minor (deferred): generated EmDash migration manifest has local ./data/emdash.db descriptor; runtime and documented seed/backup use KANADE_DATA_DIR, but future manifest-based migration must explicitly target the production database.
Final: minor (deferred): guide provides manual full backups and recovery; concrete daily BaoTa job, retention automation and full application restore rehearsal remain future operations work.
Final: Ruling: keep current serialized media generation and source-change validation; reviewer declined to classify unreproduced concurrent in-flight response races as blockers — a request overlapping replacement can reflect its read time, while fresh subsequent requests are tested — cost if wrong: a concurrent request could briefly see old bytes.
Verification (2026-10-08): `pnpm test` exit 0: 13 unit tests, Astro/Vue checks (63 files, zero errors/warnings/hints), server build, 32 desktop/mobile tests, 5 CMS tests. `pnpm format:check` exit 0. Frozen installation and repo setup replay exit 0, 27 content rows skipped with no overwrites. Production instance has not been deployed.
Audit: `pnpm audit --audit-level=high` exit 0; one moderate sprintf-js advisory (GHSA-hp3w-g68c-fv3c), no patched release reported. Dependency source was not altered.

Additional language verification: English 32/32 and Japanese 32/32 desktop/mobile browser checks passed with their respective builds. Rebuilt default zh-CN successfully afterward. Total language browser coverage: 96 checks.
Ruling: retain current cloud checkout on branch work, with no merge/push — approved scope is implementation and environment preparation, and the remote started empty — delivery remains local until separately published or pushed.

Environment draft: install_script and start_skill saved successfully (requires_publish=true); existing repository/network/secret settings preserved. The saved installation script was executed successfully, and the documented development command served valid setup status/RSS and survived a stop/restart with persisted content. Saving does not publish, and new-task restoration is unverified.
Before remote delivery: implementation remained uncommitted on work in the existing checkout; required src/data files are included among deliverable candidates, .env/data/dependencies/build output excluded. At that stage no remote push or VPS deployment had been performed.

User authorization (2026-10-08): “先把代码提交到仓库里面” authorizes committing and pushing this implementation to duanap/index. The remote has no refs; target is main. Preserve the cloud work branch and push its initial commit to origin/main. VPS deployment remains outside this step.
