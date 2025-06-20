// routes/auth.js
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
          error: 'ユーザー名とパスワードを入力してください' 
        });
      }
      
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
      
      const isValid = await bcrypt.compare(password, user.password);
      
      if (!isValid) {
        return res.status(401).json({ 
          success: false, 
          error: 'ユーザー名またはパスワードが正しくありません' 
        });
      }
      
      // セッションに保存
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
        error: 'ログイン処理に失敗しました' 
      });
    }
  });
  
  // ログアウト
  router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error('セッション破棄エラー:', err);
        return res.status(500).json({ 
          success: false, 
          error: 'ログアウトに失敗しました' 
        });
      }
      
      res.json({ 
        success: true, 
        message: 'ログアウトしました' 
      });
    });
  });
  
  return router;
};