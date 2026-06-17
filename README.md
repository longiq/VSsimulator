# VB.NET Solution Explorer

A Visual Studio Code extension that lets you **open, browse, build, run and debug
VB.NET (.NET Framework) solution (`.sln`) files** — without needing the full
Visual Studio IDE.

The `.sln` format itself is language-agnostic (it is identical for C# and
VB.NET); the difference is the project file (`.vbproj` instead of `.csproj`).
While the marketplace already has C#-focused solution explorers, this extension
is written from scratch with VB.NET / .NET Framework projects in mind.

## Features

- **Solution Explorer tree** — parses the `.sln` and each non-SDK `.vbproj` and
  shows a Visual-Studio-like tree (Solution → Projects → References → Folders →
  Files). Click a file to open it.
- **Build / Rebuild** the whole solution or an individual project with MSBuild.
- **Run** an executable project (`OutputType` = `Exe`/`WinExe`).
- **Debug** a .NET Framework executable using the `clr` debugger provided by the
  official C# extension.

## Requirements

This extension targets **classic .NET Framework** projects, so it expects a
**Windows** environment with:

- **Visual Studio** or **Visual Studio Build Tools** installed (provides
  `MSBuild.exe`, located automatically via `vswhere`).
- The **C# extension** (`ms-dotnettools.csharp`) — required for the `clr`
  debugger. It is declared as an extension dependency and installed
  automatically.

## Usage

1. Open a folder that contains a VB.NET `.sln` file. The **VB Solution** view
   appears in the Activity Bar and loads the solution automatically.
2. Use the title-bar buttons or right-click nodes in the tree:
   - Right-click the **Solution** → *Build* / *Rebuild*.
   - Right-click a **Project** → *Build Project* / *Run* / *Debug*.
3. To open a different solution, run **VB: Open Solution (.sln)** from the
   command palette or the view title bar.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `vbsln.configuration` | `Debug` | MSBuild configuration used for build/run/debug. |
| `vbsln.msbuildPath` | `""` | Explicit path to `MSBuild.exe`. Leave empty to auto-detect with `vswhere`. |

## How it works

| Concern | Implementation |
| --- | --- |
| Parse `.sln` | `src/solution/SolutionParser.ts` — scans `Project(...)` lines, skips solution folders. |
| Parse `.vbproj` | `src/solution/VbprojParser.ts` — reads `OutputType`, `AssemblyName`, `Compile`/`Content`/`None`, references and folders. |
| Tree view | `src/tree/SolutionTreeProvider.ts` + `src/tree/nodes.ts`. |
| Locate MSBuild | `src/build/MSBuildLocator.ts` — runs `vswhere -find MSBuild\**\Bin\MSBuild.exe`. |
| Build | `src/build/BuildService.ts` — runs MSBuild as a VS Code task with the `$msCompile` problem matcher. |
| Run | `src/run/RunService.ts`. |
| Debug | `src/debug/DebugService.ts` — launches a `clr` debug session. |

## Development

```bash
npm install
npm run compile      # or: npm run watch
```

Press <kbd>F5</kbd> to launch an **Extension Development Host**. The included
`sample/` folder contains a small VB.NET .NET Framework console solution
(`HelloWorld.sln`) for testing the tree, build, run and debug flows.

## Limitations

- Windows only (classic .NET Framework + MSBuild + `clr` debugger).
- Targets **non-SDK** `.vbproj` files. SDK-style projects are not the primary
  focus (the project parser is isolated to make adding them later easy).
- Does not provide VB.NET IntelliSense / language services (out of scope).
