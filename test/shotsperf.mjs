/* 逐发跟踪玩家射击：命中计数 / 相机状态 / 散布 */
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
await new Promise((r) => setTimeout(r, 4500))

const r = await page.evaluate(() => {
  const g = window.__nexus.game
  const p = g.player
  const cam = window.__nexus.camera

  // 打点 bot.hit
  window.__hitCalls = []
  g.bots.list.forEach((b) => {
    const orig = b.hit.bind(b)
    b.hit = (dmg, head, atk, wid) => {
      window.__hitCalls.push({ dmg, head, atk: atk ? (atk.isPlayer ? 'PLAYER' : 'bot') : '?' })
      return orig(dmg, head, atk, wid)
    }
  })

  // 传送 + 瞄准（西车道）
  p.pos.set(-20, 0, 0)
  cam.position.set(-20, 1.62, 0)
  const bot = g.bots.list.find((b) => b.alive)
  bot.pos.set(-20, 0, 6)
  bot.respawnT = 0
  const dist = 6
  p.yaw = Math.atan2(-0, -6)
  p.pitch = Math.atan2(1.55 - 1.62, dist)
  cam.rotation.set(p.pitch, p.yaw, 0, 'YXZ')
  cam.quaternion.setFromEuler(cam.rotation)

  const shots = []
  for (let i = 0; i < 6; i++) {
    p.fireCooldown = 0
    const hitsBefore = p.stats.hits
    const magBefore = p.mag
    p.fire()
    shots.push({
      i,
      hitsDelta: p.stats.hits - hitsBefore,
      magDelta: magBefore - p.mag,
      spreadDeg: +(p.computeSpread() * 180 / Math.PI).toFixed(3),
      bloom: +p.bloom.toFixed(3),
      camQuat: [cam.quaternion.x.toFixed(3), cam.quaternion.y.toFixed(3), cam.quaternion.z.toFixed(3), cam.quaternion.w.toFixed(3)],
      enabled: p.enabled,
      alive: p.alive,
      reloading: p.reloading,
      switching: p.switching,
    })
  }
  // 用游戏自身的 rayBox 遍历所有碰撞体，找出 t<6 的命中
  const hits = []
  const { rayBox: gameRayBox, world: gWorld } = window.__nexus
  for (const b of gWorld.rayBoxes) {
    const rr = gameRayBox([-20, 1.62, 0], [0, -0.012, 1], b)
    if (rr !== -1 && rr.t < 6) hits.push({ t: +rr.t.toFixed(2), mat: b.mat, box: [b.min, b.max] })
  }
  // 用 dbg 的精确数值直接调用 rayBox 验证
  const d = window.__dbg
  const wallTest = d ? gameRayBox(d.origin, d.dir, {
    min: [-28.6, 0, -21.3], max: [28.6, 5.5, -20.7],
  }) : 'no-dbg'

  // 用 dbg 的方向重扫所有碰撞体，找出 t<10 的命中
  const coneHits = []
  if (d) {
    for (const b of gWorld.rayBoxes) {
      const rr = gameRayBox(d.origin, d.dir, b)
      if (rr !== -1 && rr.t < 10) coneHits.push({ t: +rr.t.toFixed(2), mat: b.mat, box: [b.min, b.max] })
    }
  }
  return { shots, hitCalls: window.__hitCalls, botHp: bot.hp, playerKills: p.kills, dbg: d, earlyHits: hits, wallTest, coneHits }
})
console.log(JSON.stringify(r, null, 1))
console.log('ERRORS:', errors)
await browser.close()
