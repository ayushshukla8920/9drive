import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const { app, mountFrontend } = await import(pathToFileURL(path.join(rootDir, 'backend', 'dist', 'app.js')).href)
const frontendRequire = createRequire(path.join(rootDir, 'frontend', 'package.json'))
const next = frontendRequire('next')
const dev = process.argv.includes('--dev')
const nextApp = next({ dev, dir: path.join(rootDir, 'frontend') })

await nextApp.prepare()
const handle = nextApp.getRequestHandler()

mountFrontend((req, res, nextError) => {
  void handle(req, res).catch(nextError)
})

const port = Number(process.env.APP_PORT ?? 4000)
app.listen(port, () => {
  console.log(`9Drive is running on http://localhost:${port}`)
})
