# weekly-report

Reconstruct recent code work (default: last 7 days) from git + file-change evidence, cluster it **by feature**, and write an archiveable dated report **plus** a short spoken summary for your stand-up / weekly report.

**Use it when you'd say:** *"what did I do this week"* / *"周报"* / *"工作总结"* / *"帮我整理这段时间的成果"*.

## What you get

1. `<YYYY-MM-DD>_周报.md` — the archiveable report (feature clusters + evidence + honest notes), including a 数据快照 section with code churn (commits / files / +N −M line counts from `summary.churn`).
2. A **PDF export** — rendered every run by default (`render-pdf.mjs`; `render-report.mjs` adds the KPI strip + cover meta rows + screenshot gallery). Verify the output exists and is non-empty before reporting success.
3. A **3–5 line spoken summary** in the reply, ready to copy.
4. **Optional demo script (off by default)** — only when you say `要演示版` / `加讲解稿`: `<report>_讲解稿.md`, where every module gets a speakable 讲解词 (natural-language, first-person) + 演示步骤 (real UI walkthrough with expected effects). Modules themselves stay at a plain 介绍 otherwise.

Two default conventions worth knowing: **完成时间只给区间**（不逐条标注单项完成时点，也不出逐日提交图），and **多作者时按人分段汇报**（第一部分本人、第二部分其他作者；未提交/未发布在备注里点明状态）。Both are overridable in the prompt.

## Presentation extras (optional, off unless you ask)

Passed through to `render-report.mjs`:

- **`--brand <logo.svg>`** — 半透明品牌水印铺在整页背景（内嵌为 data URI，HTML/PDF 都是单文件）。
  **本仓库不内置任何公司 logo。** 示例里的 Pamera 字标（`--brand` 指向业务仓库的
  `catalog-server/viewer/public/logo.svg`）**仅用于本公司内部周报**；其他使用者请换成自己的标识，或干脆不加。
- **`--author <name>` / `--github <login>` / `--avatar <file>`** — 封面身份条：头像 + 姓名 + GitHub 账号。
  **逗号分隔可列多人、按位置配对，本人放第一位**——报告里有几个作者就写几个，封面会把所有参与人都列出来
  （如 `--github "me,同事的登录名"`）。这是通用能力，不绑定任何组织：单人时缺省从 `git config user.name`
  和 `gh api user` 推断；头像优先用 `--avatar` 指定的本地文件，否则按 `--github` 拉 GitHub 头像
  （离线时自动回退姓名首字母）。

Report styles in `templates/` (one-pager 汇报版 / OKR 版 / 大厂格式调研 BIGTECH-FORMAT.md). **No emoji**: all artifacts use text labels + bold; color is a companion cue only.

## Works where your work actually is

- **Local git repo** — reads commits, uncommitted changes, recently modified files, artifacts.
- **Repo hosted elsewhere** (teammate's GitHub repo, work PC, stale local clone) — automatically falls back to read-only **remote evidence** via `gh api`, filtered to your own commits. No local fetch/clone needed.

## Try it

```bash
bash scripts/demo.sh /path/to/repo --days 30     # preview the evidence it gathers
```

Then in Claude Code: `weekly report from ./my-projects, last 7 days`.

## Configuration

See [config.md](./config.md) for editable defaults (time window, output directory, a default scan list).
