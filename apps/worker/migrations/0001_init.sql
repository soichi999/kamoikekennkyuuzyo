CREATE TABLE family (
  family_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);

CREATE TABLE child (
  child_id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  name TEXT NOT NULL,
  grade TEXT NOT NULL,
  home_lat REAL NOT NULL,
  home_lng REAL NOT NULL,
  school_lat REAL NOT NULL,
  school_lng REAL NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE location (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  at TEXT NOT NULL,
  score INTEGER NOT NULL,
  level TEXT NOT NULL,
  factors TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE daily (
  child_id TEXT NOT NULL,
  date TEXT NOT NULL,
  status TEXT NOT NULL,
  total_score INTEGER,
  level TEXT,
  baseline_score INTEGER,
  diff_from_baseline INTEGER,
  hotspots TEXT,
  summary TEXT,
  stats TEXT,
  generated_at TEXT,
  PRIMARY KEY (child_id, date)
);

CREATE UNIQUE INDEX idx_location_child_at ON location (child_id, at);
CREATE INDEX idx_daily_child_date ON daily (child_id, date);
