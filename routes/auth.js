// routes/auth.js
// 認証関連のルート（デバッグ版）

const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();

module.exports = (dbGet, dbAll, dbRun) => {
    // ログイン
    router.post('/login', async (req, res) => {
        console.log('🔑 ログイン試行開始');
        
        try {
            const { username, password } = req.body;
            
            if (!username || !password) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'ユーザーIDとパスワードを入力してください' 
                });
            }
            
            // セッションリセット（既存セッションがある場合）
            if (req.session.user) {
                await new Promise((resolve, reject) => {
                    req.session.regenerate((err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
            }
            
            // ユーザー取得（リトライ付き）
            let user = null;
            let retryCount = 0;
            const maxRetries = 3;
            
            while (!user && retryCount < maxRetries) {
                try {
                    user = await dbGet(
                        'SELECT * FROM users WHERE username = ? AND is_active = 1',
                        [username]
                    );
                    break;
                } catch (dbError) {
                    console.error(`データベースエラー (試行 ${retryCount + 1}):`, dbError);
                    retryCount++;
                    if (retryCount < maxRetries) {
                        await new Promise(resolve => setTimeout(resolve, 1000)); // 1秒待機
                    }
                }
            }
            
            if (!user) {
                return res.status(401).json({ 
                    success: false, 
                    error: 'ユーザーIDまたはパスワードが正しくありません' 
                });
            }
            
            // パスワード検証
            const isValid = await bcrypt.compare(password, user.password);
            
            if (!isValid) {
                return res.status(401).json({ 
                    success: false, 
                    error: 'ユーザーIDまたはパスワードが正しくありません' 
                });
            }
            
            // セッション設定
            req.session.user = {
                id: user.id,
                username: user.username,
                name: user.name,
                role: user.role,
                service_type: user.service_type
            };
            
            // セッション保存を明示的に実行
            await new Promise((resolve, reject) => {
                req.session.save((err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
            
            console.log('✅ ログイン成功:', req.session.user);
            
            res.json({ 
                success: true,
                user: req.session.user,
                message: 'ログインしました'
            });
            
        } catch (error) {
            console.error('❌ ログインエラー詳細:', error);
            res.status(500).json({ 
                success: false, 
                error: 'ログイン処理でエラーが発生しました',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    });
    
    // ログアウト
    router.post('/logout', (req, res) => {
        console.log('🚪 ログアウト試行');
        req.session.destroy((err) => {
            if (err) {
                console.error('ログアウトエラー:', err);
                return res.status(500).json({ 
                    success: false, 
                    error: 'ログアウト処理でエラーが発生しました' 
                });
            }
            
            console.log('✅ ログアウト成功');
            res.json({ 
                success: true,
                message: 'ログアウトしました'
            });
        });
    });
    
    // 認証チェック
    router.get('/auth-check', (req, res) => {
        console.log('🔍 認証チェック:', req.session.user ? '認証済み' : '未認証');
        if (req.session.user) {
            res.json({ 
                authenticated: true,
                user: req.session.user
            });
        } else {
            res.json({ 
                authenticated: false 
            });
        }
    });
    
    return router;
};