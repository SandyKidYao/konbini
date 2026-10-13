# 写一个模组

场景里的一切都是模组：街道、店铺、行人、事件。内置模组和外部模组用的是同一套接口，区别只是一个打包在工程里，一个在运行时从网址加载。

## 最小的模组

```ts
import { defineMod } from '../../engine/mod';

export default defineMod({
  id: 'my.balloon',          // 唯一，用点分隔
  layer: 'extra',            // library | world | site | events | extra
  requires: ['konbini.world.streets'],
  setup(ctx) {
    const { THREE, kit } = ctx;
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.6, 24, 16), kit.mat('#ff7a5c'));
    b.position.set(0, 12, 0);
    ctx.root.add(b);                                   // 每个模组有自己的根节点
    ctx.onFrame((dt, t) => { b.position.y = 12 + Math.sin(t) * 0.3; });
  },
});
```

内置模组写好后加到 `src/content/index.ts` 的 `builtinMods` 里。外部模组是一个普通的 `.js` 文件，`export default` 同样的对象，不 import 任何东西（`THREE`、`kit`、脚本步骤都从 `ctx` 拿），放进 `public/mods/` 后用 `?mods=mods/xxx.js` 加载，参考 `public/mods/chochin.js`。

## 上下文 `ctx` 能做什么

| 成员 | 用途 |
|---|---|
| `ctx.THREE`、`ctx.kit` | three.js 和建模工具（`box`、`cyl`、`rod`、`mat`、`canvasTex`、随机数…） |
| `ctx.root`、`ctx.scene` | 本模组的根节点；整个场景（摄影棚级的东西放这里） |
| `ctx.mod.random` | 按模组 id 播种的随机数，布局每次一致 |
| `ctx.atmosphere` | `drivers`（hour、daylight、golden、cloud、rain、snow、fog、wind、thunder、temperature、wet、snowCover、flash）、`look`、`channel(name)`、`defineChannel`、`onStrike` |
| `ctx.glow.add(mat, 'sign', 1)` | 让自发光材质跟随某个通道（`sign` `interior` `vending` `window` `lamp` `signal` `head`，可自定义） |
| `ctx.surfaces` | `addWalk` 可行走面、`addRoof` 屋顶（雨在这里停）、`addShelter` 遮雨区 |
| `ctx.nav` | 步行网络：`addNode` / `addEdge`（`width` 车道宽、`gate` 闸门、`onEnter` 开门钩子）/ `route` |
| `ctx.prefabs` | `define(name, factory)` 注册素材；`create('figure', {...})` 生成 |
| `ctx.director` | `define(event)` 注册随机事件；`spawn(walker, { at: 'node.id' })` 生成角色 |
| `ctx.steps` | 角色脚本：`go` `walk` `wait` `until` `face` `pose` `sit` `stand` `place` `run` `leave` |
| `ctx.services` | `provide(name, impl)` / `get(name)`：模组之间按名字协作，不互相 import |
| `ctx.bus` | 松散的消息：`emit` / `on` |
| `ctx.fx` | `envMap`、`wetable(mat)`、`addPuddle`、`addSheen`、`addPass`（自定义后期） |
| `ctx.audio` | `define(name, recipe)` 定义音效、`play(name)` |
| `ctx.interact.clickable(obj, fn, '名字')` | 可点击，悬停显示名字 |
| `ctx.onFrame(fn)` | 每帧回调 `(dt, t, drivers)` |

## 事件

```ts
ctx.director.define({
  id: 'delivery-truck',
  max: 1,
  needs: { services: ['shop'] },                     // 当前主体没有这个服务就不会触发
  weight: ({ drivers }) => 0.2 * drivers.daylight,   // 白天才来
  run({ drivers, board }) {
    const S = ctx.steps;
    const fig = ctx.prefabs.create('figure', { shirt: '#3d78d6' });
    const a = ctx.director.spawn(fig, { at: 'street.a.west', label: '送货员' });
    a.then(S.go('shop.door.in'), S.pose('pay', 2), S.go('street.a2.east'));
    return a;                                        // 返回角色，调度器据此判断事件何时结束
  },
});
```

## 天气相关的约定

- 想让东西跟着天气变：每帧读 `drivers`，比如 `d.snow > 0.3` 时撑伞，`d.temperature < 8` 时围围巾，`d.thunder > 0.3` 时收旗
- 积雪是自动的：模型里朝上、头顶没有遮挡的表面会积雪。会移动的东西（比如车）设 `object.userData.skyIgnore = true`，不想积雪的设 `userData.noSnow = true`
- 闪电：`ctx.atmosphere.onStrike((distance) => …)`
- 换天气数据源：实现 `WeatherProvider`（`src/engine/live/openmeteo.ts`），返回 `LiveReport`，传给 `new LiveSync(atmosphere, provider)`

## 换一个主体

主体模组都带 `site: 'xxx'`，只有 `?site=xxx` 选中的那一组会加载。世界通过服务 `world.plot` 给出地块范围和临街入口节点；主体在地块上搭建，并提供事件依赖的服务和节点名。便利店提供的约定写在 `src/content/site/konbini/api.ts`（`shop`、`shop.backyard`、`shop.banners` 以及 `shop.door.in`、`shop.register` 等节点）。新主体只要提供同样的约定，顾客、店员等事件就能直接复用。

## 外部模组的安全

外部模组是任意 JavaScript，运行时拥有和页面一样的权限。默认只接受同源的相对路径；要加载完整网址需要额外加 `&allowRemoteMods`，只对你信任的来源这样做。
