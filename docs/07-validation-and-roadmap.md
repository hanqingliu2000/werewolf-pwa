# 验证与后续工作

基线：prod1.0，2026-10-13。每次发布在[发布说明](../releases/prod1.0.md)记录实际执行结果，不把计划写成已经通过。

## 分层验证

| 层次 | 入口 | 验证重点 |
| --- | --- | --- |
| 仓库一致性 | `npm --prefix web run repo:check` | 文档链接、版本、活跃素材、泄密高风险文件与客户端边界 |
| 类型与单元/契约 | `npm --prefix web run check` | 规则、权限、并发、去重、SQLite/PG、播报与恢复 |
| 生产构建 | `npm --prefix web run build` | 完整Node运行时与静态资源打包 |
| 本地HTTP | `npm --prefix web run smoke` | 独立会话、末席竞争、真实服务重启恢复 |
| 浏览器回归 | `npm --prefix web run test:ui` | Chromium/WebKit流程、私密面板、音频及响应式布局 |
| 临时评审 | `node --test scripts/ui-review/review.test.mjs` | 示例与接口隔离；浏览器用review配置 |
| 线上局部 | `web/scripts/deployment-api-smoke.mjs`、cloud配置 | 实际TLS、Cookie、权限、素材及短程操作 |
| 真实计时整局 | production配置，显式启用 | 多独立会话、夜间、首夜竞选、猎人、复盘及重开 |

本地PG契约使用PGlite真实SQL引擎和pg驱动，不冒充Supabase线上压力测试。线上QA只定向清理该次报告中的Cloud QA房间，禁止全表删除。

部分本地整局使用隔离SQLite压缩行动窗口；不能称作正常计时云端整局。WebKit人工生命周期测试会使用已支持的keepalive回退。显式文档替换期间、匹配本机同源且属于本测试房间读取的已知WebKit取消诊断单独保存在报告，游戏期间或其他地址的错误仍使测试失败；不关闭CORS或放宽服务端Origin。上游说明见[Playwright #43120](https://github.com/microsoft/playwright/issues/43120)。

## 安全门槛

Git历史与发布候选均扫描凭据；审计锁定依赖；检查私有表RLS/权限、客户端bundle与发布包。风险及未验证范围写入安全报告，不用“没有告警”证明绝对安全。

## 后续优先级

1. 真实iOS Safari和Android Chrome：外放、前后台、来电、蓝牙、低电量及Wake Lock。
2. 熟人真实聚会：新手理解、房主负担、单屏行动和玩法配比。
3. 线上独立agent试玩，与脚本多会话模拟明确区分。
4. 根据反馈决定是否需要原生宿主；不预先承诺浏览器后台连续主持。

不扩展登录/验证码、远程匹配或警长记录，除非重新确认产品需求。
