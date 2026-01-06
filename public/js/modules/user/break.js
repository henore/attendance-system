// modules/user/break.js
// 利用者の休憩機能ハンドラー（修正版）

import { API_ENDPOINTS } from '../../constants/api-endpoints.js';
import { MESSAGES } from '../../constants/labels.js';
import { getCurrentDate, getCurrentTime, timeToMinutes, calculateBreakDuration } from '../../utils/date-time.js';

export class UserBreakHandler {
  constructor(apiCall, showNotification, currentUser, confirmationModal = null) {
    this.apiCall = apiCall;
    this.showNotification = showNotification;
    this.currentUser = currentUser;
    this.confirmationModal = confirmationModal;

    // 休憩状態
    this.isOnBreak = false;
    this.currentBreakStart = null;
    this.hasBreakToday = false;
    this.breakCheckInterval = null;
    this.autoEndTimeout = null; // 自動終了タイマー

    // 小休憩状態
    this.isOnShortBreak = false;
    this.shortBreakInterval = null;
    this.shortBreakStartTime = null;

    // 中抜け状態
    this.isOnAbsence = false;
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
      <div class="d-grid gap-2">
        <button class="btn btn-info" id="userBreakBtn" disabled>
          <i class="fas fa-pause"></i> 休憩
        </button>
        <button class="btn btn-outline-secondary btn-sm" id="userShortBreakBtn" disabled>
          <i class="fas fa-clock"></i> 小休憩（10分）
        </button>
        <button class="btn btn-outline-warning btn-sm" id="userAbsenceBtn" disabled>
          <i class="fas fa-door-open"></i> 中抜け
        </button>
      </div>
    `;
    if (breakDisplay) breakDisplay.style.display = 'none';
}
  /**
   * 休憩不可UIを表示（通所者の午後出勤）
   */
  renderNoBreakUI(breakElement, breakDisplay) {
    breakElement.innerHTML = `
      <p class="text-muted">午後出勤のため休憩はありません</p>
      <div class="d-grid gap-2">
        <button class="btn btn-info" id="userBreakBtn" disabled>
          <i class="fas fa-pause"></i> 休憩なし
        </button>
        <button class="btn btn-outline-secondary btn-sm" id="userShortBreakBtn">
          <i class="fas fa-clock"></i> 小休憩（10分）
        </button>
        <button class="btn btn-outline-warning btn-sm" id="userAbsenceBtn">
          <i class="fas fa-door-open"></i> 中抜け
        </button>
      </div>
    `;
    if (breakDisplay) breakDisplay.style.display = 'none';

    // イベントリスナーを追加
    this.attachShortBreakAndAbsenceListeners();
  }

  /**
   * 休憩中UIを表示
   */
  renderBreakingUI(breakElement, breakDisplay) {
    const serviceType = this.currentUser.service_type;

    let breakButtons = '';
    let breakInfo = '';

    if (serviceType === 'commute') {
      breakInfo = '<p class="text-info">通所の方は12:30に自動終了します</p>';
    } else {
      breakButtons = `
        <button class="btn btn-warning" id="userBreakEndBtn">
          <i class="fas fa-play"></i> 休憩終了
        </button>
      `;
      breakInfo = '<p class="text-info mt-2">60分で自動終了します</p>';
    }

    breakElement.innerHTML = `
      <p class="mb-3 text-warning">
        <i class="fas fa-pause-circle"></i> 休憩中（${this.currentBreakStart}〜）
      </p>
      <div class="d-grid gap-2">
        ${breakButtons}
        <button class="btn btn-outline-secondary btn-sm" id="userShortBreakBtn" disabled>
          <i class="fas fa-clock"></i> 小休憩（10分）
        </button>
        <button class="btn btn-outline-warning btn-sm" id="userAbsenceBtn" disabled>
          <i class="fas fa-door-open"></i> 中抜け
        </button>
      </div>
      ${breakInfo}
    `;

    if (breakDisplay) breakDisplay.style.display = 'block';

    // 在宅者の手動終了ボタン
    if (serviceType === 'home') {
      const endBtn = document.getElementById('userBreakEndBtn');
      if (endBtn) {
        endBtn.addEventListener('click', () => this.handleBreakEnd());
      }
    }

    // イベントリスナーを追加
    this.attachShortBreakAndAbsenceListeners();
  }

  /**
   * 休憩完了UIを表示
   */
  renderBreakCompletedUI(breakElement, breakDisplay) {
    breakElement.innerHTML = `
      <p class="text-info">本日の休憩は完了しました（60分）</p>
      <div class="d-grid gap-2">
        <button class="btn btn-info" id="userBreakBtn" disabled>
          <i class="fas fa-check"></i> 休憩済み
        </button>
        <button class="btn btn-outline-secondary btn-sm" id="userShortBreakBtn">
          <i class="fas fa-clock"></i> 小休憩（10分）
        </button>
        <button class="btn btn-outline-warning btn-sm" id="userAbsenceBtn">
          <i class="fas fa-door-open"></i> 中抜け
        </button>
      </div>
    `;
    if (breakDisplay) breakDisplay.style.display = 'none';

    // イベントリスナーを追加
    this.attachShortBreakAndAbsenceListeners();
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
      <div class="d-grid gap-2">
        <button class="btn btn-info" id="userBreakStartBtn">
          <i class="fas fa-pause"></i> 休憩開始
        </button>
        <button class="btn btn-outline-secondary btn-sm" id="userShortBreakBtn">
          <i class="fas fa-clock"></i> 小休憩（10分）
        </button>
        <button class="btn btn-outline-warning btn-sm" id="userAbsenceBtn">
          <i class="fas fa-door-open"></i> 中抜け
        </button>
      </div>
    `;

    if (breakDisplay) breakDisplay.style.display = 'none';

    const startBtn = document.getElementById('userBreakStartBtn');
    if (startBtn) {
      startBtn.addEventListener('click', () => this.handleBreakStart());
    }

    // イベントリスナーを追加
    this.attachShortBreakAndAbsenceListeners();
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
        <div class="d-grid gap-2">
          <button class="btn btn-info" id="userBreakBtn" disabled>
            <i class="fas fa-pause"></i> 休憩開始
          </button>
          <button class="btn btn-outline-secondary btn-sm" id="userShortBreakBtn" disabled>
            <i class="fas fa-clock"></i> 小休憩（10分）
          </button>
          <button class="btn btn-outline-warning btn-sm" id="userAbsenceBtn" disabled>
            <i class="fas fa-door-open"></i> 中抜け
          </button>
        </div>
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
      const serviceType = this.currentUser.service_type;

      // 確認モーダルを表示（confirmationModalがある場合）
      if (this.confirmationModal) {
        let message = '';
        let timeInfo = '';

        if (serviceType === 'commute') {
          message = '11:30から12:30までの固定休憩です。';
          timeInfo = '11:30 〜 12:30（60分）';
        } else {
          message = '休憩開始から1時間で自動終了します。';
          const currentTime = getCurrentTime();
          const currentMinutes = timeToMinutes(currentTime);
          const adjustedMinutes = Math.floor(currentMinutes / 15) * 15;
          const hours = Math.floor(adjustedMinutes / 60);
          const minutes = adjustedMinutes % 60;
          const adjustedStartTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
          timeInfo = `${adjustedStartTime} 開始（60分間）`;
        }

        const confirmed = await this.confirmationModal.show({
          title: '休憩確認',
          message: `${message}\n休憩に入りますか？`,
          time: timeInfo,
          confirmText: 'はい',
          cancelText: 'いいえ',
          icon: 'fa-coffee'
        });

        // いいえの場合は処理を中断
        if (!confirmed) {
          this.showNotification('休憩をキャンセルしました', 'info');
          return;
        }
      }

      const currentTime = getCurrentTime();
      let adjustedStartTime = currentTime;

      // 在宅者の場合は15分刻み切り捨て
      if (serviceType === 'home') {
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
   * 小休憩と中抜けボタンのイベントリスナーをアタッチ
   */
  attachShortBreakAndAbsenceListeners() {
    const shortBreakBtn = document.getElementById('userShortBreakBtn');
    const absenceBtn = document.getElementById('userAbsenceBtn');

    if (shortBreakBtn && !shortBreakBtn.disabled) {
      shortBreakBtn.addEventListener('click', () => this.handleShortBreakStart());
    }

    if (absenceBtn) {
      absenceBtn.addEventListener('click', () => this.handleAbsenceStart());
    }
  }

  /**
   * 小休憩開始処理（10分タイマー）
   */
  handleShortBreakStart() {
    if (this.isOnShortBreak) {
      this.showNotification('既に小休憩中です', 'warning');
      return;
    }

    if (this.isOnAbsence) {
      this.showNotification('中抜け中は小休憩できません', 'warning');
      return;
    }

    // 小休憩開始
    this.isOnShortBreak = true;
    this.shortBreakStartTime = Date.now();

    // プログレスバー表示を開始
    this.startShortBreakProgress();

    this.showNotification('小休憩を開始しました（10分）', 'info');
  }

  /**
   * 小休憩プログレスバー更新
   */
  startShortBreakProgress() {
    const display = document.getElementById('userShortBreakDisplay');
    const progressBar = document.getElementById('shortBreakProgressBar');
    const timerText = document.getElementById('shortBreakTimer');

    if (!display || !progressBar || !timerText) return;

    // 表示
    display.style.display = 'block';

    // 10分 = 600秒
    const totalDuration = 600;
    let elapsed = 0;

    // 1秒ごとに更新
    this.shortBreakInterval = setInterval(() => {
      elapsed++;
      const remaining = totalDuration - elapsed;
      const progress = (elapsed / totalDuration) * 100;

      // プログレスバー更新
      progressBar.style.width = `${progress}%`;

      // 残り時間表示
      const minutes = Math.floor(remaining / 60);
      const seconds = remaining % 60;
      timerText.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

      // 10分経過で自動終了
      if (elapsed >= totalDuration) {
        this.endShortBreak();
      }
    }, 1000);
  }

  /**
   * 小休憩終了
   */
  endShortBreak() {
    if (this.shortBreakInterval) {
      clearInterval(this.shortBreakInterval);
      this.shortBreakInterval = null;
    }

    this.isOnShortBreak = false;
    this.shortBreakStartTime = null;

    // プログレスバー非表示
    const display = document.getElementById('userShortBreakDisplay');
    if (display) {
      display.style.display = 'none';
    }

    // プログレスバーリセット
    const progressBar = document.getElementById('shortBreakProgressBar');
    const timerText = document.getElementById('shortBreakTimer');
    if (progressBar) progressBar.style.width = '0%';
    if (timerText) timerText.textContent = '10:00';

    this.showNotification('小休憩が終了しました', 'success');
  }

  /**
   * 中抜け開始処理
   */
  async handleAbsenceStart() {
    if (this.isOnAbsence) {
      // 既に中抜け中の場合は終了処理
      this.handleAbsenceEnd();
      return;
    }

    // 確認ダイアログ表示
    if (this.confirmationModal) {
      const confirmed = await this.confirmationModal.show({
        title: '中抜け確認',
        message: 'これは通院などによる途中休憩用です。\n中抜けの際は必ず現場監督の方に伝えて下さい。',
        time: '',
        confirmText: 'はい',
        cancelText: 'いいえ',
        icon: 'fa-door-open'
      });

      if (!confirmed) {
        this.showNotification('中抜けをキャンセルしました', 'info');
        return;
      }
    }

    // 中抜け開始
    this.isOnAbsence = true;

    // ボタンのテキストを変更
    const absenceBtn = document.getElementById('userAbsenceBtn');
    if (absenceBtn) {
      absenceBtn.innerHTML = '<i class="fas fa-door-open"></i> 中抜け中';
      absenceBtn.classList.remove('btn-outline-warning');
      absenceBtn.classList.add('btn-warning');
    }

    // 他のボタンを無効化
    this.disableButtonsDuringAbsence();

    this.showNotification('中抜けを開始しました', 'info');
  }

  /**
   * 中抜け終了処理
   */
  handleAbsenceEnd() {
    this.isOnAbsence = false;

    // ボタンのテキストを戻す
    const absenceBtn = document.getElementById('userAbsenceBtn');
    if (absenceBtn) {
      absenceBtn.innerHTML = '<i class="fas fa-door-open"></i> 中抜け';
      absenceBtn.classList.remove('btn-warning');
      absenceBtn.classList.add('btn-outline-warning');
    }

    // ボタンを再有効化
    this.enableButtonsAfterAbsence();

    this.showNotification('中抜けを終了しました', 'success');
  }

  /**
   * 中抜け中にボタンを無効化
   */
  disableButtonsDuringAbsence() {
    const clockInBtn = document.getElementById('userClockInBtn');
    const clockOutBtn = document.getElementById('userClockOutBtn');
    const breakBtn = document.getElementById('userBreakBtn');
    const breakStartBtn = document.getElementById('userBreakStartBtn');
    const breakEndBtn = document.getElementById('userBreakEndBtn');
    const shortBreakBtn = document.getElementById('userShortBreakBtn');

    if (clockInBtn) clockInBtn.disabled = true;
    if (clockOutBtn) clockOutBtn.disabled = true;
    if (breakBtn) breakBtn.disabled = true;
    if (breakStartBtn) breakStartBtn.disabled = true;
    if (breakEndBtn) breakEndBtn.disabled = true;
    if (shortBreakBtn) shortBreakBtn.disabled = true;
  }

  /**
   * 中抜け終了後にボタンを再有効化
   */
  enableButtonsAfterAbsence() {
    const clockOutBtn = document.getElementById('userClockOutBtn');
    const breakBtn = document.getElementById('userBreakBtn');
    const breakStartBtn = document.getElementById('userBreakStartBtn');
    const breakEndBtn = document.getElementById('userBreakEndBtn');
    const shortBreakBtn = document.getElementById('userShortBreakBtn');

    // 退勤ボタンは常に有効化
    if (clockOutBtn) clockOutBtn.disabled = false;

    // 休憩ボタンは状態に応じて有効化
    if (!this.hasBreakToday && breakStartBtn) {
      breakStartBtn.disabled = false;
    }
    if (this.isOnBreak && breakEndBtn) {
      breakEndBtn.disabled = false;
    }
    if (breakBtn && !this.isOnBreak) {
      breakBtn.disabled = false;
    }

    // 小休憩ボタンは有効化
    if (shortBreakBtn) shortBreakBtn.disabled = false;
  }

  /**
   * クリーンアップ
   */
  destroy() {
    this.stopBreakTimeMonitoring();
    this.clearAutoBreakEnd();

    // 小休憩タイマーのクリーンアップ
    if (this.shortBreakInterval) {
      clearInterval(this.shortBreakInterval);
      this.shortBreakInterval = null;
    }
  }
}