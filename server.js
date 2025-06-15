// server.js
// Node.js Express サーバー

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const morgan = require('morgan');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

// Express アプリケーション作成
const app = express();
const PORT = process.env.PORT || 3000;

// データベース接続
const db = new sqlite3.Database('./database/attendance.db', (err) => {
    if (err) {
        console.error('データベース接続エラー:', err);
        process.exit(1);
    }
    console.log('✅ SQLiteデータベースに接続しました');
});

// データベースヘルパー関数
const dbGet = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

const dbAll = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

const dbRun = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve({ id: this.lastID, changes: this.changes });
        });
    });
};

// ミドルウェア設定
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
            fontSrc: ["'self'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:"],
        },
    },
}));

app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
}));

app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静的ファイル配信（Content-Typeの設定）
app.use(express.static('public', {
    setHeaders: (res, path) => {
        if (path.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        } else if (path.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        }
    }
}));

// セッション設定
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24 // 24時間
    }
}));

// レート制限
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15分
    max: 100 // リクエスト数
});

app.use('/api/', limiter);

// 認証ミドルウェア
const requireAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: '認証が必要です' });
    }
    next();
};

// 権限チェックミドルウェア
const requireRole = (roles) => {
    return (req, res, next) => {
        if (!req.session.user || !roles.includes(req.session.user.role)) {
            return res.status(403).json({ success: false, error: '権限がありません' });
        }
        next();
    };
};

// ルート設定
const authRoutes = require('./routes/auth')(dbGet, dbAll, dbRun);
const userRoutes = require('./routes/user')(dbGet, dbAll, dbRun, requireAuth);
const staffRoutes = require('./routes/staff')(dbGet, dbAll, dbRun, requireAuth, requireRole);
const adminRoutes = require('./routes/admin')(dbGet, dbAll, dbRun, requireAuth, requireRole);
const attendanceRoutes = require('./routes/attendance')(dbGet, dbAll, dbRun, requireAuth);
const handoverRoutes = require('./routes/handover')(dbGet, dbAll, dbRun, requireAuth, requireRole);

// APIルート登録
app.use('/api', authRoutes);
app.use('/api/user', requireAuth, userRoutes);
app.use('/api/staff', requireAuth, requireRole(['staff', 'admin']), staffRoutes);
app.use('/api/admin', requireAuth, requireRole(['admin']), adminRoutes);
app.use('/api/attendance', requireAuth, attendanceRoutes);
app.use('/api', handoverRoutes);

// SPAのためのフォールバック
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// エラーハンドリングミドルウェア
app.use((err, req, res, next) => {
    console.error('エラー:', err.stack);
    res.status(500).json({
        success: false,
        error: process.env.NODE_ENV === 'production' 
            ? 'サーバーエラーが発生しました' 
            : err.message
    });
});

// サーバー起動
app.listen(PORT, () => {
    console.log(`🚀 サーバー起動: http://localhost:${PORT}`);
    console.log(`📊 環境: ${process.env.NODE_ENV || 'development'}`);
});

// プロセス終了時の処理
process.on('SIGINT', () => {
    console.log('\n🛑 サーバーを停止します...');
    db.close((err) => {
        if (err) {
            console.error('データベースクローズエラー:', err);
        } else {
            console.log('✅ データベース接続を閉じました');
        }
        process.exit(0);
    });
});