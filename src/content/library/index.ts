// The asset library: registers every built-in prefab. Nothing is placed in the scene here.
import { defineMod } from '../../engine/mod';
import { Figure, Dog, type FigureOptions } from './figure';
import { car, truck, bus, type Car, type CarOptions, type TruckOptions, type BusOptions } from './car';
import { nobori, vendingMachine, bicycle, acUnit, trafficCone, type Nobori, type NoboriDesign, type VendingMachine } from './props';
import type * as THREE from 'three';

type Simple = { root: THREE.Group };
declare module '../../engine/prefabs' {
  interface PrefabTypes {
    figure: { options: FigureOptions; result: Figure };
    dog: { options: object; result: Dog };
    car: { options: CarOptions; result: Car };
    truck: { options: TruckOptions; result: Car };
    bus: { options: BusOptions; result: Car };
    nobori: { options: { design?: NoboriDesign }; result: Nobori };
    'vending-machine': { options: { body?: string; accent?: string; seed?: number; label?: string }; result: VendingMachine };
    bicycle: { options: { color?: string }; result: Simple };
    'ac-unit': { options: object; result: Simple };
    'traffic-cone': { options: object; result: Simple };
  }
}

export default defineMod({
  id: 'konbini.library',
  name: '素材库',
  layer: 'library',
  setup(ctx) {
    const p = ctx.prefabs;
    p.define('figure', (c, o: FigureOptions) => new Figure(c, o));
    p.define('dog', () => new Dog());
    p.define('car', car);
    p.define('truck', truck);
    p.define('bus', bus);
    p.define('nobori', nobori);
    p.define('vending-machine', vendingMachine);
    p.define('bicycle', bicycle);
    p.define('ac-unit', acUnit);
    p.define('traffic-cone', trafficCone);
  },
});

export { Figure, Dog };
