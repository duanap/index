import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createRequire } from "node:module";
import { dataPaths } from "../config/runtime.mjs";

export const FORK_COMMIT = "bb448eaf26e76a6d6ff55042f9031222dd010239";
const repository = "https://github.com/duanap/emdash.git";
const project = resolve(fileURLToPath(new URL("../", import.meta.url)));

function command(binary, args, cwd, options = {}) {
  const result = spawnSync(binary, args, {
    cwd,
    stdio: options.capture ? "pipe" : "inherit",
    encoding: "utf8",
    ...options,
  });
  if (result.status !== 0)
    throw new Error(
      `${binary} ${args.join(" ")} failed (${result.status})${result.stderr ? `: ${result.stderr.slice(-1000)}` : ""}`,
    );
  return result.stdout?.trim();
}

export async function verifyForkPackages(root = project) {
  const manifest = JSON.parse(
    await readFile(join(root, "vendor/manifest.json"), "utf8"),
  );
  if (manifest.commit !== FORK_COMMIT)
    throw new Error("Unexpected EmDash fork commit");
  for (const item of manifest.packages) {
    const digest = createHash("sha256")
      .update(await readFile(join(root, "vendor", item.file)))
      .digest("hex");
    if (digest !== item.sha256)
      throw new Error(`Fork package hash mismatch: ${item.file}`);
  }
  const require = createRequire(join(root, "package.json"));
  const coreEntry = require.resolve("emdash");
  const adminEntry = createRequire(coreEntry).resolve("@emdash-cms/admin");
  for (const entry of [coreEntry, adminEntry]) {
    const metadata = JSON.parse(
      await readFile(resolve(entry, "../../package.json"), "utf8"),
    );
    if (
      metadata.version !== "1.2.0" ||
      metadata.kanadeFork?.commit !== FORK_COMMIT
    )
      throw new Error("Installed core/admin are not the same pinned fork");
  }
  return manifest;
}

async function preserveUploadOriginals(source) {
  const path = join(source, "packages/admin/src/lib/api/media.ts");
  let code = await readFile(path, "utf8");
  for (const line of [
    'import { prepareWebpUpload } from "../webp-upload.js";',
    "\tfile = await prepareWebpUpload(file, opts?.signal);",
    "\tfile = await prepareWebpUpload(file, options?.signal);",
  ]) {
    if (!code.includes(line))
      throw new Error(
        "Pinned upload source does not match the original-preservation patch",
      );
    code = code.replace(line, "");
  }
  await writeFile(path, code);
}

export async function buildFork({
  workDir,
  outputDir = join(project, "vendor"),
  pnpm = "pnpm",
  source,
}) {
  const workspace = resolve(workDir);
  const data = dataPaths(project).directory;
  if (workspace === data || workspace.startsWith(data + sep))
    throw new Error("Build workspace must be outside application data");
  if (!source) {
    command(
      "git",
      ["clone", "--filter=blob:none", "--no-checkout", repository, workspace],
      project,
    );
    command(
      "git",
      ["sparse-checkout", "set", "packages", "scripts", "patches"],
      workspace,
    );
    command("git", ["fetch", "origin", FORK_COMMIT], workspace);
    command("git", ["checkout", "--detach", FORK_COMMIT], workspace);
  } else {
    const pinned = command("git", ["rev-parse", "HEAD"], resolve(source), {
      capture: true,
    });
    if (pinned !== FORK_COMMIT)
      throw new Error("Source checkout is not the pinned fork");
    await mkdir(workspace, { recursive: false });
    command(
      "git",
      [
        "archive",
        "--format=tar",
        `--output=${join(workspace, "source.tar")}`,
        FORK_COMMIT,
      ],
      resolve(source),
    );
    command("tar", ["-xf", "source.tar"], workspace);
    // The build's informational commit label comes from this read-only metadata.
    await writeFile(
      join(workspace, ".git"),
      `gitdir: ${resolve(source, ".git")}\n`,
    );
  }
  await preserveUploadOriginals(workspace);
  command(
    pnpm,
    [
      "install",
      "--frozen-lockfile",
      "--filter",
      "emdash...",
      "--filter",
      "@emdash-cms/admin...",
    ],
    workspace,
  );
  command(
    pnpm,
    [
      "--filter",
      "emdash...",
      "--filter",
      "@emdash-cms/admin...",
      "run",
      "build",
    ],
    workspace,
  );
  return packFork({ workspace, outputDir, pnpm });
}

export async function packFork({
  workspace,
  outputDir = join(project, "vendor"),
  pnpm = "pnpm",
}) {
  if (
    command("git", ["rev-parse", "HEAD"], workspace, { capture: true }) !==
    FORK_COMMIT
  )
    throw new Error("Refusing to pack an unpinned checkout");
  const media = await readFile(
    join(workspace, "packages/admin/src/lib/api/media.ts"),
    "utf8",
  );
  if (media.includes("await prepareWebpUpload(file,"))
    throw new Error("Upload-original preservation patch is missing");
  await mkdir(outputDir, { recursive: true });
  const packages = [];
  for (const [directory, file] of [
    ["core", "emdash-1.2.0-duanap-bb448eaf.tgz"],
    ["admin", "emdash-cms-admin-1.2.0-duanap-bb448eaf.tgz"],
  ]) {
    const packageDir = join(workspace, "packages", directory);
    const metadata = JSON.parse(
      await readFile(join(packageDir, "package.json"), "utf8"),
    );
    if (metadata.version !== "1.2.0")
      throw new Error("Unexpected fork package version");
    metadata.kanadeFork = {
      repository,
      commit: FORK_COMMIT,
      patches: ["preserve-upload-originals"],
    };
    await writeFile(
      join(packageDir, "package.json"),
      JSON.stringify(metadata, null, 2) + "\n",
    );
    const destination = resolve(outputDir, file);
    command(pnpm, ["pack", "--out", destination], packageDir);
    packages.push({
      name: metadata.name,
      version: metadata.version,
      file,
      sha256: createHash("sha256")
        .update(await readFile(destination))
        .digest("hex"),
    });
  }
  await cp(
    join(workspace, "packages/admin/src/lib/icons.tsx"),
    join(outputDir, "admin-icons.tsx"),
  );
  await cp(join(workspace, "LICENSE"), join(outputDir, "LICENSE-emdash"));
  await writeFile(
    join(outputDir, "manifest.json"),
    JSON.stringify(
      {
        repository,
        commit: FORK_COMMIT,
        patches: ["preserve-upload-originals"],
        packages,
      },
      null,
      2,
    ) + "\n",
  );
  return packages;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const { values } = parseArgs({
    options: {
      "work-dir": { type: "string" },
      "output-dir": { type: "string" },
      source: { type: "string" },
      pnpm: { type: "string" },
      verify: { type: "boolean" },
      "pack-only": { type: "boolean" },
    },
  });
  if (values.verify) await verifyForkPackages();
  else {
    if (!values["work-dir"])
      throw new Error(
        "Specify a fresh --work-dir outside the application data directory",
      );
    if (values["pack-only"])
      await packFork({
        workspace: resolve(values["work-dir"]),
        outputDir: values["output-dir"],
        pnpm: values.pnpm,
      });
    else
      await buildFork({
        workDir: values["work-dir"],
        outputDir: values["output-dir"],
        source: values.source,
        pnpm: values.pnpm,
      });
  }
}
