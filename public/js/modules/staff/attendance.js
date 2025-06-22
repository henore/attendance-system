// modules/staff/attendance.js
// スタッフの出退勤機能ハンドラー

import { AttendanceHandler } from '../shared/attendance-handler.js';
import { API_ENDPOINTS } from '../../constants/api-endpoints.js';
import { MESSAGES } from '../../constants/labels.js';
import { getCurrentTime, calculateBreakDuration } from '../../utils/date-time.js';

export class StaffAttendanceHandler extends AttendanceHandler {
  constructor(apiCall, showNotification) {
    super(apiCall, showNotification);
    
    // 休憩管理
    this.isOnBreak = false;
    this.currentBreakStart = null;
    this.breakCheckInterval = null;
  }

  /**
   * スタッフの出勤処理
   */
  async clockIn() {
    return await super.clockIn(API_ENDPOINTS.ATTENDANCE.CLOCK_IN);
  }

 /**
   * スタッフの退勤処理（休憩押し忘れ対応版）
   */
  async clockOut(currentAttendance) {
    if (this.isOnBreak) {
      // 休憩中の退勤確認
      const confirmMessage = '現在休憩中です。\n急病・早退等の理由で退勤する場合は「OK」を押してください。\n休憩を終了してから退勤する場合は「キャンセル」を押してください。';
      if (!confirm(confirmMessage)) {
        return { success: false };
      }
      
      // 休憩を自動終了
      await this.handleBreakEnd();
    }

    return await super.clockOut(API_ENDPOINTS.STAFF.CLOCK_OUT, currentAttendance);
  }

  /**
   * 今日の出勤状況を取得
   */
  async getTodayAttendance() {
    return await super.getTodayAttendance(API_ENDPOINTS.USER.ATTENDANCE_TODAY);
  }

  /**
   * 休憩開始処理
   */
  async handleBreakStart() {
    if (!this.isWorking) {
      this.showNotification('出勤中のみ休憩できます', 'warning');
      return;
    }

    const result = await super.startBreak(API_ENDPOINTS.STAFF.BREAK_START, true);
    if (result.success) {
      this.currentBreakStart = result.startTime || getCurrentTime();
      this.isOnBreak = true;
      this.updateBreakUI();
      this.startBreakTimeMonitoring();
    }
  }

  /**
   * 休憩終了処理
   */
  async handleBreakEnd() {
    const result = await super.endBreak(API_ENDPOINTS.STAFF.BREAK_END, this.isOnBreak);
    if (result.success) {
      this.isOnBreak = false;
      this.currentBreakStart = null;
      this.stopBreakTimeMonitoring();
      this.updateBreakUI();
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
        <button class="btn btn-clock btn-clock-out" id="staffClockOutBtn">
          <i class="fas fa-clock"></i> 退勤
        </button>
      `;
      
      const clockOutBtn = document.getElementById('staffClockOutBtn');
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
        <button class="btn btn-clock btn-clock-in" id="staffClockInBtn">
          <i class="fas fa-clock"></i> 出勤
        </button>
      `;
      
      const clockInBtn = document.getElementById('staffClockInBtn');
      if (clockInBtn && handlers.onClockIn) {
        clockInBtn.addEventListener('click', handlers.onClockIn);
      }
    }
  }

  /**
   * 休憩UIを更新
   */
  updateBreakUI(breakElement = null) {
    if (!breakElement) {
      breakElement = document.getElementById('breakManagementStatus');
    }
    
    const breakDisplay = document.getElementById('breakTimeDisplay');
    if (!breakElement) return;

    if (this.isOnBreak) {
      breakElement.innerHTML = `
        <p class="mb-3 text-warning">
          <i class="fas fa-pause-circle"></i> 休憩中（${this.currentBreakStart}〜）
        </p>
        <button class="btn btn-warning" id="breakEndBtn">
          <i class="fas fa-play"></i> 休憩終了
        </button>
      `;
      
      if (breakDisplay) breakDisplay.style.display = 'block';
      
      const endBtn = document.getElementById('breakEndBtn');
      if (endBtn) {
        endBtn.addEventListener('click', () => this.handleBreakEnd());
      }
    } else {
      breakElement.innerHTML = `
        <p class="text-muted">休憩時間を記録できます</p>
        <button class="btn btn-info" id="breakStartBtn">
          <i class="fas fa-pause"></i> 休憩開始
        </button>
      `;
      
      if (breakDisplay) breakDisplay.style.display = 'none';
      
      const startBtn = document.getElementById('breakStartBtn');
      if (startBtn) {
        startBtn.addEventListener('click', () => this.handleBreakStart());
      }
    }
  }

  /**
   * 休憩時間監視を開始
   */
  startBreakTimeMonitoring() {
    this.breakCheckInterval = setInterval(() => {
      this.updateBreakTimeDisplay();
    }, 60000); // 1分ごと
  }

  /**
   * 休憩時間監視を停止
   */
  stopBreakTimeMonitoring() {
    if (this.breakCheckInterval) {
      clearInterval(this.breakCheckInterval);
      this.breakCheckInterval = null;
    }
  }

  /**
   * 休憩時間表示を更新
   */
  updateBreakTimeDisplay() {
    if (!this.isOnBreak || !this.currentBreakStart) return;
    
    const currentTime = getCurrentTime();
    const duration = calculateBreakDuration(this.currentBreakStart, currentTime);
    const durationElement = document.getElementById('breakDuration');
    
    if (durationElement) {
      const hours = Math.floor(duration / 60);
      const minutes = duration % 60;
      durationElement.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
  }

  /**
   * 特定日の出勤記録取得
   */
  async getAttendanceByDate(date) {
    try {
      const response = await this.apiCall(API_ENDPOINTS.STAFF.ATTENDANCE(date));
      return response.attendance || null;
    } catch (error) {
      console.error('出勤記録取得エラー:', error);
      return null;
    }
  }
}