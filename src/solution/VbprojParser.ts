import * as fs from 'fs';
import * as path from 'path';
import { XMLParser } from 'fast-xml-parser';

export type OutputType = 'Exe' | 'WinExe' | 'Library' | 'Unknown';

/** A reference (assembly or project) declared by the project. */
export interface ProjectReference {
  /** Display name. */
  name: string;
  /** True for <ProjectReference>, false for assembly <Reference>. */
  isProjectReference: boolean;
  /** Absolute path for project references, if resolvable. */
  absolutePath?: string;
}

/** A source/content file included by the project. */
export interface ProjectItem {
  /** Path relative to the project directory (as written in the file). */
  include: string;
  /** Absolute path on disk. */
  absolutePath: string;
  /** MSBuild item kind: Compile, Content, None, EmbeddedResource, ... */
  itemType: string;
  /**
   * The file this item is nested under in the Solution Explorer, as written in
   * `<DependentUpon>` (usually just a file name, e.g. `Form1.vb`). Undefined for
   * top-level items.
   */
  dependentUpon?: string;
}

export interface VbProject {
  /** Absolute path to the .vbproj file. */
  path: string;
  /** Directory containing the project file. */
  dir: string;
  /** Project name (file name without extension). */
  name: string;
  outputType: OutputType;
  /** Assembly name; defaults to project name when not specified. */
  assemblyName: string;
  /** Root namespace, if declared. */
  rootNamespace?: string;
  /** Target framework version, e.g. `v4.8`. */
  targetFramework?: string;
  /** Startup object (e.g. `HelloWorld.Module1`), if declared. */
  startupObject?: string;
  /** Whether the project produces a runnable executable. */
  isExecutable: boolean;
  references: ProjectReference[];
  items: ProjectItem[];
  /** Explicitly declared empty folders (<Folder Include>). */
  folders: string[];
  /**
   * OutputPath per configuration name (e.g. `Debug` -> `bin\Debug\`). The key
   * `*` holds an unconditional OutputPath, if any.
   */
  outputPaths: Record<string, string>;
}

const ITEM_TYPES = [
  'Compile',
  'Content',
  'None',
  'EmbeddedResource',
  'Resource',
  'ApplicationDefinition',
  'Page',
];

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  // Always return arrays for the element names we iterate over so callers do
  // not have to special-case single vs. multiple occurrences.
  isArray: (name) =>
    ['PropertyGroup', 'ItemGroup', 'Reference', 'ProjectReference', 'Folder', ...ITEM_TYPES].includes(
      name
    ),
});

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function firstScalar(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return firstScalar(value[0]);
  }
  if (typeof value === 'object') {
    // fast-xml-parser stores element text under '#text'.
    const text = (value as Record<string, unknown>)['#text'];
    return text === undefined ? undefined : String(text);
  }
  return String(value);
}

/** Parse a non-SDK style .vbproj from disk. */
export function parseVbproj(vbprojPath: string): VbProject {
  const content = fs.readFileSync(vbprojPath, 'utf8');
  return parseVbprojContent(content, vbprojPath);
}

/** Parse raw .vbproj content. `vbprojPath` resolves relative includes. */
export function parseVbprojContent(content: string, vbprojPath: string): VbProject {
  const dir = path.dirname(vbprojPath);
  const name = path.basename(vbprojPath, path.extname(vbprojPath));

  const xml = parser.parse(content);
  const project = xml.Project ?? {};
  const propertyGroups = toArray<Record<string, unknown>>(project.PropertyGroup);
  const itemGroups = toArray<Record<string, unknown>>(project.ItemGroup);

  // Scalar properties can appear in any PropertyGroup; first wins.
  let outputTypeRaw: string | undefined;
  let assemblyName: string | undefined;
  let rootNamespace: string | undefined;
  let targetFramework: string | undefined;
  let startupObject: string | undefined;
  const outputPaths: Record<string, string> = {};
  for (const pg of propertyGroups) {
    outputTypeRaw = outputTypeRaw ?? firstScalar(pg['OutputType']);
    assemblyName = assemblyName ?? firstScalar(pg['AssemblyName']);
    rootNamespace = rootNamespace ?? firstScalar(pg['RootNamespace']);
    targetFramework = targetFramework ?? firstScalar(pg['TargetFrameworkVersion']);
    startupObject = startupObject ?? firstScalar(pg['StartupObject']);

    // OutputPath is usually inside a configuration-conditioned PropertyGroup.
    const outputPath = firstScalar(pg['OutputPath']);
    if (outputPath) {
      const config = configFromCondition(pg['@_Condition']);
      outputPaths[config ?? '*'] = outputPath;
    }
  }

  const outputType = normalizeOutputType(outputTypeRaw);
  const items: ProjectItem[] = [];
  const references: ProjectReference[] = [];
  const folders: string[] = [];

  for (const ig of itemGroups) {
    for (const itemType of ITEM_TYPES) {
      for (const entry of toArray<Record<string, unknown>>(ig[itemType] as never)) {
        const include = entry?.['@_Include'];
        if (typeof include !== 'string' || include.length === 0) {
          continue;
        }
        const normalized = include.replace(/\\/g, path.sep);
        const dependentUpon = firstScalar(entry['DependentUpon']);
        items.push({
          include,
          absolutePath: path.resolve(dir, normalized),
          itemType,
          dependentUpon: dependentUpon ? dependentUpon.replace(/\\/g, path.sep) : undefined,
        });
      }
    }

    for (const ref of toArray<Record<string, unknown>>(ig.Reference as never)) {
      const includeAttr = ref?.['@_Include'];
      if (typeof includeAttr !== 'string') {
        continue;
      }
      // Assembly references use a strong name; take the simple name only.
      references.push({
        name: includeAttr.split(',')[0].trim(),
        isProjectReference: false,
      });
    }

    for (const ref of toArray<Record<string, unknown>>(ig.ProjectReference as never)) {
      const includeAttr = ref?.['@_Include'];
      if (typeof includeAttr !== 'string') {
        continue;
      }
      const normalized = includeAttr.replace(/\\/g, path.sep);
      const refName = firstScalar(ref['Name']) ?? path.basename(includeAttr, path.extname(includeAttr));
      references.push({
        name: refName,
        isProjectReference: true,
        absolutePath: path.resolve(dir, normalized),
      });
    }

    for (const folder of toArray<Record<string, unknown>>(ig.Folder as never)) {
      const includeAttr = folder?.['@_Include'];
      if (typeof includeAttr === 'string' && includeAttr.length > 0) {
        folders.push(includeAttr.replace(/\\/g, path.sep));
      }
    }
  }

  return {
    path: vbprojPath,
    dir,
    name,
    outputType,
    assemblyName: assemblyName ?? name,
    rootNamespace,
    targetFramework,
    startupObject,
    isExecutable: outputType === 'Exe' || outputType === 'WinExe',
    references,
    items,
    folders,
    outputPaths,
  };
}

/**
 * Extract the configuration name from an MSBuild PropertyGroup condition such as
 * `'$(Configuration)|$(Platform)' == 'Debug|AnyCPU'` -> `Debug`. Returns
 * undefined when the condition does not pin a configuration.
 */
function configFromCondition(condition: unknown): string | undefined {
  if (typeof condition !== 'string') {
    return undefined;
  }
  // Grab the right-hand literal, then the part before the first '|'.
  const m = /==\s*'([^']*)'/.exec(condition);
  if (!m) {
    return undefined;
  }
  const literal = m[1];
  const config = literal.split('|')[0].trim();
  return config.length > 0 ? config : undefined;
}

function normalizeOutputType(raw: string | undefined): OutputType {
  switch ((raw ?? '').trim().toLowerCase()) {
    case 'exe':
      return 'Exe';
    case 'winexe':
      return 'WinExe';
    case 'library':
      return 'Library';
    default:
      return 'Unknown';
  }
}
