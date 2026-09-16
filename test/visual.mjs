/* 视觉验证：武器模型 / 人形机器人 / 地图装饰 像素分析 */
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 720 })
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 30000 })
await new Promise((r) => setTimeout(r, 3000))
await page.click('#btn-start')
await new Promise((r) => setTimeout(r, 5000))

// 1. 把机器人传到玩家正前方 8m，玩家面向它（西车道）
await page.evaluate(() => {
  const g = window.__nexus.game
  const p = g.player
  p.pos.set(-20, 0, 0)
  p.yaw = 0
  const cam = window.__nexus.camera
  cam.position.set(-20, 1.62, 0)
  cam.rotation.set(0, 0, 0, 'YXZ')
  cam.quaternion.setFromEuler(cam.rotation)
  const bot = g.bots.list.find((b) => b.alive)
  if (bot) bot.pos.set(-20, 0, -8)
})
await new Promise((r) => setTimeout(r, 600))
await page.screenshot({ path: 'test/vis-bot.png' })

// 2. 面向喷泉方向（装饰验证）
await page.evaluate(() => {
  const p = window.__nexus.game.player
  p.pos.set(10, 0, 14)
  p.yaw = Math.PI * 1.25
  const cam = window.__nexus.camera
  cam.position.set(10, 1.62, 14)
  cam.rotation.set(0, Math.PI * 1.25, 0, 'YXZ')
  cam.quaternion.setFromEuler(cam.rotation)
})
await new Promise((r) => setTimeout(r, 600))
await page.screenshot({ path: 'test/vis-decor.png' })

// 3. 面向天桥方向（遮阳棚/横幅）
await page.evaluate(() => {
  const p = window.__nexus.game.player
  p.pos.set(-5, 0, -17)
  p.yaw = 0
  const cam = window.__nexus.camera
  cam.position.set(-5, 1.62, -17)
  cam.rotation.set(0, 0, 0, 'YXZ')
  cam.quaternion.setFromEuler(cam.rotation)
})
await new Promise((r) => setTimeout(r, 600))
await page.screenshot({ path: 'test/vis-awing.png' })

// 分析
const page2 = await browser.newPage()
await page2.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 30000 })
await new Promise((r) => setTimeout(r, 1000))
const results = {}
for (const name of ['bot', 'decor', 'awing']) {
  const b64 = fs.readFileSync(`test/vis-${name}.png`).toString('base64')
  results[name] = await page2.evaluate(async (b64img) => {
    const img = new Image()
    img.src = 'data:image/png;base64,' + b64img
    await img.decode()
    const c = document.createElement('canvas')
    c.width = 640; c.height = 360
    const g = c.getContext('2d')
    g.drawImage(img, 0, 0, 640, 360)
    const d = g.getImageData(0, 0, 640, 360).data
    // 统计：整体亮度 / 红色像素(机器人描边) / 底部武器区域亮度 / 天空
    let sum = 0, cnt = 0, red = 0, weaponSum = 0, weaponN = 0, topSum = 0, topN = 0
    for (let y = 0; y < 360; y++) {
      for (let x = 0; x < 640; x++) {
        const i = (y * 640 + x) * 4
        const r = d[i], gg = d[i + 1], b = d[i + 2]
        sum += r + gg + b; cnt += 3
        if (r > 140 && gg < 90 && b < 90) red++                       // 红描边/旗帜
        if (y > 300) { weaponSum += r + gg + b; weaponN += 3 }        // 底部=武器模型区
        if (y < 60) { topSum += r + gg + b; topN += 3 }               // 顶部=天空
      }
    }
    return {
      avg: Math.round(sum / cnt),
      redPx: red,
      bottomAvg: Math.round(weaponSum / weaponN),
      topAvg: Math.round(topSum / topN),
    }
  }, b64)
}
console.log(JSON.stringify(results, null, 1))
await browser.close()
