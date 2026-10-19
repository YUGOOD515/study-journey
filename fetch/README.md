# 教务网页抓取

## 经法管融通课程余量

从项目根目录运行 `python fetch/scripts/export_course_capacity.py --source "src_data/2026-2027学年第1学期全校通识教育课程（选修）、专业教育课程（经法管融通）、素质教育课程一览表（仅供参考）.xlsx" --out fetch/outputs/course-capacity-YYYY-MM-DD`。需安装 `openpyxl`；输出目录必须尚不存在。Cookie 通过 `ZUEL_COOKIE`、交互隐藏输入或标准输入提供，不保存凭据。

按“所属模块（适用2024版）=大类平台（经法管融通）”筛选，公选接口查询为空时用跨专业接口补查。保留当前账号筛选条件、模糊匹配标记、原始余量、请求时间和空结果。输出 XLSX、CSV 和原始 JSON；学期字段非空时必须为 `2026-2027-1`。接口失败会停止，已取得的原始记录保留供排查；没有生成 XLSX 时不表示抓取完成。

本次对话生成的培养方案文件、解析脚本及 Python 缓存已移入此目录。以下命令在 fetch 目录运行。

依赖：`python -m pip install beautifulsoup4 html5lib`

课表重新请求：`python scripts/export_timetable.py`，交互输入 Cookie，不保存凭据。

指定学期：`python scripts/export_timetable.py --semester 2024-2025-1`。默认保存到 `outputs/timetable/2024-2025-1/`，其他学期同理。可使用 `--out` 自定义目录。

原网页的 `Form1` 使用 POST 向当前课表地址提交表单，学期字段为 `xnxq01id`。脚本发送 `application/x-www-form-urlencoded` 表单：`xnxq01id=2024-2025-1&zc=&sfFD=1&wkbkc=1`。其中 `zc` 留空表示全部周次，`sfFD=1` 选择详细模式，`wkbkc=1` 显示无课表课程列表。身份认证沿用 Cookie。请求后核对返回页面所选学期与目标学期一致，再导出文件，避免把默认学期误当作目标学期。

已获取 2024-2025-1、2024-2025-2、2025-2026-1、2025-2026-2，各保存在相应学期子目录。JSON 同时收录有课表及无课表课程；CSV 仅保持原始周课表布局，无课表课程不人为安插到周课表。

离线重新解析：`python scripts/export_timetable.py --html outputs/timetable/source.html`

课表交付：`outputs/timetable/timetable.json` 和 `outputs/timetable/timetable.csv`。原始响应保存在同目录的 `source.html`。JSON 包含所选学期、周次、默认课表布局、完整单元格详情及课程明细。CSV 保留页面默认详细模式的星期、节次、单元格换行和备注；隐藏字段存入 JSON，不在 CSV 中重复显示。跨大节的课程按照原页面重复出现。

CSV 为 UTF-8 BOM 编码，不能表达颜色、列宽或合并样式，合并内容写入左上角，其余覆盖位置留空。JSON 记录合并关系。课表中正文分隔线和原始备注不作修正。

培养方案历史输出保留在 `outputs/curriculum-2026-09-08/` 和 `outputs/curriculum-csv/`，对应脚本为 `scripts/export_curriculum_csv.py`。
