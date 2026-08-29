export const HELP = `本地日历 CLI — 操作 Local Calendar 的日程与待办

用法: localcal <命令> [参数]

日程:
  agenda                              今日总览（日程 + 待办）
  today                               agenda 的快捷别名
  next                                查看下一条即将开始的日程
  export [-f 开始] [-t 结束] [-o 文件] 导出 ICS 日程文件
  import -i 文件                       导入 ICS 日程文件
  list [-f 开始] [-t 结束] [-c 日历]   查询日程（默认今天起 7 天）
  create <标题> -s <开始> [-e <结束>]  创建日程
  update <id> [--title 标题] [-s 开始] [-e 结束] [-c 日历] [-l 地点] [-n 说明]
  delete <id>                         删除日程（重复日程删除整个系列）
  search <关键词>                      搜索日程

待办:
  task list [--all | --done] [--today | --overdue | --scheduled]
  task add <标题> [-d 截止日期] [-n 备注] [-p 优先级] [-r 重复] [--remind 分钟] [--parent 父任务ID]
  task update <id> [--title 标题] [-d 截止日期] [-n 备注] [-p 优先级] [-r 重复] [--remind 分钟|none] [--parent 父任务ID|none]
  task done <id...> | task undo <id> | task delete <id...>

日历、附件与回收站:
  calendars | calendar list
  calendar create <名称> [--color 色值]
  calendar update <id> [--title 名称] [--color 色值]
  calendar delete <id>
  attachment list <event|task> <对象ID>
  attachment add <event|task> <对象ID> -i 文件
  attachment delete <event|task> <对象ID> <附件ID>
  trash list | restore <ID> | delete <ID>

其他:
  doctor                              检查数据目录、数据库和应用连接
  help                                显示本帮助

通用:
  --data-dir 目录                     使用指定的数据目录（多个便携包时必填）
  --json                              以 JSON 输出（便于程序与 AI 解析）

时间格式: ISO 8601（本地时区），如 2026-08-28T14:00；纯日期 2026-08-28 视为全天。
日历 ID: personal(个人) work(工作) family(家庭) holidays(中国节假日, 只读)

应用运行时改动实时同步到界面；未运行时直接读写本地数据库。`
