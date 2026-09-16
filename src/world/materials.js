/* ================= 共享材质库 ================= */
import * as THREE from 'three'
import { wallPlaster, floorTiles, crateWood } from './textures.js'

export const PALETTE = {
  plaster: 0xe6dcc5,
  stone: 0x998d79,
  stoneLight: 0xb8b0a0,
  wood: 0x8d6c45,
  metal: 0x555d6b,
  plant: 0x4d7a4d,
  trim: 0x5d83e8,
  water: 0x2f6f9f,
  rugA: 0xb3552e,
  rugB: 0x2e4a6e,
  railing: 0x3a4048,
  trunk: 0x7a5c3c,
  leaf: 0x3f7a45,
}

let cache = null

export function getMaterials() {
  if (cache) return cache
  const plasterTex = wallPlaster()
  const floorTex = floorTiles()
  const woodTex = crateWood()

  cache = {
    floor: new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.92, metalness: 0.02 }),
    plaster: new THREE.MeshStandardMaterial({ map: plasterTex, roughness: 0.9 }),
    plasterDark: new THREE.MeshStandardMaterial({ color: PALETTE.plaster, roughness: 0.9 }),
    stone: new THREE.MeshStandardMaterial({ color: PALETTE.stone, roughness: 0.95, metalness: 0.03 }),
    stoneLight: new THREE.MeshStandardMaterial({ color: PALETTE.stoneLight, roughness: 0.9 }),
    wood: new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.75 }),
    metal: new THREE.MeshStandardMaterial({ color: PALETTE.metal, roughness: 0.45, metalness: 0.6 }),
    railing: new THREE.MeshStandardMaterial({ color: PALETTE.railing, roughness: 0.5, metalness: 0.5 }),
    plant: new THREE.MeshStandardMaterial({ color: PALETTE.plant, roughness: 1 }),
    trim: new THREE.MeshStandardMaterial({
      color: PALETTE.trim, roughness: 0.35, metalness: 0.2,
      emissive: PALETTE.trim, emissiveIntensity: 0.5,
    }),
    water: new THREE.MeshStandardMaterial({
      color: PALETTE.water, roughness: 0.1, metalness: 0.2,
      emissive: 0x1b3c5c, emissiveIntensity: 0.5, transparent: true, opacity: 0.92,
    }),
    rugA: new THREE.MeshStandardMaterial({ color: PALETTE.rugA, roughness: 1 }),
    rugB: new THREE.MeshStandardMaterial({ color: PALETTE.rugB, roughness: 1 }),
    trunk: new THREE.MeshStandardMaterial({ color: PALETTE.trunk, roughness: 1 }),
    leaf: new THREE.MeshStandardMaterial({ color: PALETTE.leaf, roughness: 1, flatShading: true }),
    laneLine: new THREE.MeshStandardMaterial({ color: 0xd8cdb4, roughness: 0.95 }),
    arch: new THREE.MeshStandardMaterial({ color: 0xd9cdb2, roughness: 0.85 }),
  }
  return cache
}
