# 2026-09-08 周报（09-01 ~ 09-08）

> 数据来源：fixture 仓库 git 提交（本窗口 6 条）+ 未提交改动 + 代码原子提取。
> 口径说明：本期按「09-01 ~ 09-08」整段统计。**单项任务的完成时点不逐条标注**，模块内统一用「本期」表述。
> 分段：第一部分为本人（fixture-author）。

## 一页汇报（可直接照念）

- 结论先行（BLUF）：本周核心突破是检索服务升级上线——先召回再判分，误检率从 12% 降到 2%（Δ −10pct），请求量 +40%。
- 另交付：周报插件文档收口四交付物 + 讲解稿模板，下一投入客户现场联调。

## 数据快照（代码改变量）

- 提交数：6（4 feat + 2 fix）
- 变更文件：7
- 代码行数：+412 −189（已剔除 `.lock` / `.map` 噪声）
- 按模块分摊：

| 模块 | 文件数 | +行 −行 |
|---|---|---|
| 检索服务 | 3 | +312 −96 |
| 运维脚本 | 2 | +100 −93 |

## 本周工作明细

### 模块 A：检索服务升级

- 目标：让知识库检索「先召回再判分」，退掉延迟高、误检高的老方案。
- 改动量：3 files（+312 −96）
- evidence: `a1b2c3d4` `b2c3d4e5`（`src/search/SearchService.java`、`src/search/SearchController.java`、`src/search/SearchConfig.kt`）

**diff 摘录**：

```java
+ public List<DocHit> search(SearchQuery q) {
+   return hitStore.search(q).stream()
+     .map(this::score)
+     .filter(h -> h.score >= MIN_SCORE)
+     .toList();
+ }
+
+ @PostMapping("/api/search")
+ public SearchResponse search(@RequestBody SearchQuery q) {
```

- 讲解词（可照读）：之前检索是「一把梭」——用户问个相似问题就容易误检；这次拆成「先召回、再判分」两步：先按相似度取前 100 条，再过滤掉分数低于阈值的。上线一周请求量涨了 40%，误检率从 12% 降到 2%。

- 演示步骤：
  1. 打开 `https://demo.internal/search`，检索「季度结余」，**预期**：前 3 条都是结余相关真正命中的结果。
  2. 切换到「近一周」筛选再搜一次，**预期**：误检条目出现在灰区并标注分数。
     - 子步骤：点「详情」展开证据链，核对每条命中的来源文档。
  3. 打开监控面板看阈值分布，**预期**：分数在 60~80 区间的请求量占比 ≤ 15%。

### 模块 B：周报插件文档收口

- 目标：项目文档从「旁注」收口到「四交付物」——归档版、汇报版、OKR 版、讲解稿，另附模块级演示步骤。
- 改动量：4 files（+100 −93）
- evidence: `e5f6a7b8`（`docs/report/SKILL.md`、`templates/demo-script-template.md`）

**diff 摘录**：

```markdown
+ ## 四交付物
+ 1. 详细归档版（默认）
+ 2. 一页汇报版（templates/one-pager-汇报版.md）
```

- 讲解词（可照读）：这周把周报插件的产出物从两样收口成四样，并补了模块级讲解稿模板，汇报者照着「讲解词 + 演示步骤」就能现场走一遍，不用再翻代码。

## 备注 / 遗留

- blocked：联调环境 `staging.fabric` 的缓存未刷新，下周一跟进。
- 已看到并排除的噪声：`.lock`、构建产物 `dist/`、纯改名 2 处。

> 风险：**未提交**的本地改动（`tmp/x.py`）不在本报告计划内；周报侧车 `.weekly-report/` 已写入，下期可增量对比。

## 下周计划

1. 完成客户现场联调（预计 3 天）。
2. 检索服务降级开关梳理，更新 `docs/runbook.md`。
3. 周报插件：完成 evidence 采集的性能改造（单次 git pass）。
