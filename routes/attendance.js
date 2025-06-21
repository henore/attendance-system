// routes/attendance.js
// 共通の出勤管理ルート（時間丸め機能追加版）

const express = require('express');
const router = express.Router();

// 時間を分に変換
const timeToMinutes = (timeStr) => {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
};

// 分を時間文字列に変換
const minutesToTime = (minutes) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

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
  
  // 出勤処理（全ロール共通）- 時間丸め機能追加
  router.post('/clock-in', async (req, res) => {
    try {
      const userId = req.session.user.id;
      const userRole = req.session.user.role;
      const today = new Date().toISOString().split('T')[0];
      let currentTime = new Date().toTimeString().slice(0, 5);
      
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
      
      // 利用者の場合は時間丸め処理
      if (userRole === 'user') {
        const currentMinutes = timeToMinutes(currentTime);
        
        // 11:30-12:30の出勤は12:30固定
        if (currentMinutes >= 690 && currentMinutes <= 750) { // 11:30-12:30
          currentTime = '12:30';
        } 
        // 9:00前は9:00固定
        else if (currentMinutes < 540) { // 9:00 = 540分
          currentTime = '09:00';
        } 
        // 9:01以降は15分切り上げ
        else if (currentMinutes >= 541) {
          const roundedMinutes = Math.ceil(currentMinutes / 15) * 15;
          currentTime = minutesToTime(roundedMinutes);
        }
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
  
  // 退勤処理（利用者用 - スタッフは別ルート）- 時間丸め機能追加
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
      let currentTime = new Date().toTimeString().slice(0, 5);
      
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
      
      // 利用者の場合は時間丸め処理
      if (userRole === 'user') {
        const currentMinutes = timeToMinutes(currentTime);
        
        // 11:30-12:30の退勤は11:30固定
        if (currentMinutes >= 690 && currentMinutes <= 750) { // 11:30-12:30
          currentTime = '11:30';
        } 
        // 15:30以前は15分切り下げ
        else if (currentMinutes <= 929) { // 15:30 = 930分
          const roundedMinutes = Math.floor(currentMinutes / 15) * 15;
          currentTime = minutesToTime(roundedMinutes);
        } 
        // 15:31以降は15:45固定
        else if (currentMinutes >= 930) {
          currentTime = '15:45';
        }
      }
      
      // 退勤時間更新
      await dbRun(
        'UPDATE attendance SET clock_out = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [currentTime, attendance.id]
      );
      
      // 更新された出勤記録を取得
      const updatedAttendance = await dbGet(
        'SELECT * FROM attendance WHERE id = ?',
        [attendance.id]
      );
      
      res.json({
        success: true,
        message: '退勤しました',
        attendance: updatedAttendance,
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