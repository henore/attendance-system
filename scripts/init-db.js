// scripts/init-db.js
// データベース初期化スクリプト

const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

// データベースディレクトリ作成
const dbDir = path.join(__dirname, '..', 'database');
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

// データベース作成
const db = new sqlite3.Database(path.join(dbDir, 'attendance.db'));

// パスワードハッシュ化
const hashPassword = (password) => {
    return bcrypt.hashSync(password, 10);
};

// 強力なランダムパスワード生成
const generateSecurePassword = (length = 16) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < length; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
};

db.serialize(() => {
    console.log('🔧 データベース初期化開始...');

    // ユーザーテーブル
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            name TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('user', 'staff', 'admin')),
            service_type TEXT CHECK(service_type IN ('commute', 'home')),
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            service_no VARCHAR(255)
        )
    `);

    // 出勤記録テーブル
    db.run(`
        CREATE TABLE IF NOT EXISTS attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            date DATE NOT NULL,
            clock_in TIME,
            clock_out TIME,
            break_start TIME,
            break_end TIME,
            status TEXT DEFAULT 'normal' CHECK(status IN ('normal', 'late', 'early', 'absence', 'paid_leave')),
            has_report INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            UNIQUE(user_id, date)
        )
    `);

    // 日報テーブル
    db.run(`
        CREATE TABLE IF NOT EXISTS daily_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            date DATE NOT NULL,
            work_content TEXT NOT NULL,
            temperature REAL,
            appetite TEXT CHECK(appetite IN ('good', 'none')),
            medication_time INTEGER,
            bedtime TIME,
            wakeup_time TIME,
            sleep_quality TEXT CHECK(sleep_quality IN ('good', 'poor', 'bad')),
            reflection TEXT,
            interview_request TEXT CHECK(interview_request IN ('consultation', 'interview')),
            contact_time_1 TIME,
            contact_time_2 TIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            UNIQUE(user_id, date)
        )
    `);

    // スタッフコメントテーブル
    db.run(`
        CREATE TABLE IF NOT EXISTS staff_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            staff_id INTEGER NOT NULL,
            date DATE NOT NULL,
            comment TEXT NOT NULL,
            is_read INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (staff_id) REFERENCES users(id),
            UNIQUE(user_id, date)
        )
    `);

    // 休憩記録テーブル
    db.run(`
        CREATE TABLE IF NOT EXISTS break_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            date DATE NOT NULL,
            start_time TIME NOT NULL,
            end_time TIME,
            duration INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    // 申し送り事項テーブル
    db.run(`
        CREATE TABLE IF NOT EXISTS handover_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT NOT NULL,
            updated_by TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 監査ログテーブル
    db.run(`
        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            admin_id INTEGER NOT NULL,
            action_type TEXT NOT NULL,
            target_id INTEGER,
            target_type TEXT,
            old_value TEXT,
            new_value TEXT,
            reason TEXT,
            ip_address TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (admin_id) REFERENCES users(id)
        )
    `);

    // 稟議申請テーブル
    db.run(`
        CREATE TABLE IF NOT EXISTS approval_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            amount REAL,
            attachment_path TEXT,
            urgency TEXT NOT NULL DEFAULT 'normal' CHECK(urgency IN ('normal', 'urgent')),
            status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'pending', 'approved', 'rejected', 'completed')),
            staff_id INTEGER NOT NULL,
            admin_id INTEGER,
            rejection_reason TEXT,
            submitted_at DATETIME,
            reviewed_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (staff_id) REFERENCES users(id),
            FOREIGN KEY (admin_id) REFERENCES users(id)
        )
    `);

    // インデックス作成
    db.run(`CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON attendance(user_id, date)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_daily_reports_user_date ON daily_reports(user_id, date)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_staff_comments_user_date ON staff_comments(user_id, date)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_approval_requests_staff_id ON approval_requests(staff_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON approval_requests(status)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_approval_requests_created_at ON approval_requests(created_at)`);

    // デフォルトユーザー作成（セキュアなランダムパスワード）
    const adminPassword = generateSecurePassword(20);
    const staffPassword = generateSecurePassword(16);
    const user1Password = generateSecurePassword(16);
    const user2Password = generateSecurePassword(16);
    
    const defaultUsers = [
        { username: 'admin', password: adminPassword, name: '管理者', role: 'admin' },
        { username: 'staff1', password: staffPassword, name: 'スタッフ1', role: 'staff' },
        { username: 'user1', password: user1Password, name: '利用者1', role: 'user', service_type: 'commute' },
        { username: 'user2', password: user2Password, name: '利用者2', role: 'user', service_type: 'home' }
    ];

    const stmt = db.prepare(`
        INSERT OR IGNORE INTO users (username, password, name, role, service_type) 
        VALUES (?, ?, ?, ?, ?)
    `);

    defaultUsers.forEach(user => {
        stmt.run(
            user.username,
            hashPassword(user.password),
            user.name,
            user.role,
            user.service_type || null
        );
    });

    stmt.finalize();

    // 初期申し送り事項
    db.run(`
        INSERT OR IGNORE INTO handover_notes (content, updated_by) 
        VALUES ('システムを開始しました。', 'システム')
    `);

    // パスワードを安全なファイルに保存
    const credentialsPath = path.join(dbDir, 'initial-credentials.txt');
    const credentialsContent = [
        '=================================================',
        '          初期ユーザー認証情報',
        '=================================================',
        '',
        '⚠️  セキュリティ上重要: このファイルは初回ログイン後に削除してください',
        '',
        `管理者    : admin     / ${adminPassword}`,
        `スタッフ  : staff1    / ${staffPassword}`,
        `利用者1   : user1     / ${user1Password} (通所)`,
        `利用者2   : user2     / ${user2Password} (在宅)`,
        '',
        '=================================================',
        '初回ログイン後は必ずパスワードを変更してください',
        '=================================================',
        ''
    ].join('\n');
    
    fs.writeFileSync(credentialsPath, credentialsContent, 'utf8');

    console.log('✅ データベース初期化完了');
    console.log('\n🔐 セキュリティ情報:');
    console.log(`   初期認証情報: ${credentialsPath}`);
    console.log('   ⚠️  初回ログイン後にパスワードを変更し、認証情報ファイルを削除してください');
});

db.close((err) => {
    if (err) {
        console.error('データベースクローズエラー:', err);
    } else {
        console.log('\n✅ データベース接続を閉じました');
    }
});