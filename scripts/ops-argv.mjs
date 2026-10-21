/** Strip pnpm's literal `--` separator from argv. */
export function opsArgv() {
  return process.argv.slice(2).filter((a) => a !== "--");
}
