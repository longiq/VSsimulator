import * as fs from 'fs';

/**
 * Given a `.vb` or `.Designer.vb` path, return the designer file that should be
 * parsed for a form preview, or undefined when the file is not a WinForms form.
 *
 * Resolution:
 *  - `Foo.Designer.vb`            -> itself
 *  - `Foo.vb` with `Foo.Designer.vb` sibling -> the sibling
 *  - `Foo.vb` that itself contains `InitializeComponent` (single-file form) -> itself
 */
export function resolveFormDesigner(filePath: string): string | undefined {
  const lower = filePath.toLowerCase();

  if (lower.endsWith('.designer.vb')) {
    return fs.existsSync(filePath) ? filePath : undefined;
  }

  if (lower.endsWith('.vb')) {
    const sibling = `${filePath.slice(0, -'.vb'.length)}.Designer.vb`;
    if (fs.existsSync(sibling)) {
      return sibling;
    }
    if (fs.existsSync(filePath) && containsInitializeComponent(filePath)) {
      return filePath;
    }
  }

  return undefined;
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
