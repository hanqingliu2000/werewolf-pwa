# 狼人杀自动主持：网页版重构基线

这是一个面向朋友线下聚会的狼人杀主持工具：每个人都能参与游戏，系统组织夜晚秘密行动、结算与胜负判断，白天讨论留在桌边。

截至 2026-10-06，旧实现已经移除并归档，新骨架、六角色规则核心、本地保存与权限接口已经通过验收。手机网页流程设计已完成，正式页面、美术语音及新云端部署尚未实现。

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
| [新应用运行说明](web/README.md) | 安装、检查、构建、健康入口与规则核心边界 |
| [参考素材说明](materials/README.md) | 材料目录、状态和完整性清单 |

下一步按 12 实现正式页面，即 09 的阶段 3。玩法以 02 为准；用户已经选择的规则与尚需实测的配比、音质、真机体验分开记录，候选板子不宣称已证明平衡。

## 归档

- 归档提交：`1416abd20e88befed14a0e8a4e66f8d19ec43e66`。
- 归档标签：`archive/pre-rewrite-2026-10-06`。
- 原实现、旧文档和锁文件均可从标签恢复；归档不代表发布或规则认可。

旧实现归档与规划文档已推送到 [GitHub 仓库](https://github.com/hanqingliu2000/werewolf-pwa)。旧云端的4张游戏表及14个函数已按随后授权备份并删除，Auth和Storage等平台结构保留，旧项目恢复原暂停状态。新代码与流程设计仅在本地开发验收，尚未提交、推送或部署，不从旧归档恢复实现。

## 本地验收

```sh
npm --prefix web ci
npm --prefix web run check
npm --prefix web run build
npm --prefix web run smoke
```

当前提供 `/api/health` 与 `/api/v2` 的房间接口，尚无可多人试玩的页面。SQLite 数据保存在被忽略的 `web/.data/`，不上传 Git，不用于云端多实例部署。
