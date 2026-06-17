import * as path from 'path';
import { VbProject } from '../solution/VbprojParser';

/**
 * Resolve the expected output executable for a project under the given
 * configuration. Non-SDK projects follow the convention
 * `bin\<Configuration>\<AssemblyName>.exe`.
 */
export function getOutputExe(project: VbProject, configuration: string): string {
  const dir = path.join(project.dir, 'bin', configuration);
  return path.join(dir, `${project.assemblyName}.exe`);
}

/** Output directory for the given configuration. */
export function getOutputDir(project: VbProject, configuration: string): string {
  return path.join(project.dir, 'bin', configuration);
}
