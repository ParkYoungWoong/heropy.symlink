# @heropy/symlink

Mirror folders with symbolic links, on every operating system.

[![npm version](https://img.shields.io/npm/v/@heropy/symlink?color=cb3837&logo=npm)](https://www.npmjs.com/package/@heropy/symlink)
[![node](https://img.shields.io/node/v/@heropy/symlink?color=5fa04e&logo=node.js&logoColor=white)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/@heropy/symlink?color=444)](./LICENSE)

Read this in [한글](./README.ko.md).

You keep the same set of folders in two or more places.  
Copying them leaves you with duplicates that drift apart.  
This tool keeps one real folder and points every other place at it.

```bash
npx @heropy/symlink .claude/skills .agents/skills
```

```
link   .agents/skills/heropy-commit-push -> ../../.claude/skills/heropy-commit-push
link   .claude/skills/react-router -> ../../.agents/skills/react-router

2 linked
```

Both folders now hold the same names.  
`heropy-commit-push` is real in `.claude/skills` and linked from `.agents/skills`, `react-router` is the other way around.  
Edit either path and you edit the same files.

## Why

An agent skill is a folder with a `SKILL.md` inside, but every tool looks for it somewhere else.  
Claude Code reads `.claude/skills`, Codex and Gemini CLI read `.agents/skills`, Cursor reads several.  
Run two of them in one repository and the same skill has to exist at both paths.

Skills are only the case that made this tool.  
Shared configuration, fixtures, prompt libraries, asset folders: anything two tools insist on finding at their own path has the same shape.

## Usage

```bash
npx @heropy/symlink <folder> <folder> [folder...] [options]
npx @heropy/symlink [folder...] --list
```

Argument order carries no meaning.  
Whichever folder holds the real directory becomes the source, the rest receive a link to it.  
Paths may be relative to the working directory or absolute, and a folder that does not exist yet is created.

| Option | What it does |
| --- | --- |
| `--list` | Report the links inside the given folders and where they point. Reads only. |
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

The command is idempotent.  
A second run reports `keep` for every name and writes nothing, so it is safe in a `postinstall` script or in a task you run out of habit.

Nothing is ever deleted to make room.  
A name is skipped when a real folder with that name exists in more than one place, when a file already uses the name, or when only links remain and the real folder is gone.  
Sort those out yourself and run again.

Mirroring works on directories.  
Loose files sitting in the folders, `README.md` and the like, are left where they are.

## Listing links

`--list` walks the whole tree under every folder you give it and reports the symbolic links it finds.  
It writes nothing and creates nothing, and it never descends through a link, so no cycle can trap it.  
Given no folder it starts at the working directory.

```bash
npx @heropy/symlink --list
npx @heropy/symlink .claude .agents --list
npx @heropy/symlink . --list --only my-skill
```

```
ok     .claude/skills/react-router -> ../../.agents/skills/react-router
broken .claude/skills/old-skill -> ../../.agents/skills/old-skill

2 links, 1 broken
```

`broken` means nothing is at the destination any more.  
The command exits with code `1` when at least one link is broken, so it doubles as a check in CI.  
`node_modules` and `.git` are never walked into.

## Operating systems

macOS and Linux get a symbolic link pointing at a relative path, so the project survives being moved or cloned somewhere else.

Windows gets a directory junction, which needs no developer mode and no elevated prompt.  
Junctions only accept absolute paths, so a link made on Windows is local to that machine.  
Git records a symbolic link as file mode `120000` and carries it between machines, while a junction is not a symbolic link at all and shows up as a plain folder, so do not expect to commit links made on Windows.

Files are not supported anywhere, on purpose.  
A file symbolic link on Windows needs developer mode or an elevated prompt, and a tool that works in three places and fails in the fourth is worse than one that says no from the start.

## API

```ts
import { symlink, list } from '@heropy/symlink'

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

Each item carries the `name`, the `status`, the absolute `path` of the link, the `source` it points at, the `target` as written to disk, and a `reason` when it was skipped.

```ts
const { links, counts } = await list(['.agents'], { only: ['my-skill'] })

links // [{ name, path, target, destination, broken }]
counts // { total, broken }
```

Bad input throws a `SymlinkError` carrying a `code` of `INVALID_ARGS`, `NOT_FOUND`, `NOT_A_DIRECTORY`, or `SAME_DIRECTORY`.  
Everything else is reported in the result rather than thrown.

## Requirements

Node.js 20.19 or newer.  
No dependencies.

## License

MIT
