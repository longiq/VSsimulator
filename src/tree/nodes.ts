import * as vscode from 'vscode';
import { Solution } from '../solution/SolutionParser';
import { VbProject } from '../solution/VbprojParser';

/** Discriminator for the different kinds of nodes in the tree. */
export type NodeKind = 'solution' | 'project' | 'references' | 'reference' | 'folder' | 'file';

/** Base class for every entry shown in the Solution Explorer tree. */
export abstract class TreeNode extends vscode.TreeItem {
  abstract readonly kind: NodeKind;
  /** Compute the children of this node lazily. */
  abstract getChildren(): TreeNode[];
}

export class SolutionNode extends TreeNode {
  readonly kind = 'solution';
  constructor(public readonly solution: Solution, private readonly projects: ProjectNode[]) {
    super(`Solution '${solution.name}'`, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'solution';
    this.iconPath = new vscode.ThemeIcon('archive');
    this.resourceUri = vscode.Uri.file(solution.path);
    this.tooltip = solution.path;
  }
  getChildren(): TreeNode[] {
    return this.projects;
  }
}

export class ProjectNode extends TreeNode {
  readonly kind = 'project';
  constructor(public readonly project: VbProject) {
    super(project.name, vscode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = 'project';
    this.iconPath = new vscode.ThemeIcon('package');
    this.resourceUri = vscode.Uri.file(project.path);
    this.tooltip = project.path;
    this.description = project.outputType !== 'Unknown' ? project.outputType : undefined;
  }

  getChildren(): TreeNode[] {
    const children: TreeNode[] = [new ReferencesNode(this.project)];
    children.push(...buildFileTree(this.project));
    return children;
  }
}

class ReferencesNode extends TreeNode {
  readonly kind = 'references';
  constructor(private readonly project: VbProject) {
    super('References', vscode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = 'references';
    this.iconPath = new vscode.ThemeIcon('references');
  }
  getChildren(): TreeNode[] {
    return this.project.references
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((r) => new ReferenceNode(r.name, r.isProjectReference));
  }
}

class ReferenceNode extends TreeNode {
  readonly kind = 'reference';
  constructor(name: string, isProject: boolean) {
    super(name, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'reference';
    this.iconPath = new vscode.ThemeIcon(isProject ? 'project' : 'library');
  }
  getChildren(): TreeNode[] {
    return [];
  }
}

export class FolderNode extends TreeNode {
  readonly kind = 'folder';
  constructor(label: string, private readonly children: TreeNode[]) {
    super(label, vscode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = 'folder';
    this.iconPath = vscode.ThemeIcon.Folder;
  }
  getChildren(): TreeNode[] {
    return this.children;
  }
}

export class FileNode extends TreeNode {
  readonly kind = 'file';
  constructor(
    label: string,
    public readonly absolutePath: string,
    private readonly children: TreeNode[] = [],
    isForm = false
  ) {
    super(
      label,
      children.length > 0
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None
    );
    // `vbForm` enables the "View Form Designer" context menu entry.
    this.contextValue = isForm ? 'vbForm' : 'file';
    this.resourceUri = vscode.Uri.file(absolutePath);
    this.iconPath = vscode.ThemeIcon.File;
    this.command = {
      command: 'vbsln.openFile',
      title: 'Open File',
      arguments: [vscode.Uri.file(absolutePath)],
    };
    this.tooltip = absolutePath;
  }
  getChildren(): TreeNode[] {
    return this.children;
  }
}

/** A file collected while building the tree, before nesting is applied. */
interface FileEntry {
  label: string;
  absolutePath: string;
  /** File name of the parent this item is nested under, if any. */
  dependentUpon?: string;
}

/** Intermediate mutable tree used to group included items into folders. */
interface DirEntry {
  dirs: Map<string, DirEntry>;
  files: FileEntry[];
}

/**
 * Build a Visual-Studio-like folder tree from the flat list of included items.
 * Non-SDK projects list every file explicitly, so the folder structure is
 * inferred from the relative include paths. Files marked `<DependentUpon>` are
 * nested under their parent file (e.g. Form1.Designer.vb under Form1.vb).
 */
function buildFileTree(project: VbProject): TreeNode[] {
  const root: DirEntry = { dirs: new Map(), files: [] };

  const ensureDir = (segments: string[]): DirEntry => {
    let current = root;
    for (const seg of segments) {
      let next = current.dirs.get(seg);
      if (!next) {
        next = { dirs: new Map(), files: [] };
        current.dirs.set(seg, next);
      }
      current = next;
    }
    return current;
  };

  for (const item of project.items) {
    const segments = item.include.split(/[\\/]/).filter((s) => s.length > 0);
    const fileName = segments.pop();
    if (!fileName) {
      continue;
    }
    // DependentUpon may be written with a path; only the file name matters for
    // matching within the same directory.
    const parent = item.dependentUpon
      ? item.dependentUpon.split(/[\\/]/).pop()
      : undefined;
    ensureDir(segments).files.push({
      label: fileName,
      absolutePath: item.absolutePath,
      dependentUpon: parent,
    });
  }

  // Declared empty folders.
  for (const folder of project.folders) {
    const segments = folder.split(/[\\/]/).filter((s) => s.length > 0);
    ensureDir(segments);
  }

  const buildFileNodes = (files: FileEntry[]): FileNode[] => {
    // Group dependents by their (case-insensitive) parent file name.
    const dependentsByParent = new Map<string, FileEntry[]>();
    const primaries: FileEntry[] = [];
    const labels = new Set(files.map((f) => f.label.toLowerCase()));
    for (const f of files) {
      const key = f.dependentUpon?.toLowerCase();
      // Only nest when the named parent actually exists in this directory;
      // otherwise treat the file as a normal top-level entry.
      if (key && labels.has(key)) {
        const list = dependentsByParent.get(key) ?? [];
        list.push(f);
        dependentsByParent.set(key, list);
      } else {
        primaries.push(f);
      }
    }

    return primaries
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((f) => {
        const rawDeps = dependentsByParent.get(f.label.toLowerCase()) ?? [];
        const deps = rawDeps
          .sort((a, b) => a.label.localeCompare(b.label))
          .map((d) => new FileNode(d.label, d.absolutePath));
        // A primary .vb with a *.Designer.vb dependent is a WinForms form.
        const isForm =
          /\.vb$/i.test(f.label) && rawDeps.some((d) => /\.designer\.vb$/i.test(d.label));
        return new FileNode(f.label, f.absolutePath, deps, isForm);
      });
  };

  const materialize = (entry: DirEntry): TreeNode[] => {
    const folderNodes = [...entry.dirs.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, child]) => new FolderNode(name, materialize(child)));
    // Folders first, then files, matching Visual Studio's ordering.
    return [...folderNodes, ...buildFileNodes(entry.files)];
  };

  return materialize(root);
}
