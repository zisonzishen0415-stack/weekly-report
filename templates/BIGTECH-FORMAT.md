# 大厂周报形式调研（选型依据）

> 一句话结论：**大厂周报是"分层汇报件"**——口头 3 句 < 一页纸汇报件（给主管，30 秒看全貌） < 详细文档（归档）。做「展示」用的是中间一层：1 页、结论先行、数据说话、敢报风险。

## 三种标准版式（本 skill 对应三套模板）

| 版式 | 结构 | 对应模板 | 使用场景 |
|---|---|---|---|
| 汇报版（一页纸） | KPI 速览 → 重点突破 1–2 项 → ✅已交付 → 📊指标(本周vs上周+Δ) → ⚠️风险/需支援 → 📅下周Top3 → 亮点 | `one-pager-汇报版.md` | 给主管、客户、群周报 |
| OKR 版 | O → KR（含**当前数据 vs 目标**、问题→方案、证据）→ 风险预警(完成率<60%黄旗) → 下周规划 → 亮点复用 | `okr-版.md` | 字节/飞书式目标管理团队 |
| 详细归档版 | 一页汇报 + 模块明细(证据) + 备注/遗留 | 默认（SKILL.md Step 3 结构） | 自留、沉淀、审计 |

## 大厂通用原则（写/评审都用这套）

1. **结论先行**：摘要 1–2 分钟看全貌；"四段式"（定性结论、定量结论、业务原因、影响周期）。
2. **重结果轻流程**：写"打通了 X 闭环"，不写"我今天改了 5 个文件"。
3. **数据说话**：核心成果量化 + 图表/进度条/截图；指标带**上周对比 Δ**。
4. **突破聚焦**：一周只写 1–2 项重点突破，避免碎片流水账。
5. **风险是职责**：风险/阻塞独立成段，写清**影响 + 需要谁 + 要什么资源**；字节做法是完成率 <60% 自动黄旗预警。
6. **下周可验收**：Top 3 按序，每条有完成标准。

## 参考来源

- 飞书官方团队 OKR 周报模板：https://www.feishu.cn/docs/doccnOd7qQBfkBb4VnSMo2SGiTc
- 聊聊周报（腾讯云，周报定位与写法）：https://cloud.tencent.com.cn/developer/article/2237045
- OKR 团队周报（版式示例）：http://www.xqppt.com/view/28324.html
- Google 系 status-report（Yesterday/Today/Blockers + Shipped/In Flight/Risks/Δ 指标表）：https://mdgrok.com/skills/508682
- Weekly Status Report Dashboard（绿/蓝/未开始三色列）：https://slidebazaar.com/templates/weekly-status-report-powerpoint-google-slides/
- Project Status Report（健康度/计划vs交付/风险矩阵/行动项）：https://slidemaker.app/project-status-report-template
