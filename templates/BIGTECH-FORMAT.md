# 大厂周报形式调研（选型依据，2026-09-08 更新）

> 一句话结论：**大厂周报是"分层汇报件"**——口头 3 句 < 一页纸汇报件（给主管，30 秒看全貌） < 详细文档（归档）。做「展示」用的是中间一层：1 页、结论先行、数据说话、敢报风险。**所有产物不出现 emoji**，层级用文字标签（已交付 / 指标 / 风险·遗留 / 下周计划 / 亮点）+ 加粗表达，颜色只是辅助。

## 各家成熟格式速览

| 公司 / 体系 | 结构 | 对应本文档/模板 |
|---|---|---|
| 字节跳动（飞书 OKR 周会） | 团队 OKR → 各 KR 下 @ 承接人，四段式：**本周进展 / 风险上浮 / 下周计划**；进场会"暴露问题 + 探讨解题思路"，拒绝流水账；完成率 <60% 自动黄旗 | `okr-版.md` |
| 阿里（产品/研发周报） | 三模块：本周工作汇总（结论先行）→ 本周工作复盘（好/不好 + 改进方案）→ 下周工作计划；要求 10 秒内读完，简洁凝练 | `one-pager-汇报版.md` 复盘入「风险/需支援」 |
| 腾讯（研发周报） | 按需求类 / 团队建设类 / 技术建设类分类，每类给全局性一句话概述；leader 需补现象背后的深度思考 | 模块明细按类归组 |
| Google / Meta / Microsoft | **Manager Read**（约 15 分钟/周）：一页纸给主管——wins / challenges / next steps；wins 用"结果 + 影响"表述（"登录完成率 +4%"不写"完成了登录模块"） | 「一页汇报」+「本周已交付」 |
| Amazon（WBR 系） | 指标驱动：北极星指标趋势 + 异动点、维度下钻（数据周报口径：业务概览 → 异动分析 → 专题分析），每个指标带上周对比 Δ | 「关键指标」表带 Δ |
| 通用写作原则（腾讯云《聊聊周报》/ ManageUp） | BLUF 结论先行；数据锚定（不写"取得一定进展"）；So-What 测试（老板看完会怎样）；行动导向（写清需要谁在何时决策）；消灭模糊词（尽快/部分用户）；"10 分钟写完、2 分钟读完"；指标缺失用 [数据待补] 而非编造 | 本文档原则区 |

## 大厂通用原则（写/评审都用这套）

1. **结论先行（BLUF）**：摘要 1–2 分钟看全貌；首行即结论，不是"本周开展了…"。
2. **重结果轻流程**：写"打通了 X 闭环"，不写"我今天改了 5 个文件"。
3. **数据说话**：核心成果用**业务/产品指标**量化 + 上期对比 Δ。代码行数与提交数是**活动量不是成果**（可拆分、可注水、AI 辅助下彻底失真），只在归档版脚注出现，不进正文。
4. **突破聚焦**：一周只写 1–2 项重点突破，避免碎片流水账。
5. **风险是职责**：风险/阻塞独立成段，写清**影响 + 需要谁 + 要什么资源**。
6. **下周可验收**：Top 3 按序，每条有完成标准。
7. **一次写、多分发**：详细归档版 → 提炼一页纸（给主管）→ 3–5 句（给 VP/CEO）→ 群周报版，同源不同貌。
8. **无 emoji**：本 skill 全部产出用文字标签 + 加粗，杜绝 emoji（含渲染器 chip 标签与截图标题）。

## 三种标准版式（本 skill 对应三套模板）

| 版式 | 结构 | 对应模板 | 使用场景 |
|---|---|---|---|
| 汇报版（一页纸） | KPI 速览 → 重点突破 1–2 项 → 已交付 → 指标(本周vs上周+Δ) → 风险/需支援 → 下周Top3 → 亮点 | `one-pager-汇报版.md` | 给主管、客户、群周报 |
| OKR 版 | O → KR（含**当前数据 vs 目标**、问题→方案、证据）→ 风险预警(完成率<60%黄旗) → 下周规划 → 亮点复用 | `okr-版.md` | 字节/飞书式目标管理团队 |
| 详细归档版 | 一页汇报 + 本期成果(交付清单/已发布/进行中) + 模块明细(目标/做法与决策/效果/可核验) + 备注/遗留 | 默认（SKILL.md Step 3 结构） | 自留、沉淀、审计 |

## 参考来源

- 飞书官方团队 OKR 周报模板：https://www.feishu.cn/docs/doccnOd7qQBfkBb4VnSMo2SGiTc
- 字节 OKR 周会模板（本周进展/风险上浮/下周计划四段式）：https://bytedance.larkoffice.com/docx/EzirdPdPZoiObGxCA9cc0TcPnwb
- 聊聊周报（腾讯云，周报定位与写法，含风险+措施示例）：https://cloud.tencent.com/developer/article/2237045
- 阿里产品工作笔记（三模块 + 10 秒读完）：https://blog.csdn.net/weixin_39942474/article/details/111380088
- ManageUp 大厂汇报方法论（BLUF/数据锚定/So-What/行动导向）：https://aiproducthub.cn/s/38323.html
- 数据周报四段式与异动分析（小火龙说数据）：https://cloud.tencent.cn/developer/article/2036224
- Weekly Status Report Examples（wins/in-progress/blockers/next week 结构 + carry-over 预警）：https://weekblast.com/blog/weekly-status-report-examples
- FAANG Manager Read（Google/Meta/Microsoft 一页纸周更，wins/challenges/next steps）：https://www.ivoox.com/en/how-faang-engineers-use-the-manager-read-to-audios-mp3_rf_177975810_1.html
- Google 系 status-report（Yesterday/Today/Blockers + Shipped/In Flight/Risks/Δ 指标表）：https://mdgrok.com/skills/508682
- Project Status Report（健康度/计划vs交付/风险矩阵/行动项）：https://slidemaker.app/project-status-report-template
