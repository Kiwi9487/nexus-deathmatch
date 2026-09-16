/* 追踪机器人的位置/状态/目标 */
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

for (let sec = 1; sec <= 6; sec++) {
  await new Promise((r) => setTimeout(r, 5000))
  const dump = await page.evaluate(() => {
    const g = window.__nexus.game
    const p = g.player
    const bots = g.bots.list.map((b, i) => ({
      i,
      pos: [b.pos.x.toFixed(0), b.pos.z.toFixed(0)],
      alive: b.alive,
      state: b.state,
      hp: Math.round(b.hp),
      kills: b.kills,
      target: b.target ? (b.target.isPlayer ? 'PLAYER' : 'bot' + g.bots.list.indexOf(b.target)) : '-',
    }))
    return { sec: p.stats, player: [p.pos.x.toFixed(0), p.pos.z.toFixed(0)], alive: p.alive, bots }
  })
  console.log(`=== t=${sec * 5}s player=${dump.player} alive=${dump.alive}`)
  for (const b of dump.bots) {
    console.log(`   bot${b.i} ${b.alive ? '✅' : '💀'} pos=${b.pos} ${b.state} hp=${b.hp} kills=${b.kills} target=${b.target}`)
  }
}
console.log('ERRORS:', errors)
await browser.close()
