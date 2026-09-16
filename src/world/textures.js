/* ================= 程序化 Canvas 纹理 ================= */
import * as THREE from 'three'

function canvas(w, h, draw) {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const g = c.getContext('2d')
  draw(g, w, h)
  return c
}

function toTex(c, repeat = 1, srgb = true) {
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repeat, repeat)
  t.anisotropy = 8
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** 广场石板地砖 */
export function floorTiles() {
  return toTex(canvas(256, 256, (g, w, h) => {
    g.fillStyle = '#b9ad97'
    g.fillRect(0, 0, w, h)
    const tile = w / 2
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        const shade = 0.92 + Math.random() * 0.16
        g.fillStyle = `rgb(${Math.round(178 * shade)},${Math.round(168 * shade)},${Math.round(148 * shade)})`
        g.fillRect(i * tile + 2, j * tile + 2, tile - 4, tile - 4)
        // 石板边角磨损
        g.fillStyle = 'rgba(90,80,65,0.14)'
        g.fillRect(i * tile + 3, j * tile + 3, tile - 6, 2)
        g.fillRect(i * tile + 3, j * tile + 3, 2, tile - 6)
      }
    }
    // 细石纹理噪点
    for (let k = 0; k < 900; k++) {
      g.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(60,50,40,0.07)'
      g.fillRect(Math.random() * w, Math.random() * h, 1, 1)
    }
    // 接缝
    g.strokeStyle = 'rgba(70,62,50,0.35)'
    g.lineWidth = 2
    g.strokeRect(0, 0, w, h)
  }), 6)
}

/** 米白灰泥墙 */
export function wallPlaster() {
  return toTex(canvas(256, 256, (g, w, h) => {
    g.fillStyle = '#e8ddc4'
    g.fillRect(0, 0, w, h)
    // 垂直刷痕
    for (let i = 0; i < 40; i++) {
      g.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.045)' : 'rgba(120,105,80,0.05)'
      const x = Math.random() * w
      g.fillRect(x, 0, 1 + Math.random() * 3, h)
    }
    // 边缘微阴影（让墙体有立体接缝感）
    g.fillStyle = 'rgba(90,78,60,0.22)'
    g.fillRect(0, 0, w, 3)
    g.fillRect(0, h - 3, w, 3)
  }), 3)
}

/** 木箱木板 */
export function crateWood() {
  return toTex(canvas(128, 128, (g, w, h) => {
    g.fillStyle = '#8d6c45'
    g.fillRect(0, 0, w, h)
    const n = 4
    for (let i = 0; i < n; i++) {
      const shade = 0.82 + Math.random() * 0.3
      g.fillStyle = `rgb(${Math.round(140 * shade)},${Math.round(106 * shade)},${Math.round(66 * shade)})`
      g.fillRect(0, (i * h) / n + 1, w, h / n - 2)
      // 木纹
      for (let k = 0; k < 6; k++) {
        g.strokeStyle = 'rgba(70,50,28,0.28)'
        g.lineWidth = 1
        const y = (i * h) / n + 3 + Math.random() * (h / n - 6)
        g.beginPath(); g.moveTo(0, y)
        g.bezierCurveTo(w / 4, y + 2, w / 2, y - 2, w, y + 1)
        g.stroke()
      }
    }
    // 边框（箱子框架）
    g.strokeStyle = '#5f4526'
    g.lineWidth = 6
    g.strokeRect(0, 0, w, h)
    g.strokeStyle = 'rgba(60,42,24,0.5)'
    g.lineWidth = 2
    g.strokeRect(5, 5, w - 10, h - 10)
  }), 1)
}

/** 径向渐变（枪口焰 / 爆炸光晕） */
export function radialGlow(inner = 'rgba(255,240,200,1)', outer = 'rgba(255,140,40,0)') {
  return toTex(canvas(64, 64, (g, w, h) => {
    const r = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2)
    r.addColorStop(0, inner)
    r.addColorStop(0.45, 'rgba(255,180,80,0.55)')
    r.addColorStop(1, outer)
    g.fillStyle = r
    g.fillRect(0, 0, w, h)
  }), 1, false)
}

/** 圆形柔点（火花 / 血迹） */
export function softDot(color = '255,255,255', alpha = 1) {
  return toTex(canvas(32, 32, (g, w, h) => {
    const r = g.createRadialGradient(w / 2, h / 2, 0.5, w / 2, h / 2, w / 2)
    r.addColorStop(0, `rgba(${color},${alpha})`)
    r.addColorStop(0.7, `rgba(${color},${alpha * 0.45})`)
    r.addColorStop(1, `rgba(${color},0)`)
    g.fillStyle = r
    g.fillRect(0, 0, w, h)
  }), 1, false)
}

/** 准星太阳光晕 */
export function sunGlow() {
  return toTex(canvas(128, 128, (g, w, h) => {
    const r = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2)
    r.addColorStop(0, 'rgba(255,250,235,1)')
    r.addColorStop(0.25, 'rgba(255,240,210,0.85)')
    r.addColorStop(1, 'rgba(255,220,170,0)')
    g.fillStyle = r
    g.fillRect(0, 0, w, h)
  }), 1, false)
}
