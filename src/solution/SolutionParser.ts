import * as fs from 'fs';
import * as path from 'path';

/** A real (non-folder) project referenced by a solution file. */
export interface SolutionProject {
  /** Project type GUID (e.g. VB.NET = F184B08F-...). */
  typeGuid: string;
  /** Display name of the project. */
  name: string;
  /** Path of the project relative to the .sln file (as written in the file). */
  relativePath: string;
  /** Absolute path to the project file on disk. */
  absolutePath: string;
  /** Unique project GUID. */
  guid: string;
}

export interface Solution {
  /** Absolute path to the .sln file. */
  path: string;
  /** Solution name (file name without extension). */
  name: string;
  /** Real projects (solution folders are excluded). */
  projects: SolutionProject[];
}

/** GUID for solution folders – these are not real projects and are skipped. */
const SOLUTION_FOLDER_TYPE_GUID = '2150E333-8FDC-42A3-9474-1A3956D46DE8';

/** VB.NET project type GUID. Exposed for callers that want to filter by language. */
export const VB_PROJECT_TYPE_GUID = 'F184B08F-C81C-45F6-A57F-5ABD9991F28F';

/**
 * Matches lines such as:
 *   Project("{TYPE-GUID}") = "Name", "relative\path.vbproj", "{PROJECT-GUID}"
 */
const PROJECT_LINE = /^Project\("\{([^}]+)\}"\)\s*=\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"\{([^}]+)\}"/;

/** Parse a .sln file from disk into a {@link Solution}. */
export function parseSolution(slnPath: string): Solution {
  const content = fs.readFileSync(slnPath, 'utf8');
  return parseSolutionContent(content, slnPath);
}

/** Parse raw .sln content. `slnPath` is used to resolve relative project paths. */
export function parseSolutionContent(content: string, slnPath: string): Solution {
  const baseDir = path.dirname(slnPath);
  const projects: SolutionProject[] = [];

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    const m = PROJECT_LINE.exec(line);
    if (!m) {
      continue;
    }
    const [, typeGuid, name, relativePath, guid] = m;

    // Skip solution folders – they are organizational, not real projects.
    if (typeGuid.toUpperCase() === SOLUTION_FOLDER_TYPE_GUID) {
      continue;
    }

    // Normalize the Windows-style backslashes used inside .sln files.
    const normalized = relativePath.replace(/\\/g, path.sep);
    projects.push({
      typeGuid: typeGuid.toUpperCase(),
      name,
      relativePath,
      absolutePath: path.resolve(baseDir, normalized),
      guid: guid.toUpperCase(),
    });
  }

  return {
    path: slnPath,
    name: path.basename(slnPath, path.extname(slnPath)),
    projects,
  };
}
