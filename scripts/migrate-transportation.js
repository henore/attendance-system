// scripts/migrate-transportation.js
// 本番環境用: カラム追加マイグレーション

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database', 'attendance.db');
const db = new sqlite3.Database(dbPath);

const migrations = [
    { table: 'users', name: 'transportation', sql: 'ALTER TABLE users ADD COLUMN transportation INTEGER' },
    { table: 'users', name: 'workweek', sql: 'ALTER TABLE users ADD COLUMN workweek TEXT' },
    { table: 'attendance', name: 'service_type', sql: 'ALTER TABLE attendance ADD COLUMN service_type TEXT' },
    { table: 'daily_reports', name: 'work_location', sql: 'ALTER TABLE daily_reports ADD COLUMN work_location TEXT' },
    { table: 'daily_reports', name: 'pc_number', sql: 'ALTER TABLE daily_reports ADD COLUMN pc_number TEXT' }
];

// テーブルのカラム一覧を取得
function getColumns(table) {
    return new Promise((resolve, reject) => {
        db.all(`PRAGMA table_info(${table})`, (err, rows) => {
            if (err) reject(err);
            else resolve(rows.map(r => r.name));
        });
    });
}

// ALTER TABLE実行
function runMigration(sql) {
    return new Promise((resolve, reject) => {
        db.run(sql, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

async function migrate() {
    console.log(`対象DB: ${dbPath}`);
    console.log('マイグレーション開始...\n');

    // テーブルごとのカラム一覧をキャッシュ
    const columnCache = {};

    for (const { table, name, sql } of migrations) {
        if (!columnCache[table]) {
            columnCache[table] = await getColumns(table);
        }

        if (columnCache[table].includes(name)) {
            console.log(`  [スキップ] ${table}.${name} - 既に存在`);
        } else {
            try {
                await runMigration(sql);
                columnCache[table].push(name);
                console.log(`  [追加] ${table}.${name}`);
            } catch (err) {
                console.error(`  [エラー] ${table}.${name}: ${err.message}`);
            }
        }
    }

    console.log('\nマイグレーション完了');
    db.close();
}

migrate().catch(err => {
    console.error('マイグレーションエラー:', err);
    db.close();
});
