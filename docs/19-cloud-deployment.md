# 云端部署与维护

基线：prod1.0，2026-10-13。部署记录见[发布说明](../releases/prod1.0.md)。

## 拓扑

Vercel应用根目录 `web/`，Node.js24、Next.js Node runtime，函数区域 `iad1`。Supabase项目位于 `us-east-1`，仅提供PostgreSQL保存；不引入Supabase Auth、Realtime或SQL游戏规则。

`werewolf_preview`、`werewolf_prod` 是两个私有schema，各自保存rooms、receipts、limits。两个独立最小权限服务账号，启用RLS，匿名及普通认证用户不能直读。迁移在 `supabase/migrations/`，密码不写入迁移。

## 服务端环境变量

| 变量 | 本地 | 云端 |
| --- | --- | --- |
| WEREWOLF_STORAGE | 不设置或sqlite | 必须postgres |
| WEREWOLF_DB_PATH | 默认.data/rooms.sqlite | 不使用 |
| WEREWOLF_SCHEMA | 不使用 | Preview为werewolf_preview，Production为werewolf_prod |
| WEREWOLF_DATABASE_URL | 仅本地PG调试需要 | 对应应用账号的transaction pooler URL |
| WEREWOLF_DATABASE_CA | 同上 | 官方根证书PEM，服务器TLS验证 |
| WEREWOLF_ORIGIN | localhost通常不必设置 | 正式网址精确Origin，无尾部斜杠 |
| WEREWOLF_MAINTENANCE | 可选1 | 1时关闭入席及API，健康返回503 maintenance |
| WEREWOLF_ENROLLMENT_CLOSED | 可选1 | 1时仅关闭新建房间，不影响已有房间 |

数据库URL必须是Supabase pooler、6543端口、与schema匹配的应用账号，无查询参数。密码经URL编码，不能使用管理员账号。连接池每实例最多一个连接，无命名预编译语句；事务借用同一连接。证书或配置缺失时失败，禁止关闭TLS验证或回退SQLite。

敏感值仅在受限平台环境配置中保存，不能使用 `NEXT_PUBLIC_`。本地环境示例只含非敏感默认值。

## 部署与正式提升

1. 安装锁定依赖，运行仓库检查、check、build、本地HTTP及相关浏览器验收。
2. 推送当前成果，等待新候选完成；正式域名自动分配保持关闭。
3. Preview只接入preview schema。Git main候选若属于Production环境，会接入prod schema，即使还没有提升正式域名，不能把它误当数据库沙箱。
4. 检查数据库健康、独立会话、恢复、权限、音频与页面资源。受保护候选认证仅使用本地0600私有文件，不公开绕过令牌。
5. 验收通过后手动提升明确的部署ID，再在正式网址复核。
6. 仅按本次QA报告的具体房间ID且匹配Cloud QA名称清理；记录版本与未完成验证。

新项目首个部署属于Production，必须先部署关闭入口的维护版本；不能假定首次就是安全预览。不要创建付费资源、升级或加保活任务。

## 保留与恢复

房间在实际业务状态变更后24小时到期，普通轮询和心跳不续期；旧局档案按结束时间24小时。访问严格检查期限。

每五分钟pg_cron清理过期房间、级联回执、限流及嵌入档案；裁剪档案递增CAS版本，避免覆盖并发修改。无需为本次发布改表或重跑已应用迁移。

接受免费后端闲置暂停。聚会前确认控制台项目可用，再检查 `/api/health`；不可用返回503而非虚假健康。恢复后检查建房加入和声音，不用轮询保活绕过闲置政策。

失败时回退维护版本或上一兼容部署，不删除新数据库、不恢复旧站、不修改私人备份。语音版本不匹配时让原页面刷新并重新启用声音。

## 安全与参考

### 用量保护（2026-10-13）

新增房间预留预算：全站6次/小时、20次/24小时、100次/30天。使用现有私有 `limits` 表，SQLite和PostgreSQL都以原子计数保存；跨实例共享，窗口从首次尝试开始。拒绝后的计数饱和在上限加一，不持续增长。已成功请求的重试先返回回执，不重新扣预算；失败或并发重复尝试可能保守占用预留名额。无需数据库迁移。

预算耗尽返回503 `ENROLLMENT_UNAVAILABLE`，仅影响建房；加入、准备、心跳、游戏指令和恢复仍走原有限流。不得在正式环境通过删计数或压测验证上限。发现异常增长时设置 `WEREWOLF_ENROLLMENT_CLOSED=1` 后重新部署；危及现有游戏时再使用维护开关。

已通过控制台API核验 Vercel Hobby、Supabase Free。没有购买额外用量、升级或启用试用。免费超额可能限制或暂停服务，不自动付费增购。应用预算不替代平台费用控制：轮询、静态素材和恶意无效请求仍可能消耗配额。免费方案不保证可用性；任何付费迁移前重新核验费用上限、提醒和服务暂停策略。

依据：[Vercel Hobby](https://vercel.com/docs/plans/hobby)、[Supabase成本控制](https://supabase.com/docs/guides/platform/cost-control)。

[安全策略](../SECURITY.md)、[本次审查](security-prod1.0.md)和[接口契约](13-room-service-contract.md)。

官方资料：[连接Postgres](https://supabase.com/docs/guides/database/connecting-to-postgres)、[Cron](https://supabase.com/docs/guides/cron)、[部署环境](https://vercel.com/docs/deployments/environments)。重新创建资源时须重新核验当前费用和配额，不沿用旧账单结论。
