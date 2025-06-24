// modules/user/attendance.js
// 利用者の出退勤機能ハンドラー

import { AttendanceHandler } from '../shared/attendance-handler.js';
import { API_ENDPOINTS } from '../../constants/api-endpoints.js';
import { getCurrentDate, getCurrentTime, timeToMinutes, minutesToTime } from '../../utils/date-time.js';

export class UserAttendanceHandler extends AttendanceHandler {
  constructor(apiCall, showNotification, currentUser) {
    super(apiCall, showNotification);
    this.currentUser = currentUser;
  }

  /**
   * 利用者の出勤時刻を丸める
   * @param {string} time HH:MM形式
   * @returns {string}
   */
  roundClockInTime(time) {
    const currentMinutes = timeToMinutes(time);
    
    // 11:30-12:30の出勤は12:30固定
    if (currentMinutes >= 690 && currentMinutes <= 750) { // 11:30-12:30
      return '12:30';
    } 
    // 9:00前は9:00固定
    else if (currentMinutes < 540) { // 9:00 = 540分
      return '09:00';
    } 
    // 9:01以降は15分切り上げ
    else if (currentMinutes >= 541) {
      const roundedMinutes = Math.ceil(currentMinutes / 15) * 15;
      return minutesToTime(roundedMinutes);
    }
    
    return time;
  }

  /**
   * 利用者の退勤時刻を丸める
   * @param {string} time HH:MM形式
   * @returns {string}
   */
  roundClockOutTime(time) {
    const currentMinutes = timeToMinutes(time);
    
    // 通所者のみ11:30-12:30の退勤は11:30固定
    if (this.currentUser.service_type === 'commute' && 
        currentMinutes >= 690 && currentMinutes <= 750) { // 11:30-12:30
      return '11:30';
    } 
    // 15:29以前は15分切り下げ（通所者・在宅者共通）
    else if (currentMinutes <= 929) { // 15:29 = 929分
      const roundedMinutes = Math.floor(currentMinutes / 15) * 15;
      return minutesToTime(roundedMinutes);
    } 
    // 15:30以降は15:45固定（通所者・在宅者共通）
    else if (currentMinutes >= 930) {
      return '15:45';
    }
    
    return time;
  }

  /**
   * 利用者の出勤処理
   */
  async clockIn() {
    try {
      const currentTime = getCurrentTime();
      const roundedTime = this.roundClockInTime(currentTime);
      
      // APIに丸めた時刻を送信
      const response = await this.apiCall(API_ENDPOINTS.ATTENDANCE.CLOCK_IN, {
        method: 'POST',
        body: JSON.stringify({ time: roundedTime })
      });
      
      if (response.success) {
        this.showNotification('出勤しました', 'success');
        return {
          success: true,
          attendance: response.attendance,
          time: roundedTime
        };
      }
      
      throw new Error(response.error || '出勤処理に失敗しました');
    } catch (error) {
      this.showNotification(error.message, 'danger');
      return { success: false, error: error.message };
    }
  }

  /**
   * 利用者の退勤処理
   */
  async clockOut(currentAttendance) {
    try {
      const currentTime = getCurrentTime();
      const roundedTime = this.roundClockOutTime(currentTime);
      
      // APIに丸めた時刻を送信
      const response = await this.apiCall(API_ENDPOINTS.ATTENDANCE.CLOCK_OUT, {
        method: 'POST',
        body: JSON.stringify({ time: roundedTime })
      });
      
      if (response.success) {
        this.showNotification('退勤しました', 'success');
        return {
          success: true,
          attendance: response.attendance,
          time: roundedTime
        };
      }
      
      throw new Error(response.error || '退勤処理に失敗しました');
    } catch (error) {
      this.showNotification(error.message, 'danger');
      return { success: false, error: error.message };
    }
  }

  /**
   * 今日の出勤状況を取得
   */
  async getTodayAttendance() {
    try {
      const response = await this.apiCall(API_ENDPOINTS.USER.ATTENDANCE_TODAY);
      
      return {
        attendance: response.attendance || null,
        report: response.report || null,
        isWorking: response.attendance && response.attendance.clock_in && !response.attendance.clock_out,
        hasReport: response.attendance && response.attendance.has_report
      };
    } catch (error) {
      console.error('今日の出勤状況取得エラー:', error);
      return {
        attendance: null,
        report: null,
        isWorking: false,
        hasReport: false
      };
    }
  }

  /**
   * 前回の出勤記録を取得
   */
  async getLastReport() {
    try {
      const today = getCurrentDate();
      let lastReportFound = null;
      
      // 過去30日間をチェック
      for (let i = 1; i <= 30; i++) {
        const checkDate = new Date(today);
        checkDate.setDate(checkDate.getDate() - i);
        const dateStr = checkDate.toISOString().split('T')[0];
        
        const response = await this.apiCall(API_ENDPOINTS.USER.REPORT_BY_DATE(dateStr));
        
        if (response.attendance && response.report) {
          lastReportFound = {
            date: dateStr,
            attendance: response.attendance,
            report: response.report,
            staffComment: response.staffComment
          };
          break;
        }
      }
      
      return lastReportFound;
    } catch (error) {
      console.error('前回記録取得エラー:', error);
      return null;
    }
  }

  /**
   * 出勤状態のUIを更新
   */
  updateUI(state, statusElement, handlers = {}) {
    if (!statusElement) return;

    const { isWorking, currentAttendance } = state;

    if (isWorking) {
      statusElement.innerHTML = `
        <p class="mb-3 text-success">
          <i class="fas fa-play-circle"></i> 出勤中（${currentAttendance.clock_in}〜）
        </p>
        <button class="btn btn-clock btn-clock-out" id="userClockOutBtn">
          <i class="fas fa-clock"></i> 退勤
        </button>
      `;
      
      const clockOutBtn = document.getElementById('userClockOutBtn');
      if (clockOutBtn && handlers.onClockOut) {
        clockOutBtn.addEventListener('click', handlers.onClockOut);
      }
    } else if (currentAttendance && currentAttendance.clock_out) {
      statusElement.innerHTML = `
        <p class="mb-3 text-info">
          <i class="fas fa-check-circle"></i> 退勤済み（${currentAttendance.clock_in}〜${currentAttendance.clock_out}）
        </p>
      `;
    } else {
      statusElement.innerHTML = `
        <p class="mb-3">本日はまだ出勤していません</p>
        <button class="btn btn-clock btn-clock-in" id="userClockInBtn">
          <i class="fas fa-clock"></i> 出勤
        </button>
      `;
      
      const clockInBtn = document.getElementById('userClockInBtn');
      if (clockInBtn && handlers.onClockIn) {
        clockInBtn.addEventListener('click', handlers.onClockIn);
      }
    }
  }

  /**
   * 前回記録確認が必要かチェック
   */
  shouldShowLastReportConfirmation(state) {
    return state.lastReportData && !state.hasConfirmedLastReport;
  }

  /**
   * 出勤ボタンの状態を更新
   */
  updateClockInButtonState(shouldDisable, message = null) {
    const clockInBtn = document.getElementById('userClockInBtn');
    if (!clockInBtn) return;
    
    if (shouldDisable) {
      clockInBtn.disabled = true;
      clockInBtn.innerHTML = message || '<i class="fas fa-lock"></i> 前回記録の確認が必要です';
    } else {
      clockInBtn.disabled = false;
      clockInBtn.innerHTML = '<i class="fas fa-clock"></i> 出勤';
    }
  }
}