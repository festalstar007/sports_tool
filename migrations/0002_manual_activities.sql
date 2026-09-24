DROP INDEX IF EXISTS idx_activities_started_at;
DROP INDEX IF EXISTS idx_activities_sport_started_at;

ALTER TABLE activities RENAME TO activities_before_manual_entry;

CREATE TABLE activities (
  id TEXT PRIMARY KEY,
  import_id TEXT UNIQUE,
  source_type TEXT NOT NULL DEFAULT 'screenshot' CHECK (source_type IN ('screenshot', 'manual')),
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

INSERT INTO activities (
  id, import_id, source_type, sport_type, started_at, timezone, distance_meters,
  duration_seconds, calories_kcal, avg_pace_seconds_per_km, avg_speed_kmh,
  avg_cadence_spm, avg_stride_cm, steps, avg_heart_rate_bpm,
  elevation_gain_meters, elevation_loss_meters, validation_warnings_json,
  created_at, updated_at
)
SELECT
  id, import_id, 'screenshot', sport_type, started_at, timezone, distance_meters,
  duration_seconds, calories_kcal, avg_pace_seconds_per_km, avg_speed_kmh,
  avg_cadence_spm, avg_stride_cm, steps, avg_heart_rate_bpm,
  elevation_gain_meters, elevation_loss_meters, validation_warnings_json,
  created_at, updated_at
FROM activities_before_manual_entry;

DROP TABLE activities_before_manual_entry;

CREATE INDEX idx_activities_started_at ON activities(started_at DESC);
CREATE INDEX idx_activities_sport_started_at ON activities(sport_type, started_at DESC);
