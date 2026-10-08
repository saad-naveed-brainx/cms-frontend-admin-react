// Starts the REAL api for the flow tests: a fresh database, migrated, with the test clients made by
// the real seed command, and then the API itself. Playwright runs this as a web server and waits
// for /health. Everything it needs arrives as environment variables from playwright.config.ts.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

const { FLOW_DATABASE, FLOW_API_PORT, FLOW_ADMIN_ORIGIN, FLOW_ADMIN, FLOW_TENANTS, FLOW_PEOPLE } =
  process.env
const apiDir = path.resolve(process.env.FLOW_API_DIR ?? '../api')

if (!existsSync(path.join(apiDir, 'package.json'))) {
  console.error(
    `The flow tests need the api repo next to admin (looked in ${apiDir}).\n` +
      'In a devflow slot: devflow-wt new <slug> api admin',
  )
  process.exit(1)
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options })
  if (result.status !== 0) {
    console.error(`${command} ${args.join(' ')} failed`)
    process.exit(result.status ?? 1)
  }
}

run('dropdb', ['--if-exists', FLOW_DATABASE])
run('createdb', [FLOW_DATABASE])

const env = {
  ...process.env,
  DATABASE_URL: `postgresql://localhost:5432/${FLOW_DATABASE}`,
  API_PORT: FLOW_API_PORT,
  CORS_ORIGINS: FLOW_ADMIN_ORIGIN,
  // Only for this throwaway database: long enough for the production check, worth nothing anywhere else.
  JWT_SECRET: 'flow-tests-only-secret-not-used-anywhere-else-0123456789',
}

// `db:migrate` builds first, so dist/ is fresh for the seed command and the server below.
run('npm', ['run', 'db:migrate'], { cwd: apiDir, env })

const admin = JSON.parse(FLOW_ADMIN)
JSON.parse(FLOW_TENANTS).forEach((tenant, index) => {
  run(
    'node',
    [
      'dist/cli/seed.js',
      '--organization', tenant.organization,
      '--site', tenant.site,
      '--host', tenant.host,
      '--email', admin.email,
      '--name', admin.name,
    ],
    // The password is only given for the first client: the person then exists, and later clients reuse them.
    { cwd: apiDir, env: index === 0 ? { ...env, SEED_ADMIN_PASSWORD: admin.password } : env },
  )
})

// Other people, each with a site of their own.
for (const person of JSON.parse(FLOW_PEOPLE)) {
  run(
    'node',
    [
      'dist/cli/seed.js',
      '--organization', person.tenant.organization,
      '--site', person.tenant.site,
      '--host', person.tenant.host,
      '--email', person.admin.email,
      '--name', person.admin.name,
    ],
    { cwd: apiDir, env: { ...env, SEED_ADMIN_PASSWORD: person.admin.password } },
  )
}

const server = spawn('node', ['dist/main.js'], { cwd: apiDir, env, stdio: 'inherit' })
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal))
server.on('exit', (code) => process.exit(code ?? 0))
