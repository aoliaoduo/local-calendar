# Local Calendar

本地版日历应用（含待办），Windows 10 桌面端。数据全本地存储（SQLite），提供 CLI 供人工与 AI 操作。

## 启动

```bash
npm install     # 首次
npm run dev     # 开发模式启动
```

生产模式：`npm run build && npm start`

Windows 便携版：`npm run dist:win`。如果网络需要本机代理，可用 `npm run dist:win:proxy`。生成的 `Local Calendar-<版本>-portable.exe` 可直接复制到任意文件夹运行；首次启动会解压运行环境，可能需要十几秒，之后启动会更快。数据库、设置、日志、截图和 RPC 文件都保存在同目录的 `data` 文件夹中，删除整个文件夹即可卸载。

## CLI（命令行 / AI 操作入口）

`npm run cal -- <命令>`；或 `npm link` 后直接使用 `localcal <命令>`。

应用运行时 CLI 走本地 RPC，改动实时同步到界面；应用未运行时直接读写本地数据库（下次启动后可见）。

```bash
localcal agenda                                  # 今日总览（日程 + 待办）
localcal list -f 2026-08-28 -t 2026-09-04        # 查询日程（默认今天起 7 天）
localcal list -c work                            # 只看工作日历
localcal create "牙医复诊" -s 2026-08-29T16:30 -e 2026-08-29T17:30 -c personal -l "和睦家口腔"
localcal create "项目评审" -s 2026-08-30T10:00 --remind 60,10 # 提前 1 小时和 10 分钟提醒
localcal create "朋友生日" -s 2026-08-30 --all-day -c family
localcal update abc12345 -e 2026-08-29T18:00     # id 可只写前几位
localcal delete abc12345
localcal search 评审
localcal export -f 2026-08-28 -t 2027-08-28 -o calendar.ics
localcal task add "交周报" -d 2026-09-04
localcal task update 1a2b3c4d --title "交周报（已确认）" -n "周五 18:00 前"
localcal task list                               # 未完成待办（--all 全部 / --done 已完成）
localcal task done 1a2b3c4d
localcal task undo 1a2b3c4d
localcal task delete 1a2b3c4d
localcal calendars                               # 列出日历
```

所有命令支持 `--json` 输出（程序/AI 友好）；出错时退出码为 1。AI 助手可直接在终端执行这些命令完成日程管理。

## 数据

- 数据库（开发模式）：`%APPDATA%\local-calendar\calendar.db`（SQLite，WAL 模式）
- 便携版数据：`应用目录\data\calendar.db`（SQLite，WAL 模式）
- 本地 RPC：与数据库位于同一数据目录，应用退出时自动清理

## 功能范围

- 视图：日 / 周 / 月，农历与节气、中国节假日（只读）、任务侧板
- 日程：创建、编辑、删除、10 色色板、全天、跨天、多日历（个人/工作/家庭）、提前提醒（系统通知 + 应用内 toast）
- 周视图支持按住空白时间段拖选，松开后直接创建对应时长的日程（15 分钟吸附）
- 待办：界面侧板 + CLI 增删改查
- 设置：默认视图、浅色/深色主题、本地日历新增/改名/改色/删除
- CLI：日程/待办 CRUD、搜索、今日总览、--json 输出、ID 前缀匹配

CLI 的 `--remind` 使用分钟数：`0` 为开始时提醒，`10` 为提前 10 分钟，多个提醒用逗号分隔；`localcal update <id> --remind none` 可清除提醒。
