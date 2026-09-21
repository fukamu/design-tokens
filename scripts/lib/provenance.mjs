import { spawn } from "node:child_process";

const SOURCE_REVISION_PATTERN = /^[0-9a-f]{40}$/u;
const CANONICAL_INPUT_PATHS = ["tokens", "package.json", "scripts"];

function runGit(repoRoot, args) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

export async function validateSourceRevisionProvenance(repoRoot, sourceRevision) {
  const revision = sourceRevision.toLowerCase();
  if (!SOURCE_REVISION_PATTERN.test(revision)) {
    throw new Error("source revision must be an explicit 40-character hexadecimal Git commit SHA");
  }

  const commit = await runGit(repoRoot, ["cat-file", "-e", `${revision}^{commit}`]);
  if (commit.code !== 0) throw new Error(`source revision ${revision} is not an available Git commit`);

  const ancestor = await runGit(repoRoot, ["merge-base", "--is-ancestor", revision, "HEAD"]);
  if (ancestor.code !== 0) throw new Error(`source revision ${revision} is not an ancestor of HEAD`);

  const sourceStatus = await runGit(repoRoot, [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
    "--",
    ...CANONICAL_INPUT_PATHS,
  ]);
  if (sourceStatus.code !== 0 || sourceStatus.stdout.trim() !== "") {
    throw new Error("canonical generation inputs must be committed and clean before generation");
  }

  const sourceDiff = await runGit(repoRoot, ["diff", "--exit-code", revision, "--", ...CANONICAL_INPUT_PATHS]);
  if (sourceDiff.code !== 0) {
    throw new Error(
      `canonical generation inputs differ from source revision ${revision}; commit tokens/, package.json, and scripts/ first`,
    );
  }
  return revision;
}
