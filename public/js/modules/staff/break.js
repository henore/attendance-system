// modules/staff/break.js
// スタッフの休憩管理機能

import { API_ENDPOINTS } from '../../constants/api-endpoints.js';
import { getCurrentTime, calculateBreakDuration } from '../../utils/date-time.js';

export class StaffBreakHandler {
  constructor(apiCall, showNotification) {
    this.apiCall = apiCall;
    this.showNotification = showNotification;
    
    // 休憩状態
    this.isOnBreak = false;
    this.currentBreakStart = null;
    this.breakCheckInterval = null;
  }

  /**
   * 休憩UIを更新
   */
  updateUI(container) {
    const breakElement = document.getElementById('staffBreakStatus');
    const breakDisplay = document.getElementById('staffBreakTimeDisplay');
    
    if (!breakElement) return;

    if (this.isOnBreak) {
      this.renderBreakingUI(breakElement, breakDisplay);
    } else {
      this.renderBreakAvailableUI(breakElement, breakDisplay);
    }
  }

  /**
   * 休憩中UIを表示
   */
  renderBreakingUI(breakElement, breakDisplay) {
    breakElement.innerHTML = `
      <p class="mb-3 text-warning">
        <i class="fas fa-pause-circle"></i> 休憩中（${this.currentBreakStart}〜）
      </p>
      <button class="btn btn-warning" id="staffBreakEndBtn">
        <i class="fas fa-play"></i> 休憩終了
      </button>
    `;
    
    if (breakDisplay) breakDisplay.style.display = 'block';
    
    const endBtn = document.getElementById('staffBreakEndBtn');
    if (endBtn) {
      endBtn.addEventListener('click', () => this.handleBreakEnd());
    }
  }

  /**
   * 休憩可能UIを表示
   */
  renderBreakAvailableUI(breakElement, breakDisplay) {
    breakElement.innerHTML = `
      <p class="text-muted">休憩時間を記録できます</p>
      <button class="btn btn-info" id="staffBreakStartBtn">
        <i class="fas fa-pause"></i> 休憩開始
      </button>
    `;
    
    if (breakDisplay) breakDisplay.style.display = 'none';
    
    const startBtn = document.getElementById('staffBreakStartBtn');
    if (startBtn) {
      startBtn.addEventListener('click', () => this.handleBreakStart());
    }
  }

  /**
   * 休憩開始処理
   */
  async handleBreakStart() {
    try {
      const response = await this.apiCall(API_ENDPOINTS.STAFF.BREAK_START, { method: 'POST' });
      
      if (response && response.success) {
        this.currentBreakStart = response.startTime;
        this.isOnBreak = true;
        this.startBreakTimeMonitoring();
        this.updateUI();
        this.showNotification(response.message || `休憩開始（${response.startTime}）`, 'info');
      }
    } catch (error) {
      console.error('休憩開始エラー:', error);
      this.showNotification('休憩開始に失敗しました', 'danger');
    }
  }

  /**
   * 休憩終了処理
   */
  async handleBreakEnd() {
    try {
      const response = await this.apiCall(API_ENDPOINTS.STAFF.BREAK_END, { method: 'POST' });
      
      if (response && response.success) {
        this.isOnBreak = false;
        this.currentBreakStart = null;
        this.stopBreakTimeMonitoring();
        this.updateUI();
        this.showNotification(response.message || `休憩終了（${response.endTime}）`, 'success');
      }
    } catch (error) {
      console.error('休憩終了エラー:', error);
      this.showNotification('休憩終了に失敗しました', 'danger');
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
    const durationElement = document.getElementById('staffBreakDuration');
    
    if (durationElement) {
      const hours = Math.floor(duration / 60);
      const minutes = duration % 60;
      durationElement.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
  }

  /**
   * 休憩状態をリセット
   */
  resetBreakState() {
    this.isOnBreak = false;
    this.currentBreakStart = null;
    this.stopBreakTimeMonitoring();
  }

  /**
   * 休憩履歴を取得
   */
  async getBreakHistory(startDate, endDate) {
    try {
      // 実装は必要に応じて追加
      return [];
    } catch (error) {
      console.error('休憩履歴取得エラー:', error);
      return [];
    }
  }
}