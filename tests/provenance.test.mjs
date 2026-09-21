import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { validateSourceRevisionProvenance } from "../scripts/lib/provenance.mjs";

function git(cwd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd,
      env: {
        ...process.env,
        GIT_AUTHOR_EMAIL: "test@example.invalid",
        GIT_AUTHOR_NAME: "Design Token Test",
        GIT_COMMITTER_EMAIL: "test@example.invalid",
        GIT_COMMITTER_NAME: "Design Token Test",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`git ${args.join(" ")} failed (${code}): ${stderr}${stdout}`));
    });
  });
}

test("source provenance requires an existing ancestor with identical canonical inputs", async () => {
  const root = await mkdtemp(join(tmpdir(), "fukamu-token-provenance-"));
  try {
    await mkdir(join(root, "tokens"));
    await mkdir(join(root, "scripts"));
    await writeFile(join(root, "tokens/source.json"), "{}\n");
    await writeFile(join(root, "scripts/build.mjs"), "export {};\n");
    await writeFile(join(root, "package.json"), "{\"name\":\"fixture\"}\n");
    await git(root, ["init", "--initial-branch=main"]);
    await git(root, ["add", "tokens", "scripts", "package.json"]);
    await git(root, ["-c", "commit.gpgsign=false", "commit", "-m", "canonical source"]);
    const sourceRevision = await git(root, ["rev-parse", "HEAD"]);
    assert.equal(await validateSourceRevisionProvenance(root, sourceRevision), sourceRevision);

    await writeFile(join(root, "README.md"), "Unrelated metadata.\n");
    await git(root, ["add", "README.md"]);
    await git(root, ["-c", "commit.gpgsign=false", "commit", "-m", "unrelated descendant"]);
    assert.equal(await validateSourceRevisionProvenance(root, sourceRevision), sourceRevision);

    await writeFile(join(root, "tokens/source.json"), "{\"changed\":true}\n");
    await assert.rejects(
      validateSourceRevisionProvenance(root, sourceRevision),
      /canonical generation inputs must be committed and clean/u,
    );
    await git(root, ["add", "tokens/source.json"]);
    await git(root, ["-c", "commit.gpgsign=false", "commit", "-m", "change canonical input"]);
    await assert.rejects(
      validateSourceRevisionProvenance(root, sourceRevision),
      /canonical generation inputs differ/u,
    );
    await assert.rejects(
      validateSourceRevisionProvenance(root, "0000000000000000000000000000000000000000"),
      /not an available Git commit/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
