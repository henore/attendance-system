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

// Express アプリケーション作成
const app = express();
const PORT = process.env.PORT || 3000;

// プロキシ経由のクライアントIP取得を有効化
app.set('trust proxy', true);

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

// セキュリティ強化ミドルウェア設定
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
            fontSrc: ["'self'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://holidays-jp.github.io"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
        },
    },
    crossOriginEmbedderPolicy: false, // 互換性のため
    hsts: {
        maxAge: 31536000, // 1年
        includeSubDomains: true,
        preload: true
    },
    noSniff: true,
    frameguard: { action: 'deny' },
    xssFilter: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
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
const trialVisitsRouter = require('./routes/trial-visits')(dbGet, dbAll, dbRun, requireAuth, requireRole);
const lineRouter = require('./routes/line');
const holidaysRouter = require('./routes/holidays')(requireAuth);

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
app.use('/api/trial-visits', requireAuth, requireRole(['staff', 'admin']), trialVisitsRouter);
app.use('/api/line', requireAuth, lineRouter); 
app.use('/api/holidays', holidaysRouter);

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

    // 通所者の休憩自動打刻（11:46 JSTに実行）
    let lastAutoBreakDate = null;
    setInterval(async () => {
        const now = getCurrentTime();
        const today = getCurrentDate();
        if (now >= '11:46' && now < '11:47' && lastAutoBreakDate !== today) {
            lastAutoBreakDate = today;
            try {
                const inserted = await dbAll(`
                    SELECT u.id, u.name FROM users u
                    JOIN attendance a ON u.id = a.user_id AND a.date = ?
                    LEFT JOIN break_records br ON u.id = br.user_id AND br.date = ?
                    WHERE u.role = 'user' AND u.service_type = 'commute'
                      AND u.is_active = 1
                      AND a.clock_in IS NOT NULL AND a.clock_out IS NULL
                      AND br.id IS NULL
                `, [today, today]);

                for (const user of inserted) {
                    await dbRun(`
                        INSERT INTO break_records (user_id, date, start_time, end_time, duration)
                        VALUES (?, ?, '11:30', '12:30', 60)
                    `, [user.id, today]);
                }

                if (inserted.length > 0) {
                    console.log(`[自動休憩] ${today} ${inserted.length}名の通所者に休憩を自動記録: ${inserted.map(u => u.name).join(', ')}`);
                }
            } catch (error) {
                console.error('[自動休憩] エラー:', error);
            }
        }
    }, 30000);
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
