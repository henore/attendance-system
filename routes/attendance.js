// routes/attendance.js
// 共通の出勤管理ルート

const express = require('express');
const router = express.Router();

module.exports = (dbGet, dbAll, dbRun, requireAuth) => {
  
  // 今日の出勤状況取得
  router.get('/today', async (req, res) => {
    try {
      const userId = req.session.user.id;
      const today = new Date().toISOString().split('T')[0];
      
      const attendance = await dbGet(
        'SELECT * FROM attendance WHERE user_id = ? AND date = ?',
        [userId, today]
      );
      
      res.json({ 
        success: true, 
        attendance: attendance || null 
      });
    } catch (error) {
      console.error('出勤状況取得エラー:', error);
      res.status(500).json({ 
        success: false, 
        error: '出勤状況の取得に失敗しました' 
      });
    }
  });
  
  // 出勤処理（全ロール共通）
  router.post('/clock-in', async (req, res) => {
    try {
      const userId = req.session.user.id;
      const today = new Date().toISOString().split('T')[0];
      const currentTime = new Date().toTimeString().slice(0, 5);
      
      // 既存の出勤記録確認
      const existing = await dbGet(
        'SELECT * FROM attendance WHERE user_id = ? AND date = ?',
        [userId, today]
      );
      
      if (existing) {
        return res.status(400).json({ 
          success: false, 
          error: '既に出勤しています' 
        });
      }
      
      // 出勤記録作成
      const result = await dbRun(
        'INSERT INTO attendance (user_id, date, clock_in) VALUES (?, ?, ?)',
        [userId, today, currentTime]
      );
      
      const attendance = await dbGet(
        'SELECT * FROM attendance WHERE id = ?',
        [result.id]
      );
      
      res.json({
        success: true,
        message: '出勤しました',
        attendance: attendance,
        time: currentTime
      });
      
    } catch (error) {
      console.error('出勤処理エラー:', error);
      res.status(500).json({ 
        success: false, 
        error: '出勤処理に失敗しました' 
      });
    }
  });
  
  // 退勤処理（利用者用 - スタッフは別ルート）
  router.post('/clock-out', async (req, res) => {
    try {
      const userId = req.session.user.id;
      const userRole = req.session.user.role;
      
      // スタッフは専用の退勤処理を使用
      if (userRole === 'staff' || userRole === 'admin') {
        return res.status(400).json({ 
          success: false, 
          error: 'スタッフは /api/staff/clock-out を使用してください' 
        });
      }
      
      const today = new Date().toISOString().split('T')[0];
      const currentTime = new Date().toTimeString().slice(0, 5);
      
      // 既存の出勤記録確認
      const attendance = await dbGet(
        'SELECT * FROM attendance WHERE user_id = ? AND date = ?',
        [userId, today]
      );
      
      if (!attendance || !attendance.clock_in) {
        return res.status(400).json({ 
          success: false, 
          error: '出勤していません' 
        });
      }
      
      if (attendance.clock_out) {
        return res.status(400).json({ 
          success: false, 
          error: '既に退勤しています' 
        });
      }
      
      // 退勤時間更新
      await dbRun(
        'UPDATE attendance SET clock_out = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [currentTime, attendance.id]
      );
      
      res.json({
        success: true,
        message: '退勤しました',
        time: currentTime
      });
      
    } catch (error) {
      console.error('退勤処理エラー:', error);
      res.status(500).json({ 
        success: false, 
        error: '退勤処理に失敗しました' 
      });
    }
  });
  
  // 特定日の出勤記録取得
  router.get('/:date', async (req, res) => {
    try {
      const userId = req.session.user.id;
      const { date } = req.params;
      
      const attendance = await dbGet(
        'SELECT * FROM attendance WHERE user_id = ? AND date = ?',
        [userId, date]
      );
      
      res.json({ 
        success: true, 
        attendance: attendance || null 
      });
    } catch (error) {
      console.error('出勤記録取得エラー:', error);
      res.status(500).json({ 
        success: false, 
        error: '出勤記録の取得に失敗しました' 
      });
    }
  });
  
  return router;
};