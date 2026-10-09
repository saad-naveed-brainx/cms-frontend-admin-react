#!/usr/bin/env node
/**
 * The live preview draws blocks with the website's own code (docs/DECISIONS.md D-030). The website
 * (../web) is the original; this copies the files below into src/site-blocks/, byte for byte, so the
 * preview and the site cannot draw a block differently.
 *
 *   node scripts/sync-blocks.mjs          copy them again (after a block or the theme changed in web)
 *   node scripts/sync-blocks.mjs --check  fail if any copy differs from the original, or is missing or extra
 *
 * The check needs the web repo beside this one (the main checkout, or a devflow slot made with web).
 * Without it, as in GitHub CI, it says so and passes: there is nothing to compare against.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const admin = join(dirname(fileURLToPath(import.meta.url)), '..')
const web = join(admin, '..', 'web')
const target = join(admin, 'src', 'site-blocks')

/** What is copied: whole folders, and single files the blocks and the theme import. */
const FOLDERS = ['src/blocks', 'src/theme']
const FILES = [
  'src/lib/guards.ts',
  'src/site/resolve-theme.ts',
  'src/site/default-theme.ts',
  // The site frame and the ready-made palettes, for the Appearance screen's preview (GOV-04).
  'src/site/SiteChrome.tsx',
  'src/site/SiteHeader.tsx',
  'src/site/SiteFooter.tsx',
  'src/site/types.ts',
  'src/site/palettes.ts',
  'src/site/contrast.ts',
]
/** Only this admin-side note lives in the copy without an original. */
const OWN = new Set(['README.md'])

const filesIn = (root, folder) =>
  readdirSync(join(root, folder), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? filesIn(root, join(folder, entry.name))
      : [join(folder, entry.name)],
  )

/** Every original, as a path under web's src/ (`blocks/Hero.tsx`). */
function originals() {
  return [...FOLDERS.flatMap((folder) => filesIn(web, folder)), ...FILES]
    .map((path) => relative('src', path))
    .sort()
}

if (!existsSync(join(web, 'src', 'blocks'))) {
  console.log('✔ blocks: ../web not found, nothing to compare (GitHub CI); skipped')
  process.exit(0)
}

const wanted = originals()

if (process.argv.includes('--check')) {
  const copies = existsSync(target)
    ? filesIn(target, '.').map((path) => relative('.', path)).filter((path) => !OWN.has(path)).sort()
    : []
  const problems = [
    ...wanted.filter((path) => !copies.includes(path)).map((path) => `missing: ${path}`),
    ...copies.filter((path) => !wanted.includes(path)).map((path) => `not in web: ${path}`),
    ...wanted
      .filter((path) => copies.includes(path))
      .filter((path) => !readFileSync(join(web, 'src', path)).equals(readFileSync(join(target, path))))
      .map((path) => `differs from web: ${path}`),
  ]
  if (problems.length > 0) {
    console.log('✘ blocks: src/site-blocks is not the same as ../web. Run npm run blocks:sync')
    for (const problem of problems) console.log(`    ${problem}`)
    process.exit(1)
  }
  console.log(`✔ blocks: ${wanted.length} files match ../web`)
  process.exit(0)
}

// Copy: everything but the admin's own note is replaced, so a file deleted in web goes here too.
for (const entry of existsSync(target) ? readdirSync(target) : []) {
  if (!OWN.has(entry)) rmSync(join(target, entry), { recursive: true, force: true })
}
for (const path of wanted) {
  mkdirSync(dirname(join(target, path)), { recursive: true })
  copyFileSync(join(web, 'src', path), join(target, path))
}
console.log(`✔ blocks: copied ${wanted.length} files from ../web into src/site-blocks`)
