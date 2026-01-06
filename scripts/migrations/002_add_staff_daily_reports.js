// scripts/migrations/002_add_staff_daily_reports.js
// スタッフ日報テーブル追加マイグレーション

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', '..', 'database', 'attendance.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  console.log('🔧 スタッフ日報テーブルを追加中...');

  // スタッフ日報テーブル
  db.run(`
    CREATE TABLE IF NOT EXISTS staff_daily_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      staff_id INTEGER NOT NULL,
      date DATE NOT NULL,
      work_report TEXT NOT NULL,
      communication TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (staff_id) REFERENCES users(id),
      UNIQUE(staff_id, date)
    )
  `, (err) => {
    if (err) {
      console.error('❌ スタッフ日報テーブル作成エラー:', err);
    } else {
      console.log('✅ スタッフ日報テーブル作成完了');
    }
  });

  // インデックス追加
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_staff_daily_reports_staff_date
    ON staff_daily_reports(staff_id, date)
  `, (err) => {
    if (err) {
      console.error('❌ インデックス作成エラー:', err);
    } else {
      console.log('✅ インデックス作成完了');
    }
  });
});

db.close((err) => {
  if (err) {
    console.error('❌ データベースクローズエラー:', err);
  } else {
    console.log('✅ マイグレーション完了');
  }
});
