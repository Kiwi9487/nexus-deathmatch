/* ================= 触屏输入层（不改动游戏逻辑，只注入等价输入） =================
 * 手机 / 平板：左半屏浮动摇杆控制移动，右半屏滑动转向，右下按钮负责开火 /
 * 瞄准 / 跳跃 / 蹲伏 / 静步 / 换弹 / 切枪 / 计分板 / 小地图 / 暂停。
 * 桌面端完全不受影响（仅当检测到触屏主输入时启用）。
 */
import { input } from './input.js'
import { t } from './i18n.js'
import { settings } from './config.js'

const LOOK_SENS = 1.8   // 触摸视角灵敏度（叠加设置里的 sens）
const JOY_R = 56        // 摇杆最大拖动半径（CSS px）

function detectTouch() {
  // 仅在“主输入是触屏”时启用，避免把带触屏的笔记本误判成手机而屏蔽键鼠。
  if (!window.matchMedia) return ('ontouchstart' in window) || navigator.maxTouchPoints > 0
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const fine = window.matchMedia('(pointer: fine)').matches
  return coarse || (!fine && (('ontouchstart' in window) || navigator.maxTouchPoints > 0))
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export const touch = {
  enabled: false,
  active: false,
  root: null,
  game: null,
  player: null,
  crouchOn: false,
  walkOn: false,

  init({ game, player }) {
    this.enabled = detectTouch()
    if (!this.enabled) return
    this.game = game
    this.player = player
    document.body.classList.add('touch')
    if (isIOS()) document.body.classList.add('ios')
    input.enableTouch()
    this.build()
    window.addEventListener('nexus-language-change', () => this.build())
  },

  build() {
    const root = document.getElementById('touch-ui')
    if (!root) return
    this.root = root
    root.innerHTML = `
      <div id="move-zone"></div>
      <div id="look-zone"></div>
      <div id="joy-base"><div id="joy-knob"></div></div>
      <div id="action-cluster">
        <button class="tbtn" data-btn="fire">${t('ctlFire')}</button>
        <button class="tbtn" data-btn="aim">${t('ctlAim')}</button>
        <button class="tbtn" data-btn="jump">${t('ctlJump')}</button>
        <button class="tbtn" data-btn="crouch">${t('ctlCrouch')}</button>
        <button class="tbtn" data-btn="reload">${t('ctlReload')}</button>
        <button class="tbtn" data-btn="switch">${t('ctlSwitch')}</button>
      </div>
      <button class="tbtn" data-btn="pause">${t('ctlPause')}</button>
    `
    this._bindJoystick()
    this._bindLook()
    this._bindButtons()
    this.setActive(this.active)
  },

  setActive(on) {
    if (this.root) this.root.classList.toggle('active', on)
  },

  update() {
    if (!this.enabled) return
    const g = this.game
    const on = (g.state === 'play' && this.player.alive) || g.state === 'train'
    if (on !== this.active) {
      this.active = on
      this.setActive(on)
    }
    if (!on) this._clear()
  },

  _clear() {
    const k = input.keys
    k.KeyW = k.KeyA = k.KeyS = k.KeyD = false
    input.setKey('Space', false)
    input.setKey('ControlLeft', false)
    input.setKey('ShiftLeft', false)
    input.setKey('Tab', false)
    input.mouse.left = false
    input.mouse.right = false
    this.crouchOn = false
    if (this.root) {
      const c = this.root.querySelector('[data-btn=crouch]')
      if (c) c.classList.remove('on')
    }
    if (this._resetJoystick) this._resetJoystick()
  },

  _bindJoystick() {
    const zone = this.root.querySelector('#move-zone')
    const base = this.root.querySelector('#joy-base')
    const knob = this.root.querySelector('#joy-knob')
    if (!zone || !base || !knob) return

    let id = null
    let ox = 0
    let oy = 0

    const setMove = (x, y) => {
      const dead = 0.16
      input.keys.KeyW = y < -dead
      input.keys.KeyS = y > dead
      input.keys.KeyA = x < -dead
      input.keys.KeyD = x > dead
    }

    this._resetJoystick = () => {
      id = null
      base.style.opacity = '0'
      knob.style.transform = 'translate(0px, 0px)'
      setMove(0, 0)
    }

    const showAt = (x, y) => {
      base.style.opacity = '1'
      base.style.transform = `translate(${x - 56}px, ${y - 56}px)`
    }

    const move = (e) => {
      let dx = e.clientX - ox
      let dy = e.clientY - oy
      const len = Math.hypot(dx, dy) || 1
      const k = len > JOY_R ? JOY_R / len : 1
      const cx = dx * k
      const cy = dy * k
      knob.style.transform = `translate(${cx}px, ${cy}px)`
      setMove(cx / JOY_R, cy / JOY_R)
    }

    zone.addEventListener('pointerdown', (e) => {
      if (id !== null) return
      e.preventDefault()
      id = e.pointerId
      ox = e.clientX
      oy = e.clientY
      showAt(ox, oy)
      try { zone.setPointerCapture(e.pointerId) } catch {}
      move(e)
    })
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId === id) move(e)
    })
    const end = (e) => {
      if (e.pointerId === id) this._resetJoystick()
    }
    zone.addEventListener('pointerup', end)
    zone.addEventListener('pointercancel', end)
    this._resetJoystick()
  },

  _bindLook() {
    const zone = this.root.querySelector('#look-zone')
    if (!zone) return
    let id = null
    let lx = 0
    let ly = 0

    zone.addEventListener('pointerdown', (e) => {
      if (id !== null) return
      e.preventDefault()
      id = e.pointerId
      lx = e.clientX
      ly = e.clientY
      try { zone.setPointerCapture(e.pointerId) } catch {}
    })
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return
      const dx = e.clientX - lx
      const dy = e.clientY - ly
      lx = e.clientX
      ly = e.clientY
      const s = LOOK_SENS * (settings.touchSens || 1)
      input.setLook(dx * s, dy * s)
    })
    const end = (e) => {
      if (e.pointerId === id) id = null
    }
    zone.addEventListener('pointerup', end)
    zone.addEventListener('pointercancel', end)
  },

  _bindButtons() {
    const root = this.root
    const q = (s) => root.querySelector(s)
    const fire = q('[data-btn=fire]')
    const aim = q('[data-btn=aim]')
    const jump = q('[data-btn=jump]')
    const crouch = q('[data-btn=crouch]')
    const reload = q('[data-btn=reload]')
    const switcher = q('[data-btn=switch]')
    const pause = q('[data-btn=pause]')

    const hold = (el, down, up) => {
      if (!el) return
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault()
        try { el.setPointerCapture(e.pointerId) } catch {}
        down()
      })
      const release = () => up()
      el.addEventListener('pointerup', release)
      el.addEventListener('pointercancel', release)
    }

    hold(fire, () => { input.mouse.left = true; input.leftEdge = true }, () => { input.mouse.left = false })
    hold(aim, () => { input.mouse.right = true; input.rightEdge = true }, () => { input.mouse.right = false })
    hold(jump, () => input.setKey('Space', true), () => input.setKey('Space', false))

    const toggle = (el, get, set) => {
      if (!el) return
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault()
        const v = !get()
        set(v)
        el.classList.toggle('on', v)
      })
    }
    toggle(crouch, () => this.crouchOn, (v) => { this.crouchOn = v; input.setKey('ControlLeft', v) })

    if (reload) reload.addEventListener('pointerdown', (e) => { e.preventDefault(); input.pressKey('KeyR', 120) })
    if (switcher) switcher.addEventListener('pointerdown', (e) => { e.preventDefault(); input.edge('KeyQ') })

    if (pause) pause.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      const g = this.game
      if (g.state === 'play' || g.state === 'train' || g.state === 'countdown') g.pause()
    })
  },
}
