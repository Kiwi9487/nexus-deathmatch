/* 截图：菜单 / 出生点 / 交火 / 视角环拍 */
import puppeteer from 'puppeteer-core'

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 720 })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 30000 })
await new Promise((r) => setTimeout(r, 3500))

// 1. 主菜单
await page.screenshot({ path: 'test/shot-menu.png' })

// 2. 进入比赛
await page.click('#btn-start')
await new Promise((r) => setTimeout(r, 6000))

// 3. 出生点视角（环拍 4 个方向）
for (let i = 0; i < 4; i++) {
  await page.evaluate((k) => {
    const p = window.__nexus.game.player
    p.yaw = (k / 4) * Math.PI * 2
  }, i)
  await new Promise((r) => setTimeout(r, 350))
  await page.screenshot({ path: `test/shot-spawn-${i}.png` })
}

// 4. 传送到机器人交火现场
await page.evaluate(() => {
  const g = window.__nexus.game
  const b = g.bots.list.find((x) => x.alive)
  if (b) {
    const p = g.player
    p.pos.set(b.pos.x + 6, 0, b.pos.z)
    p.yaw = Math.atan2(b.pos.x - p.pos.x, b.pos.z - p.pos.z) + Math.PI // 面向机器人
  }
})
await new Promise((r) => setTimeout(r, 1000))
await page.screenshot({ path: 'test/shot-fight.png' })

// 5. 中央喷泉区域
await page.evaluate(() => {
  const p = window.__nexus.game.player
  p.pos.set(8, 0, 10)
  p.yaw = Math.atan2(0 - 8, 0 - 10) + Math.PI // 面向喷泉
})
await new Promise((r) => setTimeout(r, 800))
await page.screenshot({ path: 'test/shot-fountain.png' })

// 6. 天桥视角
await page.evaluate(() => {
  const p = window.__nexus.game.player
  p.pos.set(16.5, 2.1, -5)
  p.yaw = Math.PI
})
await new Promise((r) => setTimeout(r, 800))
await page.screenshot({ path: 'test/shot-catwalk.png' })

// 7. 死亡界面
await page.evaluate(() => {
  const g = window.__nexus.game
  const p = g.player
  p.invuln = 0
  p.hp = 10
  p.armor = 0
  p.hit(999, true, g.bots.list[0], 'deagle')
})
await new Promise((r) => setTimeout(r, 800))
await page.screenshot({ path: 'test/shot-death.png' })

console.log('ERRORS:', errors.length ? errors : '无')
await browser.close()
