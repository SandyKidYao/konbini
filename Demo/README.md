# ひかりマート · 1:150 场景模型

一个用 Three.js 做的日式街角便利店桌面模型，可在晴朗的白天、阴天的下午、雨夜三个场景间切换。

## 运行

```bash
npm install
npm run dev      # 本地开发，改代码即时刷新
npm run build    # 打包成单个 dist/index.html，双击即可打开
```

`legacy/single-file.html` 是拆分前的旧版单文件 Demo，仅作参照。

## 操作

- 拖动旋转、滚轮缩放、右键平移；松手 6 秒后转台会继续慢慢转
- `1` `2` `3` 切换场景，`R` 开关转台，`M` 开关声音
- 点击小猫、便利店、后门、自动贩卖机、出租车、路上的人会有小反馈
- 网址后加 `#night` 直接打开雨夜；`?cam=x,y,z,tx,ty,tz` 指定初始视角；`?warp=60` 先快进 60 秒的街景再显示

## 目录

```
src/
  main.js              入口：按顺序搭建模型，跑主循环
  style.css            界面样式（展品标签、贩卖机按键、工具按钮）
  core/
    stage.js           渲染器、场景、相机、轨道控制、反射用的 CubeCamera
    helpers.js         box / cyl / rod 等建模工具，圆角盒、贴图 UV、canvas 贴图
    materials.js       多处共用的材质
    registry.js        跨模块登记表：发光材质、会变湿的材质、每帧回调、可点击物体
    palette.js         品牌色、商品色
    rng.js             固定种子的随机数（每次打开布局一致）
  textures/
    surfaces.js        沥青、地砖、土层截面、胡桃木等表面贴图
    signage.js         招牌、海报、贩卖机面板、铭牌等带字的贴图
  world/
    layout.js          街区平面尺寸、建筑范围、雨滴落点高度 floorAt()
    plinth.js          展示底座（土层 + 胡桃木 + 铜铭牌）与摄影棚背景
    ground.js          地块、人行道、路缘石、道路标线
    store.js           便利店：外壳、玻璃、招牌、雨棚、店内、屋顶、自动门
    props.js           贩卖机、自行车、伞架、垃圾桶、路桩、锥桶、栏杆、小猫
    backyard.js        店铺左侧的员工后院：后门、围栏、补货笼车、垃圾站、休息角、打盹的猫
    neighborhood.js    民宅、公寓、对街商铺、投币停车场、公交站、围墙树篱
    street.js          电线杆与电线、路灯、红绿灯（含信号周期）、路牌、反光镜
    nature.js          樱花与花瓣、悬浮的棉花云
    vehicles.js        出租车（会等红灯）与停着的车
    lights.js          太阳、天光、店内与雨棚的灯
    nobori.js          店门口的のぼり旗（宣传旗）
  life/
    figure.js          小人偶（关节、姿势、手持道具、雨伞）和柴犬
    actor.js           脚本执行器：walk / wait / until / face / pose / sit / run / leave
    routes.js          可走的路线：人行道、斑马线（等绿灯）、停车场到店门、店内过道
    events.js          随机事件与调度：顾客购物、游客拍照、店员后院休息、店员摆/收旗、路人遛狗
  fx/
    weather.js         雨丝与水花（GPU 计算）
    wet.js             平面反射：水洼（带涟漪）与湿地面的倒影
    post.js            后期：环境光遮蔽、辉光、移轴模糊、调色
  state/
    modes.js           三个场景的全部参数表与过渡插值
    apply.js           把当前参数推到灯光、材质、后期上
  audio/
    ambience.js        程序化环境音（雨、风、鸟鸣）与点击音效
  ui/
    hud.js             场景按键、转台、声音、快捷键
    picking.js         点击/悬停拾取
```

## 常见改动入口

- 调某个场景的光线、颜色、辉光、雨量：`src/state/modes.js`
- 加一个新物件：在 `src/world/` 对应文件里用 `box()` / `cyl()` 搭，发光部分用 `glow(material, 'sign')` 登记，就会跟着场景变亮变暗
- 让东西可以点：`pickable(object, onClick, '名称')`
- 每帧动画：`onFrame((dt, t, state) => { ... })`
- 加一个新的随机事件：在 `src/life/events.js` 写一个函数，用 `new Actor(new Figure(...))` 生成人物，
  再 `.then(walk(...), face(...), pose(...), run(...))` 串起脚本，最后登记进 `WEIGHTS` 和 `EVENTS`
