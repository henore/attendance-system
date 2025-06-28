// server.js
// Node.js Express サーバー - JST統一版
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const morgan = require('morgan');
const helmet = require('helmet');
const cors = require('cors');
const { getCurrentDate, getCurrentTime } = require('./utils/date-time');

const lineRoutes = require('./routes/line');

// LINEルートをマウント
app.use('/api/line', lineRoutes);

// 静的ファイル配信の設定（画像アクセス用）
app.use('/temp', express.static(path.join(__dirname, 'public/temp')));

console.log('✅ LINE Messaging API ルートを追加しました');

// Express アプリケーション作成
const app = express();
const PORT = process.env.PORT || 3000;

// CORS設定
app.use(cors({
  origin: 'https://happytime-web.com',
  credentials: true,
}));

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
const authRouter = require('./routes/auth')(dbGet, dbAll, dbRun);
const userRouter = require('./routes/user')(dbGet, dbAll, dbRun, requireAuth);
const staffRouter = require('./routes/staff')(dbGet, dbAll, dbRun, requireAuth, requireRole);
const adminRouter = require('./routes/admin')(dbGet, dbAll, dbRun, requireAuth, requireRole);
const attendanceRouter = require('./routes/attendance')(dbGet, dbAll, dbRun, requireAuth);
const handoverRouter = require('./routes/handover')(dbGet, dbAll, dbRun, requireAuth);

// 認証チェック用エンドポイント（認証前でもアクセス可能）
app.get('/api/auth/check-auth', (req, res) => {
  if (req.session.user) {
    res.json({
      success: true,
      authenticated: true,
      user: req.session.user
    });
  } else {
    res.json({
      success: true,
      authenticated: false
    });
  }
});

// APIルート登録
app.use('/api/auth', authRouter);
app.use('/api/user', requireAuth, userRouter);
app.use('/api/staff', requireAuth, requireRole(['staff', 'admin']), staffRouter);
app.use('/api/admin', requireAuth, requireRole(['admin']), adminRouter);
app.use('/api/attendance', requireAuth, attendanceRouter);
app.use('/api/handover', requireAuth, handoverRouter);

// サーバー日付取得エンドポイント（JST統一モジュール使用）
app.get('/api/server-date', requireAuth, (req, res) => {
  res.json({
    success: true,
    serverDate: getCurrentDate(),
    serverTime: getCurrentTime()
  });
});

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
    console.log(`📅 サーバー日時(JST): ${getCurrentDate()} ${getCurrentTime()}`);
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