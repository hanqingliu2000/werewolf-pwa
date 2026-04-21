# 部署到可手机访问 URL（Phase 14）

## 推荐：Vercel（最快）

## 前置
- Supabase 已创建并执行 `db/migrations/0001_init.sql`
- 准备好环境变量：
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 本地验证
```bash
npm run test:werewolf
npm run build:werewolf
```

## Vercel CLI 部署
```bash
npm i -g vercel
vercel login
vercel --prod
```

在 Vercel 项目设置中添加上述两个环境变量后重新部署：
```bash
vercel --prod
```

部署成功后会返回一个 HTTPS URL，可直接在手机浏览器打开。

## 路径建议
- 房主页（Host）：`/`
- 玩家页（Player）：`/player`

## 验收清单
- [ ] 手机可打开 URL
- [ ] Host 可创建房间并开始
- [ ] Player 可进入 `/player` 并提交动作
- [ ] 夜晚结算、白天录入、胜负判定可跑通
