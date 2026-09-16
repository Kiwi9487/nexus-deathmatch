/* 插桩 respawnBot：记录 living 与返回的出生点 */
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

await page.evaluate(() => {
  const bots = window.__nexus.bots
  const orig = bots.respawnBot.bind(bots)
  window.__logs = []
  bots.respawnBot = (bot) => {
    const living = bots.aliveList.filter((b) => b !== bot)
    if (window.__nexus.game.player.alive) living.push(window.__nexus.game.player)
    window.__logs.push({
      living: living.map((e) => ({
        x: e.x ?? e.pos.x, z: e.z ?? e.pos.z,
        isPlayer: e.isPlayer,
        hasX: 'x' in e,
      })),
    })
    return orig(bot)
  }
})
await page.click('#btn-start')
await new Promise((r) => setTimeout(r, 5000))
const logs = await page.evaluate(() => window.__logs)
console.log(JSON.stringify(logs, null, 1).slice(0, 3000))
console.log('ERRORS:', errors)
await browser.close()
