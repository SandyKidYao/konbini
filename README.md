# ひかりマート · 桜坂二丁目店

一个放在桌上的 1:150 街角便利店场景模型，用 Three.js + TypeScript 搭建。时间和天气可以分别调整，也可以打开「实况」，跟随你所在地此刻的真实时间和天气。场景还跟着日期走：樱花春开秋红、冬天贩卖机换热饮、过节门口摆上门松或圣诞树、夏日祭的傍晚有人穿浴衣散步。街上有顾客、游客、店员、路人和出租车在活动。整个场景由一个个「模组」拼成，内容可以按模组扩展。

`Demo/` 是早期原型，仅作参照，不再维护。

## 运行

```bash
npm install
npm run dev        # 开发：http://localhost:5173 ，改代码即时刷新
npm run build      # 类型检查 + 打包成单个 dist/index.html（可双击打开）
npm run preview    # 用本地服务器预览打包结果（加载外部模组需要用这种方式）
npm run shots      # 用本机 Chrome 无头截图一组场景到 tmp/shots/，页面报错时失败（先 build）
```

## 操作

- 拖动旋转、滚轮缩放、右键平移；松手 6 秒后转台会继续慢慢转
- 下方一排天气图标切换天气（悬停显示名字）：晴、少云、阴、雾、小雨、雨、雷雨、雪
- 拖动太阳改变时刻，点时刻标签（清晨 / 正午 / 傍晚 / 深夜）会动画过去
- 「实况」：定位你所在的地方，跟随当地的真实时间、日出日落和天气（每 10 分钟更新）。手动改时间或天气会退出实况
- 拖动太阳改变时刻（指着时间条会显示具体时间）
- 点下方的日期按钮（或标签卡上的「日期」）打开日历：一键跳到春夏秋冬或某个节日，也可以翻月份选任意一天；「回到今天」恢复。日期按钮上的橙点表示现在看的不是今天
- 标签卡上的「日期」是当前日期（实况时是那个地方的日期），后面的小标签是季节或正在进行的节日
- 快捷键：`1`–`8` 天气，`L` 实况，`R` 转台，`M` 声音，`[` `]` 前后翻一天（加 Shift 一周）
- 点击小猫、便利店、后门、自动贩卖机、出租车、路上的人都会有小反馈

网址参数：

| 参数 | 例子 | 作用 |
|---|---|---|
| `weather` | `?weather=snow` | 初始天气：`clear` `partly` `cloudy` `fog` `drizzle` `rain` `storm` `snow` |
| `time` | `?time=1750` | 初始时刻（时分） |
| `date` | `?date=2026-07-07`、`?date=12-24` | 指定日期（不写年份就是今年） |
| `season` | `?season=autumn` | 跳到这个季节里的一个典型日子：`spring` `summer` `autumn` `winter` |
| `live` | `?live=1`、`?live=0` | 打开 / 关闭实况（上次打开过会自动恢复） |
| `place` | `?place=35.68,139.69,東京` | 实况用指定地点，而不是定位 |
| `site` | `?site=konbini` | 选择主体 |
| `mods` | `?mods=mods/chochin.js,mods/furin.js` | 加载外部模组（逗号分隔，默认只允许同源相对路径） |
| `disable` | `?disable=konbini.events.taxi` | 关掉某些模组 |
| `cam` | `?cam=14,9,16,1.5,0.6,-1` | 初始视角 `x,y,z,目标x,目标y,目标z` |
| `warp` | `?warp=60` | 先快进 60 秒的街景再显示 |

## 实况天气

- 位置：先用浏览器定位（会请求权限）；拒绝或失败时用 IP 估计（只有当它的时区和本机一致才采用，避免被代理误导）；再不行就按本机时区选一个城市
- 天气：[Open-Meteo](https://open-meteo.com)（免费、无需密钥），WMO 天气代码决定天气类型，云量、降水、降雪、风速、能见度细化成连续的天气参数
- 地名：BigDataCloud 的反向地理编码
- 上次的结果缓存在浏览器里，下次打开先显示缓存，再后台刷新
- 浏览器定位需要安全上下文（`localhost` 或 https）。直接双击打开打包后的文件时会退回到 IP / 时区估计

## 结构

```
src/
  engine/              与内容无关的运行时
    app.ts             启动、按依赖顺序加载模组、主循环
    mod.ts             模组定义、上下文（ModContext）、依赖排序、外部加载
    atmosphere.ts      时间 × 天气 → 驱动量（日照、云、雨、雪、雾、风、雷、湿度、积雪）与整体观感；今天的日期
    calendar.ts        日期 → 季节、星期、日本节假日、节日、日出日落
    states.ts          随日期、时间、天气切换的离散状态（ctx.states）
    live/              实况：定位、Open-Meteo 天气、定时同步与缓存
    surfaces.ts        地面高度、屋顶、遮雨区域
    nav.ts             步行网络：节点、带宽度/闸门/开门钩子的边、寻路
    agents/            Actor 与脚本步骤、事件调度（Director）
    prefabs.ts         素材库注册表
    services.ts        模组间按名字互相提供服务；消息总线
    glow.ts            自发光材质跟随通道（招牌、店内、窗户、路灯…）
    interact.ts audio.ts stage.ts
    kit/               建模工具、canvas 贴图、随机数
  fx/                  渲染层：全局光、背景、反射、雨、雪与积雪、闪电、湿地面、后期
  content/             所有内容都是模组
    library/           素材库（layer: library）：人偶、柴犬、汽车、贩卖机、自行车、旗、空调外机、锥桶
    world/             世界环境（layer: world）：底座、道路、街道设施与信号灯、邻里建筑、樱花与云
    site/konbini/      主体（layer: site）：店铺、门前场地、员工后院、旗位、节日装饰
    events/            事件（layer: events）：收银员、顾客、店员休息、摆收旗、路人、游客、出租车
    common/            内置内容共用的色板、贴图、材质
  ui/                  界面
public/mods/           外部模组示例（chochin.js：店门口的一串提灯；furin.js：只在夏天挂出来的风铃）
scripts/shots.mjs      无头截图检查（npm run shots）
```

加载顺序：`library → world → site → events → extra`，同层内按 `requires` 排序；缺依赖或出错的模组会被跳过并显示在右上角的「模组」列表里，不影响其他内容。

扩展方式见 [docs/MODDING.md](docs/MODDING.md)。
