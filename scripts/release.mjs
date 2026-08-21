import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

function fail(message) {
  console.error(`\n[release] ${message}`)
  process.exit(1)
}

function run(command, args, options = {}) {
  const commandLabel = `${command} ${args.join(' ')}`.trim()
  console.log(`\n[release] $ ${commandLabel}`)
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    ...options
  })

  if (result.error) {
    fail(`Failed to execute: ${commandLabel}\n${result.error.message}`)
  }

  if (typeof result.status === 'number' && result.status !== 0) {
    fail(`Command failed (${result.status}): ${commandLabel}`)
  }

  return result
}

function runQuiet(command, args) {
  return spawnSync(command, args, { encoding: 'utf8' })
}

function getHeadCommit() {
  return (runQuiet('git', ['rev-parse', 'HEAD']).stdout || '').trim()
}

function getLocalTagCommit(tagName) {
  const exists = runQuiet('git', ['rev-parse', '-q', '--verify', `refs/tags/${tagName}`]).status === 0
  if (!exists) {
    return null
  }
  return (runQuiet('git', ['rev-list', '-n', '1', tagName]).stdout || '').trim()
}

function getRemoteTagCommit(tagName) {
  const remoteTag = runQuiet('git', ['ls-remote', '--tags', 'origin', `refs/tags/${tagName}^{}`])
  if (remoteTag.status !== 0) {
    return undefined
  }
  const line = (remoteTag.stdout || '').trim()
  if (!line) {
    return null
  }
  return line.split('\t')[0]
}

const rawArgs = process.argv.slice(2)
const dryRun = rawArgs.includes('--dry-run')
const allowDirty = rawArgs.includes('--allow-dirty')
const versionArg = rawArgs.find((arg) => arg !== '--dry-run' && arg !== '--allow-dirty')

if (!versionArg) {
  fail('Usage: pnpm release <version|vversion> [--dry-run] [--allow-dirty]')
}

const normalizedVersion = versionArg.replace(/^v/, '')
const semverPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/

if (!semverPattern.test(normalizedVersion)) {
  fail(`Invalid version: "${versionArg}". Expected semver like 3.2.3 or v3.2.3`)
}

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const packageName = packageJson.name
const currentVersion = packageJson.version
const tagName = `v${normalizedVersion}`
const shouldBumpVersion = currentVersion !== normalizedVersion

const status = runQuiet('git', ['status', '--porcelain'])
if (status.status !== 0) {
  fail('Could not determine git status')
}
if (!allowDirty && (status.stdout || '').trim().length > 0) {
  fail('Working tree is not clean. Commit or stash changes before releasing.')
}

const npmWhoAmI = runQuiet('npm', ['whoami'])
if (npmWhoAmI.status !== 0) {
  const authMessage = 'NPM auth is missing or expired. Run "npm login" and retry.'
  if (dryRun) {
    console.warn(`\n[release] ${authMessage}`)
  } else {
    fail(authMessage)
  }
}

const publishedVersionCheck = runQuiet('npm', ['view', `${packageName}@${normalizedVersion}`, 'version'])
if (publishedVersionCheck.status === 0 && (publishedVersionCheck.stdout || '').trim() === normalizedVersion) {
  fail(`Version ${normalizedVersion} is already published for ${packageName}`)
}

console.log(`\n[release] Preparing release ${tagName}`)
if (dryRun) {
  console.log('[release] Dry-run mode enabled: publish and push steps will be skipped')
}
if (allowDirty) {
  console.log('[release] Allow-dirty mode enabled: skipping clean working tree check')
}

run('pnpm', ['build'])

if (shouldBumpVersion) {
  if (dryRun) {
    console.log(`\n[release] Dry-run: would bump package version to ${normalizedVersion}`)
    console.log('[release] Dry-run: would update lockfile and create release commit')
  } else {
    run('pnpm', ['version', normalizedVersion, '--no-git-tag-version'])
    run('pnpm', ['install', '--lockfile-only'])
    run('git', ['add', 'package.json', 'pnpm-lock.yaml'])
    run('git', ['commit', '-m', `chore(release): ${tagName}`])
  }
} else {
  console.log(`\n[release] package.json is already at ${normalizedVersion}; skipping version bump and commit`)
}

if (!dryRun) {
  const headSha = getHeadCommit()
  const localTagCommit = getLocalTagCommit(tagName)

  if (localTagCommit) {
    if (localTagCommit !== headSha) {
      fail(
        `Tag ${tagName} already exists locally, but points to a different commit. ` +
          `Delete it with "git tag -d ${tagName}" and retry.`
      )
    }

    console.log(`\n[release] Reusing existing local tag ${tagName} (already points to HEAD)`)
  } else {
    run('git', ['tag', '-a', tagName, '-m', tagName])
  }

  const remoteTagCommit = getRemoteTagCommit(tagName)
  if (remoteTagCommit === undefined) {
    fail('Could not verify remote tags from origin')
  }

  let shouldPushTag = true
  if (remoteTagCommit) {
    if (remoteTagCommit !== headSha) {
      fail(
        `Tag ${tagName} already exists on origin and points to a different commit. ` +
          `Delete it with "git push origin :refs/tags/${tagName}" and retry.`
      )
    }

    shouldPushTag = false
    console.log(`\n[release] Reusing existing remote tag ${tagName} (already points to HEAD)`)
  }

  run('npm', ['publish', '--access', 'public'])
  run('git', ['push', 'origin', 'HEAD'])
  if (shouldPushTag) {
    run('git', ['push', 'origin', tagName])
  }
  console.log(`\n[release] Release ${tagName} completed`)
} else {
  console.log(`\n[release] Dry-run: would create tag ${tagName}`)
  console.log('[release] Dry-run: would push current branch and tag to origin')
  console.log('[release] Dry-run: would publish package to npm')
  console.log('\n[release] Dry-run complete. To perform the release, run without --dry-run')
}