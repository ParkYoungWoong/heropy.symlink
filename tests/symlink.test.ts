import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SymlinkError, list, symlink, type Item } from '../src/index.js'

let root: string
let a: string
let b: string

beforeEach(async () => {
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'symlink-test-')))
  a = path.join(root, 'a')
  b = path.join(root, 'b')
  await fs.mkdir(a, { recursive: true })
  await fs.mkdir(b, { recursive: true })
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

async function makeSkill(dir: string, name: string) {
  await fs.mkdir(path.join(dir, name), { recursive: true })
  await fs.writeFile(path.join(dir, name, 'SKILL.md'), `# ${name}\n`)
}

async function isLink(target: string) {
  return (await fs.lstat(target)).isSymbolicLink()
}

function find(items: Item[], name: string, dir: string) {
  return items.find((item) => item.name === name && path.dirname(item.path) === dir)
}

describe('symlink', () => {
  it('links what each side is missing, in both directions', async () => {
    await makeSkill(a, 'one')
    await makeSkill(b, 'two')

    const result = await symlink([a, b])

    expect(result.counts.linked).toBe(2)
    expect(await isLink(path.join(b, 'one'))).toBe(true)
    expect(await isLink(path.join(a, 'two'))).toBe(true)
    expect(await fs.readFile(path.join(b, 'one', 'SKILL.md'), 'utf8')).toContain('one')
  })

  it('does not care which folder holds the real thing', async () => {
    await makeSkill(b, 'only-in-b')

    const result = await symlink([a, b])

    expect(find(result.items, 'only-in-b', a)?.status).toBe('linked')
    expect(await isLink(path.join(a, 'only-in-b'))).toBe(true)
    expect((await fs.lstat(path.join(b, 'only-in-b'))).isDirectory()).toBe(true)
  })

  it('mirrors across three folders', async () => {
    const c = path.join(root, 'c')
    await fs.mkdir(c)
    await makeSkill(a, 'one')

    const result = await symlink([a, b, c])

    expect(result.counts.linked).toBe(2)
    expect(await isLink(path.join(b, 'one'))).toBe(true)
    expect(await isLink(path.join(c, 'one'))).toBe(true)
  })

  it('ends in the same state however often it runs', async () => {
    await makeSkill(a, 'one')
    await symlink([a, b])

    const second = await symlink([a, b])

    expect(second.counts).toMatchObject({ linked: 0, fixed: 0, kept: 1 })
  })

  it('rebuilds a link that points nowhere', async () => {
    await makeSkill(a, 'one')
    await symlink([a, b])
    await fs.rename(path.join(a, 'one'), path.join(a, 'renamed'))
    await fs.rename(path.join(a, 'renamed'), path.join(a, 'one'))
    await fs.symlink('../gone', path.join(b, 'broken'), 'dir')
    await makeSkill(a, 'broken')

    const result = await symlink([a, b])

    expect(find(result.items, 'broken', b)?.status).toBe('fixed')
    expect(await fs.readFile(path.join(b, 'broken', 'SKILL.md'), 'utf8')).toContain('broken')
  })

  it('leaves both sides alone when each holds a real folder', async () => {
    await makeSkill(a, 'same')
    await makeSkill(b, 'same')

    const result = await symlink([a, b])

    expect(result.counts.skipped).toBe(2)
    expect(find(result.items, 'same', a)?.reason).toBe('duplicate')
    expect((await fs.lstat(path.join(a, 'same'))).isDirectory()).toBe(true)
    expect((await fs.lstat(path.join(b, 'same'))).isDirectory()).toBe(true)
  })

  it('reports links whose folder is gone', async () => {
    await makeSkill(a, 'one')
    await symlink([a, b])
    await fs.rm(path.join(a, 'one'), { recursive: true })

    const result = await symlink([a, b])

    expect(find(result.items, 'one', b)?.reason).toBe('orphan')
    expect(await isLink(path.join(b, 'one'))).toBe(true)
  })

  it('does not overwrite a file that already uses the name', async () => {
    await makeSkill(a, 'one')
    await fs.writeFile(path.join(b, 'one'), 'do not touch')

    const result = await symlink([a, b])

    expect(find(result.items, 'one', b)?.reason).toBe('occupied')
    expect(await fs.readFile(path.join(b, 'one'), 'utf8')).toBe('do not touch')
  })

  it('ignores loose files inside the folders', async () => {
    await fs.writeFile(path.join(a, 'README.md'), '# hi')
    await makeSkill(a, 'one')

    const result = await symlink([a, b])

    expect(result.items.map((item) => item.name)).toEqual(['one'])
    expect(await fs.readdir(b)).toEqual(['one'])
  })

  it('writes nothing on a dry run', async () => {
    await makeSkill(a, 'one')

    const result = await symlink([a, b], { dryRun: true })

    expect(result.counts.linked).toBe(1)
    expect(await fs.readdir(b)).toEqual([])
  })

  it('creates a folder that does not exist yet', async () => {
    await makeSkill(a, 'one')
    const fresh = path.join(root, 'fresh', 'skills')

    const result = await symlink([a, fresh])

    expect(result.created).toEqual([fresh])
    expect(await isLink(path.join(fresh, 'one'))).toBe(true)
  })

  it('handles only the given names', async () => {
    await makeSkill(a, 'one')
    await makeSkill(a, 'two')

    const result = await symlink([a, b], { only: ['two'] })

    expect(result.items.map((item) => item.name)).toEqual(['two'])
    expect(await fs.readdir(b)).toEqual(['two'])
  })

  it('removes its own links and keeps everything else', async () => {
    await makeSkill(a, 'one')
    await fs.mkdir(path.join(root, 'outside', 'other'), { recursive: true })
    await fs.symlink(path.join(root, 'outside', 'other'), path.join(b, 'other'), 'dir')
    await symlink([a, b])

    const result = await symlink([a, b], { unlink: true })

    expect(find(result.items, 'one', b)?.status).toBe('unlinked')
    expect(find(result.items, 'other', b)?.reason).toBe('foreign')
    expect(await fs.readdir(b)).toEqual(['other'])
    expect((await fs.lstat(path.join(a, 'one'))).isDirectory()).toBe(true)
  })

  it('refuses a file as an argument', async () => {
    const file = path.join(root, 'note.txt')
    await fs.writeFile(file, 'hello')

    await expect(symlink([a, file])).rejects.toMatchObject({ code: 'NOT_A_DIRECTORY' })
    await expect(symlink([a, file])).rejects.toBeInstanceOf(SymlinkError)
  })

  it('refuses fewer than two folders', async () => {
    await expect(symlink([a])).rejects.toMatchObject({ code: 'INVALID_ARGS' })
  })

  it('refuses two paths that mean the same folder', async () => {
    await expect(symlink([a, path.join(a, '..', 'a')])).rejects.toMatchObject({
      code: 'SAME_DIRECTORY'
    })
  })

  it('resolves relative paths against the given cwd', async () => {
    await makeSkill(a, 'one')

    await symlink(['a', 'b'], { cwd: root })

    expect(await isLink(path.join(b, 'one'))).toBe(true)
  })

  it.skipIf(process.platform === 'win32')('points at a relative path', async () => {
    await makeSkill(a, 'one')

    await symlink([a, b])

    expect(await fs.readlink(path.join(b, 'one'))).toBe(path.join('..', 'a', 'one'))
  })

  it.runIf(process.platform === 'win32')('uses an absolute junction on Windows', async () => {
    await makeSkill(a, 'one')

    const result = await symlink([a, b])

    expect(path.isAbsolute(find(result.items, 'one', b)!.target!)).toBe(true)
  })
})

describe('list', () => {
  it('reports every link and where it points', async () => {
    await makeSkill(a, 'one')
    await makeSkill(b, 'two')
    await symlink([a, b])

    const result = await list([root])

    expect(result.links.map((link) => link.name).sort()).toEqual(['one', 'two'])
    expect(result.counts).toEqual({ total: 2, broken: 0 })
    const one = result.links.find((link) => link.name === 'one')!
    expect(one.path).toBe(path.join(b, 'one'))
    expect(one.destination).toBe(path.join(a, 'one'))
    expect(one.broken).toBe(false)
  })

  it('finds links nested deeper than the given folder', async () => {
    const agents = path.join(root, '.agents', 'skills')
    const claude = path.join(root, '.claude', 'skills')
    await fs.mkdir(agents, { recursive: true })
    await makeSkill(agents, 'one')
    await symlink([agents, claude])

    const result = await list([root])

    expect(result.links.map((link) => link.path)).toEqual([path.join(claude, 'one')])
  })

  it('marks a link whose destination is gone', async () => {
    await makeSkill(a, 'one')
    await symlink([a, b])
    await fs.rm(path.join(a, 'one'), { recursive: true })

    const result = await list([b])

    expect(result.counts).toEqual({ total: 1, broken: 1 })
    expect(result.links[0]!.broken).toBe(true)
    expect(result.links[0]!.destination).toBe(path.join(a, 'one'))
  })

  it('reads only, it never creates or removes anything', async () => {
    await makeSkill(a, 'one')
    await symlink([a, b])

    await list([root])

    expect(await fs.readdir(a)).toEqual(['one'])
    expect(await fs.readdir(b)).toEqual(['one'])
    expect(await isLink(path.join(b, 'one'))).toBe(true)
  })

  it('reports each link once when a given folder sits inside another', async () => {
    await makeSkill(a, 'one')
    await symlink([a, b])

    const result = await list([root, b])

    expect(result.links).toHaveLength(1)
    expect(result.dirs).toEqual([root])
  })

  it('handles only the given names', async () => {
    await makeSkill(a, 'one')
    await makeSkill(a, 'two')
    await symlink([a, b])

    const result = await list([root], { only: ['two'] })

    expect(result.links.map((link) => link.name)).toEqual(['two'])
  })

  it('walks past node_modules and .git', async () => {
    await makeSkill(a, 'one')
    await symlink([a, b])
    for (const noisy of ['node_modules', '.git']) {
      await fs.mkdir(path.join(root, noisy), { recursive: true })
      await fs.symlink(a, path.join(root, noisy, 'buried'), 'dir')
    }

    const result = await list([root])

    expect(result.links.map((link) => link.name)).toEqual(['one'])
  })

  it('defaults to the current folder', async () => {
    await makeSkill(a, 'one')
    await symlink([a, b])

    const result = await list([], { cwd: root })

    expect(result.links.map((link) => link.name)).toEqual(['one'])
  })

  it('refuses a path that does not exist instead of creating it', async () => {
    const missing = path.join(root, 'nope')

    await expect(list([missing])).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(fs.stat(missing)).rejects.toBeTruthy()
  })

  it('refuses a file as an argument', async () => {
    const file = path.join(root, 'note.txt')
    await fs.writeFile(file, 'hello')

    await expect(list([file])).rejects.toMatchObject({ code: 'NOT_A_DIRECTORY' })
    await expect(list([file])).rejects.toBeInstanceOf(SymlinkError)
  })
})
