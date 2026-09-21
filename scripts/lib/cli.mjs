export function sourceRevisionFromArgs(args = process.argv.slice(2), environment = process.env) {
  let revision = environment.SOURCE_REVISION;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--source-revision") {
      revision = args[index + 1];
      index += 1;
      continue;
    }
    if (argument.startsWith("--source-revision=")) {
      revision = argument.slice("--source-revision=".length);
      continue;
    }
    throw new Error(`unknown argument '${argument}'`);
  }
  if (!revision) {
    throw new Error("pass --source-revision <40-character Git commit SHA> or set SOURCE_REVISION");
  }
  return revision;
}
