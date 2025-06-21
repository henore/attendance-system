// routes/handover.js（削除機能追加版）
const express = require('express');
const router = express.Router();

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
        'SELECT * FROM handover_notes WHERE is_deleted = 0 ORDER BY id DESC LIMIT 1'
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
        'SELECT * FROM handover_notes WHERE is_deleted = 0 ORDER BY id DESC LIMIT 1'
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

      // 現在の時刻を取得（日本時間）
      const now = new Date();
      const japanTime = new Date(now.getTime() + (9 * 60 * 60 * 1000));
      const timeString = japanTime.toISOString().slice(11, 16); // HH:MM形式
      
      // 改行を含む内容をフォーマット
      const formattedContent = `${content.trim()} (${timeString} ${req.session.user.name})`;

      // 新しい申し送りを追加
      await dbRun(
        'INSERT INTO handover_notes (content, updated_by, is_deleted) VALUES (?, ?, 0)',
        [formattedContent, req.session.user.name]
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

  // 申し送り事項削除（新規追加）
  router.delete('/', requireAuth, async (req, res) => {
    try {
      // 権限チェック
      if (!['staff', 'admin'].includes(req.session.user.role)) {
        return res.status(403).json({ 
          success: false, 
          error: '権限がありません' 
        });
      }

      // 最新の申し送りを取得
      const latestHandover = await dbGet(
        'SELECT * FROM handover_notes WHERE is_deleted = 0 ORDER BY id DESC LIMIT 1'
      );

      if (!latestHandover) {
        return res.status(404).json({ 
          success: false, 
          error: '削除する申し送り事項がありません' 
        });
      }

      // 論理削除
      await dbRun(
        'UPDATE handover_notes SET is_deleted = 1 WHERE id = ?',
        [latestHandover.id]
      );

      // 削除記録を作成
      const now = new Date();
      const japanTime = new Date(now.getTime() + (9 * 60 * 60 * 1000));
      const timeString = japanTime.toISOString().slice(11, 16);
      
      const deleteMessage = `【削除】前回の申し送りを削除しました (${timeString} ${req.session.user.name})`;
      
      await dbRun(
        'INSERT INTO handover_notes (content, updated_by, is_deleted) VALUES (?, ?, 0)',
        [deleteMessage, req.session.user.name]
      );

      res.json({ 
        success: true, 
        message: '申し送り事項を削除しました' 
      });
      
    } catch (error) {
      console.error('申し送り削除エラー:', error);
      res.status(500).json({ 
        success: false, 
        error: '申し送り事項の削除に失敗しました' 
      });
    }
  });

  return router;
};