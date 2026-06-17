import * as path from 'path';
import { VbProject } from '../solution/VbprojParser';

/**
 * Output directory for the given configuration. Honors the project's
 * `<OutputPath>` (per configuration, then unconditional) and falls back to the
 * non-SDK convention `bin\<Configuration>\`.
 */
export function getOutputDir(project: VbProject, configuration: string): string {
  const rel =
    project.outputPaths[configuration] ??
    project.outputPaths['*'] ??
    path.join('bin', configuration);
  return path.resolve(project.dir, rel.replace(/\\/g, path.sep));
}

/**
 * Resolve the expected output binary for a project under the given
 * configuration. Executables produce `.exe`; libraries produce `.dll`.
 */
export function getOutputExe(project: VbProject, configuration: string): string {
  const ext = project.outputType === 'Library' ? '.dll' : '.exe';
  return path.join(getOutputDir(project, configuration), `${project.assemblyName}${ext}`);
}
