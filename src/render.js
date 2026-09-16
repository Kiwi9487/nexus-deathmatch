/* ================= 渲染器：光照 / 天空 =================
 * 直接渲染（无 EffectComposer）：合成器在部分 GPU/软件渲染上输出全黑，
 * 为保证所有环境可玩，采用最稳妥的直渲 + ACES 色调映射
 */
import * as THREE from 'three'
import { CFG, settings } from './config.js'
import { sunGlow } from './world/textures.js'

export const scene = new THREE.Scene()
export const camera = new THREE.PerspectiveCamera(70, 1, 0.01, 800)
camera.rotation.order = 'YXZ'
// 关键：相机必须加入场景图，挂载在相机上的第一人称武器/枪口灯才会被渲染
scene.add(camera)

export let renderer
let clouds = []
let sun = null
const sunDir = new THREE.Vector3(0.45, 0.62, 0.38).normalize()

export function initRenderer(canvas) {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
    stencil: false,
  })
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.04
  scene.fog = new THREE.FogExp2(0xdde4ea, 0.0035)

  // 天空穹顶（渐变 + 太阳光晕）
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(0x4f8fd4) },
      mid: { value: new THREE.Color(0xa8c8ea) },
      bot: { value: new THREE.Color(0xf0e2c8) },
      sunDir: { value: sunDir.clone() },
    },
    vertexShader: `
      varying vec3 vDir;
      void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
    `,
    fragmentShader: `
      varying vec3 vDir;
      uniform vec3 top; uniform vec3 mid; uniform vec3 bot; uniform vec3 sunDir;
      void main(){
        float h = clamp(vDir.y, -1.0, 1.0);
        vec3 col = h > 0.0 ? mix(mid, top, smoothstep(0.08, 0.65, h)) : mix(bot, vec3(0.42,0.36,0.30), smoothstep(0.0, -0.3, h));
        float sun = pow(max(dot(vDir, sunDir), 0.0), 900.0) * 2.2;
        float halo = pow(max(dot(vDir, sunDir), 0.0), 40.0) * 0.35;
        col += vec3(1.0, 0.92, 0.78) * (sun + halo);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  })
  const sky = new THREE.Mesh(new THREE.SphereGeometry(480, 24, 14), skyMat)
  scene.add(sky)

  // 太阳（远距光点）
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sunGlow(), color: 0xfff3d8, transparent: true, depthWrite: false, fog: false,
  }))
  sunSprite.scale.setScalar(90)
  sunSprite.position.copy(sunDir).multiplyScalar(430)
  scene.add(sunSprite)

  // 低空薄云（缓慢飘移）
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, depthWrite: false, fog: false })
  for (let i = 0; i < 7; i++) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(26 + Math.random() * 30, 1.1, 10 + Math.random() * 14), cloudMat)
    c.position.set(-120 + Math.random() * 240, 42 + Math.random() * 26, -100 + Math.random() * 200)
    c.rotation.y = Math.random() * Math.PI
    c.userData.speed = 0.6 + Math.random() * 1.2
    scene.add(c)
    clouds.push(c)
  }

  // 光照：温暖阳光 + 天空泛光
  sun = new THREE.DirectionalLight(0xffddb0, 2.7)
  sun.position.copy(sunDir).multiplyScalar(70)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.left = -52; sun.shadow.camera.right = 52
  sun.shadow.camera.top = 52; sun.shadow.camera.bottom = -52
  sun.shadow.camera.near = 5; sun.shadow.camera.far = 160
  sun.shadow.bias = -0.0004
  sun.shadow.normalBias = 0.04
  scene.add(sun)
  scene.add(sun.target)

  const hemi = new THREE.HemisphereLight(0xcfe0f5, 0x7d6a52, 0.55)
  scene.add(hemi)
  scene.add(new THREE.AmbientLight(0xffffff, 0.16))

  applyQuality()
  resize()
  window.addEventListener('resize', resize)
}

export function applyQuality() {
  const q = CFG.quality[settings.quality]
  if (!renderer) return
  renderer.shadowMap.enabled = q.shadow > 0
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  if (renderer.shadowMap.enabled) {
    for (const l of scene.children) {
      if (l.isDirectionalLight && l.castShadow) {
        l.shadow.mapSize.set(q.shadow, q.shadow)
      }
    }
  }
  const scale = (parseInt(settings.resolution, 10) || 100) / 100
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.dpr) * scale)
  resize()
}

export function resize() {
  const w = window.innerWidth, h = window.innerHeight
  if (!renderer) return
  renderer.setSize(w, h)
  const fovV = (settings.fov * Math.PI) / 180
  camera.fov = (2 * Math.atan(Math.tan(fovV / 2) / (w / h)) * 180) / Math.PI
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}

export function updateWorld(dt, time) {
  for (const c of clouds) {
    c.position.x += c.userData.speed * dt
    if (c.position.x > 160) c.position.x = -160
  }
}

export function render(time) {
  renderer.render(scene, camera)
}

/* ---------- shadow follow: shadow map box centered on player ---------- */
const SHADOW_HALF = 34
export function updateShadow(px, pz) {
  if (!sun) return
  const cx = Math.max(-26, Math.min(26, px))
  const cz = Math.max(-18, Math.min(18, pz))
  sun.position.set(cx + sunDir.x * 70, 70, cz + sunDir.z * 70)
  sun.target.position.set(cx, 0, cz)
  sun.shadow.camera.left = -SHADOW_HALF
  sun.shadow.camera.right = SHADOW_HALF
  sun.shadow.camera.top = SHADOW_HALF
  sun.shadow.camera.bottom = -SHADOW_HALF
  sun.shadow.camera.updateProjectionMatrix()
}
