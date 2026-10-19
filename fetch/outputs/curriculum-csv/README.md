# 培养方案 CSV 导出

源页面：https://jwxt.zuel.edu.cn/jsxsd/pyfa/topyfamx

CSV 是纯数据格式，不能保留字体、颜色、边框、列宽或真正的合并单元格。导出保留原始表格顺序、行列位置、空白单元格、多行表头、显式换行和源数据，不计算或修正学分、成绩、课程名称。HTML 排版空白按文本规则折叠。

合并单元格的内容只写入左上角，其余覆盖位置留空；manifest.json 记录每个单元格的位置与 rowspan/colspan。source.html 是本次请求的原始响应，保留原始标记和内联样式；外部样式仍依赖原网站，不能保证离线显示完全一致。

| 文件 | 内容 |
| --- | --- |
| table_01.csv | 毕业要求对培养目标的支撑关系 |
| table_02.csv 至 table_04.csv | 课程体系与毕业要求关联矩阵，保留续表 |
| table_05.csv | 各类课程学分安排 |
| table_06.csv 至 table_09.csv | 全程教学计划，保留续表 |
| table_10.csv | 课程设置总表，含个人完成情况 |
| text.csv | 正文及表格文件引用 |

全部 CSV 使用 UTF-8 BOM 编码，方便 Excel 识别中文。CSV 不具备列类型信息，如需严格保留学期范围、代码等字符串，请在 Excel 中通过“从文本/CSV”导入并设置列类型为文本。

在项目根目录执行：

```powershell
python -m pip install beautifulsoup4 html5lib
python scripts/export_curriculum_csv.py --html outputs/curriculum-csv/source.html --out outputs/curriculum-csv
```

重新请求网页（交互输入 Cookie，不回显、不写入脚本）：

```powershell
python scripts/export_curriculum_csv.py --url https://jwxt.zuel.edu.cn/jsxsd/pyfa/topyfamx --out outputs/curriculum-csv
```

原页面存在不规范 HTML，使用 html5lib 按浏览器规则解析。不要使用此前清理版 HTML 替代原始响应，因为清理版已丢失部分表格结构。原始值包括页面中的异常文本也照录，不自动修改。
