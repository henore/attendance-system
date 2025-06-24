// modules/staff/attendance.js
// スタッフの出退勤UI制御（簡潔版）

import { API_ENDPOINTS } from '../../constants/api-endpoints.js';
import { getCurrentTime } from '../../utils/date-time.js';

export class StaffAttendanceUI {
  constructor(app, parentModule) {
    this.app = app;
    this.parent = parentModule;
    
    // 状態管理
    this.isWorking = false;
    this.isOnBreak = false;
    this.currentAttendance = null;
    this.breakStartTime = null;
    this.breakCheckInterval = null;
  }

  /**
   * 出勤処理
   */
  async handleClockIn() {
    try {
      const response = await this.app.apiCall(API_ENDPOINTS.ATTENDANCE.CLOCK_IN, {
        method: 'POST',
        body: JSON.stringify({ time: getCurrentTime() })
      });
      
      if (response.success) {
        this.isWorking = true;
        this.currentAttendance = response.attendance;
        this.updateUI();
        this.app.showNotification('出勤しました', 'success');
        return true;
      }
    } catch (error) {
      console.error('出勤処理エラー:', error);
      this.app.showNotification(error.message || '出勤処理に失敗しました', 'danger');
      return false;
    }
  }

  /**
   * 退勤処理
   */
  async handleClockOut() {
    try {
      // 休憩中の場合は確認
      if (this.isOnBreak) {
        const confirmMessage = '現在休憩中です。\n急病・早退等の理由で退勤する場合は「OK」を押してください。\n休憩を終了してから退勤する場合は「キャンセル」を押してください。';
        if (!confirm(confirmMessage)) {
          return false;
        }
        // 休憩を自動終了
        await this.handleBreakEnd(true);
      }

      const response = await this.app.apiCall(API_ENDPOINTS.STAFF.CLOCK_OUT, {
        method: 'POST'
      });
      
      if (response.success) {
        this.isWorking = false;
        this.currentAttendance.clock_out = response.time;
        this.updateUI();
        this.app.showNotification('退勤しました', 'success');
        return true;
      }
    } catch (error) {
      console.error('退勤処理エラー:', error);
      
      // 未コメントの日報がある場合の処理
      if (error.message && error.message.includes('未コメント')) {
        const uncommentedReports = error.uncommentedReports || [];
        const userNames = uncommentedReports.map(r => r.user_name).join('、');
        this.app.showNotification(
          `以下の利用者の日報にコメントが記入されていません：${userNames}`,
          'warning'
        );
      } else {
        this.app.showNotification(error.message || '退勤処理に失敗しました', 'danger');
      }
      return false;
    }
  }

  /**
   * 休憩開始処理
   */
  async handleBreakStart() {
    if (!this.isWorking) {
      this.app.showNotification('出勤中のみ休憩できます', 'warning');
      return false;
    }

    try {
      const response = await this.app.apiCall(API_ENDPOINTS.STAFF.BREAK_START, {
        method: 'POST'
      });
      
      if (response.success) {
        this.isOnBreak = true;
        this.breakStartTime = response.startTime;
        this.updateUI();
        this.startBreakTimer();
        this.app.showNotification('休憩を開始しました', 'info');
        return true;
      }
    } catch (error) {
      console.error('休憩開始エラー:', error);
      this.app.showNotification(error.message || '休憩開始に失敗しました', 'danger');
      return false;
    }
  }

  /**
   * 休憩終了処理
   */
  async handleBreakEnd(autoEnd = false) {
    if (!this.isOnBreak) {
      this.app.showNotification('休憩中ではありません', 'warning');
      return false;
    }

    try {
      const response = await this.app.apiCall(API_ENDPOINTS.STAFF.BREAK_END, {
        method: 'POST',
        body: JSON.stringify({ autoEnd })
      });
      
      if (response.success) {
        this.isOnBreak = false;
        this.breakStartTime = null;
        this.stopBreakTimer();
        this.updateUI();
        this.app.showNotification(
          autoEnd ? '休憩を自動終了しました（60分）' : '休憩を終了しました',
          'success'
        );
        return true;
      }
    } catch (error) {
      console.error('休憩終了エラー:', error);
      this.app.showNotification(error.message || '休憩終了に失敗しました', 'danger');
      return false;
    }
  }

  /**
   * 休憩タイマー開始（60分で自動終了）
   */
  startBreakTimer() {
    // 60分後に自動終了
    this.breakCheckInterval = setTimeout(() => {
      this.handleBreakEnd(true);
    }, 60 * 60 * 1000);
  }

  /**
   * 休憩タイマー停止
   */
  stopBreakTimer() {
    if (this.breakCheckInterval) {
      clearTimeout(this.breakCheckInterval);
      this.breakCheckInterval = null;
    }
  }

  /**
   * 今日の出勤状況を読み込み
   */
  async loadTodayAttendance() {
    try {
      const response = await this.app.apiCall(API_ENDPOINTS.ATTENDANCE.TODAY);
      
      if (response.attendance) {
        this.currentAttendance = response.attendance;
        this.isWorking = response.attendance.clock_in && !response.attendance.clock_out;
        
        // 休憩状態もチェック
        if (response.attendance.break_start && !response.attendance.break_end) {
          this.isOnBreak = true;
          this.breakStartTime = response.attendance.break_start;
          this.startBreakTimer();
        }
      }
      
      this.updateUI();
    } catch (error) {
      console.error('出勤状況取得エラー:', error);
    }
  }

  /**
   * UI更新
   */
  updateUI() {
    this.updateAttendanceDisplay();
    this.updateButtonStates();
  }

  /**
   * 出勤状況表示更新
   */
  updateAttendanceDisplay() {
    const statusElement = document.getElementById('attendanceStatusDisplay');
    if (!statusElement) return;

    let html = '';

    if (this.isWorking) {
      html = `
        <div class="alert alert-success">
          <i class="fas fa-play-circle"></i> 
          出勤中（${this.currentAttendance.clock_in}〜）
        </div>
      `;
      
      if (this.isOnBreak) {
        html += `
          <div class="alert alert-warning">
            <i class="fas fa-pause-circle"></i> 
            休憩中（${this.breakStartTime}〜）
          </div>
        `;
      }
    } else if (this.currentAttendance && this.currentAttendance.clock_out) {
      html = `
        <div class="alert alert-info">
          <i class="fas fa-check-circle"></i> 
          退勤済み（${this.currentAttendance.clock_in}〜${this.currentAttendance.clock_out}）
        </div>
      `;
    } else {
      html = `
        <div class="alert alert-secondary">
          <i class="fas fa-clock"></i> 
          本日はまだ出勤していません
        </div>
      `;
    }

    statusElement.innerHTML = html;
  }

  /**
   * ボタン状態更新
   */
  updateButtonStates() {
    const clockInBtn = document.getElementById('clockInBtn');
    const clockOutBtn = document.getElementById('clockOutBtn');
    const breakStartBtn = document.getElementById('breakStartBtn');
    const breakEndBtn = document.getElementById('breakEndBtn');
    
    if (this.isWorking) {
      // 出勤中
      if (clockInBtn) clockInBtn.disabled = true;
      if (clockOutBtn) clockOutBtn.disabled = false;
      
      // 休憩ボタンの制御
      if (this.isOnBreak) {
        // 休憩中
        if (breakStartBtn) breakStartBtn.disabled = true;
        if (breakEndBtn) breakEndBtn.disabled = false;
      } else {
        // 休憩していない
        if (breakStartBtn) {
          // 既に休憩を取った場合は無効化
          breakStartBtn.disabled = this.currentAttendance.break_start ? true : false;
        }
        if (breakEndBtn) breakEndBtn.disabled = true;
      }
    } else {
      // 未出勤または退勤済み
      if (this.currentAttendance && this.currentAttendance.clock_out) {
        // 退勤済みの場合は全て無効化
        if (clockInBtn) clockInBtn.disabled = true;
      } else {
        // 未出勤の場合
        if (clockInBtn) clockInBtn.disabled = false;
      }
      if (clockOutBtn) clockOutBtn.disabled = true;
      if (breakStartBtn) breakStartBtn.disabled = true;
      if (breakEndBtn) breakEndBtn.disabled = true;
    }
  }

  /**
   * クリーンアップ
   */
  destroy() {
    this.stopBreakTimer();
  }
}