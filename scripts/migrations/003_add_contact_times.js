// scripts/migrations/003_add_contact_times.js
// 日報テーブルに連絡時間カラム追加マイグレーション

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', '..', 'database', 'attendance.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  console.log('🔧 日報テーブルに連絡時間カラムを追加中...');

  // 連絡時間1回目
  db.run(`ALTER TABLE daily_reports ADD COLUMN contact_time_1 TIME`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('❌ contact_time_1 追加エラー:', err);
    } else {
      console.log('✅ contact_time_1 カラム追加完了');
    }
  });

  // 連絡時間2回目
  db.run(`ALTER TABLE daily_reports ADD COLUMN contact_time_2 TIME`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('❌ contact_time_2 追加エラー:', err);
    } else {
      console.log('✅ contact_time_2 カラム追加完了');
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
