// routes/auth.js
// 認証関連のルート（デバッグ版）

const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();

module.exports = (dbGet, dbAll, dbRun) => {
    // ログイン
    router.post('/login', async (req, res) => {
        console.log('🔑 ログイン試行開始');
        console.log('リクエストボディ:', req.body);
        
        try {
            const { username, password } = req.body;
            
            console.log('📝 受信データ:', { username, password: password ? '***' : 'なし' });
            
            if (!username || !password) {
                console.log('❌ バリデーションエラー: 必須項目不足');
                return res.status(400).json({ 
                    success: false, 
                    error: 'ユーザーIDとパスワードを入力してください' 
                });
            }
            
            console.log('🔍 データベース検索開始');
            
            // ユーザー取得
            const user = await dbGet(
                'SELECT * FROM users WHERE username = ? AND is_active = 1',
                [username]
            );
            
            console.log('👤 ユーザー検索結果:', user ? '見つかりました' : '見つかりません');
            
            if (!user) {
                console.log('❌ ユーザーが見つからない');
                return res.status(401).json({ 
                    success: false, 
                    error: 'ユーザーIDまたはパスワードが正しくありません' 
                });
            }
            
            console.log('🔐 パスワード検証開始');
            
            // パスワード検証
            const isValid = await bcrypt.compare(password, user.password);
            
            console.log('🔐 パスワード検証結果:', isValid ? '正しい' : '間違っている');
            
            if (!isValid) {
                console.log('❌ パスワードが間違っている');
                return res.status(401).json({ 
                    success: false, 
                    error: 'ユーザーIDまたはパスワードが正しくありません' 
                });
            }
            
            console.log('📋 セッション設定開始');
            
            // セッション設定
            req.session.user = {
                id: user.id,
                username: user.username,
                name: user.name,
                role: user.role,
                service_type: user.service_type
            };
            
            console.log('✅ ログイン成功:', req.session.user);
            
            res.json({ 
                success: true,
                user: req.session.user,
                message: 'ログインしました'
            });
            
        } catch (error) {
            console.error('❌ ログインエラー詳細:', error);
            console.error('エラースタック:', error.stack);
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