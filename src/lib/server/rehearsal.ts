/**
 * Rehearsal mode runs the whole show on fictional guests. It must never read
 * the real invite submissions, so every data folder has to be a rehearsal one
 * (scripts/rehearsal.mjs sets them). A misconfigured start fails loudly.
 */
export const REHEARSAL = process.env.REHEARSAL === "1";

export function guardDataDir(dir: string, what: string): string {
  if (REHEARSAL && !/(^|[\\/])rehearsal([\\/]|$)/.test(dir)) {
    throw new Error(`Rehearsal mode refuses to use ${what} at "${dir}": start it with npm run rehearsal so only sample data is used.`);
  }
  return dir;
}
