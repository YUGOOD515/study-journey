# 经法管融通自定义课程添加修复

本次热修修复“添加课程”弹窗中选择“通识·经融 / 大类·经融”后，`POST /api/personal-plan/manual` 返回 SQLite CHECK constraint failed 的问题。

## 原因

v2 数据库中 `plan_custom_courses` 有如下约束：

- `requirement_type = '经法管融通'` 时，`credit_count_to` 必须非空；
- `requirement_type <> '经法管融通'` 时，`credit_count_to` 必须为空。

原接口在经法管融通课程中仍写入 `requirement_type = '选修'`，同时又写入 `credit_count_to`，因此触发约束。

## 修复

- 自定义经法管融通课程入库时，`requirement_type` 改为 `经法管融通`；
- 同时写入 `credit_count_to`，默认计入大类平台选修，可在学分流向中切换；
- 后端返回给前端展示和统计时，仍把该类课程映射为“选修”，保持原有前端统计逻辑稳定。

## 修改文件

- `app/server/index.ts`
