// routes/handover.js（権限チェック修正版）
const express = require('express');
const router = express.Router();

module.exports = (dbGet, dbAll, dbRun, requireAuth) => {
  
  // 申し送り事項取得（スタッフ・管理者のみ）
  router.get('/handover', requireAuth, async (req, res) => {
    try {
      // 権限チェック
      if (!['staff', 'admin'].includes(req.session.user.role)) {
        return res.status(403).json({ 
          success: false, 
          error: '権限がありません' 
        });
      }

      const handover = await dbGet(
        'SELECT * FROM handover_notes ORDER BY id DESC LIMIT 1'
      );
      
      res.json({ 
        success: true, 
        handover: handover || { content: '', updated_by: null, created_at: null }
      });
    } catch (error) {
      console.error('申し送り取得エラー:', error);
      res.status(500).json({ 
        success: false, 
        error: '申し送り事項の取得に失敗しました' 
      });
    }
  });

  // 申し送り事項更新（スタッフ・管理者のみ）
  router.post('/handover', requireAuth, async (req, res) => {
    try {
      // 権限チェック
      if (!['staff', 'admin'].includes(req.session.user.role)) {
        return res.status(403).json({ 
          success: false, 
          error: '権限がありません' 
        });
      }

      const { content } = req.body;
      
      if (!content || !content.trim()) {
        return res.status(400).json({ 
          success: false, 
          error: '申し送り事項を入力してください' 
        });
      }

      // 最新の申し送りを取得
      const latestHandover = await dbGet(
        'SELECT * FROM handover_notes ORDER BY id DESC LIMIT 1'
      );

      // 5分以内の更新制限チェック
      if (latestHandover) {
        const lastUpdate = new Date(latestHandover.created_at);
        const now = new Date();
        const diffMinutes = (now - lastUpdate) / (1000 * 60);
        
        if (diffMinutes < 5 && latestHandover.updated_by !== req.session.user.name) {
          return res.status(400).json({ 
            success: false, 
            error: '他のユーザーが更新してから5分間は更新できません' 
          });
        }
      }

      // 新しい申し送りを追加
      await dbRun(
        'INSERT INTO handover_notes (content, updated_by) VALUES (?, ?)',
        [content.trim(), req.session.user.name]
      );

      res.json({ 
        success: true, 
        message: '申し送り事項を更新しました' 
      });
      
    } catch (error) {
      console.error('申し送り更新エラー:', error);
      res.status(500).json({ 
        success: false, 
        error: '申し送り事項の更新に失敗しました' 
      });
    }
  });

  return router;
};