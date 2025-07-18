// modules/user/break.js
// 利用者の休憩機能ハンドラー（修正版）

import { API_ENDPOINTS } from '../../constants/api-endpoints.js';
import { MESSAGES } from '../../constants/labels.js';
import { getCurrentDate, getCurrentTime, timeToMinutes, calculateBreakDuration } from '../../utils/date-time.js';

export class UserBreakHandler {
  constructor(apiCall, showNotification, currentUser) {
    this.apiCall = apiCall;
    this.showNotification = showNotification;
    this.currentUser = currentUser;
    
    // 休憩状態
    this.isOnBreak = false;
    this.currentBreakStart = null;
    this.hasBreakToday = false;
    this.breakCheckInterval = null;
    this.autoEndTimeout = null; // 自動終了タイマー
  }

  /**
   * 休憩状態を読み込み
   * @param {Object} attendance 
   */
  async loadBreakStatus(attendance) {
    if (!attendance) return;
    
    try {
      const today = getCurrentDate();
      const response = await this.apiCall(API_ENDPOINTS.USER.BREAK_STATUS(today));
      
      if (response.breakRecord) {
        this.hasBreakToday = true;
        if (!response.breakRecord.end_time) {
          this.isOnBreak = true;
          this.currentBreakStart = response.breakRecord.start_time;
          this.startBreakTimeMonitoring();
        }
      }
    } catch (error) {
      console.error('休憩状況読み込みエラー:', error);
    }
  }

  /**
   * 休憩UIを更新
   * @param {HTMLElement} container 
   */
  updateUI(container) {
    const breakElement = document.getElementById('userBreakStatus');
    const breakDisplay = document.getElementById('userBreakTimeDisplay');
    if (!breakElement) return;

    const clockInTime = this.getCurrentClockInTime();
    if (!clockInTime) {
      this.renderNotWorkingUI(breakElement, breakDisplay);
      return;
    }

    // 出勤時刻による休憩可否判定（通所者のみ）
    if (this.currentUser.service_type === 'commute') {
      const clockInMinutes = timeToMinutes(clockInTime);
      if (clockInMinutes >= 690) { // 11:30以降の出勤
        this.renderNoBreakUI(breakElement, breakDisplay);
        return;
      }
    }

    if (this.hasBreakToday) {
      if (this.isOnBreak) {
        this.renderBreakingUI(breakElement, breakDisplay);
      } else {
        this.renderBreakCompletedUI(breakElement, breakDisplay);
      }
    } else {
      this.renderBreakAvailableUI(breakElement, breakDisplay);
    }
  }

  /**
   * 未出勤時のUI
   */
 
  renderNotWorkingUI(breakElement, breakDisplay) {
    breakElement.innerHTML = `
      <p class="text-muted">出勤後に休憩機能が利用できます</p>
      <button class="btn btn-info" disabled>
        <i class="fas fa-pause"></i> 休憩開始
      </button>
    `;
    if (breakDisplay) breakDisplay.style.display = 'none';
}
  /**
   * 休憩不可UIを表示（通所者の午後出勤）
   */
  renderNoBreakUI(breakElement, breakDisplay) {
    breakElement.innerHTML = `
      <p class="text-muted">午後出勤のため休憩はありません</p>
      <button class="btn btn-info" disabled>
        <i class="fas fa-pause"></i> 休憩なし
      </button>
    `;
    if (breakDisplay) breakDisplay.style.display = 'none';
  }

  /**
   * 休憩中UIを表示
   */
  renderBreakingUI(breakElement, breakDisplay) {
    const serviceType = this.currentUser.service_type;
    
    let endInfo = '';
    if (serviceType === 'commute') {
      endInfo = '<p class="text-info">通所の方は12:30に自動終了します</p>';
    } else {
      endInfo = `
        <button class="btn btn-warning" id="userBreakEndBtn">
          <i class="fas fa-play"></i> 休憩終了
        </button>
        <p class="text-info mt-2">60分で自動終了します</p>
      `;
    }
    
    breakElement.innerHTML = `
      <p class="mb-3 text-warning">
        <i class="fas fa-pause-circle"></i> 休憩中（${this.currentBreakStart}〜）
      </p>
      ${endInfo}
    `;
    
    if (breakDisplay) breakDisplay.style.display = 'block';
    
    // 在宅者の手動終了ボタン
    if (serviceType === 'home') {
      const endBtn = document.getElementById('userBreakEndBtn');
      if (endBtn) {
        endBtn.addEventListener('click', () => this.handleBreakEnd());
      }
    }
  }

  /**
   * 休憩完了UIを表示
   */
  renderBreakCompletedUI(breakElement, breakDisplay) {
    breakElement.innerHTML = `
      <p class="text-info">本日の休憩は完了しました（60分）</p>
      <button class="btn btn-info" disabled>
        <i class="fas fa-check"></i> 休憩済み
      </button>
    `;
    if (breakDisplay) breakDisplay.style.display = 'none';
  }

  /**
   * 休憩可能UIを表示
   */
  renderBreakAvailableUI(breakElement, breakDisplay) {
    const serviceType = this.currentUser.service_type;
    let breakInfo = '';
    
    if (serviceType === 'commute') {
      breakInfo = '通所の方：どのタイミングでも11:30-12:30固定（60分）';
    } else {
      breakInfo = '在宅の方：15分刻み切り捨てで開始、60分固定';
    }
      
    breakElement.innerHTML = `
      <p class="text-muted">${breakInfo}</p>
      <button class="btn btn-info" id="userBreakStartBtn">
        <i class="fas fa-pause"></i> 休憩開始
      </button>
    `;
    
    if (breakDisplay) breakDisplay.style.display = 'none';
    
    const startBtn = document.getElementById('userBreakStartBtn');
    if (startBtn) {
      startBtn.addEventListener('click', () => this.handleBreakStart());
    }
  }

  /**
   * 休憩無効UIを表示
   */
  disableUI() {
    const breakElement = document.getElementById('userBreakStatus');
    const breakDisplay = document.getElementById('userBreakTimeDisplay');
    
    if (breakElement) {
      breakElement.innerHTML = `
        <p class="text-muted">退勤済みです</p>
        <button class="btn btn-info" disabled>
          <i class="fas fa-pause"></i> 休憩開始
        </button>
      `;
    }
    
    if (breakDisplay) {
      breakDisplay.style.display = 'none';
    }
  }

  /**
   * 休憩開始処理（改善版）
   */
  async handleBreakStart() {
    if (this.hasBreakToday) {
      this.showNotification(MESSAGES.ATTENDANCE.BREAK_ALREADY_TAKEN, 'warning');
      return;
    }

    try {
      const currentTime = getCurrentTime();
      let adjustedStartTime = currentTime;
      
      // 在宅者の場合は15分刻み切り捨て
      if (this.currentUser.service_type === 'home') {
        const currentMinutes = timeToMinutes(currentTime);
        const adjustedMinutes = Math.floor(currentMinutes / 15) * 15;
        const hours = Math.floor(adjustedMinutes / 60);
        const minutes = adjustedMinutes % 60;
        adjustedStartTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
      }

      const response = await this.apiCall(API_ENDPOINTS.USER.BREAK_START, { 
        method: 'POST',
        body: JSON.stringify({ startTime: adjustedStartTime })
      });
      
      if (response && response.success) {
        this.hasBreakToday = true;
        this.currentBreakStart = response.startTime || adjustedStartTime;
        
        const serviceType = this.currentUser.service_type;
        
        if (serviceType === 'commute' || response.isCompleted) {
          // 通所者は即座に完了状態
          this.isOnBreak = false;
          this.showNotification(
            response.message || '休憩時間を記録しました（11:30-12:30 60分）', 
            'success'
          );
        } else {
          // 在宅者は休憩開始
          this.isOnBreak = true;
          this.startBreakTimeMonitoring();
          this.setupAutoBreakEnd(); // 60分後自動終了設定
          
          let message = `休憩開始（${this.currentBreakStart}）`;
          if (adjustedStartTime !== currentTime) {
            message += ` ※開始時刻を${adjustedStartTime}に調整しました`;
          }
          message += ' - 60分で自動終了します';
          
          this.showNotification(message, 'info');
        }
        
        this.updateUI();
      }
    } catch (error) {
      console.error('休憩開始エラー:', error);
      this.showNotification(error.message || '休憩開始に失敗しました', 'danger');
    }
  }

  /**
   * 休憩終了処理
   */
  async handleBreakEnd() {
    if (!this.isOnBreak) {
      this.showNotification('休憩中ではありません', 'warning');
      return;
    }

    try {
      const response = await this.apiCall(API_ENDPOINTS.USER.BREAK_END, { method: 'POST' });
      
      this.isOnBreak = false;
      this.currentBreakStart = null;
      this.stopBreakTimeMonitoring();
      this.clearAutoBreakEnd();
      this.updateUI();
      
      const message = response.message || `休憩終了（${getCurrentTime()}）`;
      this.showNotification(message, 'success');
      
    } catch (error) {
      console.error('休憩終了エラー:', error);
      this.showNotification(error.message || '休憩終了処理でエラーが発生しました', 'danger');
    }
  }

  /**
   * 60分後自動終了の設定
   */
  setupAutoBreakEnd() {
    this.clearAutoBreakEnd();
    
    // 60分 = 3,600,000ミリ秒
    this.autoEndTimeout = setTimeout(() => {
      if (this.isOnBreak) {
        this.showNotification('休憩時間が60分に達したため自動終了します', 'info');
        this.handleBreakEnd();
      }
    }, 60 * 60 * 1000);
  }

  /**
   * 自動終了タイマーをクリア
   */
  clearAutoBreakEnd() {
    if (this.autoEndTimeout) {
      clearTimeout(this.autoEndTimeout);
      this.autoEndTimeout = null;
    }
  }

  /**
   * 休憩時間監視を開始
   */
  startBreakTimeMonitoring() {
    this.stopBreakTimeMonitoring();
    
    this.breakCheckInterval = setInterval(() => {
      this.updateBreakTimeDisplay();
      this.checkBreakTimeLimit();
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
    const durationElement = document.getElementById('userBreakDuration');
    
    if (durationElement) {
      const hours = Math.floor(duration / 60);
      const minutes = duration % 60;
      durationElement.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
  }

  /**
   * 休憩時間制限をチェック
   */
  checkBreakTimeLimit() {
    if (!this.isOnBreak || !this.currentBreakStart) return;
    
    const currentTime = getCurrentTime();
    const duration = calculateBreakDuration(this.currentBreakStart, currentTime);
    
    // 60分経過で自動終了（安全策として監視も継続）
    if (duration >= 60) {
      this.showNotification('休憩時間が60分に達しました。自動終了します。', 'info');
      this.handleBreakEnd();
    }
  }

  /**
   * 現在の出勤時刻を取得
   */
  getCurrentClockInTime() {
    const attendanceStatus = document.getElementById('userAttendanceStatus');
    if (!attendanceStatus) return null;
    
    const clockInMatch = attendanceStatus.textContent.match(/出勤中（(\d{2}:\d{2})/);
    return clockInMatch ? clockInMatch[1] : null;
  }

  /**
   * 休憩状態をリセット
   */
  resetBreakState() {
    this.hasBreakToday = false;
    this.isOnBreak = false;
    this.currentBreakStart = null;
    this.stopBreakTimeMonitoring();
    this.clearAutoBreakEnd();
  }

  /**
   * クリーンアップ
   */
  destroy() {
    this.stopBreakTimeMonitoring();
    this.clearAutoBreakEnd();
  }
}