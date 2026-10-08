import { DatabaseSync, backup } from "node:sqlite";
import { mkdir, cp, chmod, writeFile, rm, realpath } from "node:fs/promises";
import { resolve, join, dirname, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { dataPaths } from "../config/runtime.mjs";

/** @param {{dataDir: string, destination: string, keyFile: string}} options */
export async function backupSite({ dataDir, destination, keyFile }) {
  const source = await realpath(resolve(dataDir));
  const target = resolve(destination);
  if (target === source || target.startsWith(source + sep))
    throw new Error("Backup destination must be outside the data directory");
  await mkdir(dirname(target), { recursive: true });
  const physicalTarget = join(
    await realpath(dirname(target)),
    target.slice(dirname(target).length + 1),
  );
  if (physicalTarget === source || physicalTarget.startsWith(source + sep))
    throw new Error("Backup destination must be outside the data directory");
  await mkdir(target, { mode: 0o700 });
  let db;
  try {
    db = new DatabaseSync(join(source, "emdash.db"), { readOnly: true });
    await backup(db, join(target, "emdash.db"));
    for (const directory of ["uploads", "webp"]) {
      try {
        await cp(join(source, directory), join(target, directory), {
          recursive: true,
          errorOnExist: true,
          force: false,
        });
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    await cp(keyFile, join(target, "site.env"), {
      errorOnExist: true,
      force: false,
    });
    await chmod(join(target, "site.env"), 0o600);
    await chmod(join(target, "emdash.db"), 0o600);
    await writeFile(
      join(target, "manifest.json"),
      JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          format: 1,
          database: "emdash.db",
          environment: "site.env",
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
  } catch (error) {
    await rm(target, { recursive: true, force: true });
    throw error;
  } finally {
    db?.close();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const { values } = parseArgs({
    options: {
      destination: { type: "string" },
      "key-file": { type: "string", default: ".env" },
    },
  });
  if (!values.destination)
    throw new Error("Specify --destination outside the data directory");
  await backupSite({
    dataDir: dataPaths().directory,
    destination: values.destination,
    keyFile: values["key-file"],
  });
  console.log(
    `Backup completed at ${resolve(values.destination)}. Keep the environment file private.`,
  );
}
