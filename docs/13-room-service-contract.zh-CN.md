# 房间服务契约

[English](13-room-service-contract.md) | 简体中文

基线：prod1.0，2026-10-13。唯一HTTP实现是 `web/src/server/http.ts`，输入契约为 `input.ts`。

## 路由

| 方法 | /api/v2下的路径 | 用途 |
| --- | --- | --- |
| POST | `session` | 建立原浏览器会话，不注册用户 |
| POST | `rooms` | 建房 |
| GET | `rooms/[id]/invitation` | 加入信息：配置、大厅标识和占用席位，不含身份 |
| POST | `rooms/[id]/join` | 加入或识别原有成员 |
| GET | `rooms/[id]` | 公共视图与本人座位 |
| GET | `rooms/[id]/private` | 本人私密视图 |
| GET | `rooms/[id]/host` | 房主组织视图 |
| POST | `rooms/[id]/commands` | 当前上下文的动作 |
| POST | `rooms/[id]/heartbeat` | 房主前台及音频就绪心跳 |
| GET | `rooms/[id]/recaps` | 本会话可访问的结束局列表 |
| GET | `rooms/[id]/recaps/[gameId]` | 指定局复盘 |

即使邀请读取不要求房间成员，也必须先建立合法浏览器会话。房间号是8位大写十六进制，不能代替身份或权限。

## 请求

建房包含 `requestId`、`name`、`config`；加入包含 `requestId`、`epochId`、`name`。

动作信封包含UUID `requestId`、`epochId`、`windowId` 和 `operation`。操作不接受 `actorId`，服务端通过Cookie映射房间成员；未知字段与不支持的动作拒绝。

`wolf_confirm` 携带 `consensusId`，新页面还携带自己的 `targetId` 防止确认旧草案；其他人的改票不使本人确认失效。白天确认/发布使用 `draftId`，播报使用 `cueId` 和当前音频版本。

写请求只接受JSON与可信同源Origin，正文上限16KiB。创建会话返回HttpOnly、SameSite=Strict Cookie，HTTPS环境设置Secure。

## 并发与去重

请求回执和房间CAS写入在同一事务提交。重复请求ID与相同输入返回原结果；同ID不同输入拒绝。未知网络结果只能用原请求重试，不新建请求来重复意图。

CAS冲突最多重读重试四次。公开revision只随公开信息变化，不公布私密动作次数或内部存储版本。随机平票结果随状态持久化。

## 信息与错误

公共、本人、房主和复盘响应分离。所有会话/私密响应禁止缓存，并用 `Vary: Cookie` 防止共享；Cookie、密码与快照不输出日志。

常见HTTP状态：400输入、401会话、403权限/来源、404房间/路由、409过期上下文或规则冲突、413正文过大、415类型不支持、429限流、503不可用。响应使用错误代码而非SQL/堆栈。

历史 `acknowledge` 是无操作兼容，不要求身份确认；`trialConfirmed` 是可选兼容字段，不作为语音主持先决条件。旧音频版本不得推进新cue。
