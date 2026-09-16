/* ================= 输入管理 ================= */

class Input {
  constructor() {
    this.keys = {}
    this.down = {}        // 本帧按下
    this.up = {}          // 本帧抬起
    this.held = {}
    this.lookDx = 0
    this.lookDy = 0
    this.mouse = { left: false, right: false }
    this.leftEdge = false
    this.rightEdge = false
    this.wheel = 0
    this.locked = false
    this.listeners = []
  }

  attach(el) {
    // 捕获阶段拦截 Tab：防止浏览器默认行为（焦点切换/退出指针锁定 → 误弹暂停设置）
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab') e.preventDefault()
    }, true)
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return
      this.keys[e.code] = true
      this.held[e.code] = true
      this.down[e.code] = true
    })
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false
      this.held[e.code] = false
      this.up[e.code] = true
    })
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return
      if (!document.hasFocus()) return   // 失焦时丢弃，防异常巨量增量
      this.lookDx += e.movementX
      this.lookDy += e.movementY
    })
    el.addEventListener('mousedown', (e) => {
      if (e.button === 0) { this.mouse.left = true; this.leftEdge = true }
      if (e.button === 2) { this.mouse.right = true; this.rightEdge = true }
    })
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false
      if (e.button === 2) this.mouse.right = false
    })
    window.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY) }, { passive: true })
    el.addEventListener('contextmenu', (e) => e.preventDefault())
  }

  // 指针锁定状态变化（由 main.js 注册到 game）
  // 锁定/解锁瞬间浏览器会产生巨大的 movementX/Y 跳变，必须丢弃
  setLocked(l) {
    this.locked = l
    this.lookDx = 0
    this.lookDy = 0
    this.lockChangedAt = performance.now()
  }

  /**
   * 鼠标增量：直接消费当帧全部增量（完全线性、无加速无延迟），
   * 单帧 clamp ±800px 仅防极端异常值（锁定切换/失焦已在上游拦截）。
   * 注意：绝不结转 —— 结转会导致增量池累积、鼠标停了视角还在转（"加速"感）
   */
  consumeLook() {
    if (!this.locked) { this.lookDx = 0; this.lookDy = 0; return { dx: 0, dy: 0 } }
    // 锁定切换后 60ms 内丢弃（防锁定瞬间异常增量）
    if (performance.now() - this.lockChangedAt < 60) {
      this.lookDx = 0
      this.lookDy = 0
      return { dx: 0, dy: 0 }
    }
    const MAX = 800
    const dx = Math.max(-MAX, Math.min(MAX, this.lookDx))
    const dy = Math.max(-MAX, Math.min(MAX, this.lookDy))
    this.lookDx = 0
    this.lookDy = 0
    return { dx, dy }
  }

  /** 每帧结束清理边缘事件（lookDx/lookDy 由 consumeLook 消费，未消费部分兜底清理） */
  endFrame() {
    this.down = {}
    this.up = {}
    this.leftEdge = false
    this.rightEdge = false
    // 未消费的鼠标增量兜底丢弃（暂停/菜单等无人消费的场景）
    if (!this.locked) { this.lookDx = 0; this.lookDy = 0 }
    this.wheel = 0
  }
}

export const input = new Input()
