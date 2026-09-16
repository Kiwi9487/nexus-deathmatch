/* 复现出生点选择逻辑，检查 NaN */
import puppeteer from 'puppeteer-core'

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 30000 })
await new Promise((r) => setTimeout(r, 3000))

const probe = await page.evaluate(() => {
  const g = window.__nexus.game
  const bots = g.bots
  const p = g.player
  const out = {}
  out.playerPos = [p.pos.x, p.pos.z]
  out.playerAlive = p.alive
  out.botPositions = bots.list.map((b) => [b.pos.x, b.pos.z, b.alive])
  out.nanBots = bots.list.filter((b) => !Number.isFinite(b.pos.x) || !Number.isFinite(b.pos.z)).length

  // 复现 pickSpawnWorld 逻辑
  const CFG_SPAWNS = [[-24, -18], [24, -17], [-24, 17], [24, 17], [0, -19], [0, 17], [20, 9], [-23, 11], [-13, -14], [19, -13]]
  const spawns = CFG_SPAWNS.map((s) => ({ x: s[0], z: s[1] }))
  const living = bots.list.filter((b) => b !== bots.list[0]).map((b) => b.pos)
  if (p.alive) living.push(p)
  out.livingCount = living.length
  out.livingFinite = living.every((e) => Number.isFinite(e.x) && Number.isFinite(e.z))
  let best = spawns[0], bestScore = -Infinity
  const scores = []
  for (const s of spawns) {
    let minD = Infinity
    for (const e of living) {
      const d = Math.hypot(s.x - e.x, s.z - e.z)
      if (d < minD) minD = d
    }
    scores.push(minD)
    const score = minD + Math.random() * 2
    if (score > bestScore) { bestScore = score; best = s }
  }
  out.scores = scores
  out.best = best
  return out
})
console.log(JSON.stringify(probe, null, 1))
console.log('ERRORS:', errors)
await browser.close()
