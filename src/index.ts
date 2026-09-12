import fs from 'node:fs/promises'
import path from 'node:path'

/** Why an item was left untouched. */
export type SkipReason =
  /** The same name exists as a real directory in more than one place. */
  | 'duplicate'
  /** A file already sits where the link should go. */
  | 'occupied'
  /** Only links remain, the real directory is gone. */
  | 'orphan'
  /** The link points outside every given directory, so `unlink` left it alone. */
  | 'foreign'

/** What happened to a single item. */
export type ItemStatus = 'linked' | 'kept' | 'fixed' | 'skipped' | 'unlinked'

export interface Item {
  /** Directory name that was mirrored. */
  name: string
  status: ItemStatus
  /** Absolute path of the link, or of the item that was skipped. */
  path: string
  /** Absolute path of the real directory behind the link. */
  source?: string
  /** Link value as written to disk: relative on macOS and Linux, absolute on Windows. */
  target?: string
  reason?: SkipReason
}

export interface Options {
  /** Report what would change without touching the disk. */
  dryRun?: boolean
  /** Remove the links this tool created instead of making them. */
  unlink?: boolean
  /** Only handle these names. */
  only?: string[]
  /** Base for relative paths. Defaults to `process.cwd()`. */
  cwd?: string
}

export interface Result {
  /** Given directories, resolved to absolute paths and deduplicated. */
  dirs: string[]
  /** Directories that did not exist and were created. */
  created: string[]
  items: Item[]
  counts: Record<ItemStatus, number>
}

/** A symbolic link found by `list`. */
export interface Link {
  /** Name of the link itself. */
  name: string
  /** Absolute path of the link. */
  path: string
  /** Link value as written on disk: relative on macOS and Linux, absolute on Windows. */
  target: string
  /** Absolute path the link resolves to, whether or not anything is there. */
  destination: string
  /** Nothing exists at the destination. */
  broken: boolean
}

export interface ListOptions {
  /** Only report links with these names. */
  only?: string[]
  /** Base for relative paths. Defaults to `process.cwd()`. */
  cwd?: string
}

export interface ListResult {
  /** Given directories, resolved to absolute paths and deduplicated. */
  dirs: string[]
  /** Every link found, sorted by path. */
  links: Link[]
  counts: { total: number; broken: number }
}

export type ErrorCode = 'INVALID_ARGS' | 'NOT_FOUND' | 'NOT_A_DIRECTORY' | 'SAME_DIRECTORY'

export class SymlinkError extends Error {
  code: ErrorCode
  constructor(code: ErrorCode, message: string) {
    super(message)
    this.name = 'SymlinkError'
    this.code = code
  }
}

/** Windows junctions are read back with an extended-length prefix. */
function stripWindowsPrefix(value: string) {
  return value.replace(/^\\\\\?\\/, '')
}

async function lstatOrNull(target: string) {
  try {
    return await fs.lstat(target)
  } catch {
    return null
  }
}

async function statOrNull(target: string) {
  try {
    return await fs.stat(target)
  } catch {
    return null
  }
}

async function realpathOrNull(target: string) {
  try {
    return await fs.realpath(target)
  } catch {
    return null
  }
}

type Kind = 'directory' | 'link' | 'file' | 'missing'

async function kindOf(target: string): Promise<Kind> {
  const stats = await lstatOrNull(target)
  if (!stats) return 'missing'
  if (stats.isSymbolicLink()) return 'link'
  if (stats.isDirectory()) return 'directory'
  return 'file'
}

/** Where the link points, as an absolute path, even when the link is broken. */
async function linkDestination(link: string) {
  try {
    const value = stripWindowsPrefix(await fs.readlink(link))
    return path.resolve(path.dirname(link), value)
  } catch {
    return null
  }
}

function isInside(parent: string, child: string) {
  const relative = path.relative(parent, child)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

async function prepareDirs(paths: string[], cwd: string, dryRun: boolean) {
  const dirs: string[] = []
  const created: string[] = []
  const seen = new Set<string>()

  for (const given of paths) {
    const absolute = path.resolve(cwd, given)
    const stats = await statOrNull(absolute)

    if (stats && !stats.isDirectory()) {
      throw new SymlinkError(
        'NOT_A_DIRECTORY',
        `"${given}" is a file. This tool links directories only.`
      )
    }

    if (!stats) {
      if (!dryRun) await fs.mkdir(absolute, { recursive: true })
      created.push(absolute)
    }

    const key = (await realpathOrNull(absolute)) ?? absolute
    if (seen.has(key)) continue
    seen.add(key)
    dirs.push(absolute)
  }

  if (dirs.length < 2) {
    throw new SymlinkError(
      'SAME_DIRECTORY',
      'Two or more different directories are required. The given paths point to the same place.'
    )
  }

  return { dirs, created }
}

async function readChildren(dir: string, only: Set<string> | null) {
  const names = await fs.readdir(dir).catch(() => [] as string[])
  const children = new Map<string, Kind>()

  for (const name of names) {
    if (only && !only.has(name)) continue
    children.set(name, await kindOf(path.join(dir, name)))
  }

  return children
}

async function createLink(source: string, link: string, dryRun: boolean) {
  const junction = process.platform === 'win32'
  // Junctions only accept absolute paths; everywhere else a relative target
  // survives moving or cloning the project.
  const target = junction ? source : path.relative(path.dirname(link), source)
  if (!dryRun) await fs.symlink(target, link, junction ? 'junction' : 'dir')
  return target
}

/** Never worth walking into. */
const IGNORED = new Set(['node_modules', '.git'])

async function resolveDirs(paths: string[], cwd: string) {
  const dirs: string[] = []
  const seen = new Set<string>()

  for (const given of paths) {
    const absolute = path.resolve(cwd, given)
    const stats = await statOrNull(absolute)

    if (!stats) {
      throw new SymlinkError('NOT_FOUND', `"${given}" does not exist.`)
    }
    if (!stats.isDirectory()) {
      throw new SymlinkError(
        'NOT_A_DIRECTORY',
        `"${given}" is a file. This tool links directories only.`
      )
    }

    const key = (await realpathOrNull(absolute)) ?? absolute
    if (seen.has(key)) continue
    seen.add(key)
    dirs.push(absolute)
  }

  // A directory nested in another given one is already covered by the walk.
  return dirs.filter((dir) => !dirs.some((other) => other !== dir && isInside(other, dir)))
}

async function walk(dir: string, only: Set<string> | null, found: Link[]) {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])

  for (const entry of entries) {
    const absolute = path.join(dir, entry.name)

    if (entry.isSymbolicLink()) {
      if (only && !only.has(entry.name)) continue
      const target = stripWindowsPrefix(await fs.readlink(absolute).catch(() => ''))
      found.push({
        name: entry.name,
        path: absolute,
        target,
        destination: path.resolve(dir, target),
        // A link is followed here on purpose: stat reports the destination.
        broken: (await statOrNull(absolute)) === null
      })
      continue
    }

    // Links are never walked into, so a cycle cannot be entered.
    if (entry.isDirectory() && !IGNORED.has(entry.name)) await walk(absolute, only, found)
  }
}

/**
 * Walks every given directory and reports the symbolic links inside it, whole
 * tree, along with where each one points and whether the destination is there.
 * Nothing is written.
 *
 * ```ts
 * const { links } = await list(['.agents'])
 * ```
 */
export async function list(paths: string[], options: ListOptions = {}): Promise<ListResult> {
  const { only, cwd = process.cwd() } = options
  const dirs = await resolveDirs(paths.length ? paths : ['.'], cwd)
  const filter = only?.length ? new Set(only) : null
  const links: Link[] = []

  for (const dir of dirs) await walk(dir, filter, links)
  links.sort((left, right) => left.path.localeCompare(right.path))

  return {
    dirs,
    links,
    counts: { total: links.length, broken: links.filter((link) => link.broken).length }
  }
}

/**
 * Mirrors the child directories of every given directory into the others with
 * symbolic links, so each directory ends up holding the same set of names.
 *
 * ```ts
 * await symlink(['.claude/skills', '.agents/skills'])
 * ```
 */
export async function symlink(paths: string[], options: Options = {}): Promise<Result> {
  const { dryRun = false, unlink = false, only, cwd = process.cwd() } = options

  if (paths.length < 2) {
    throw new SymlinkError('INVALID_ARGS', 'Give at least two directories to mirror.')
  }

  const { dirs, created } = await prepareDirs(paths, cwd, dryRun)
  const filter = only?.length ? new Set(only) : null
  const items: Item[] = []

  const listing = new Map<string, Map<string, Kind>>()
  for (const dir of dirs) listing.set(dir, await readChildren(dir, filter))

  const names = [...new Set(dirs.flatMap((dir) => [...listing.get(dir)!.keys()]))]
    .sort()
    // Plain files sitting in the folders are not mirrored, and not reported.
    .filter((name) =>
      dirs.some((dir) => {
        const kind = listing.get(dir)!.get(name)
        return kind === 'directory' || kind === 'link'
      })
    )

  for (const name of names) {
    const kindIn = (dir: string) => listing.get(dir)!.get(name) ?? 'missing'

    if (unlink) {
      for (const dir of dirs) {
        if (kindIn(dir) !== 'link') continue
        const link = path.join(dir, name)
        const destination = await linkDestination(link)
        const ours = destination !== null && dirs.some((other) => isInside(other, destination))

        if (!ours) {
          items.push({ name, status: 'skipped', path: link, reason: 'foreign' })
          continue
        }

        if (!dryRun) await fs.rm(link, { recursive: true, force: true })
        items.push({ name, status: 'unlinked', path: link })
      }
      continue
    }

    const sources = dirs.filter((dir) => kindIn(dir) === 'directory')

    if (sources.length > 1) {
      for (const dir of sources) {
        items.push({ name, status: 'skipped', path: path.join(dir, name), reason: 'duplicate' })
      }
      continue
    }

    if (sources.length === 0) {
      for (const dir of dirs) {
        if (kindIn(dir) !== 'link') continue
        items.push({ name, status: 'skipped', path: path.join(dir, name), reason: 'orphan' })
      }
      continue
    }

    const source = path.join(sources[0]!, name)
    const sourceReal = (await realpathOrNull(source)) ?? source

    for (const dir of dirs) {
      if (dir === sources[0]) continue
      const link = path.join(dir, name)
      const kind = kindIn(dir)

      if (kind === 'file') {
        items.push({ name, status: 'skipped', path: link, source, reason: 'occupied' })
        continue
      }

      if (kind === 'link') {
        const current = await realpathOrNull(link)
        if (current === sourceReal) {
          items.push({ name, status: 'kept', path: link, source })
          continue
        }
        if (!dryRun) await fs.rm(link, { recursive: true, force: true })
        const target = await createLink(source, link, dryRun)
        items.push({ name, status: 'fixed', path: link, source, target })
        continue
      }

      const target = await createLink(source, link, dryRun)
      items.push({ name, status: 'linked', path: link, source, target })
    }
  }

  const counts: Record<ItemStatus, number> = {
    linked: 0,
    kept: 0,
    fixed: 0,
    skipped: 0,
    unlinked: 0
  }
  for (const item of items) counts[item.status]++

  return { dirs, created, items, counts }
}

export default symlink
