// routes/auth.js
// 認証関連のルート

const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();

module.exports = (dbGet, dbAll, dbRun) => {
    // ログイン
    router.post('/login', async (req, res) => {
        try {
            const { username, password } = req.body;
            
            if (!username || !password) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'ユーザーIDとパスワードを入力してください' 
                });
            }
            
            // ユーザー取得
            const user = await dbGet(
                'SELECT * FROM users WHERE username = ? AND is_active = 1',
                [username]
            );
            
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
            
            res.json({ 
                success: true,
                user: req.session.user,
                message: 'ログインしました'
            });
            
        } catch (error) {
            console.error('ログインエラー:', error);
            res.status(500).json({ 
                success: false, 
                error: 'ログイン処理でエラーが発生しました' 
            });
        }
    });
    
    // ログアウト
    router.post('/logout', (req, res) => {
        req.session.destroy((err) => {
            if (err) {
                console.error('ログアウトエラー:', err);
                return res.status(500).json({ 
                    success: false, 
                    error: 'ログアウト処理でエラーが発生しました' 
                });
            }
            
            res.json({ 
                success: true,
                message: 'ログアウトしました'
            });
        });
    });
    
    // 認証チェック
    router.get('/auth-check', (req, res) => {
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