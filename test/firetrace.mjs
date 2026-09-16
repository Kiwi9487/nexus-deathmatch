/* 追踪机器人开火决策链路的每个状态 */
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
await page.click('#btn-start')
await new Promise((r) => setTimeout(r, 6000))

// 打点：统计 fire 调用
await page.evaluate(() => {
  window.__nexus.bots.list.forEach((b) => {
    if (!b._origFire) {
      b._origFire = b.fire
      b._fireCalls = 0
      b.fire = function (...a) { this._fireCalls++; return this._origFire.apply(this, a) }
    }
  })
})
await new Promise((r) => setTimeout(r, 8000))

const dump = await page.evaluate(() => {
  const g = window.__nexus.game
  const p = g.player
  return {
    player: { pos: [p.pos.x.toFixed(1), p.pos.z.toFixed(1)], alive: p.alive, invuln: +p.invuln.toFixed(1), hp: p.hp },
    bots: g.bots.list.map((b, i) => ({
      i,
      pos: [b.pos.x.toFixed(1), b.pos.z.toFixed(1)],
      state: b.state,
      fireCalls: b._fireCalls,
      reactT: +b.reactT.toFixed(2),
      fireCd: +b.fireCd.toFixed(2),
      burstPause: +b.burstPause.toFixed(2),
      burstLeft: b.burstLeft,
      mag: b.mag,
      reloading: b.reloading,
      yaw: +b.yaw.toFixed(2),
      aimYaw: +b.aimYaw.toFixed(2),
      facing: Math.abs(((b.aimYaw - b.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI).toFixed(2),
      target: b.target ? (b.target.isPlayer ? 'PLAYER' : 'bot') : '-',
    })),
  }
})
console.log(JSON.stringify(dump, null, 1))
console.log('ERRORS:', errors)
await browser.close()
