/* ================= 入口与主循环 ================= */
import { loadSettings, settings } from './config.js'
import { initRenderer, scene, camera, renderer, updateWorld, render, applyQuality, updateShadow, resize } from './render.js'
import { buildMap, world } from './world/map.js'
import { input } from './input.js'
import { initAudio, setVolume } from './audio.js'
import { Player } from './player.js'
import { Bots } from './bots.js'
import { updateEffects, updateFountain } from './effects.js'
import { ui } from './ui.js'
import { game } from './game.js'
import { applyLanguage } from './i18n.js'
import { touch } from './touch.js'

loadSettings()
applyLanguage()

const canvas = document.getElementById('c3d')
initRenderer(canvas)
input.attach(canvas)
buildMap(scene)

const player = new Player(scene)
const bots = new Bots(scene, player)
player.targets = bots.list

/* ---------- 组装 ---------- */
ui.init({ player, bots, game })
ui.applySettings = () => {
  setVolume(settings.volume)
  applyQuality()
}
ui.applySettings()
game.init({ player, bots, ui })
touch.init({ game, player })

const enterFullscreen = () => {
  if (!touch.enabled) return
  try {
    const el = document.documentElement
    if (el.requestFullscreen) {
      const p = el.requestFullscreen()
      if (p && p.catch) p.catch(() => {})
    }
  } catch {}
}

const lockPointer = () => {
  if (touch.enabled) { enterFullscreen(); return }
  if (canvas.requestPointerLock) canvas.requestPointerLock()
}

/* ---------- 按钮动作 ---------- */
ui.onStart = () => {
  initAudio()
  setVolume(settings.volume)
  ui.fade(true)
  setTimeout(() => {
    ui.fade(false)
    game.startMatch()
    lockPointer()
  }, 420)
}

ui.onTraining = () => {
  initAudio()
  setVolume(settings.volume)
  ui.fade(true)
  setTimeout(() => {
    ui.fade(false)
    game.startTraining()
    lockPointer()
  }, 300)
}

ui.onResume = () => {
  ui.fade(true)
  setTimeout(() => {
    ui.fade(false)
    lockPointer()
  }, 240)
}

ui.onToMenu = () => {
  if (document.pointerLockElement) document.exitPointerLock()
  game.toMenu()
}

ui.onRematch = () => {
  ui.fade(true)
  setTimeout(() => {
    ui.fade(false)
    game.startMatch()
    lockPointer()
  }, 420)
}

/* ---------- 指针锁定 / 暂停 ---------- */
document.addEventListener('pointerlockchange', () => {
  if (touch.enabled) return
  const locked = document.pointerLockElement === canvas
  input.setLocked(locked)
  if (!locked && (game.state === 'play' || game.state === 'countdown' || game.state === 'train')) {
    game.pause()
  } else if (locked && game.state === 'pause') {
    game.resume()
  }
})

// 战斗中意外丢失锁定时，点击画面即可恢复
canvas.addEventListener('click', () => {
  if (touch.enabled) return
  if ((game.state === 'play' || game.state === 'train') && !document.pointerLockElement) {
    canvas.requestPointerLock()
  }
})

document.addEventListener('visibilitychange', () => {
  if (document.hidden && (game.state === 'play' || game.state === 'countdown' || game.state === 'train')) game.pause()
})

// 移动端地址栏收起 / 旋转屏幕时，重新适配画布与 HUD 尺寸
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => resize())
}
window.addEventListener('orientationchange', () => setTimeout(resize, 120))

/* ---------- 主循环 ---------- */
let last = performance.now()
let fpsAcc = 0
let fpsN = 0
let fpsCheckT = 0

// 自适应画质：FPS 持续偏低时自动降 DPR（稳定帧率 → 转动视角更平滑无割裂）
// 防抖策略：暂停/菜单不采样；连续两窗不达标才切换；升档只在非对局时应用
let qBad = 0
let qPending = null
function autoQuality(dt) {
  if (game.state === 'pause' || game.state === 'menu') {
    fpsAcc = 0; fpsN = 0; fpsCheckT = 0; qBad = 0
    // 对局结束/暂停后再落地待处理的画质切换，避免战斗中途分辨率突变
    if (qPending) { settings.quality = qPending; qPending = null; applyQuality() }
    return
  }
  fpsAcc += dt
  fpsN++
  fpsCheckT += dt
  if (fpsCheckT >= 2) {
    const avg = fpsAcc / fpsN
    fpsAcc = 0
    fpsN = 0
    fpsCheckT = 0
    const cur = settings.quality
    let want = cur
    if (avg < 46 && cur === 'high') want = 'medium'
    else if (avg < 36 && cur === 'medium') want = 'low'
    else if (avg > 62 && cur === 'low') want = 'medium'
    else if (avg > 64 && cur === 'medium') want = 'high'
    if (want !== cur) {
      if (++qBad >= 2) {
        qBad = 0
        // 画质/分辨率切换会重设阴影贴图与像素比，造成一帧明显卡顿。
        // 对局进行中一律推迟到暂停/菜单/结算，保证转动视角全程丝滑。
        // 战斗与靶场都保持稳定，画质切换只落在菜单/暂停/结算等非动作时刻
        if (game.state === 'play' || game.state === 'train') qPending = want
        else { settings.quality = want; applyQuality() }
      }
    } else qBad = 0
  }
}

function loop(now) {
  requestAnimationFrame(loop)
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  const time = now / 1000
  autoQuality(dt)

  if (game.state !== 'pause') {
    game.update(dt)
    player.update(dt, time)
    if (game.state !== 'train') bots.update(dt, time)
    updateEffects(dt)
    updateFountain(dt, time)
    updateWorld(dt, time)
  }
  ui.update({ player, bots, game }, dt, time)
  touch.update()
  updateShadow(player.pos.x, player.pos.z)
  render(time)
  input.endFrame()
}
requestAnimationFrame(loop)

window.__nexus = { game, player, bots, settings, scene, camera, renderer, world, input, touch }
