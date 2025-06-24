// modules/user/attendance.js
// 利用者の出退勤機能ハンドラー

import { AttendanceHandler } from '../shared/attendance-handler.js';
import { API_ENDPOINTS } from '../../constants/api-endpoints.js';
import { MESSAGES } from '../../constants/labels.js';
import { getCurrentDate } from '../../utils/date-time.js';

export class UserAttendanceHandler extends AttendanceHandler {
  constructor(apiCall, showNotification) {
    super(apiCall, showNotification);
  }

  /**
   * 利用者の出勤処理
   */
  async clockIn() {
    return await super.clockIn(API_ENDPOINTS.ATTENDANCE.CLOCK_IN);
  }

  /**
   * 利用者の退勤処理
   */
  async clockOut(currentAttendance) {
    return await super.clockOut(API_ENDPOINTS.ATTENDANCE.CLOCK_OUT, currentAttendance);
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
        checkDate.setDate(today.getDate() - i);
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