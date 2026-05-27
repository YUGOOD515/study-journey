# 运行与开发说明

## 1. 环境要求

项目运行需要：

| 工具 | 用途 |
|---|---|
| Node.js | 运行 Vite 前端与 Express 后端 |
| npm | 安装依赖、执行脚本 |
| SQLite 数据库文件 | 保存培养方案、用户计划和学校原始数据 |

当前 `package.json` 主要信息：

| 字段 | 值 |
|---|---|
| name | `study-journey` |
| version | `0.1.0` |
| type | `module` |
| private | `True` |

## 2. 推荐目录结构

推荐保持如下结构：

```text
项目根目录/
├─ app/
│  ├─ server/
│  └─ src/
└─ db/
   └─ course_planner_v2.sqlite
```

后端默认从 `app/` 的上一级目录读取数据库：

```text
../db/course_planner_v2.sqlite
```

## 3. 安装依赖

在项目根目录下执行：

```bash
cd app
npm install
```

不要在项目根目录直接执行 `npm install`。当前 `package.json` 位于 `app/` 下。

## 4. 启动开发环境

```bash
cd app
npm run dev
```

该命令会同时启动：

```text
npm run dev:web
npm run dev:api
```

对应脚本如下：

```json
{
  "dev": "concurrently -n web,api -c cyan,magenta \"npm:dev:web\" \"npm:dev:api\"",
  "dev:web": "vite",
  "dev:api": "tsx watch server/index.ts",
  "build": "tsc -b && vite build"
}
```

## 5. 端口说明

| 服务 | 默认端口 | 地址 |
|---|---:|---|
| 前端 Vite | 6173 | `http://localhost:6173` |
| 后端 Express | 6174 | `http://localhost:6174` |
| 健康检查 | 6174 | `http://localhost:6174/api/health` |

端口由 `app/vite.config.ts` 和 `app/server/index.ts` 决定。后端端口也可以通过环境变量 `PORT` 覆盖。

## 6. 数据库路径规则

后端当前通过 `app/server/db.ts` 解析数据库路径。优先级如下：

1. 如果设置了 `DB_PATH`，使用 `DB_PATH`。
2. 否则尝试 `../db/course_planner_v2.sqlite`。
3. 兼容其他相对路径，例如 `../../db/course_planner_v2.sqlite`、`app/db/course_planner_v2.sqlite`。

示例：

```bash
cd app
DB_PATH=../db/course_planner_v2.sqlite npm run dev
```

Windows PowerShell 示例：

```powershell
cd app
$env:DB_PATH = "../db/course_planner_v2.sqlite"
npm run dev
```

## 7. 常用开发命令

| 命令 | 位置 | 用途 |
|---|---|---|
| `npm run dev` | `app/` | 同时启动前后端 |
| `npm run dev:web` | `app/` | 只启动前端 |
| `npm run dev:api` | `app/` | 只启动后端 |
| `npm run build` | `app/` | TypeScript 构建 + Vite 构建 |

## 8. 数据库检查命令

可以用 SQLite CLI 检查主库：

```bash
sqlite3 db/course_planner_v2.sqlite
```

进入后常用命令：

```sql
.headers on
.mode column
.tables
PRAGMA integrity_check;
PRAGMA foreign_key_check;
SELECT COUNT(*) FROM plan_program_courses;
SELECT COUNT(*) FROM plan_custom_courses;
```

## 9. 常见问题

### 9.1 后端提示找不到数据库

通常原因是当前工作目录不对。应在 `app/` 目录执行：

```bash
npm run dev
```

如果仍找不到，显式指定：

```bash
DB_PATH=../db/course_planner_v2.sqlite npm run dev
```

### 9.2 端口被占用

如果 `6173` 或 `6174` 被占用，先关闭旧的开发进程。Windows PowerShell 可用：

```powershell
netstat -ano | findstr :6174
taskkill /PID <PID> /F
```

### 9.3 出现 SQLite journal 文件

`*.sqlite-journal` 是 SQLite 事务日志文件。开发服务器运行时可能临时出现。确认后端已经关闭后，通常会自动消失。如果数据库没有写入进程且 journal 文件长期存在，再考虑备份后处理。

### 9.4 `node:sqlite` 相关问题

当前后端使用 Node 的 `node:sqlite`。如果本地 Node 版本不支持，需要升级 Node，或者改回项目早期依赖中的 SQLite 方案。不要在没有确认兼容性的情况下同时混用多个 SQLite 驱动。

### 9.5 Excel 文件名显示异常

如果从 zip 解压后出现 `#Uxxxx` 形式的文件名，通常是压缩包编码或解压工具造成的。数据库已导入的情况下，运行项目不依赖这些文件名。只有重新执行 `scripts/import_src_data.py` 时才需要确认 `src_data/` 中的真实文件名。
