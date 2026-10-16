# AGENT.md

给在这个仓库里工作的 AI 助手和开发者看的说明：项目怎么搭的、写代码时守哪些规矩、怎么验证、怎么提交和发布。面向用户的介绍在 [README.md](README.md)，模组接口的完整说明在 [docs/MODDING.md](docs/MODDING.md)。

## 这是什么

一个放在桌边的街角便利店场景模型（ひかりマート · 桜坂二丁目店），Three.js + TypeScript，浏览器里运行。时间、天气、日期会改变场景，街上的人和车按脚本生活。另有一个 Electron 桌宠外壳（macOS，试验中）。

产品的基调是「治愈」：画面安静、不打扰，界面平时隐藏，模型就是整个页面。新增内容和界面时请守住这个基调。

## 常用命令

```bash
npm install
npm run dev          # 开发服务器 http://localhost:5173
npm run build        # 类型检查 + 打包成单个 dist/index.html（双击可开）
npm run typecheck    # 只做类型检查
npm run shots        # 无头 Chrome 截图一组场景到 tmp/shots/，页面报错即失败（先 build）
npm run shots -- door winter   # 只截名字含这些词的场景
npm run site         # 打包 Pages 站点到 _site/（首页 + app/）
npm run site:preview # 本地预览 _site/
npm run pet          # 打包后打开桌宠；pet:dev 让桌宠加载开发服务器
npm run pet:pack     # 把桌宠打包成 release/Konbini-<版本>-arm64.dmg
npm run icons        # 由 assets/ 里的 SVG 生成桌面版图标和菜单栏图标到 desktop/（需要 macOS）
```

调试常用网址参数：`?weather=snow&time=2200`、`?date=12-24`、`?season=summer`、`?view=facade`、`?warp=60`、`?live=1&place=35.68,139.69,東京`、`?mods=mods/furin.js`、`?pet=1`。完整列表见 `src/main.ts` 开头的注释。

需要 Node.js 20.19+（Vite 7）。从 VS Code 扩展里开的终端可能带着 `ELECTRON_RUN_AS_NODE=1`，跑桌宠前先 `unset ELECTRON_RUN_AS_NODE`。

## 目录

```
src/
  engine/     与内容无关的运行时：模组加载、时间天气、日历、状态、步行网络、角色与车辆、服务总线、拾取、音效、俯视图的平面登记（plan.ts）
  fx/         渲染层：光照、反射、雨雪、积雪、闪电、湿地面、后期（AO、辉光、移轴、调色）
  content/    所有内容，全部是模组
    library/    素材库（人偶、车、贩卖机…）
    world/      世界：底座、道路与交通规则、邻里、自然
    site/konbini/  主体：店铺、门前、后院；api.ts 是它对事件提供的约定
    events/     事件：顾客、店员、路人、车流、停车、送货
    common/     内置内容共用的色板、贴图、材质
  ui/         界面：hud.ts 设置按钮与托盘、views.ts 视角预设、map.ts 俯视图、date-picker.ts、tips.ts 悬停提示、pet.ts 桌宠模式
  main.ts     入口：读网址参数、建 App、接界面
desktop/      Electron 桌宠外壳（main.js 窗口与菜单，preload.cjs 页面与外壳的接口，图标由 npm run icons 生成）
public/mods/  外部模组示例（运行时加载）
site/         GitHub Pages 首页（静态页，iframe 嵌入 app/）
assets/       图标源文件：icon.svg（网页 favicon 直接用它，桌面版图标由它生成）、tray.svg（菜单栏图标，线框）
scripts/shots.mjs  无头截图检查
docs/         MODDING.md 与 README 用图
tmp/          本地草稿：截图、开发记录 PROGRESS.md（不入库）
```

## 架构

### 一切都是模组

- 引擎（`engine/`、`fx/`）不认识任何具体内容，**永远不 import `content/`**。内容通过 `defineMod({ id, layer, requires, site?, setup(ctx) })` 接入
- 加载顺序按层：`library → world → site → events → extra`，同层按 `requires` 排序。缺依赖或 `setup` 抛错的模组被跳过、在模组面板标红，其余照常运行。新代码也要保持这种失败隔离：一个模组坏了，不能拖垮整个场景
- 内置模组和外部模组用同一套接口。外部模组是不 import 任何东西的 `.js`，所有能力（`THREE`、`kit`、`steps`…）从 `ctx` 拿。给内置模组加能力时，优先放进 `ctx`，这样外部模组也能用
- 新的内置模组要加进 `src/content/index.ts` 的 `builtinMods`

### 模组之间怎么协作

- 用 `ctx.services.provide/get` 按名字提供和获取能力，用 `ctx.bus` 发松散消息。**模组之间不互相 import 实现**；只允许 `import type` 拿类型（例如 `events/` 引用 `world/roads.ts` 的 `RoadService` 类型）
- 主体（site）通过约定接入：便利店的约定写在 `site/konbini/api.ts`（`shop`、`shop.parking`、节点名…）。事件只依赖约定，所以换一个主体（拉面店、书店）时事件可以复用。往约定里加东西要同时更新 `api.ts` 和 MODDING.md
- 位置从服务里取，不要写死坐标（例如外部模组挂提灯用 `shop.awning`）

### 时间、天气、日期、状态

- `Atmosphere` 把「时刻 × 天气参数」算成连续的驱动量 `drivers`（daylight、rain、snow、fog、wind、wet、snowCover…），内容每帧读它
- `calendar.ts` 给出 `day`：季节（南半球翻转）、星期、日本节假日、节日。店在日本，所以节假日按日本日历
- 连续变化（亮度、强度）用发光通道 `ctx.glow` 和 `onFrame`；离散的「该显示哪个版本」用 `ctx.states.track / show`。会出现的东西在 `setup` 里就建好，交给 `show` 隐藏，这样积雪遮挡才算得对
- 实况（`engine/live/`）只在用户打开时联网，换数据源实现 `WeatherProvider` 即可

### 角色与车辆

- 行人是 `Actor` 加脚本步骤（`go` `walk` `wait` `pose`…），在 `nav` 步行网络上寻路；事件由 `Director` 按 `weight` 调度
- 车辆是 `Vehicle` 加路径与 `drive` 步骤，自带闸门（红灯、让行、人行横道、踏切）、跟车、让人。车堵死（互相等成一圈）超过 40 秒会挤过去；排在红灯或闸门后面再久都不算堵死
- 铁路（`world/railway.ts`）：电车两头钻进模型边上的短隧道，在隧道里被切掉，外面看不到截面；踏切由 `world.railway` 服务告诉车和人什么时候不能过。海边公路、沙滩和海在 `world/coast.ts`、`streets.ts`
- 店右边的车位直接开向 B 路：车从 A 路左转进 B 路再拐进车位，倒车回到 B 路；同一时间只有一辆车在车位前进出，倒车时两头的车停下等。行人走店前的铺地和侧窗前的人行带。店后的后巷是送货卡车的路，里面不要放东西

### 俯视图

- 两种形态：模型（3D）和俯视图（`?view=plan`，托盘视角一行最后的按钮，或按 P）。`App.form` 为 `plan` 时整帧只做模拟，不渲染 3D；`ui/map.ts` 在 2D 画布上画 `app.plan`
- 图上的内容由模组在造模型时用 `ctx.plan` 一起登记（`add` 形状、`marker` 小灯、`movers` 会动的东西），地图本身不认识任何具体内容。新增看得见的东西（建筑、树、路面）时，顺手登记它的平面形状
- 地图是像素风：画布约 50 像素宽（每米不到一个像素），按整数倍放大、不做平滑。车和人画得比实际大（人 2×2 像素），各用一种颜色（车：白天深蓝、夜里白；人：白天覆盆子红、夜里粉），店里的顾客透过屋顶也画出来，为的是很小的一块图也能看出店里店外在发生什么。形状对齐整像素，圆和转弯的车逐像素画，柔光用抖动。不要在上面用渐变、模糊或抗锯齿的路径
- 地图的静态层（地面、屋顶、影子、路灯光圈）只在光线变化时重画，每帧只画会动的东西和天气
- 桌宠的俯视图形态：窗口固定为 380×540，地图按「大小」（120 / 160 / 220 px）画在窗口底部，上面留出设置托盘的位置；透明的地方点击穿透。形态记在 `pet.json` 的 `form`

### 渲染与性能

- 一帧的开销分两头：CPU 是 three.js 逐个网格的开销（场景每被渲染一遍就付一次），GPU 是像素数 × 灯光数。在 Retina 屏上，GPU 才是瓶颈（M2 上全分辨率约 35 帧，像素比 1.25 约 60 帧），所以 `App.adaptQuality` 会按帧率动态调整像素比
- **场景每帧只完整渲染一次**：阴影图手动更新（`shadowMap.autoUpdate = false`，`Fx.render` 每帧置一次 `needsUpdate`），世界矩阵也只更新一次（`scene.matrixWorldAutoUpdate = false`）。GTAO 读主通道的深度，不再自己重画法线。新增任何「再渲染一遍场景」的东西（反射、捕捉）都要算进这笔账
- 静态网格在加载后自动按材质合并（`engine/batch.ts`）：原网格移到第 31 层不再绘制，引擎每帧检查，动了的自动退出合并。细节见 MODDING.md「静态合并」
- 后期只有场景渲染用 4×MSAA，后面的全屏通道都用普通缓冲；GTAO 用半分辨率
- 改像素比或画布尺寸只能在渲染之前做（`App` 里 `resizePending`）：改尺寸会清空画布，没重画就被浏览器合成出去，整页会白一下。每次改尺寸都要重新分配渲染目标，会卡一下，所以动态分辨率升档失败后的重试间隔会逐次加倍
- 运行中才第一次出场的材质组合会现编着色器（卡几十毫秒）：用 `ctx.fx.warm` 在加载时预热（车辆已经这样做）。不能用 `renderer.compileAsync` 代替，它算出的裁剪平面数量不对，编出来的程序用不上
- `fx/lights.ts` 给 three 的光照片段打了补丁：灯照不到的像素（灯关着、在光锥或范围外）跳过 BRDF。灯多一点的代价因此主要落在被照亮的区域
- **场景里的灯光数量不能变**（会触发着色器重新编译）：车灯用固定数量的灯池
- 短命的东西（路人、车辆）用完要 `dispose`，几何体数量应该随时间保持稳定
- 会动的物体设 `userData.skyIgnore = true`，不想积雪的设 `userData.noSnow = true`
- 尊重「减少动态效果」：状态切换此时一律立即完成

### 界面

- 模型就是页面。界面平时隐藏，指针移动时浮出，几秒后淡出
- 界面上不放文字，用图标；每个按钮必须有 `aria-label`（中文），读屏念它，指针停在按钮上时也作为提示显示出来（`tips.ts`）；有快捷键的再加 `aria-keyshortcuts`，提示里会一起显示
- 网页和桌宠用同一套设置面板（视角、天气、时刻、日期、实况、转台、声音、模组），右上角有关闭按钮。网页从底部的设置按钮打开，桌宠双击打开。窗口太矮时，从托盘打开的日历和模组卡片会盖在托盘上（卡片底部有「返回」），再放不下就滚动
- 主题跟随日照：`body[data-theme]` 在 `light` / `dark` 之间切换。Pages 首页靠这个属性同步文字颜色，不要改名或去掉

### 打包与首页

- `vite-plugin-singlefile` 把所有东西内联成一个 `index.html`，`base: './'`，从 `file://` 双击打开也要能用（此时实况退回到 IP 和时区估计）
- Pages 站点：`npm run site` 把应用打包到 `_site/app/`，再把 `site/` 的静态首页复制过去。首页用同源 iframe 嵌入 `app/`，读取 iframe 里的 `data-theme` 来跟随昼夜
- 图标只有一个源文件 `assets/icon.svg`：应用的 favicon 在打包时内联（`vite.config.ts` 的 `inlineIcon`），首页由 `npm run site` 复制过去；改了它要重跑 `npm run icons` 并提交新生成的 `desktop/` 图标
- 桌宠用 `?pet=1`：透明背景、低功耗。视角、缩放和网页一致，只有「全景」例外：桌宠里它从同一个方向退远到整个模型（连云）都落在渐隐带以内，桌宠一打开就是完整的模型（`views.ts` 的 `viewPose`）。模型超出窗口的地方不会被直线切断，而是在靠近窗口边缘的一圈里渐隐到桌面上（`style.css` 里画布的 CSS 遮罩，宽度是窗口短边的 9%，和 `views.ts` 的 `PET_FADE` 保持一致；四边都有，但模型够不到的边本来就是空的，所以只在被切的一侧看得见）。渐隐到几乎透明的部分不接收点击（`pet.ts` 的 `edgeAlpha`，和遮罩保持一致）。桌面上只有模型（或俯视图），没有设置按钮：双击模型或俯视图打开和网页相同的设置面板，用面板上的关闭按钮或 Esc 收起。面板在模型形态下从窗口顶部垂下，在俯视图形态下开在小图上方（看不见的设置按钮仍留在 DOM 里，作为面板展开的锚点，见 `pet.ts`）。⌥ 拖动模型、或直接拖动俯视图可以移动窗口：能拖的地方光标是张开的手（模型上要按住 ⌥），拖动时握拳；原生菜单第一行是这两个操作的说明（桌面上不放文字，忘了的人会先去菜单找）。桌宠里的面板只用很小的投影：大投影会被窗口边缘截断；原生菜单只管窗口本身（大小、置顶、图标、省电、退出）和「设置…」。外壳和页面之间只通过 `preload.cjs` 暴露的 `window.konbiniDesktop` 通信，页面在没有外壳时也必须正常运行
- 桌宠默认只在菜单栏放一个线框图标（`tray.svg`，模板图，系统按菜单栏深浅着色），不进程序坞；两者都可以在菜单「显示图标」里切换，记在 `pet.json`，至少保留一个

## 开发原则

- **小而完整**：一次改动只做一件事，做完、验证完再做下一件
- **先读后写**：改之前先看相关模组、`api.ts` 和 MODDING.md 里的约定，新代码要像周围的代码
- **注释写「为什么」**：代码注释用英文，简短、具体，说清楚意图和约束（参考现有文件开头的注释）。不写复述代码的注释
- **类型严格**：`strict` 打开，`npm run build` 必须零错误；不要用 `any` 绕过，跨模组用 `import type`
- **确定性**：布局用 `ctx.mod.random`（按模组 id 播种），每次打开看到的街景一致
- **依赖克制**：只有 `three` 一个运行时依赖，版本精确锁定（不用 `^`）。加依赖前先想想能不能用 `kit` 做到，单文件打包的体积也要考虑
- **隐私**：不加任何统计和追踪。应用只会访问 Open-Meteo（天气）、BigDataCloud（地名）、geojs（IP 定位），并且只在打开实况时访问；字体来自 jsdelivr。定位结果只缓存在用户自己的浏览器里。新增外部请求要在 README 的隐私一节说明
- **外部模组的安全**：默认只加载同源相对路径；远程地址必须显式加 `&allowRemoteMods`，不要放宽这个默认值
- **语言**：README、MODDING.md、界面文字（`aria-label`）、提交给用户看的文档都用中文；代码、注释、提交信息用英文
- **文档同步**：改了模组接口或 `ctx` 要更新 MODDING.md；改了用户能感知的功能，看看 README 是否需要更新。README 保持简洁，技术细节放 MODDING.md

## 验证

提交前至少：

1. `npm run build` 通过（类型检查 + 打包）
2. `npm run shots` 全部通过，并**亲眼看一遍相关截图**：脚本只能发现报错，发现不了画面问题
3. 改了界面：浅色和深色主题、窄屏（截图里有 `narrow`、`ui-picker-narrow`）都要看
4. 加了用户看得见的新内容：在 `scripts/shots.mjs` 里加一个截图场景
5. 改了交通、行人或停车：用 `?warp=` 快进，模拟多个时段（早高峰、雨天傍晚、深夜、节日），检查车辆有没有重叠、卡死，行人有没有穿过车位
6. 改了 `site/` 或打包配置：`npm run site && npm run site:preview` 看一遍首页

`tmp/` 不入库，截图和开发记录（`tmp/PROGRESS.md`，含待办清单）都放在这里。

## 提交

- 主分支是 `main`。小改动直接提交在 `main`；较大的功能（例如交通系统、桌宠）开分支，做完合并回 `main`
- 提交信息用英文，一行标题写清楚改了什么、对用户意味着什么，形式是「范围: 说明」或一句完整的话，例如：
  - `Tilt-shift: raise the focus band so the shop sits in it again`
  - `Living traffic and a shop front where people and cars each have their own way`
- 不用 `feat:` / `fix:` 这类前缀。需要时在正文里补充原因
- 由 AI 助手完成的提交，在末尾加 `Co-Authored-By` 署名
- 提交前看一眼 `git status`，不要把 `dist/`、`_site/`、`tmp/`、截图、`.env` 之类提交进去（`.gitignore` 已覆盖）

## 发布

发布一个 Release，网页和桌面版就一起发出去：

```bash
# 先把 package.json 的 version 改成新版本并提交、推送到 main
gh release create v0.4.0 --target main --generate-notes
gh run list --limit 4    # Pages 与 Desktop 两个 workflow 都应成功
```

- **版本号**：以 Release 的 tag 为准（`v0.4.0` → 0.4.0），桌面版打包时由 CI 写进 App。`package.json` 的 version 在发版前改成同一个，保持仓库与发布一致
- **网页**：`.github/workflows/pages.yml` 在 Release 发布时执行 `npm run site`，发布到 https://sandykidyao.github.io/konbini/ 。推送到 `main` 不再更新线上；需要时可在 Actions 里手动运行。发布后打开线上地址看一眼。仓库的 `github-pages` 环境只允许 `main` 和 `v*` tag 部署，tag 换了命名方式要同步改这条规则
- **桌宠**：`.github/workflows/desktop.yml` 在 macOS（Apple 芯片）上执行 `npm run pet:pack`，把 `Konbini-<版本>-arm64.dmg` 上传到这个 Release；手动运行时填 tag 可重新打包已有的 Release。本地打包同样用 `npm run pet:pack`，产物在 `release/`
- 打包配置在 `electron-builder.yml`：只装 `desktop/` 的外壳文件和 `dist/`（页面是单文件，不带 `node_modules`）。`LSUIElement` 让 App 启动时不进程序坞，「显示图标」里的偏好仍可把它请回来
- 还没有 Developer ID：App 只做了 ad-hoc 签名、没有公证，首次打开要在「隐私与安全性」里点「仍要打开」（README 有说明）。以后接入签名时，把证书放进 Secrets，并去掉 `identity: "-"` 与 `hardenedRuntime: false`
- 只打 Apple 芯片版本；Intel 和自动更新都还没做

## 仓库

- GitHub：https://github.com/SandyKidYao/konbini ，公开，MIT 协议
- 灵感来源与致谢见 README
