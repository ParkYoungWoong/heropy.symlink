#!/usr/bin/env node
import { createRequire } from 'node:module'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { SymlinkError, symlink, type Item, type Result } from './index.js'

const require = createRequire(import.meta.url)
const { version } = require('../package.json') as { version: string }

const color = process.stdout.isTTY && !process.env.NO_COLOR
const dim = (value: string) => (color ? `[2m${value}[0m` : value)
const bold = (value: string) => (color ? `[1m${value}[0m` : value)

const help = `${bold('symlink')} - mirror folders with symbolic links

Every listed folder ends up holding the same child folders. Whichever folder
holds the real thing becomes the source, the others get a link to it.

${bold('Usage')}
  npx @heropy/symlink <folder> <folder> [folder...] [options]

${bold('Options')}
  --only <name>   Handle only these names. Repeat the flag or separate with commas.
  --unlink        Remove the links this tool created. Real folders are left alone.
  --dry-run       Print what would change without touching the disk.
  -h, --help      Show this help.
  -v, --version   Show the version.

${bold('Examples')}
  npx @heropy/symlink .claude/skills .agents/skills
  npx @heropy/symlink .claude/skills .agents/skills --only my-skill --dry-run
  npx @heropy/symlink .claude/skills .agents/skills --unlink

Folders only. Paths may be relative or absolute. Missing folders are created.
On macOS and Linux the link points at a relative path, so the project stays
portable. On Windows a junction is used, which needs no extra permission.
`

const labels: Record<Item['status'], string> = {
  linked: 'link  ',
  fixed: 'fix   ',
  kept: 'keep  ',
  skipped: 'skip  ',
  unlinked: 'remove'
}

const reasons: Record<NonNullable<Item['reason']>, string> = {
  duplicate: 'a real folder with this name exists in more than one place',
  occupied: 'a file already uses this name',
  orphan: 'the folder it pointed to is gone',
  foreign: 'points outside the given folders'
}

function report(result: Result, cwd: string, dryRun: boolean) {
  const show = (target: string) => path.relative(cwd, target) || '.'

  for (const dir of result.created) {
    console.log(`${dim('mkdir ')} ${show(dir)}`)
  }

  for (const item of result.items) {
    const label = labels[item.status]
    const line = `${item.status === 'skipped' ? label : dim(label)} ${show(item.path)}`
    if (item.status === 'skipped') {
      console.log(`${line} ${dim(`(${reasons[item.reason!]})`)}`)
    } else if (item.target) {
      console.log(`${line} ${dim(`-> ${item.target}`)}`)
    } else {
      console.log(line)
    }
  }

  const { linked, fixed, kept, skipped, unlinked } = result.counts
  const summary = [
    linked && `${linked} linked`,
    fixed && `${fixed} fixed`,
    unlinked && `${unlinked} removed`,
    kept && `${kept} already fine`,
    skipped && `${skipped} skipped`
  ].filter(Boolean)

  console.log(
    `\n${bold(summary.length ? summary.join(', ') : 'nothing to do')}${
      dryRun ? dim(' (dry run, nothing was written)') : ''
    }`
  )
}

async function main() {
  let parsed
  try {
    parsed = parseArgs({
      allowPositionals: true,
      options: {
        only: { type: 'string', multiple: true },
        unlink: { type: 'boolean', default: false },
        'dry-run': { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
        version: { type: 'boolean', short: 'v', default: false }
      }
    })
  } catch (error) {
    console.error(`${(error as Error).message}\n`)
    console.error(help)
    process.exitCode = 1
    return
  }

  const { values, positionals } = parsed

  if (values.version) {
    console.log(version)
    return
  }

  if (values.help || positionals.length === 0) {
    console.log(help)
    if (positionals.length === 0 && !values.help) process.exitCode = 1
    return
  }

  const dryRun = values['dry-run'] === true
  const cwd = process.cwd()

  try {
    const result = await symlink(positionals, {
      dryRun,
      unlink: values.unlink === true,
      only: values.only?.flatMap((value) => value.split(',')).filter(Boolean)
    })
    report(result, cwd, dryRun)
  } catch (error) {
    if (error instanceof SymlinkError) {
      console.error(error.message)
      process.exitCode = 1
      return
    }
    throw error
  }
}

await main()
