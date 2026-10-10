# 网页与房间服务

已完成规则、SQLite及异步PostgreSQL适配、原浏览器会话、权限、网页与公共播放器。取消逐人身份确认的版本已正式发布，音频为 `host-zh-v3`；本机验收见 [23](../docs/23-identity-viewing-without-confirmation.md)，正式发布与短程浏览器验收见 [24](../docs/24-identity-flow-production-release.md)。此前V2整局验收见 [22](../docs/22-production-voice-game-acceptance.md)，真实手机仍未验收。

## 安装与验收

在本目录使用 Node.js 24.14.1 运行：

```sh
npm ci
npm run check
npm run build
npm run smoke
npx playwright install chromium webkit
npm run test:ui
```

`check` 包含类型、代码检查、规则、保存权限及 HTTP 防护测试和覆盖率门槛。`smoke` 在空闲端口使用隔离数据库，检查独立会话、并发加入、角色过滤与真正服务重启恢复；结束后关闭服务器并删除测试数据，不接触云端。

## 本地运行

```sh
npm run dev -- --hostname 127.0.0.1 --port 3000
```

根路径为创建或加入，房间位于 `/r/房间号`，复盘为 `/r/房间号/recap/对局编号`。健康状态在 `/api/health`，游戏服务在 `/api/v2`；契约见 [13](../docs/13-room-service-contract.md)。端口占用时另选空闲端口。

默认文件为 `.data/rooms.sqlite`，目录不进入 Git。可用 `WEREWOLF_DB_PATH` 指定本地文件；非 localhost 请求必须配置准确的 `WEREWOLF_ORIGIN`。不要公开部署 SQLite 版本，也不要把数据文件加入生产资源追踪。

## 核心边界

- `src/game/` 保存类型、配置校验、随机发牌、XState 阶段流转、规则结算和命令处理。
- `executeCommand` 返回新状态，不修改传入快照；非法操作不改变原状态或消耗资源。时间由调用者提供，随机发牌默认使用 Node.js 密码学随机源。
- 常规命令确认后锁定；狼人的共同最终确认才锁定，提议变化使此前确认失效。
- HTTP 不接受 `actorId`；服务层从会话匹配当前房间成员，再注入核心命令。公开、本人、房主和复盘视图彼此分离。
- 条件更新与回执在同一SQLite或PostgreSQL事务提交，内部写版本不作为公开进度。新对局、公开窗口、狼队提议和白天草案都检查过期上下文。
- 房主心跳和服务端截止时间控制暂停及恢复；文字手动确认和语音 ended 都走受上下文校验的公开指令协议。播完开眼序列才开计时，公开公告未完不能开始下一步。
- 浏览器不持有云端凭据；线上仅服务端使用对应环境的最小权限数据库账号。不提供客户端注入角色、随机种子或完整权威状态的入口。
- 网页默认文字主持，点击语音即可准备并启用，试音可选。刷新、后台与播放失败不自动恢复；可明确切回文字，保留未完成公告。没有原生App或复用旧声音。

当前253项测试覆盖规则、保存、权限、播报、播放器及云端配置；本地PG测试通过真实pg驱动与隔离PGlite引擎，线上另验证实际TLS、角色隔离和短程网页流程。本次身份流程与两种浏览器验收见23，此前正式V2完整局见22。截图和报告在 `test-results/`，不进入Git。

## 云端运行

设置 `WEREWOLF_STORAGE=postgres`、`WEREWOLF_SCHEMA`、`WEREWOLF_DATABASE_URL`、`WEREWOLF_DATABASE_CA`；Production另配置准确的 `WEREWOLF_ORIGIN`。Vercel缺少PostgreSQL配置会失败，不回退SQLite。URL及证书必须使用Secret，不能是NEXT_PUBLIC_变量。

`WEREWOLF_MAINTENANCE=1` 关闭入席及游戏API，健康接口返回503 maintenance。正式部署通过预览和就绪检查后手动提升。两份私有schema迁移位于仓库 `supabase/migrations/`，过期任务每五分钟运行。

`playwright.cloud.config.ts` 仅运行新项目的短程部署检查，需指定 `CLOUD_SMOKE_URL`；受保护Preview另提供0600的 `CLOUD_SMOKE_AUTH` 文件。它会创建自己的Cloud QA房间，检查首个行动后中止，不完成整局；使用 `scripts/cleanup-cloud-smoke.mjs` 按生成报告仅清理该次房间。秘密、私密截图和认证文件不能提交。
