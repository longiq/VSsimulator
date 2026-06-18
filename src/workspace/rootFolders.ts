import * as path from 'path';
import { Solution } from '../solution/SolutionParser';

/**
 * Minimal set of top-level directories that hold the solution's projects.
 *
 * Only the directories of the projects listed in the `.sln` are returned — NOT
 * the solution's parent directory — so unrelated files sitting next to the
 * `.sln` (or at the same level as the solution folder) are never pulled in.
 * Directories nested inside another candidate are dropped so a project whose
 * folder contains another project's folder yields a single root.
 *
 * Pure (no `vscode` dependency) so it can be unit-tested standalone.
 */
export function computeRootFolders(solution: Solution): string[] {
  const candidates = new Set<string>();
  for (const project of solution.projects) {
    candidates.add(path.dirname(project.absolutePath));
  }

  const all = [...candidates];
  return all
    .filter((dir) => !all.some((other) => other !== dir && isSubPath(other, dir)))
    .sort((a, b) => a.localeCompare(b));
}

/** Whether `child` is the same as, or nested inside, `parent`. */
export function isSubPath(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}
