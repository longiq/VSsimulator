import * as fs from 'fs';
import * as path from 'path';

/**
 * Given a `.vb` or `.Designer.vb` path, return the designer file that should be
 * parsed for a form preview, or undefined when the file is not a WinForms form.
 *
 * Resolution:
 *  - `Foo.Designer.vb`            -> itself
 *  - `Foo.vb` with `Foo.Designer.vb` sibling -> the sibling
 *  - `Foo.vb` that itself contains `InitializeComponent` (single-file form) -> itself
 *
 * Lookups are case-insensitive: VB.NET projects come from Windows, where paths
 * ignore case, so an include like `Wnd\Form1.Designer.vb` must still resolve to
 * an on-disk `WND/Form1.Designer.vb` on a case-sensitive filesystem.
 */
export function resolveFormDesigner(filePath: string): string | undefined {
  const lower = filePath.toLowerCase();

  if (lower.endsWith('.designer.vb')) {
    return existsCI(filePath);
  }

  if (lower.endsWith('.vb')) {
    const sibling = `${filePath.slice(0, -'.vb'.length)}.Designer.vb`;
    const resolvedSibling = existsCI(sibling);
    if (resolvedSibling) {
      return resolvedSibling;
    }
    const self = existsCI(filePath);
    if (self && containsInitializeComponent(self)) {
      return self;
    }
  }

  return undefined;
}

/**
 * Return the actual on-disk path matching `filePath`, comparing the file name
 * case-insensitively within its directory. Returns undefined if no match.
 */
function existsCI(filePath: string): string | undefined {
  if (fs.existsSync(filePath)) {
    return filePath;
  }
  const dir = path.dirname(filePath);
  const wanted = path.basename(filePath).toLowerCase();
  try {
    const match = fs.readdirSync(dir).find((name) => name.toLowerCase() === wanted);
    return match ? path.join(dir, match) : undefined;
  } catch {
    return undefined;
  }
}

/** Whether a file path looks like a WinForms form (for menu visibility). */
export function isFormFile(filePath: string): boolean {
  return resolveFormDesigner(filePath) !== undefined;
}

function containsInitializeComponent(filePath: string): boolean {
  try {
    return /Sub\s+InitializeComponent\s*\(/i.test(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return false;
  }
}
