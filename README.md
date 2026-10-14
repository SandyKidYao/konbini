# Konbini

希望这家小便利店，能治愈你一天的疲惫。

**[在线体验 →](https://sandykidyao.github.io/konbini/)**

![黄昏时的ひかりマート](docs/images/hero.jpg)

## 特点

- **时间与天气**：随意拖动时刻，切换晴、雨、雪、雾等八种天气；也可以打开「实况」，跟随你所在地此刻的天气
- **四季与节日**：春天樱花开，秋天叶子红；过年摆门松，圣诞节放圣诞树
- **街上的生活**：顾客进进出出，车来车往，送货车按时补货，后院长椅上睡着一只猫

| | |
|---|---|
| ![春天，樱花开了](docs/images/spring-bloom.jpg) | ![夏日祭的傍晚](docs/images/summer-festival.jpg) |
| ![雨夜](docs/images/rain-night.jpg) | ![雪夜](docs/images/snow-night.jpg) |

## 本地运行

```bash
npm install
npm run dev     # 打开 http://localhost:5173
npm run pet     # 桌宠（macOS）
```

想给场景加点东西？参见 [模组扩展](docs/MODDING.md)。

## 隐私

不会收集或记录你的位置等个人信息。打开「实况」后，大致位置只会用于查询当地天气，结果只缓存在你自己的浏览器里。

## 致谢

- 感谢 [Susu 的视频](https://x.com/NFT_Chen/status/2109034305968336929) 提供的灵感
- 天气数据来自 [Open-Meteo](https://open-meteo.com)，地名来自 [BigDataCloud](https://www.bigdatacloud.com)
- 使用 [Three.js](https://threejs.org) 构建

## 许可

[MIT](LICENSE)
