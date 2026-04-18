// scripts/migrate-nakanuke.js
// 中抜けカラム追加マイグレーション

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database', 'attendance.db');
const db = new sqlite3.Database(dbPath);

const migrations = [
  // attendance テーブルに中抜け関連カラムを追加
  `ALTER TABLE attendance ADD COLUMN nakanuke_start TIME`,
  `ALTER TABLE attendance ADD COLUMN nakanuke_minutes INTEGER DEFAULT 0`,
  `ALTER TABLE attendance ADD COLUMN nakanuke_reason TEXT`,
  // staff_daily_reports テーブルに中抜けカラムを追加
  `ALTER TABLE staff_daily_reports ADD COLUMN nakanuke_minutes INTEGER DEFAULT 0`
];

console.log('🔧 中抜けカラム追加マイグレーション開始...');

db.serialize(() => {
  migrations.forEach((sql) => {
    db.run(sql, (err) => {
      if (err) {
        if (err.message.includes('duplicate column name')) {
          console.log(`  ⏭ スキップ（既に存在）: ${sql.substring(0, 60)}...`);
        } else {
          console.error(`  ❌ エラー: ${err.message}`);
        }
      } else {
        console.log(`  ✅ 成功: ${sql.substring(0, 60)}...`);
      }
    });
  });
});

db.close((err) => {
  if (err) {
    console.error('データベースクローズエラー:', err);
  } else {
    console.log('✅ マイグレーション完了');
  }
});
