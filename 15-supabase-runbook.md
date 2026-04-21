# Supabase 接入运行手册（Phase 9）

## 目标
把狼人杀主持 app 从内存模式切换到 Supabase 持久化模式前，先完成数据库与连通性验收。

## 1) 准备环境变量
复制 `.env.example` 到你的运行环境，填入：
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 2) 应用 migration
已提供初始 schema：
- `db/migrations/0001_init.sql`

执行方式（任选其一）：
- Supabase Dashboard SQL Editor 执行该 SQL
- 或 Supabase CLI `db push`（按你的项目配置）

## 3) 连通性与表结构验收
运行：

```bash
npm run smoke:supabase
```

预期输出：
- `[OK] table rooms`
- `[OK] table players`
- `[OK] table night_actions`
- `[OK] table events`
- `Supabase smoke check passed.`

如果要验证核心 RPC 写路径，运行：

```bash
npm run smoke:supabase:rpc
```

该命令会创建一个临时房间，依次执行创建、加入、开始、夜间行动、夜晚结算、白天推进、白天投票，并在最后尝试清理临时房间。

## 4) 切换策略建议
- 当前应用在未配置 Supabase 环境变量时仍回退到内存 store，便于本地开发。
- 主要 write-path 已改为 Supabase RPC 事务；联调时优先跑 `npm run smoke:supabase:rpc`。
- 每次修改数据库 RPC 或 route handler 后运行全量 tests + build。

## 5) 风险检查
- 如果启用了 RLS，需提前加好 policy，否则 anon key 会写失败。
- 开发阶段先在受控环境中关闭或放宽策略，联调完成后再收紧。
