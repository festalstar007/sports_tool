PRAGMA foreign_keys = ON;

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
  import_id TEXT NOT NULL UNIQUE,
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

CREATE INDEX idx_activities_started_at ON activities(started_at DESC);
CREATE INDEX idx_activities_sport_started_at ON activities(sport_type, started_at DESC);
