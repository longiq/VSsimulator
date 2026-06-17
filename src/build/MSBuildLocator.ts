import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFile } from 'child_process';
import * as vscode from 'vscode';

let cachedPath: string | undefined;

/** Default location of vswhere installed alongside the VS Installer. */
function vswherePath(): string {
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  return path.join(programFilesX86, 'Microsoft Visual Studio', 'Installer', 'vswhere.exe');
}

function run(file: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: true }, (err, stdout) => {
      if (err) {
        reject(err);
      } else {
        resolve(stdout.toString());
      }
    });
  });
}

/**
 * Locate MSBuild.exe.
 *
 * Resolution order:
 *  1. The `vbsln.msbuildPath` setting, if it points to an existing file.
 *  2. vswhere lookup of the latest VS / Build Tools install that ships MSBuild.
 *
 * Returns `undefined` when MSBuild cannot be found (e.g. non-Windows host or
 * Build Tools not installed).
 */
export async function findMSBuild(): Promise<string | undefined> {
  const configured = vscode.workspace
    .getConfiguration('vbsln')
    .get<string>('msbuildPath', '')
    .trim();
  if (configured && fs.existsSync(configured)) {
    return configured;
  }

  if (cachedPath && fs.existsSync(cachedPath)) {
    return cachedPath;
  }

  // MSBuild for .NET Framework only exists on Windows.
  if (os.platform() !== 'win32') {
    return undefined;
  }

  const vswhere = vswherePath();
  if (!fs.existsSync(vswhere)) {
    return undefined;
  }

  try {
    const out = await run(vswhere, [
      '-latest',
      '-products',
      '*',
      '-requires',
      'Microsoft.Component.MSBuild',
      '-find',
      'MSBuild\\**\\Bin\\MSBuild.exe',
    ]);
    const first = out
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)[0];
    if (first && fs.existsSync(first)) {
      cachedPath = first;
      return first;
    }
  } catch {
    // Fall through to undefined.
  }
  return undefined;
}

/** Clear the cached MSBuild path (e.g. when the setting changes). */
export function clearMSBuildCache(): void {
  cachedPath = undefined;
}
