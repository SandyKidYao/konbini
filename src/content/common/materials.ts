// Materials shared across the built-in content. Some depend on engine services (reflections, wetness),
// so they are created once, on first request, from whichever mod asks first.
import type { ModContext } from '../../engine/mod';
import { mat } from '../../engine/kit/build';
import {
  asphaltTex, tileTex, concreteTex, blockTex, grassTex, storeWallTex, winWarmTex, winCoolTex,
} from './surfaces';

function build(ctx: ModContext) {
  const env = ctx.fx.envMap;
  const wet = <M extends import('three').MeshStandardMaterial>(m: M) => ctx.fx.wetable(m);
  return {
    wall: mat('#ffffff', { map: storeWallTex, roughness: 0.6 }),
    white: mat('#f3f3ef', { roughness: 0.55 }),
    frame: mat('#59606a', { roughness: 0.4, metalness: 0.55 }),
    darkMetal: mat('#3a3f46', { roughness: 0.5, metalness: 0.45 }),
    chrome: mat('#d3d7dc', { roughness: 0.25, metalness: 0.9 }),
    rubber: mat('#24262a', { roughness: 0.9 }),
    pole: mat('#b1b0aa', { roughness: 0.8 }),
    wire: mat('#2a2a2c', { roughness: 0.6 }),
    green: mat('#16936a', { roughness: 0.45 }),
    awning: mat('#d6d8d6', { roughness: 0.45, metalness: 0.1 }),
    roof: mat('#b7b8b3', { roughness: 0.9 }),
    coping: mat('#a2a5a8', { roughness: 0.6 }),
    shelf: mat('#eceef0', { roughness: 0.5 }),
    shelfBase: mat('#4b5a68', { roughness: 0.6 }),
    wood: mat('#b8936a', { roughness: 0.65 }),
    houseRoof: mat('#56637a', { roughness: 0.65, flatShading: true }),
    darkGlass: mat('#2a3542', { roughness: 0.12, metalness: 0.55, envMap: env, envMapIntensity: 0.5 }),
    glass: mat('#c2d4dd', { transparent: true, opacity: 0.18, roughness: 0.04, metalness: 0.3, envMap: env, envMapIntensity: 0.9, depthWrite: false }),
    roadPaint: wet(mat('#f2f1ec', { roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })),
    asphalt: wet(mat('#ffffff', { map: asphaltTex, roughness: 0.92 })),
    tile: wet(mat('#ffffff', { map: tileTex, roughness: 0.85 })),
    concrete: wet(mat('#ffffff', { map: concreteTex, roughness: 0.9 })),
    block: wet(mat('#ffffff', { map: blockTex, roughness: 0.95 })),
    curb: wet(mat('#cdcac2', { roughness: 0.85 })),
    grass: wet(mat('#ffffff', { map: grassTex, roughness: 1 })),
    wheelStop: wet(mat('#d6d2c8', { roughness: 0.9 })),
  };
}
export type CommonMaterials = ReturnType<typeof build>;

let cache: CommonMaterials | null = null;
export const materials = (ctx: ModContext) => (cache ??= build(ctx));

/** A lit window pane (warm curtains or cool blinds) that follows the 'window' channel. */
export function windowPane(ctx: ModContext, kind: 'warm' | 'cool') {
  const m = mat('#2b3542', {
    emissive: '#ffffff', emissiveMap: kind === 'warm' ? winWarmTex : winCoolTex,
    roughness: 0.15, metalness: 0.4, envMap: ctx.fx.envMap, envMapIntensity: 0.5,
  });
  return ctx.glow.add(m, 'window', kind === 'warm' ? ctx.mod.random.range(0.6, 0.95) : ctx.mod.random.range(0.35, 0.6));
}
