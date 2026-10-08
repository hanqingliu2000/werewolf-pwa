# 19 云端部署与验收

更新：2026-10-07。本轮不运行新的完整对局或阶段7 agent 试玩。旧网站、旧云端项目和私人备份保持不动。

## 已建立资源

| 项目 | 当前值 |
| --- | --- |
| GitHub 保存点 | `25c3521`，语音、计时、前台行动弹窗及自动提交推送约定已推送 |
| Supabase | `werewolf-web-v2`，`knkrwuquthqblnkoxdtn`，`us-east-1`，PostgreSQL17.11，ACTIVE_HEALTHY |
| Supabase 所属范围 | `barryliu's projects` 的现有 Vercel 集成；明确选择 `free`，官方返回 $0/月、无需付款方式 |
| Vercel | `werewolf-web-v2`，`prj_pw1MiSa05HR43JzYQxcbQNW03UDh`，当前团队 Hobby、无试用，Node24、iad1 |
| 新网址 | https://werewolf-web-v2.vercel.app |
| 首个维护部署 | `dpl_8jECqGSknUBtxxGPoGrjmMgis1rg`，READY；页面200，健康接口503并返回 maintenance，未开放游戏 |
| 已验收正式部署 | `dpl_G1p85AuVqbEut4t2VxRdqt1wSYH9`，先 --skip-domain 候选检查，通过后手动提升；新网址已开放，健康200 |
| 云端代码保存点 | `940f169` 已推送；后续操作脚本修正、真实PG回归及最终记录另行提交，不自动改变已验收部署 |

Supabase 成本工具不可用，改用官方 Vercel 集成计划及创建结果核验，不假造成本确认编号。未启用 Pro、Team、付费组件或升级。免费项目允许闲置暂停，不发送保活请求。

## 保存与权限

- TypeScript 规则核心保持不变。RoomStore 支持异步适配，服务和 HTTP 完整等待读写；SQLite 仍用于本地，Vercel 缺失 PostgreSQL 配置时拒绝运行，不回退本地文件。
- 新项目有 `werewolf_preview`、`werewolf_prod` 两个私有 schema，各有 rooms、receipts、limits。版本条件写入与回执同事务，限流原子计数；不新增 SQL 角色结算。
- 两个应用账号分别为 `werewolf_preview_app`、`werewolf_prod_app`，只有对应 schema 权限，没有 BYPASSRLS 或管理角色权限；随机独立凭据仅在受限本地配置中保存，不进入 Git、命令行或公开日志。
- 云端查询确认 anon、authenticated、service_role 都没有这两个 schema 的 USAGE，两个应用账号也不能访问对方 schema；安全 advisor 没有发现事项。
- 每个环境一个 `*/5 * * * *` 的启用清理任务，删除过期房间和限流，裁剪嵌入档案并增加 CAS 版本；回执按外键删除。访问仍执行24小时有效期，不因轮询或心跳续期。
- 两份迁移的文件版本与云端工具实际生成的记录对齐。自动审查拒绝直接改写迁移历史表，故只调整本地文件名，未改云端历史表。

## 运行配置与发布门槛

需要 `WEREWOLF_STORAGE=postgres`、对应 `WEREWOLF_SCHEMA`、`WEREWOLF_DATABASE_URL`、`WEREWOLF_DATABASE_CA`；Production 另指定 `WEREWOLF_ORIGIN=https://werewolf-web-v2.vercel.app`。Preview 使用 Vercel 可信部署域名，同源校验不接受任意请求域名。

数据库 URL 使用实际 Connect 面板确认的 `aws-0-us-east-1.pooler.supabase.com`、6543端口、对应最小权限用户名。SSL面板下载官方 `prod-ca-2021.crt`，真实连接验证服务器，未降低 rejectUnauthorized。URL和证书已在两环境保存为 type=sensitive、visibility=secret，不能是 NEXT_PUBLIC_ 变量。

自动审查拒绝将管理员凭据配置成普通 Development 变量，本轮没有执行该连接。替代方案只生成最小权限应用凭据，不让网页持有管理员凭据。`web/scripts/configure-cloud.mjs` 已验证两账号连接、TLS和跨环境隔离，通过0600临时JSON文件和官方环境API分别写入新项目 Secret，文件用后移除。CLI Preview 提示和批量JSON问题改用已验证的单变量JSON请求格式，没有改用普通变量或命令行秘密。

新项目已连接既有GitHub仓库并关闭自动生产域名分配，Git推送不自动提升到正式网址。已完成真实云端pg连接、预览冒烟、资源校验和正式候选就绪检查，手动提升指定部署。首个维护部署仍可作为回退目标；回退不删除数据库，也不操作旧站。

## 本机验证

- `npm run check`：17个文件、235项通过，覆盖语句97.4%、分支94.74%、函数96.96%、行98.91%。类型检查与 lint 通过。
- PostgreSQL测试使用 PGlite18 的真实SQL引擎与 TCP 协议、真实 pg 驱动，而不是模拟SQL结果；覆盖SQLite/PG共同契约、两连接抢末席、两服务共同确认、回执回滚、限流、RLS及环境隔离。这不是 Supabase PostgreSQL17 的线上并发验收。
- `npm run build` 通过。修复了 Turbopack 不接受越出项目根目录的排除路径，并使用 tracing ignore 避免动态SQLite路径追踪整个项目；上传包排除数据库、日志、环境文件及私人备份。
- 云端6张业务表、权限、两项清理任务和安全advisor已核验。两个清理任务各至少5次成功运行；性能advisor只有两项新库尚未使用的回执外键索引INFO，保留索引用于后续级联清理，不声称已经经过压力测试。
- 两个实际应用账号的TLS、schema读写权限和互斥访问已通过。Preview `dpl_EvgxVw7KH7AJx3P4VqHRTtG9JHLo` 健康接口200；保留默认预览保护，使用官方CLI为该新项目生成的私有测试认证，不公开令牌。
- Chromium Preview短程用例通过，约47秒：8个独立会话入席、准备及刷新、非房主拒绝、错误Origin拒绝、Secure/HttpOnly/Strict Cookie、no-store、真实试听、40段资源完整加载解码、真实播报完成才开启30秒守卫窗口、自动弹出私密面板及提交。随后明确中止，没有运行完整对局。只删除了该用例报告中的1个 Cloud QA 房间。
- 真实Supabase PostgreSQL17的契约复测8项通过、3项明确跳过。包含独立连接末席竞争、狼人同时确认、事务回滚、去重及档案裁剪；跨环境/RLS由实际账号连接及云端权限查询另验。跳过需要管理员改表或模拟未来整体清理的用例，避免影响他人数据；这些分支仍在本机隔离PG测试中执行。结束仅删除这次创建的房间ID。
- 正式候选及提升后的公开域名API冒烟都通过：数据库、首页、40段MP3字节/文本/SHA256、3个独立会话、Secure/HttpOnly/Strict、no-store、非房主和外部会话拒绝、Origin拒绝和持久回执去重。公开域名检查不使用保护绕过。候选与正式测试的QA大厅均按各自报告清理。
- 冒烟脚本最初把JSON字符串顺序当作回执相等，JSONB字段重排导致误判；改用结构化深比较后通过，未修改服务器去重行为。本机有一次整套检查未通过，随后数据库单文件11项及整套235项重复通过；未降低门槛或删除断言，不将未完整保存的那次日志归因成某个已修复问题。
- 本地服务恢复在 `http://127.0.0.1:3000`，健康200。正式首页截图已检查，素材实际渲染。实际凭据扫描251份待提交/已跟踪材料未发现泄露；私人配置、认证、测试截图、数据库和CLI缓存不提交。

## 后续边界

1. 阶段7线上独立agent试玩尚未执行；本轮只有短程脚本验收，不冒充agent对局。
2. 免费后端闲置暂停时，聚会前恢复并检查健康；故障回退维护版本或上一兼容部署，不删除新数据库，不恢复旧站。

真实手机音频、完整语音局复测和线上独立 agent 试玩仍未完成。
