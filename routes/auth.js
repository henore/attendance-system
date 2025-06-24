// routes/auth.js
// 認証ルート - JST統一版

const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { getCurrentDate, getCurrentTime } = require('../utils/date-time');

module.exports = (dbGet, dbAll, dbRun) => {
    
    // ログイン
    router.post('/login', async (req, res) => {
        try {
            const { username, password } = req.body;
            
            if (!username || !password) {
                return res.status(400).json({
                    success: false,
                    error: 'ユーザー名とパスワードを入力してください'
                });
            }
            
            // ユーザー検索
            const user = await dbGet(
                'SELECT * FROM users WHERE username = ? AND is_active = 1',
                [username]
            );
            
            if (!user) {
                return res.status(401).json({
                    success: false,
                    error: 'ユーザー名またはパスワードが正しくありません'
                });
            }
            
            // パスワード検証
            const isValid = await bcrypt.compare(password, user.password);
            
            if (!isValid) {
                return res.status(401).json({
                    success: false,
                    error: 'ユーザー名またはパスワードが正しくありません'
                });
            }
            
            // セッションに保存するユーザー情報
            const sessionUser = {
                id: user.id,
                username: user.username,
                name: user.name,
                role: user.role,
                service_type: user.service_type
            };
            
            // セッション設定
            req.session.user = sessionUser;
            
            // ログイン成功
            console.log(`[ログイン成功] ${user.name}(${user.role}) - ${getCurrentDate()} ${getCurrentTime()}`);
            
            res.json({
                success: true,
                message: 'ログインしました',
                user: sessionUser
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
        try {
            const userName = req.session.user ? req.session.user.name : '不明';
            
            // セッション破棄
            req.session.destroy((err) => {
                if (err) {
                    console.error('セッション破棄エラー:', err);
                    return res.status(500).json({
                        success: false,
                        error: 'ログアウト処理でエラーが発生しました'
                    });
                }
                
                console.log(`[ログアウト] ${userName} - ${getCurrentDate()} ${getCurrentTime()}`);
                
                // クッキークリア
                res.clearCookie('connect.sid');
                
                res.json({
                    success: true,
                    message: 'ログアウトしました'
                });
            });
            
        } catch (error) {
            console.error('ログアウトエラー:', error);
            res.status(500).json({
                success: false,
                error: 'ログアウト処理でエラーが発生しました'
            });
        }
    });
    
    // 認証状態確認
    router.get('/check-auth', (req, res) => {
        if (req.session && req.session.user) {
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
    
    return router;
};