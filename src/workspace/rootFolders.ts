import * as path from 'path';
import { Solution } from '../solution/SolutionParser';

/**
 * Minimal set of top-level directories that contain the solution and all of its
 * projects. Directories nested inside another candidate are dropped so e.g. a
 * solution whose projects all live under its own folder yields a single root.
 *
 * Pure (no `vscode` dependency) so it can be unit-tested standalone.
 */
export function computeRootFolders(solution: Solution): string[] {
  const candidates = new Set<string>();
  candidates.add(path.dirname(solution.path));
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
