# 数据结构与截图识别规范

## 1. 核心原则

- 跑步与步行共享同一套字段。
- 数据库存储规范化数值，不存储“2.21 公里”之类带单位字符串。
- 保留 AI 原始响应和规范化结果。
- AI 结果始终进入确认页面，不直接成为正式记录。
- 正文运动日期时间优先；必须忽略手机状态栏时间。

## 2. 标准字段与单位

| 字段 | 类型 | 单位/格式 | 必填 |
| --- | --- | --- | --- |
| `sport_type` | TEXT | `running` / `walking` | 是 |
| `source_type` | TEXT | `screenshot` / `manual` | 是 |
| `started_at` | TEXT | 带时区 ISO 8601 | 是 |
| `timezone` | TEXT | 默认 `Asia/Shanghai` | 是 |
| `distance_meters` | INTEGER | 米 | 是 |
| `duration_seconds` | INTEGER | 秒 | 是 |
| `calories_kcal` | INTEGER | 千卡 | 否 |
| `avg_pace_seconds_per_km` | INTEGER | 秒/公里 | 否 |
| `avg_speed_kmh` | REAL | 公里/小时 | 否 |
| `avg_cadence_spm` | INTEGER | 步/分钟 | 否 |
| `avg_stride_cm` | INTEGER | 厘米 | 否 |
| `steps` | INTEGER | 步 | 否 |
| `avg_heart_rate_bpm` | INTEGER | 次/分钟 | 否 |
| `elevation_gain_meters` | REAL | 米 | 否 |
| `elevation_loss_meters` | REAL | 米 | 否 |

`distance_meters` 和 `duration_seconds` 为第一版正式记录的核心必填指标。其他字段识别不到时允许为 `NULL`。

## 3. D1 迁移基线

```sql
CREATE TABLE activity_imports (
  id TEXT PRIMARY KEY,
  image_key TEXT NOT NULL UNIQUE,
  image_content_type TEXT NOT NULL,
  image_size_bytes INTEGER NOT NULL,
  source_app TEXT,
  status TEXT NOT NULL CHECK (
    status IN ('uploaded', 'recognizing', 'needs_review', 'failed', 'confirmed')
  ),
  raw_ai_response TEXT,
  normalized_extraction_json TEXT,
  recognition_error_code TEXT,
  recognition_error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE activities (
  id TEXT PRIMARY KEY,
  import_id TEXT UNIQUE,
  source_type TEXT NOT NULL DEFAULT 'screenshot' CHECK (
    source_type IN ('screenshot', 'manual')
  ),
  sport_type TEXT NOT NULL CHECK (sport_type IN ('running', 'walking')),
  started_at TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  distance_meters INTEGER NOT NULL CHECK (distance_meters > 0),
  duration_seconds INTEGER NOT NULL CHECK (duration_seconds > 0),
  calories_kcal INTEGER CHECK (calories_kcal IS NULL OR calories_kcal >= 0),
  avg_pace_seconds_per_km INTEGER CHECK (
    avg_pace_seconds_per_km IS NULL OR avg_pace_seconds_per_km > 0
  ),
  avg_speed_kmh REAL CHECK (avg_speed_kmh IS NULL OR avg_speed_kmh > 0),
  avg_cadence_spm INTEGER CHECK (avg_cadence_spm IS NULL OR avg_cadence_spm > 0),
  avg_stride_cm INTEGER CHECK (avg_stride_cm IS NULL OR avg_stride_cm > 0),
  steps INTEGER CHECK (steps IS NULL OR steps >= 0),
  avg_heart_rate_bpm INTEGER CHECK (
    avg_heart_rate_bpm IS NULL OR avg_heart_rate_bpm > 0
  ),
  elevation_gain_meters REAL CHECK (
    elevation_gain_meters IS NULL OR elevation_gain_meters >= 0
  ),
  elevation_loss_meters REAL CHECK (
    elevation_loss_meters IS NULL OR elevation_loss_meters >= 0
  ),
  validation_warnings_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (import_id) REFERENCES activity_imports(id)
);

CREATE INDEX idx_activities_started_at
ON activities(started_at DESC);

CREATE INDEX idx_activities_sport_started_at
ON activities(sport_type, started_at DESC);
```

`source_type = 'manual'` 时 `import_id` 为 `NULL`；截图记录仍使用唯一的导入 ID。删除策略由服务层明确执行：手动记录只删除活动行，截图记录同时删除活动、导入和 R2 对象。SQLite 外键行为不得被隐式假设。

## 4. AI 输出协议

Workers AI 必须被要求只返回 JSON，不返回 Markdown 代码块或解释文字。即使模型承诺 JSON，服务端仍必须执行解析和 Zod 校验。

规范化识别结果：

```json
{
  "schemaVersion": 1,
  "sportType": "running",
  "startedAtLocal": "2026-09-20T20:41:00",
  "timezone": "Asia/Shanghai",
  "distanceMeters": 2210,
  "durationSeconds": 1240,
  "caloriesKcal": 181,
  "avgPaceSecondsPerKm": 561,
  "avgSpeedKmh": 6.42,
  "avgCadenceSpm": 148,
  "avgStrideCm": 72,
  "steps": 3061,
  "avgHeartRateBpm": 142,
  "elevationGainMeters": 8.5,
  "elevationLossMeters": 5.8,
  "confidence": {
    "sportType": 0.99,
    "startedAtLocal": 0.99,
    "distanceMeters": 0.99,
    "durationSeconds": 0.99,
    "caloriesKcal": 0.98,
    "avgPaceSecondsPerKm": 0.98,
    "avgSpeedKmh": 0.98,
    "avgCadenceSpm": 0.98,
    "avgStrideCm": 0.98,
    "steps": 0.98,
    "avgHeartRateBpm": 0.98,
    "elevationGainMeters": 0.97,
    "elevationLossMeters": 0.97
  },
  "warnings": []
}
```

无法识别的可选数值使用 `null`，不得使用 `0` 代替未知值。置信度范围为 0 到 1。

## 5. 识别规则

### 5.1 运动类型

- 标题包含“户外跑步”时输出 `running`。
- 标题包含“户外步行”时输出 `walking`。
- 标题不明确时输出 `null`，由用户选择。

### 5.2 日期时间

- 读取正文中靠近运动距离上方的完整日期时间。
- 忽略屏幕顶部状态栏的当前时间、电量、网络和运营商内容。
- 日期为 `2026年9月20日 20:41` 时，规范化为本地时间 `2026-09-20T20:41:00`，再结合 `Asia/Shanghai` 形成正式时间。

### 5.3 数值转换

- `2.21 公里` → `2210` 米。
- `00:20:40` → `1240` 秒。
- `9'21\"/公里` → `561` 秒/公里。
- `3,061 步` → `3061`，移除千位分隔符。
- `8.5 米` → `8.5`。
- 保持 OCR 小数精度，不从展示字符串中增加不存在的精度。

### 5.4 忽略内容

- 手机状态栏。
- 返回、编辑、分享图标。
- “轨迹、配速、分段、图表、详情”等标签页文字。
- 没有具体数值的“训练表现”“有氧训练压力”等标题。
- 手机底部系统导航按钮。

## 6. 样例期望结果

固定测试图片：

- 跑步：`tests/fixtures/screenshots/outdoor-running-2026-09-20.jpg`
- 步行：`tests/fixtures/screenshots/outdoor-walking-2026-09-22.jpg`

这两张图片已获得用户授权，可进入版本库并用于识别回归测试。测试不得修改原图。

### 6.1 户外跑步样例

```json
{
  "sportType": "running",
  "startedAt": "2026-09-20T20:41:00+08:00",
  "distanceMeters": 2210,
  "durationSeconds": 1240,
  "caloriesKcal": 181,
  "avgPaceSecondsPerKm": 561,
  "avgSpeedKmh": 6.42,
  "avgCadenceSpm": 148,
  "avgStrideCm": 72,
  "steps": 3061,
  "avgHeartRateBpm": 142,
  "elevationGainMeters": 8.5,
  "elevationLossMeters": 5.8
}
```

### 6.2 户外步行样例

```json
{
  "sportType": "walking",
  "startedAt": "2026-09-22T20:09:00+08:00",
  "distanceMeters": 3030,
  "durationSeconds": 1889,
  "caloriesKcal": 221,
  "avgPaceSecondsPerKm": 623,
  "avgSpeedKmh": 5.77,
  "avgCadenceSpm": 122,
  "avgStrideCm": 78,
  "steps": 3866,
  "avgHeartRateBpm": 120,
  "elevationGainMeters": 7.5,
  "elevationLossMeters": 5.1
}
```

## 7. 交叉校验

识别后执行以下计算，产生警告而不是拒绝用户保存：

### 7.1 距离、时长和配速

```text
expected_pace = duration_seconds / (distance_meters / 1000)
```

识别配速与计算配速相对偏差超过 3% 时，标记 `PACE_MISMATCH`。

### 7.2 距离、时长和速度

```text
expected_speed = (distance_meters / 1000) / (duration_seconds / 3600)
```

识别速度与计算速度相对偏差超过 3% 时，标记 `SPEED_MISMATCH`。

### 7.3 步数和步幅

```text
estimated_distance_meters = steps * avg_stride_cm / 100
```

估算距离与识别距离相对偏差超过 8% 时，标记 `STEP_DISTANCE_MISMATCH`。

### 7.4 基本合理性

第一版仅用于发现明显 OCR 错误，范围应保持宽松：

- 距离必须大于 0，建议警告上限 200 km。
- 时长必须大于 0，建议警告上限 48 小时。
- 平均心率建议警告范围为 30～240 BPM。
- 步频建议警告范围为 20～300 SPM。
- 步幅建议警告范围为 10～300 cm。

合理性警告必须允许用户确认保存，数据库硬约束只阻止无意义的零值和负值。

## 8. 派生值策略

距离和时长是核心基础数据。程序按以下规则计算平均配速和平均速度；提供步数时，同时计算平均步频和平均步幅：

```text
avg_pace_seconds_per_km = duration_seconds / distance_km
avg_speed_kmh = distance_km / duration_hours
avg_cadence_spm = floor(steps / duration_minutes)
avg_stride_cm = round(distance_meters * 100 / steps)
```

手动录入始终使用程序派生值。截图识别也优先使用基础数据派生这四项，避免视觉模型在相邻标签、单位换算或小数点上产生错误；用户仍需在确认页核对结果。
