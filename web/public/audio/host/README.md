# Host TTS Prebuilt Audio (方案A)

把预生成的主持语音放在本目录，文件名需与 `web/lib/host-tts.ts` 的 key 对齐。

必需文件（基础）：
- night_guard_open.mp3
- night_werewolf_open.mp3
- night_seer_open.mp3
- night_witch_open.mp3
- night_resolve.mp3
- day_announce.mp3
- day_input.mp3

推荐补充（用于“睁眼→闭眼→下一位睁眼”完整节奏）：
- night_guard_close.mp3
- night_werewolf_close.mp3
- night_seer_close.mp3
- night_witch_close.mp3

说明：
- 若推荐补充文件缺失，前端会自动回退到浏览器 TTS 文本播报，不会阻塞流程。
- `night_witch_hint`（提示女巫“今晚被刀目标”）默认走浏览器 TTS，避免泄露私密查验信息。
