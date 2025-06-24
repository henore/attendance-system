// routes/handover.js
// 申し送りルート - JST統一版

const express = require('express');
const router = express.Router();
const { getHandoverDateTime } = require('../utils/date-time');

module.exports = (dbGet, dbAll, dbRun, requireAuth) => {
  
  // 申し送り事項取得（スタッフ・管理者のみ）
  router.get('/', requireAuth, async (req, res) => {
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
  router.post('/', requireAuth, async (req, res) => {
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

      // 既存の内容がある場合、空白での上書きを防ぐ
      if (latestHandover && latestHandover.content && !content.trim()) {
        return res.status(400).json({ 
          success: false, 
          error: '申し送り事項を空にすることはできません' 
        });
      }

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

      // JST統一モジュールから日本時間を取得
      const formattedTime = getHandoverDateTime();

      // 記入者情報を内容に追記（改行なし）
      const contentWithAuthor = `${content.trim()} - ${req.session.user.name} (${formattedTime})`;

      // 新しい申し送りを追加
      await dbRun(
        'INSERT INTO handover_notes (content, updated_by) VALUES (?, ?)',
        [contentWithAuthor, req.session.user.name]
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