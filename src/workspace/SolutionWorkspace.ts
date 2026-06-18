import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Solution } from '../solution/SolutionParser';
import { computeRootFolders } from './rootFolders';

let output: vscode.OutputChannel | undefined;
function log(message: string): void {
  if (!output) {
    output = vscode.window.createOutputChannel('VB Solution');
  }
  output.appendLine(`[workspace] ${message}`);
}

/**
 * Ensure the project directories of a solution are part of the VS Code
 * workspace, so AI assistants (Copilot/Codex/Claude), search and
 * go-to-definition can see the whole codebase.
 *
 * The extension only parses the solution in memory, so a `.sln` opened from
 * outside the current folder is invisible to anything that indexes via
 * `vscode.workspace.workspaceFolders`.
 *
 * Strategy (no reload loops, no junk files):
 *  - Only the directories that actually hold the solution's projects are added,
 *    never the solution's parent directory, so unrelated files sitting next to
 *    the `.sln` are not pulled in.
 *  - If a folder/workspace is already open, the missing project folders are
 *    added **in place** with `updateWorkspaceFolders` (no window reload).
 *  - Only when no folder is open at all do we generate a multi-root
 *    `.code-workspace` (kept in the extension's global storage, not in the
 *    project) and open it — exactly once.
 *  - Once we are running inside a workspace we generated, we never reopen again.
 */
export async function ensureSolutionWorkspace(
  context: vscode.ExtensionContext,
  solution: Solution
): Promise<void> {
  const enabled = vscode.workspace
    .getConfiguration('vbsln')
    .get<boolean>('addSolutionToWorkspace', true);
  if (!enabled) {
    return;
  }

  const dirs = computeRootFolders(solution);
  if (dirs.length === 0) {
    return;
  }

  const uncovered = dirs.filter((dir) => !isCovered(dir));
  if (uncovered.length === 0) {
    return;
  }

  // A folder or workspace is already open: add the missing project folders in
  // place. Appending folders (never touching the first one) does not restart
  // the window, so this can never cause a reload loop.
  if ((vscode.workspace.workspaceFolders?.length ?? 0) > 0) {
    const start = vscode.workspace.workspaceFolders?.length ?? 0;
    log(`Adding ${uncovered.length} project folder(s) to the workspace.`);
    vscode.workspace.updateWorkspaceFolders(
      start,
      0,
      ...uncovered.map((dir) => ({ uri: vscode.Uri.file(dir), name: labelFor(solution, dir) }))
    );
    return;
  }

  // No folder open at all: we must create a workspace to host the project
  // folders. Generate it once in global storage and open it.
  const storageDir = path.join(context.globalStorageUri.fsPath, 'workspaces');

  // Safety net: if we are somehow already inside a generated workspace, do not
  // reopen — that is what previously caused an endless reload loop.
  const currentWsFile = vscode.workspace.workspaceFile?.fsPath;
  if (currentWsFile && isInside(storageDir, currentWsFile)) {
    return;
  }

  const workspaceUri = generateWorkspaceFile(storageDir, solution, dirs);
  log(`Opening multi-root workspace for ${solution.name}: ${workspaceUri.fsPath}`);
  await vscode.commands.executeCommand('vscode.openFolder', workspaceUri, {
    forceReuseWindow: true,
  });
}

/** True when `dir` is inside one of the currently open workspace folders. */
function isCovered(dir: string): boolean {
  const folders = vscode.workspace.workspaceFolders ?? [];
  return folders.some((f) => isInside(f.uri.fsPath, dir) || normalize(f.uri.fsPath) === normalize(dir));
}

/** Whether `child` is the same as, or nested inside, `parent` (path-normalized). */
function isInside(parent: string, child: string): boolean {
  const p = normalize(parent);
  const c = normalize(child);
  return c === p || c.startsWith(p + path.sep);
}

/** Normalize a path for comparison (resolve + case-fold on Windows). */
function normalize(p: string): string {
  const resolved = path.resolve(p);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/**
 * Write (or overwrite) a deterministic `.code-workspace` file for this solution
 * and return its URI. The file name is keyed by the solution path so reopening
 * the same solution reuses the same workspace.
 */
function generateWorkspaceFile(storageDir: string, solution: Solution, dirs: string[]): vscode.Uri {
  fs.mkdirSync(storageDir, { recursive: true });

  const hash = crypto.createHash('sha1').update(solution.path).digest('hex').slice(0, 8);
  const fileName = `${sanitize(solution.name)}-${hash}.code-workspace`;
  const filePath = path.join(storageDir, fileName);

  const contents = {
    folders: dirs.map((dir) => ({ path: dir, name: labelFor(solution, dir) })),
    // Remember which solution this workspace represents: the .sln itself is not
    // one of the folders, so the extension reads this on the next activation.
    settings: {
      'vbsln.activeSolution': solution.path,
    },
  };
  fs.writeFileSync(filePath, JSON.stringify(contents, null, 2), 'utf8');
  return vscode.Uri.file(filePath);
}

/** Friendly label for a folder: the project name when it maps to one. */
function labelFor(solution: Solution, dir: string): string {
  const project = solution.projects.find((p) => normalize(path.dirname(p.absolutePath)) === normalize(dir));
  return project?.name ?? path.basename(dir);
}

/** Strip characters that are awkward in file names. */
function sanitize(name: string): string {
  return name.replace(/[^\w.-]+/g, '_');
}
