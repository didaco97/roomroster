export type GrainMaskKind = 'felt' | 'marker' | 'graphite' | 'waxy' | 'stamp'

export interface GrainTile {
  uri: string
  size: number
  density: number
  css: number
  bytes: number
  mean: number
}

export const GRAIN_TILES: Record<GrainMaskKind, GrainTile> = {
  felt: {
    uri: '/textures/06597dc2195d.png',
    size: 224,
    density: 2,
    css: 112,
    bytes: 14622,
    mean: 0.897,
  },
  marker: {
    uri: '/textures/b90186efaed7.png',
    size: 256,
    density: 2,
    css: 128,
    bytes: 19041,
    mean: 0.932,
  },
  graphite: {
    uri: '/textures/1f93fd1d306f.png',
    size: 224,
    density: 2,
    css: 112,
    bytes: 13207,
    mean: 0.866,
  },
  waxy: {
    uri: '/textures/5cdb04679567.png',
    size: 224,
    density: 2,
    css: 112,
    bytes: 10023,
    mean: 0.931,
  },
  stamp: {
    uri: '/textures/c14f9e42e529.png',
    size: 320,
    density: 2,
    css: 160,
    bytes: 12359,
    mean: 0.928,
  },
}
