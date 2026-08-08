// scripts/migrate-audit-target-name.js
// 監査ログにtarget_nameカラム追加＋既存データのバックフィル

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database', 'attendance.db');
const db = new sqlite3.Database(dbPath);

const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function(err) {
    if (err) reject(err);
    else resolve(this);
  });
});

const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => {
    if (err) reject(err);
    else resolve(rows);
  });
});

async function migrate() {
  console.log('監査ログ target_name カラム追加マイグレーション開始...');

  // カラム追加
  try {
    await dbRun('ALTER TABLE audit_log ADD COLUMN target_name TEXT');
    console.log('  target_name カラム追加完了');
  } catch (err) {
    if (err.message.includes('duplicate column name')) {
      console.log('  スキップ（既に存在）');
    } else {
      throw err;
    }
  }

  // 既存データのバックフィル: target_type='user' → usersテーブルから直接取得
  const r1 = await dbRun(`
    UPDATE audit_log SET target_name = (
      SELECT u.name FROM users u WHERE u.id = audit_log.target_id
    ) WHERE target_type = 'user' AND target_name IS NULL AND target_id IS NOT NULL
  `);
  console.log(`  target_type=user: ${r1.changes}件 更新`);

  // 既存データのバックフィル: target_type='attendance' → JSONからuser_id取得してusersテーブル参照
  const r2 = await dbRun(`
    UPDATE audit_log SET target_name = (
      SELECT u.name FROM users u WHERE u.id = CAST(COALESCE(
        json_extract(audit_log.old_value, '$.user_id'),
        json_extract(audit_log.new_value, '$.user_id')
      ) AS INTEGER)
    ) WHERE target_type = 'attendance' AND target_name IS NULL
      AND (json_extract(old_value, '$.user_id') IS NOT NULL OR json_extract(new_value, '$.user_id') IS NOT NULL)
  `);
  console.log(`  target_type=attendance (JSON user_id): ${r2.changes}件 更新`);

  // 残り: attendanceテーブルからJOIN
  const r3 = await dbRun(`
    UPDATE audit_log SET target_name = (
      SELECT u.name FROM attendance a JOIN users u ON a.user_id = u.id WHERE a.id = audit_log.target_id
    ) WHERE target_type = 'attendance' AND target_name IS NULL AND target_id IS NOT NULL
  `);
  console.log(`  target_type=attendance (JOINフォールバック): ${r3.changes}件 更新`);

  // 結果確認
  const remaining = await dbAll(
    'SELECT id, action_type, target_type, target_id FROM audit_log WHERE target_name IS NULL AND target_id IS NOT NULL'
  );
  if (remaining.length > 0) {
    console.log(`  ${remaining.length}件の未解決レコードあり:`);
    remaining.forEach(r => console.log(`    ID:${r.id} ${r.action_type} ${r.target_type}(${r.target_id})`));
  } else {
    console.log('  全レコードの名前解決完了');
  }

  console.log('マイグレーション完了');
}

migrate()
  .catch(err => console.error('マイグレーションエラー:', err))
  .finally(() => db.close());
