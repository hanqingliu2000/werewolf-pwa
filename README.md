# 狼人杀自动主持：网页版重构基线

这是一个面向朋友线下聚会的狼人杀主持工具：每个人都能参与游戏，系统组织夜晚秘密行动、结算与胜负判断，白天讨论留在桌边。

截至2026-10-07，规则、网页、美术、平直播报、本机多人语音及新免费云端部署已完成。新网址为 [werewolf-web-v2.vercel.app](https://werewolf-web-v2.vercel.app)，Preview短程和正式API验收通过，详见19。真实手机和聚会现场仍待验证，音频版本为 `host-zh-v2`。

## 当前范围

- 只开发响应式网页版，手机浏览器优先。
- Android 和 iOS 用户都通过浏览器加入，不开发原生 App 或 WebView 壳。
- 首版支持 8 至 12 人与六角色，提供候选预设及受限自定义配比。
- 每人使用个人手机；仅房主的玩家手机承担公共播报，不支持额外设备或主持接管。
- 首版需要联网，重点支持刷新、短时断线和音频失败后的恢复。
- 全新暗黑奇幻美术和中文男声主持；原浏览器可恢复，不支持换设备恢复。
- 优先验证小范围熟人局，不扩展复杂社交、付费体系或远程匹配。

## 文档导航

| 文档 | 内容 |
| --- | --- |
| [00 产品愿景](docs/00-product-vision.md) | 用户、场景、价值与范围决定 |
| [01 产品需求](docs/01-product-requirements.md) | 首版必需能力、增强项与验收目标 |
| [02 规则与决策](docs/02-rules-and-decisions.md) | 已选六角色规则、胜负方式、配置与决策记录 |
| [03 对局流程与隐私](docs/03-gameplay-and-privacy.md) | 完整一局、信息边界、主持节奏与故障恢复 |
| [04 UX 与页面地图](docs/04-ux-and-screens.md) | 玩家、房主与公共视角的交互设计 |
| [05 播报与素材](docs/05-narration-and-assets.md) | 语音脚本、素材需求与保留材料的使用条件 |
| [06 网页与开发原则](docs/06-web-and-development.md) | 浏览器边界、共享规则、版本与技术选型原则 |
| [07 验证与重构路线](docs/07-validation-and-roadmap.md) | 阶段交付、质量门槛与真实对局验证 |
| [08 归档与保留记录](docs/08-archive-and-retention.md) | 存档提交、资料取舍、本地备份与恢复方式 |
| [09 分阶段开发计划](docs/09-phased-development-plan.md) | 实施顺序、交付物、验收门槛、旧数据清理与逐玩家 agent 仿真 |
| [10 骨架与规则核心验收](docs/10-foundation-and-rule-core-acceptance.md) | 本轮范围、版本、118个测试、覆盖率、HTTP验收与未完成边界 |
| [11 本地保存与权限验收](docs/11-persistence-and-permissions-acceptance.md) | 身份、持久化、恢复、169个测试和真实 HTTP 重启验收 |
| [12 手机网页流程设计](docs/12-web-flow-design.md) | 页面、私密任务、同机主持、故障恢复与组件设计 |
| [13 房间接口契约](docs/13-room-service-contract.md) | 数据分层、会话、命令、去重、权限与错误处理 |
| [14 网页设计与验收](docs/14-web-design-and-acceptance.md) | 完整页面、新美术、175项测试与两种浏览器验收 |
| [15 主持语音与播放器验收](docs/15-narration-and-playback-acceptance.md) | 新脚本、40段候选音频、播放器、197项测试与14项浏览器回归 |
| [16 平直播报更新](docs/16-neutral-narration-acceptance.md) | 已选B风格、40段V2、版本升级保护与202项测试 |
| [17 多人语音验收](docs/17-voice-game-acceptance.md) | 本机完整语音局及故障恢复，不等同真机 |
| [18 计时与死亡角色验收](docs/18-timing-and-dead-role-acceptance.md) | 15/10秒窗口、死亡角色播报与前台自动行动面板 |
| [19 云端部署](docs/19-cloud-deployment.md) | 免费资源、私有schema、维护与正式部署、预览验收和恢复 |
| [20 试玩前流程修复](docs/20-pre-play-flow-fixes.md) | 紧凑行动窗、播报回执重试、白天改选防误发布和局部回归 |
| [本地语音生成](scripts/README.md) | 锁定环境、模型版本、生成参数与声音复核 |
| [视觉规范](design-system/werewolf-web/MASTER.md) | 全站色彩、文字、控件与页面应用 |
| [新应用运行说明](web/README.md) | 安装、检查、构建、健康入口与规则核心边界 |
| [参考素材说明](materials/README.md) | 材料目录、状态和完整性清单 |

阶段6采用新的 `https://werewolf-web-v2.vercel.app`，旧站不变；用户要求暂不重跑完整局。后续阶段7线上独立agent试玩另行执行，iOS Safari、Android Chrome和聚会现场仍需验收；配比不宣称已经证明平衡。

## 归档

- 归档提交：`1416abd20e88befed14a0e8a4e66f8d19ec43e66`。
- 归档标签：`archive/pre-rewrite-2026-10-06`。
- 原实现、旧文档和锁文件均可从标签恢复；归档不代表发布或规则认可。

规则核心、保存权限和流程基线已以 `0c54cf7` 推送至 [GitHub 仓库](https://github.com/hanqingliu2000/werewolf-pwa)，网页设计另行独立保存。旧4张游戏表与14个函数已备份删除，平台结构保留，旧项目仍暂停。没有恢复旧实现或替换线上网站。

## 本地验收

```sh
npm --prefix web ci
npm --prefix web run check
npm --prefix web run build
npm --prefix web run smoke
npm --prefix web run test:ui
```

`npm --prefix web run dev -- --hostname 127.0.0.1 --port 3000` 启动完整网页。默认文字主持，大厅内可真实试音后启用语音。SQLite 保存在被忽略的 `web/.data/`，不上传 Git，也不用于云端多实例部署。
