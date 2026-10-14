# Web应用

[English](README.md) | 简体中文

prod1.0，包版本1.0.0。完整介绍与安装见[仓库README](../README.zh-CN.md)，规则见[游戏规则](../docs/02-rules-and-decisions.zh-CN.md)，环境与正式发布见[部署说明](../docs/19-cloud-deployment.zh-CN.md)。

仓库文档中英双语，默认英语；应用界面、游戏流程和语音仍使用中文。

## 本目录运行

Node.js24.14.1或更新的24.x版本：

```sh
npm ci
npm run dev -- --hostname 127.0.0.1 --port 3000
```

默认本地SQLite，无需云端账号或语音模型。数据在 `.data/rooms.sqlite`，不提交。非localhost访问需准确配置WEREWOLF_ORIGIN。

```sh
npm run repo:check
npm run check
npm run build
npm run smoke
npx playwright install chromium webkit
npm run test:ui
```

smoke与默认浏览器配置启动隔离本地服务；不要带着正式PostgreSQL配置运行。本地测试不等于真实手机或线上验收。

## 模块

- `src/game/`：唯一规则、阶段、随机发牌与命令核心。
- `src/server/`：会话、权限、去重、公共/本人/房主视图、SQLite/PG保存及私有统计摘要。
- `src/narration/`：当前V7脚本、素材指纹与公开Web Audio播放器。
- `src/ui/`：真实响应式页面、私密面板、前台同步与恢复。
- `tests/`：规则、契约、权限、音频与浏览器验证。

线上必须用私有PostgreSQL配置，禁止客户端数据库凭据或SQLite回退。健康入口是 `/api/health`，业务接口是 `/api/v2`。推送候选不自动提升正式域名。
