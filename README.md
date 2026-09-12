# @heropy/symlink

Mirror folders with symbolic links, on every operating system.

Read this in [한국어](./README.ko.md).

You keep the same set of folders in two or more places. Copying them leaves you
with duplicates that drift apart. This tool keeps one real folder and makes the
other places point at it.

```bash
npx @heropy/symlink .claude/skills .agents/skills
```

```
link   .agents/skills/heropy-commit-push -> ../../.claude/skills/heropy-commit-push
link   .claude/skills/react-router -> ../../.agents/skills/react-router

2 linked
```

Every listed folder now holds the same names. `heropy-commit-push` is real in
`.claude/skills` and linked from `.agents/skills`, `react-router` is real in
`.agents/skills` and linked from `.claude/skills`. Edit either path and you are
editing the same files.

## Why

Agent skills are just folders with a `SKILL.md` inside, but every tool looks in
its own place. Claude Code reads `.claude/skills`, Codex and Gemini CLI read
`.agents/skills`, Cursor reads several. Use two tools in one project and the
same skill has to sit in both paths.

The problem is not limited to skills. Shared configuration, fixtures, prompt
libraries, asset folders: anything that two tools insist on finding at their own
path has the same shape.

## Usage

```bash
npx @heropy/symlink <folder> <folder> [folder...] [options]
```

Order does not matter. Whichever folder holds the real thing becomes the source,
the others get a link to it. Paths can be relative to where you run the command,
or absolute. A folder that does not exist yet is created.

| Option | What it does |
| --- | --- |
| `--only <name>` | Handle only these names. Repeat the flag or separate with commas. |
| `--unlink` | Remove the links this tool created. Real folders are left alone. |
| `--dry-run` | Print what would change without touching the disk. |
| `-h`, `--help` | Show help. |
| `-v`, `--version` | Show the version. |

```bash
# see what would happen first
npx @heropy/symlink .claude/skills .agents/skills --dry-run

# three places at once
npx @heropy/symlink .claude/skills .agents/skills .gemini/skills

# one name only
npx @heropy/symlink .claude/skills .agents/skills --only my-skill

# take the links back out
npx @heropy/symlink .claude/skills .agents/skills --unlink
```

## What it does to each name

| Report | Meaning |
| --- | --- |
| `link` | The folder was missing here, a link was created. |
| `keep` | A link already points at the right place, nothing was written. |
| `fix` | A link pointed somewhere else or at nothing, it was rebuilt. |
| `skip` | Left untouched. The reason is printed next to it. |

Running it twice changes nothing the second time, so it is safe in a `postinstall`
script or in a task you run by habit.

Nothing is ever deleted to make room. A name is skipped when a real folder with
that name exists in more than one place, when a file already uses the name, or
when only links remain and the real folder is gone. Sort those out yourself and
run again.

Loose files inside the folders, `README.md` and the like, are ignored. Only
folders are mirrored.

## Operating systems

macOS and Linux get a symbolic link pointing at a relative path, so the project
keeps working after you move it or someone else clones it.

Windows gets a directory junction, which needs no developer mode and no
administrator prompt. Junctions only accept absolute paths, so a link made on
Windows is local to that machine. Git records a symbolic link as file mode
`120000` and can carry it between machines, but a junction is not a symbolic
link and shows up as a plain folder, so do not expect to commit links made on
Windows.

Files are not supported anywhere, on purpose. A file symbolic link on Windows
needs developer mode or an elevated prompt, and a tool that works in three
places and fails in the fourth is worse than one that says no from the start.

## API

```ts
import { symlink } from '@heropy/symlink'

const result = await symlink(['.claude/skills', '.agents/skills'], {
  dryRun: false,
  unlink: false,
  only: ['my-skill'],
  cwd: process.cwd()
})

result.dirs // absolute paths, deduplicated
result.created // folders that did not exist and were created
result.counts // { linked, kept, fixed, skipped, unlinked }
result.items // one entry per name and folder
```

Each item carries the `name`, the `status`, the absolute `path` of the link, the
`source` it points at, the `target` as written to disk, and a `reason` when it
was skipped.

Bad input throws a `SymlinkError` with a `code` of `INVALID_ARGS`,
`NOT_A_DIRECTORY`, or `SAME_DIRECTORY`. Everything else is reported in the
result rather than thrown.

## Requirements

Node.js 20.19 or newer. No dependencies.

## License

MIT
