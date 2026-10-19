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

内置模组写好后加到 `src/content/index.ts` 的 `builtinMods` 里。外部模组是一个普通的 `.js` 文件，`export default` 同样的对象，不 import 任何东西（`THREE`、`kit`、脚本步骤都从 `ctx` 拿），放进 `public/mods/` 后用 `?mods=mods/xxx.js` 加载，参考 `public/mods/chochin.js`（提灯）和 `public/mods/furin.js`（只在夏天挂出来的风铃）。

## 上下文 `ctx` 能做什么

| 成员 | 用途 |
|---|---|
| `ctx.THREE`、`ctx.kit` | three.js 和建模工具（`box`、`cyl`、`rod`、`mat`、`canvasTex`、随机数…）；`fader(root)` 让一整个物体淡入淡出（`set(0–1)`，行人出现和离开、车辆在边缘都用它） |
| `ctx.root`、`ctx.scene` | 本模组的根节点；整个场景（摄影棚级的东西放这里） |
| `ctx.mod.random` | 按模组 id 播种的随机数，布局每次一致 |
| `ctx.atmosphere` | `drivers`（hour、daylight、golden、cloud、rain、snow、fog、wind、thunder、temperature、wet、snowCover、flash）、`day`（今天的日期、季节、节日）、`look`、`channel(name)`、`defineChannel`、`onStrike`、`onDayChange` |
| `ctx.states` | 随日期、时间、天气切换的离散状态：`track({ pick, enter, blend })`、`show(object, when)`、`conditions`（见下文） |
| `ctx.glow.add(mat, 'sign', 1)` | 让自发光材质跟随某个通道（`sign` `interior` `vending` `window` `lamp` `signal` `head`，可自定义） |
| `ctx.surfaces` | `addWalk` 可行走面、`addRoof` 屋顶（雨在这里停）、`addShelter` 遮雨区 |
| `ctx.nav` | 步行网络：`addNode` / `addEdge`（`width` 车道宽、`gate` 闸门、`onEnter` 开门钩子）/ `route` |
| `ctx.prefabs` | `define(name, factory)` 注册素材；`create('figure', {...})` 生成 |
| `ctx.director` | `define(event)` 注册随机事件；`spawn(walker, { at: 'node.id' })` 生成角色；`avoid((actor, x, z) => 是否让一让)` 让行人走路时给某些东西让路（道路模组用它让人给开着的车让路） |
| `ctx.steps` | 角色脚本：`go` `walk` `wait` `until` `face` `pose` `sit` `stand` `place` `run` `leave` |
| `ctx.services` | `provide(name, impl)` / `get(name)`：模组之间按名字协作，不互相 import |
| `ctx.bus` | 松散的消息：`emit` / `on` |
| `ctx.fx` | `envMap`、`transparent`（桌宠：只画模型，周围没有摄影棚地面和背景；桌宠的「显示天空」会在运行中改变它，每帧读，不要只在 `setup` 里读一次）、`wetable(mat)`、`addPuddle`、`addSheen`、`addPass`（自定义后期）、`skyChanged()`（挡雪的东西变了）、`warm(obj)`（预先编译着色器，见下） |
| `ctx.audio` | `define(name, recipe)` 定义音效、`play(name)` |
| `ctx.interact.clickable(obj, fn, '名字')` | 可点击（悬停时光标变成手形；名字不显示在画面上） |
| `ctx.plan` | 俯视图上的样子：`add(shape)` 加一块平面形状、`marker(m)` 加一个小灯、`movers(fn)` 报告会动的东西（见下文「俯视图」） |
| `ctx.onFrame(fn)` | 每帧回调 `(dt, t, drivers)` |

## 事件

```ts
ctx.director.define({
  id: 'flyers',
  max: 1,
  needs: { services: ['shop'] },                     // 当前主体没有这个服务就不会触发
  weight: ({ drivers }) => 0.2 * drivers.daylight,   // 白天才来
  run({ drivers, board }) {
    const S = ctx.steps;
    const fig = ctx.prefabs.create('figure', { shirt: '#3d78d6' });
    const a = ctx.director.spawn(fig, { at: 'street.a.west', label: '发传单的人' });
    a.then(S.go('shop.door.in'), S.pose('pay', 2), S.go('street.a2.east'));
    return a;                                        // 返回角色，调度器据此判断事件何时结束
  },
});
```

事件的 `weight` 和 `run` 还会收到 `day`（今天的日期，见下文），比如 `weight: ({ drivers, day }) => day.dayOff ? 0.6 : 0.3` 让周末和节假日更热闹。

内置飞机事件提供 `events.aircraft` 服务，供脚本和调试使用（没有界面按钮）：

- `send(1 | -1)`：请求往 +x 或 −x 飞越，成功返回 `true`；已有飞机或尾云、或当前不是适合飞行的白天晴／少云天气时返回 `false`
- `flying`：只读布尔值，飞机是否正在飞越；`lingering`：只读布尔值，飞机或尾云是否仍在场
- 自动事件的起飞间隔为 240–420 模拟秒，首次也等待这个间隔；飞越约 38 秒，每段尾云保留约 60 秒后完全消散，上一架飞机及其尾云清完前不会再次起飞。夜晚、阴雨雪雾天气暂停出现，条件恢复后重新尝试，不积攒航班

运行 `npm run check:aircraft` 可检查调度、尾云生命周期、天气切换、俯视图同步和长期资源稳定性；截图回归为 `npm run build && npm run shots -- aircraft`。

## 车辆与道路

车和人一样是按脚本行动的角色，引擎部分在 `src/engine/agents/vehicle.ts`：

- 路径：`path(x, z, 朝向).speed(8).line(x, z).curve(x, z, 朝向)` 画出车走的线（朝向 0 = +z，π/2 = +x），弯道会自动限速
- 脚本步骤：`drive(path, { reverse, speed, gates, through })`、`wait`、`until`、`run`、`engine(on)`、`choose(fn)`（走到这里再决定接下来做什么）
- 行驶中自动做的事：在路径终点和关着的闸门（`Gate`：红灯、停车让行、人行横道上有人）前停下；跟车；给挡在路上的车和人让路；拐弯前打转向灯；刹车灯、倒车灯；天暗、下雨、起雾时开大灯
- 人也会让车：走路时看前方一步，正在开或马上要开的车（车身外加上它一秒内要开到的地方）挡着就先停一下；车如果正是在等这个人，那人先走
- 世界模组 `konbini.world.roads` 提供服务 `world.roads`（类型见 `src/content/world/roads.ts`）：
  - `spawn(body, 'west' | 'east' | 'shore-west' | 'shore-east')`：在道路尽头（模型外）放一辆车：A 路的两头，或者海边公路的两头
  - `through(from, to)`：开过去，遵守信号灯和停车让行：沿 A 路直行；从 A 路拐进 B 路，过踏切，到下面的丁字路口转上海边公路（反过来也行）；或者沿海边公路开过去。过踏切前一律先停一下，警报响着、栏杆没抬起、或者对面没有一辆车的空位时不过去
  - `arrive(from, pose, onward, { enter, balk })`：沿 A 路开来、拐进路边某处（比如停车场出入口），再慢慢开过 `onward`；拐弯前问 `enter` 有没有空位，没有就直接开过去（`balk`）。`onward` / `via` 里的点写 `[x, z]` 是直线开过去，写 `{ x, z, heading }` 是转弯过去
  - `depart(pose, 'east' | 'west', { via })`：先慢慢开过 `via` 这些点（比如沿停车场车道开到出入口），在人行道前等空当，再汇入 A 路开走
  - `pullIn(from, pose, { enter })`：沿 A 路开来、拐进 B 路，再车头朝前拐进 B 路西侧的车位（`pose` 是停好的位置，车头朝 −x）。拐下 A 路之前在路口边上等 `enter` 说可以（比如拿到车位前的锁），不会开到 B 路里再放弃
  - `backOut(pose, to, { ready, onRoad })`：从 B 路西侧的车位倒车出来开走：`'south'` 顺着 B 路开下去，`'east'` / `'west'` 倒进对面车道、开上路口转回 A 路。先等要倒过去的车道都有空当，再问 `ready`（比如拿锁），倒车期间其他车在车位两头停下等它
  - `intoLane(from, x)` / `alongLane()`：从 A 路拐进 B 路、再左转进店后的小巷，停在 x 处；之后顺着小巷往西开出模型（送货卡车用）
  - `clip`：车身要用的裁切平面。用素材库造的车身带上它，车身完整进入模型后约 0.8 秒内淡入，遇到红灯或排队停住也会继续变得清晰；驶离时在边缘前最后几米整体淡出，到边缘时已经完全消失，不会露出被切开的截面。自己写车身时，实现 `VehicleBody.fade(presence)` 就能得到同样的效果，`presence` 由引擎每帧给出（0–1），交给 `ctx.kit.fader(root).set` 即可
- 世界模组 `konbini.world.railway` 提供服务 `world.railway`：`closed()` 踏切是不是关着（警报在响，或者栏杆还没完全抬起来），`z` 铁路中线，`crossing` 踏切的范围，`send(1 | -1)` 马上发一班车（往 +x 或 −x，没有车在跑的时候）。电车从 5:30 到 23:50 大约每两分钟一班，往返交替；行人走到踏切前、车开到停止线前都会看 `closed()`
- 车身素材：`car`（形状见 `CAR_MODELS`：kei、hatch、sedan、minivan、taxi）、`truck`（`kei` 小货车、`box` 箱式送货车）、`bus`；都实现 `VehicleBody`，也可以自己做车身

```js
// 每隔一会儿开过一辆粉色的移动售货车
const roads = ctx.services.get('world.roads');
let wait = 30;
ctx.onFrame((dt) => {
  if ((wait -= dt) > 0 || !roads.free('west')) return;
  wait = 120;
  const body = ctx.prefabs.create('car', { color: '#f6c6d8', len: 4.7, width: 1.74, bodyH: 0.72, cabinLen: 3.5, cabinH: 0.82, cabinX: -0.45, clip: roads.clip });
  roads.spawn(body, 'west', { label: '移动售货车' }).then(roads.through('west', 'east', { speed: 5 }));
});
```

## 日期、季节与状态

`ctx.atmosphere.day` 是今天：实况模式下是那个地方的真实日期，否则是本机日期，或者 `?date=2026-07-07` / `?season=winter` 指定的日期。按 `[` `]` 可以前后翻一天（加 Shift 一周），方便预览。

| 字段 | 含义 |
|---|---|
| `year` `month` `date` `weekday` | 日期，`weekday` 0 是周日 |
| `season` | `spring` `summer` `autumn` `winter`（南半球的地点会反过来） |
| `seasonDay` | 按季节算的「一年中的第几天」，南半球偏移半年；花开叶落这类用它，配合 `ctx.kit.between(day.seasonDay, '3-22', '4-12')`（跨年的区间也行，如 `'12-28', '1-7'`） |
| `dayOff` / `holiday` | 是否周末或日本法定节假日；节假日名称 |
| `festivals` | 正在进行的节日：`shogatsu` `setsubun` `hinamatsuri` `tanabata` `natsumatsuri` `obon` `tsukimi` `halloween` `christmas` `omisoka` |

便利店在日本，所以节假日和节日按日本的日历；季节跟随地点所在的半球。手动模式下日出日落按东京和当天日期计算，夏天傍晚更亮、冬天天黑得早；实况模式下用那个地方真实的日出日落。天气预设的气温也随季节变化（冬天的「晴」很冷）。

### 让素材随条件切换状态

连续变化的东西（招牌亮度、灯光强度）继续用通道和 `onFrame`。「该显示哪个版本」这类离散状态用 `ctx.states`：

```ts
// 樱花：春开、夏绿、秋红、冬枯；切换时用 3 秒慢慢变色
ctx.states.track<'bloom' | 'leaf' | 'autumn' | 'bare'>({
  pick: ({ day }) => between(day.seasonDay, '3-22', '4-12') ? 'bloom' : between(day.seasonDay, '4-13', '9-30') ? 'leaf'
    : between(day.seasonDay, '10-1', '11-30') ? 'autumn' : 'bare',
  duration: 3,
  blend: (from, to, t) => canopy.color.copy(COLOR[from]).lerp(COLOR[to], t),
});

// 自动贩卖机：入冬换热饮，瞬间切换
ctx.states.track({
  pick: ({ day, drivers }) => between(day.seasonDay, '10-15', '4-20') || drivers.temperature < 8 ? 'hot' : 'cold',
  enter: (to) => { front.map = faces[to]; },
});

// 节日装饰：条件成立时弹出来，不成立时收起
ctx.states.show(kadomatsu, (c) => c.has('shogatsu'));
```

- `pick(c)` 返回当前应处的状态（字符串、数字、布尔都行），引擎每秒检查几次，日期一变立即检查。`c` 里有 `day`、`season`、`dayOff`、`has(festival)`、`hour`、`period`（`dawn` `day` `dusk` `night`，按日出日落）、`weather`、`drivers`
- `enter(to, from)` 在切换开始时调用，适合换贴图、换文字这类一步到位的变化；开头会以 `from = undefined` 调用一次
- `blend(from, to, t)` 在切换过程中每帧调用，`t` 从 0 缓动到 1，适合颜色、大小渐变；开头会以 `blend(s, s, 1)` 调用一次
- `duration` 切换用的秒数（默认 1.6，0 为立即）；用户开了「减少动态效果」时一律立即切换
- 切换结束后引擎会重新计算积雪的遮挡，所以出现、消失的东西不会在原地留下一块不积雪的空白
- 会出现的东西请在 `setup` 里就建好、交给 `show` 隐藏，这样它的材质也能积雪
- 只活一小会儿的东西（比如路人）不需要 track，生成时读一次 `ctx.states.conditions` 决定穿什么就行

## 天气相关的约定

- 想让东西跟着天气变：每帧读 `drivers`，比如 `d.snow > 0.3` 时撑伞，`d.temperature < 8` 时围围巾，`d.thunder > 0.3` 时收旗
- 积雪是自动的：模型里朝上、头顶没有遮挡的表面会积雪。会移动的东西（比如车）设 `object.userData.skyIgnore = true`，不想积雪的设 `userData.noSnow = true`
- 闪电：`ctx.atmosphere.onStrike((distance) => …)`
- 换天气数据源：实现 `WeatherProvider`（`src/engine/live/openmeteo.ts`），返回 `LiveReport`，传给 `new LiveSync(atmosphere, provider)`

## 俯视图

俯视图是另一种形态：从正上方看下去的一块像素风小图，先画在约 50 个像素宽的画布上，再按整数倍放大；车和人画得比实际大，很小的一块图也看得清。车和人、红绿灯、天气、昼夜都和模型同步，打开俯视图时模型不再绘制，所以很省电。图上有什么，由模组自己通过 `ctx.plan` 声明，和造模型时一一对应：

```js
// 地面、路面、屋顶：kind 决定默认颜色和叠放顺序（road → land → green → walk → lot → paint → tree → building → site）
ctx.plan.add({ kind: 'building', rect: { x0: -4, x1: 4, z0: -3, z1: 3 }, h: 6, color: '#d6d1de', glow: 'window' });
ctx.plan.add({ kind: 'tree', circle: { x: 2, z: 8, r: 1.5 }, h: 4, color: () => leaves.color.getStyle() });
// 小灯：color(t) 每帧调用，返回 null 就是灭着；pool 是夜里地上那圈光的半径
ctx.plan.marker({ x: 10, z: 9, r: 0.4, pool: 6, color: () => ctx.atmosphere.channel('lamp') > 0.05 ? '#ffe0a6' : null });
// 会动的东西：每画一帧调用一次，返回当前的位置、朝向、尺寸
ctx.plan.movers(() => robots.map((r) => ({ kind: 'vehicle', x: r.x, z: r.z, heading: r.heading, len: 0.6, width: 0.6 })));
```

- 坐标和场景一样，单位是米；俯视图上 x 向右、z 向下（场景的正面，也就是道路 A，在下方）
- `h` 是高度：有高度的形状会背着太阳投影，太阳越低影子越长；人走到高于 2 米的屋顶下面就看不见了
- `color` 可以是函数，每帧读取（季节里变色的树）。不写就用这一类的默认颜色。夜晚、积雪、雨后路湿的效果由地图统一加上，形状只要给白天的颜色
- `glow` 是一个发光通道名（`window`、`interior`、`sign`…）：通道亮起来时，形状在夜里泛暖光
- 车和人在图上都画得比实际大，而且各用一种颜色（所有车一个颜色，所有人一个颜色），小图上一眼能分清。行人由引擎自动画上；道路模组把 `traffic.vehicles` 报告给了 `movers`
- `movers` 返回的 `PlanMover.kind` 可以是 `vehicle`、`person`、`aircraft` 或 `contrail`；`heading` 为弧度，0 朝 +z、π/2 朝 +x，`len` / `width` 是米制尺寸，`opacity` 为可选的 0–1 可见度（默认 1，四种都按它绘制，`npm run check:plan-opacity` 检查车和人）。飞机以有机翼和尾翼的蓝色小图案画在地面对象之上，旁边带一块投在地上的淡影；尾云按小段登记，使用偏冷的浅色像素抖动，随 `opacity` 降低逐渐稀疏、淡去。在模型上，飞机像云一样往地面投下影子
- 模组 `setup` 失败时，它加到俯视图上的东西会一并撤掉

## 静态合并（自动，不用声明）

所有模组 `setup` 结束后，引擎会把共用同一个材质的静态网格合并成一个网格来画，这样绘制次数能从上千次降到几百次。模组不需要做任何事，但了解规则能避免意外：

- 原来的网格还留在原处：引用、父子关系、`userData`、点击都照常。它们只是被移到第 31 层（`BATCHED_LAYER`），不再被相机绘制。如果你自己用 `Raycaster` 做检测，记得 `raycaster.layers.enable(31)`
- 引擎每帧检查这些原网格。哪个被移动、旋转、缩放、隐藏、移出场景，或者换了材质、改了几何体，它就自动退出合并，回到单独绘制（这一次要重建它所在的批次，之后就没有额外开销了）。所以 `onFrame` 里做动画、开门、点击后弹一下都照常工作
- 改材质的属性（颜色、发光强度、贴图）不影响合并，因为合并后的网格用的就是同一个材质对象
- 不参与合并的：透明材质、多材质数组、`ShaderMaterial`、交给 `ctx.states.show` 的物体、带 `userData.skyIgnore` 的物体（会移动的东西本来就该设这个），以及 `setup` 之后才加进场景的东西
- 一出场就一直在动的东西设 `userData.skyIgnore = true`，可以省掉第一帧的那次重建

## 运行中才出场的东西：预先编译着色器

一种新的材质组合第一次被画出来时，浏览器要现编着色器，画面会卡几十毫秒。加载时就在场景里的东西没有这个问题（编译发生在加载画面后面），运行中才生成的东西才有，比如第一次开进来的巴士。在 `setup` 里给每种会出场的东西造一个样品交给 `ctx.fx.warm(obj)`，引擎会在下一帧把它离屏画一次（所有部件都显示，夜里才亮的灯也算），之后保留它，让编好的着色器不被回收。样品不用加进场景，也不要再用。街上的车就是这样做的（`events/traffic.ts`）

## 换一个主体

主体模组都带 `site: 'xxx'`，只有 `?site=xxx` 选中的那一组会加载。世界通过服务 `world.plot` 给出地块范围和临街入口节点；主体在地块上搭建，并提供事件依赖的服务和节点名。便利店提供的约定写在 `src/content/site/konbini/api.ts`：
- `shop`：店门、货架通道、收银台等节点，以及 `awning`（雨棚前沿的位置，外部模组挂提灯、风铃时从这里取，不要写死坐标）
- `shop.backyard`：后门、员工贩卖机、长椅，以及围栏上朝后巷的开口（`opening`，节点 `lane` 在开口外的后巷里，送货员从这里进出）；`shop.banners`
- `shop.parking`：店侧边的车位——车头朝店的侧窗，直接开向 B 路（没有车道，B 路就是车道），每个车位写明轮挡的位置和下车后走到人行带的空隙；同一时间只让一辆车在车位前进出的锁（`takeFront` / `freeFront`）；车怎么进出由停车事件按这些数据规划
- `shop` 的节点里可以有 `sideOut`：第二扇门（侧门）外面的位置，停车的人从这里进出
- 节点 `shop.photo.model` / `shop.photo.camera`：游客拍照的位置（有这两个节点，拍照事件才会出现）

新主体只要提供同样的约定，顾客、店员、开车来的顾客等事件就能直接复用。

便利店的布局：店的左边是员工后院，右边是四个车位，车头朝侧窗、直接开向 B 路；店前是一整片铺地，从后院的围栏一直到 B 路的转角。侧窗前 1.2 m 的人行带从后巷一直通到店前，侧门开在上面，B 路这一侧走路的人也走这条（B 路在店旁边没有人行道，世界的节点 `street.b.side` 和 `street.b.crossing` 由主体连起来）。店后是一条贯通的后巷，送货卡车从 B 路开进来、停在后院的开口前卸货，再往西开出模型；后巷里不要放任何东西。往店前加东西时，别放进侧窗前的人行带和后巷。

## 外部模组的安全

外部模组是任意 JavaScript，运行时拥有和页面一样的权限。默认只接受同源的相对路径；要加载完整网址需要额外加 `&allowRemoteMods`，只对你信任的来源这样做。
