# Local Calendar

本地版日历应用（含待办），Windows 10 桌面端。数据全本地存储（SQLite），提供 CLI 供人工与 AI 操作。

当前版本：`2.1.2`

## 启动

```bash
npm install     # 首次
npm run dev     # 开发模式启动
npm test        # 构建并运行共享服务冒烟测试（含提醒边界）
```

生产模式：`npm run build && npm start`

Windows 便携版：`npm run dist:win`。如果网络需要本机代理，可用 `npm run dist:win:proxy`。生成的 `Local Calendar-<版本>-portable.exe` 可直接复制到任意文件夹运行；首次启动会解压运行环境，可能需要十几秒，之后启动会更快。数据库、设置、日志、截图和 RPC 文件都保存在同目录的 `data` 文件夹中，删除整个文件夹即可卸载。

## CLI（命令行 / AI 操作入口）

`npm run cal -- <命令>`；或 `npm link` 后直接使用 `localcal <命令>`。

首次使用 CLI 请在项目目录执行一次 `npm link`，之后可在任意 PowerShell 窗口直接运行 `localcal`。CLI 会按自身安装路径定位本地 `data` 目录，不依赖当前 PowerShell 工作目录；应用运行时自动通过本地 RPC 操作当前便携版数据。

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
localcal import -i calendar.ics
localcal task add "交周报" -d 2026-09-04
localcal task add "每日站会" -d 2026-09-01 -r weekdays
localcal task update 1a2b3c4d --title "交周报（已确认）" -n "周五 18:00 前"
localcal task list                               # 未完成待办（--all 全部 / --done 已完成）
localcal task list --today                       # 只看今天任务
localcal task list --overdue                     # 只看逾期任务
localcal task done 1a2b3c4d 5e6f7a8b                 # 可一次完成多个任务
localcal task done-all --overdue                   # 批量完成逾期任务
localcal task undo 1a2b3c4d
localcal task delete 1a2b3c4d 5e6f7a8b
localcal calendars                               # 列出日历
localcal doctor                                  # 检查数据路径和应用连接
```

所有命令支持 `--json` 输出（程序/AI 友好）；出错时退出码为 1。AI 助手可直接在终端执行这些命令完成日程管理。

## 数据

- 数据库（开发、便携版、CLI 统一）：`项目或应用目录\data\calendar.db`（SQLite，WAL 模式）
- 本地 RPC：与数据库位于同一数据目录，应用退出时自动清理

## 功能范围

- 视图：日 / 周 / 月，农历与节气、中国节假日（只读）、任务侧板
- 日程：创建、编辑、删除、10 色色板、全天、跨天、多日历（个人/工作/家庭）、提前提醒（系统通知 + 应用内 toast）
- 周视图支持按住空白时间段拖选，松开后直接创建对应时长的日程（15 分钟吸附）
- 时间线单击快速创建，双击打开宽版详细创建编辑器
- 月视图在日程较多时可点击“还有 n 项”查看当天完整安排
- 月视图详情弹层支持查看当天全部日程并快速进入编辑
- 重复日程支持“仅此日程”修改/删除，或继续作用于整个系列
- 待办：界面侧板 + CLI 增删改查
- 设置：默认视图、浅色/深色主题、本地日历新增/改名/改色/删除
- 数据：设置中心可打开便携数据目录、备份数据库和从备份恢复
- 回收站：删除的日程和任务可恢复，也可永久删除
- 打印：顶部打印按钮调用 Windows 系统打印对话框
- 任务侧栏：右侧任务面板默认展开，可独立隐藏，不再与日历视图二选一
- 深度融合：有截止日期的任务会显示在日历中，点击可直接编辑，拖动可修改截止日期
- 任务重复：支持每天、工作日、每周、每月、每年重复，重复实例会投影到日历
- 重复任务支持仅此实例编辑、删除和跳过，系列规则保持不变
- 任务面板采用卡片式布局，支持搜索、日期快捷设置和已完成任务清理
- 任务支持高/普通/低优先级，面板按逾期、今天、未来 7 天、以后和无日期分组
- 任务面板支持拖拽排序，顺序会持久化到本地数据库
- 任务面板支持全部/今天/逾期/有日期筛选和多选批量完成、删除
- 设置菜单：设置、回收站、外观、打印，按 Google 日历的入口逻辑组织
- 回收站与数据：模拟数据已迁移到便携版 `release/data`，启动后可直接使用
- Windows：系统托盘显示今日安排和未完成任务，点击项目会直接定位并打开编辑，应用启用单实例运行
- 通知：系统通知点击后直接定位到对应日程或任务
- 通知中心：提醒会保存在应用内通知中心，可清空并点击跳转
- 窗口：默认居中并最大化启动，记忆上次窗口尺寸、位置、最大化状态和最后视图，自绘标题栏不响应右键菜单
- 视图：日 / 4 天 / 周 / 月 / 年 / 日程六种模式；任务截止日会作为全天项目显示在日历中
- 账户：支持本地用户名与头像颜色，不连接云端账号
- 任务：支持任务截止提醒，系统通知与应用内 toast 同步
- 导入/安全：设置中心支持图形化导入 ICS、手动备份/恢复，便携版自动轮换保留 14 份备份
- CLI：日程/待办 CRUD、搜索、今日总览、--json 输出、ID 前缀匹配

CLI 的 `--remind` 使用分钟数：`0` 为开始时提醒，`10` 为提前 10 分钟，多个提醒用逗号分隔；`localcal update <id> --remind none` 可清除提醒。
