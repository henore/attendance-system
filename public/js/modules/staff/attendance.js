// modules/staff/attendance.js
// スタッフの出退勤UI制御（中抜け機能追加版）

import { API_ENDPOINTS } from '../../constants/api-endpoints.js';
import { getCurrentTime, getCurrentDate, calculateWorkHours, calculateBreakDuration } from '../../utils/date-time.js';
import { ConfirmationModal } from '../user/confirmation-modal.js';

export class StaffAttendanceUI {
  constructor(app, parentModule) {
    this.app = app;
    this.parent = parentModule;

    // 確認ダイアログ
    this.confirmationModal = new ConfirmationModal();

    // 状態管理
    this.isWorking = false;
    this.isOnBreak = false;
    this.isOnNakanuke = false;
    this.currentAttendance = null;
    this.breakStartTime = null;
    this.nakanukeStartTime = null;
    this.breakButtonUpdateInterval = null;
    this.nakanukeTimerInterval = null;
    this.breakOverAlerted = false; // 60分超過アラート済みフラグ
  }

  /**
   * 出勤処理
   */
  async handleClockIn() {
    try {
      const currentTime = getCurrentTime();

      const confirmed = await this.confirmationModal.show({
        title: '出勤確認',
        message: '出勤時刻は以下になります。出勤しますか？',
        time: currentTime,
        confirmText: 'はい',
        cancelText: 'いいえ',
        icon: 'fa-sign-in-alt'
      });

      if (!confirmed) {
        this.app.showNotification('出勤をキャンセルしました', 'info');
        return false;
      }

      const response = await this.app.apiCall(API_ENDPOINTS.ATTENDANCE.CLOCK_IN, {
        method: 'POST',
        body: JSON.stringify({ time: currentTime })
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
      // 休憩中は退勤不可
      if (this.isOnBreak) {
        this.app.showNotification('休憩を終了してから退勤してください', 'warning');
        return false;
      }

      // 中抜け中は退勤不可
      if (this.isOnNakanuke) {
        this.app.showNotification('中抜けを終了してから退勤してください', 'warning');
        return false;
      }

      const currentTime = getCurrentTime();

      const confirmed = await this.confirmationModal.show({
        title: '退勤確認',
        message: '退勤時刻は以下になります。退勤しますか？',
        time: currentTime,
        confirmText: 'はい',
        cancelText: 'いいえ',
        icon: 'fa-sign-out-alt'
      });

      if (!confirmed) {
        this.app.showNotification('退勤をキャンセルしました', 'info');
        return false;
      }

      const response = await this.app.apiCall(API_ENDPOINTS.STAFF.CLOCK_OUT, {
        method: 'POST'
      });

      if (response.success) {
        this.isWorking = false;
        this.isOnBreak = false;
        this.isOnNakanuke = false;
        this.breakStartTime = null;
        this.nakanukeStartTime = null;
        this.stopBreakTimer();
        this.stopNakanukeTimer();
        if (!this.currentAttendance.date) {
          this.currentAttendance.date = getCurrentDate();
        }
        this.currentAttendance.clock_out = response.time;
        this.updateUI();
        this.app.showNotification('退勤しました', 'success');
        this.updateReportSection();
        return true;
      }
    } catch (error) {
      console.error('退勤処理エラー:', error);

      if (error.message && error.message.includes('未コメント')) {
        const uncommentedReports = error.uncommentedReports || [];
        const userNames = uncommentedReports.map(r => r.user_name).join('、');

        const shouldProceed = confirm(
          `以下の利用者の日報にコメントが記入されていません：\n${userNames}\n\nコメント未入力ですが退勤しますか？`
        );

        if (shouldProceed) {
          await this.forceClockOut();
        }
      } else {
        this.app.showNotification(error.message || '退勤処理に失敗しました', 'danger');
      }
      return false;
    }
  }

  /**
   * 強制退勤処理（未コメント日報があっても退勤）
   */
  async forceClockOut() {
    try {
      const response = await this.app.apiCall('/api/staff/force-clock-out', {
        method: 'POST'
      });

      if (response.success) {
        this.isWorking = false;
        this.isOnBreak = false;
        this.isOnNakanuke = false;
        this.breakStartTime = null;
        this.nakanukeStartTime = null;
        this.stopBreakTimer();
        this.stopNakanukeTimer();
        if (!this.currentAttendance.date) {
          this.currentAttendance.date = getCurrentDate();
        }
        this.currentAttendance.clock_out = response.time;
        this.updateUI();
        this.app.showNotification('退勤しました（未コメント日報あり）', 'warning');
        this.updateReportSection();
        return true;
      }
    } catch (error) {
      console.error('強制退勤処理エラー:', error);
      this.app.showNotification(error.message || '強制退勤処理に失敗しました', 'danger');
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
      const currentTime = getCurrentTime();

      const confirmed = await this.confirmationModal.show({
        title: '休憩確認',
        message: '休憩を開始しますか？',
        time: `${currentTime} 開始`,
        confirmText: 'はい',
        cancelText: 'いいえ',
        icon: 'fa-coffee'
      });

      if (!confirmed) {
        this.app.showNotification('休憩をキャンセルしました', 'info');
        return false;
      }

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
  async handleBreakEnd() {
    if (!this.isOnBreak) {
      this.app.showNotification('休憩中ではありません', 'warning');
      return false;
    }

    try {
      const response = await this.app.apiCall(API_ENDPOINTS.STAFF.BREAK_END, {
        method: 'POST'
      });

      if (response.success) {
        this.isOnBreak = false;
        this.breakStartTime = null;
        this.stopBreakTimer();

        if (this.currentAttendance) {
          this.currentAttendance.break_start = response.breakStart;
          this.currentAttendance.break_end = response.endTime;
        }

        this.updateUI();
        this.updateBreakStatusDisplay();

        this.app.showNotification('休憩を終了しました', 'success');
        return true;
      }
    } catch (error) {
      console.error('休憩終了エラー:', error);
      this.app.showNotification(error.message || '休憩終了に失敗しました', 'danger');
      return false;
    }
  }

  /**
   * 中抜け開始処理
   */
  async handleNakanukeStart() {
    if (!this.isWorking) {
      this.app.showNotification('出勤中のみ中抜けできます', 'warning');
      return false;
    }

    try {
      const confirmed = await this.confirmationModal.show({
        title: '中抜け確認',
        message: '中抜けをしますか？',
        time: getCurrentTime(),
        confirmText: 'はい',
        cancelText: 'いいえ',
        icon: 'fa-door-open'
      });

      if (!confirmed) {
        this.app.showNotification('中抜けをキャンセルしました', 'info');
        return false;
      }

      // 理由入力ダイアログ
      const reason = prompt('中抜け理由を入力してください（必須）');
      if (!reason || !reason.trim()) {
        this.app.showNotification('中抜け理由は必須です', 'warning');
        return false;
      }

      const response = await this.app.apiCall(API_ENDPOINTS.STAFF.NAKANUKE_START, {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() })
      });

      if (response.success) {
        this.isOnNakanuke = true;
        this.nakanukeStartTime = response.startTime;
        if (this.currentAttendance) {
          this.currentAttendance.nakanuke_start = response.startTime;
          this.currentAttendance.nakanuke_minutes = 0;
          this.currentAttendance.nakanuke_reason = reason.trim();
        }
        this.updateUI();
        this.startNakanukeTimer();
        this.app.showNotification('中抜けを開始しました', 'info');
        return true;
      }
    } catch (error) {
      console.error('中抜け開始エラー:', error);
      this.app.showNotification(error.message || '中抜け開始に失敗しました', 'danger');
      return false;
    }
  }

  /**
   * 中抜け終了処理
   */
  async handleNakanukeEnd() {
    if (!this.isOnNakanuke) {
      this.app.showNotification('中抜け中ではありません', 'warning');
      return false;
    }

    try {
      const response = await this.app.apiCall(API_ENDPOINTS.STAFF.NAKANUKE_END, {
        method: 'POST'
      });

      if (response.success) {
        this.isOnNakanuke = false;
        this.nakanukeStartTime = null;
        this.stopNakanukeTimer();

        if (this.currentAttendance) {
          this.currentAttendance.nakanuke_minutes = response.nakanuke_minutes;
        }

        this.updateUI();
        this.updateNakanukeStatusDisplay();

        this.app.showNotification(`中抜けを終了しました（${response.nakanuke_minutes}分）`, 'success');
        return true;
      }
    } catch (error) {
      console.error('中抜け終了エラー:', error);
      this.app.showNotification(error.message || '中抜け終了に失敗しました', 'danger');
      return false;
    }
  }

  /**
   * 休憩タイマー開始（経過時間表示の定期更新＋60分超過アラート）
   */
  startBreakTimer() {
    this.breakOverAlerted = false;

    // 60分超過時のアラートをスケジュール
    const elapsed = this.getElapsedBreakMinutes();
    const remainingToAlert = Math.max(0, 60 - elapsed);
    this.breakAlertTimeout = setTimeout(() => {
      if (this.isOnBreak) {
        this.breakOverAlerted = true;
        alert('休憩時間が60分を超えています。管理者、上長に確認、報告をしてください。');
        this.updateBreakStatusDisplay();
      }
    }, remainingToAlert * 60 * 1000);

    // 30秒ごとにボタン状態と休憩ステータスを更新
    this.breakButtonUpdateInterval = setInterval(() => {
      this.updateButtonStates();
      this.updateBreakStatusDisplay();
    }, 30 * 1000);

    // 初回の休憩ステータス表示
    this.updateBreakStatusDisplay();
  }

  /**
   * 休憩タイマー停止
   */
  stopBreakTimer() {
    if (this.breakButtonUpdateInterval) {
      clearInterval(this.breakButtonUpdateInterval);
      this.breakButtonUpdateInterval = null;
    }
    if (this.breakAlertTimeout) {
      clearTimeout(this.breakAlertTimeout);
      this.breakAlertTimeout = null;
    }
  }

  /**
   * 中抜けタイマー開始
   */
  startNakanukeTimer() {
    this.updateNakanukeStatusDisplay();

    // 1分ごとに中抜けステータスを更新
    this.nakanukeTimerInterval = setInterval(() => {
      this.updateNakanukeStatusDisplay();
    }, 60 * 1000);
  }

  /**
   * 中抜けタイマー停止
   */
  stopNakanukeTimer() {
    if (this.nakanukeTimerInterval) {
      clearInterval(this.nakanukeTimerInterval);
      this.nakanukeTimerInterval = null;
    }
  }

  /**
   * 休憩経過時間を取得（分）
   */
  getElapsedBreakMinutes() {
    if (!this.breakStartTime) return 0;

    const now = new Date();
    const [startHours, startMinutes] = this.breakStartTime.split(':').map(Number);
    const startTime = new Date();
    startTime.setHours(startHours, startMinutes, 0, 0);

    const elapsed = Math.floor((now - startTime) / 1000 / 60);
    return elapsed;
  }

  /**
   * 中抜け経過時間を取得（分）
   */
  getElapsedNakanukeMinutes() {
    if (!this.nakanukeStartTime) return 0;

    const now = new Date();
    const [startHours, startMinutes] = this.nakanukeStartTime.split(':').map(Number);
    const startTime = new Date();
    startTime.setHours(startHours, startMinutes, 0, 0);

    const elapsed = Math.floor((now - startTime) / 1000 / 60);
    return elapsed;
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

        // 休憩状態のチェック
        if (response.attendance.break_start && !response.attendance.break_end) {
          this.isOnBreak = true;
          this.breakStartTime = response.attendance.break_start;
          this.startBreakTimer();
        }

        // 中抜け状態のチェック
        if (response.attendance.nakanuke_start && (response.attendance.nakanuke_minutes === 0 || response.attendance.nakanuke_minutes === null)) {
          this.isOnNakanuke = true;
          this.nakanukeStartTime = response.attendance.nakanuke_start;
          this.startNakanukeTimer();
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
    this.updateReportSection();
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
      } else if (this.currentAttendance.break_start && this.currentAttendance.break_end) {
        html += `
          <div class="alert alert-info">
            <i class="fas fa-coffee"></i>
            休憩済み（${this.currentAttendance.break_start}〜${this.currentAttendance.break_end}）
          </div>
        `;
      }

      if (this.isOnNakanuke) {
        html += `
          <div class="alert alert-danger">
            <i class="fas fa-door-open"></i>
            中抜け中（${this.nakanukeStartTime}〜）
          </div>
        `;
      } else if (this.currentAttendance.nakanuke_minutes > 0) {
        html += `
          <div class="alert alert-secondary">
            <i class="fas fa-door-closed"></i>
            中抜け済み（${this.currentAttendance.nakanuke_minutes}分）
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

      if (this.currentAttendance.break_start && this.currentAttendance.break_end) {
        html += `
          <div class="alert alert-secondary">
            <i class="fas fa-coffee"></i>
            休憩時間（${this.currentAttendance.break_start}〜${this.currentAttendance.break_end}）
          </div>
        `;
      }

      if (this.currentAttendance.nakanuke_minutes > 0) {
        html += `
          <div class="alert alert-secondary">
            <i class="fas fa-door-closed"></i>
            中抜け（${this.currentAttendance.nakanuke_minutes}分）
          </div>
        `;
      }
    } else {
      html = `
        <div class="alert alert-secondary">
          <i class="fas fa-clock"></i>
          本日はまだ出勤していません
        </div>
      `;
    }

    statusElement.innerHTML = html;

    // 休憩ステータス専用表示エリアの更新
    this.updateBreakStatusDisplay();
    this.updateNakanukeStatusDisplay();
  }

  /**
   * 休憩ステータス専用の表示を更新
   */
  updateBreakStatusDisplay() {
    const breakStatusElement = document.getElementById('breakStatusDisplay');
    if (!breakStatusElement) return;

    let html = '';

    if (this.isOnBreak) {
      const elapsed = this.getElapsedBreakMinutes();
      const isOver = elapsed >= 60;

      if (isOver) {
        html = `
          <div class="break-status-content text-danger">
            <div class="break-status-icon">
              <i class="fas fa-exclamation-triangle fa-2x"></i>
            </div>
            <div class="break-status-text">
              <p class="mb-1 fw-bold">休憩時間が60分を超えています（${elapsed} 分経過）</p>
              <p class="mb-1">管理者、上長に確認、報告をしてください</p>
              <small class="text-muted">
                <i class="fas fa-clock"></i> ${this.breakStartTime} から休憩開始
              </small>
            </div>
          </div>
        `;
      } else {
        html = `
          <div class="break-status-content">
            <div class="break-status-icon text-warning">
              <i class="fas fa-coffee fa-2x"></i>
            </div>
            <div class="break-status-text">
              <p class="mb-1 fw-bold">休憩中（${elapsed} 分経過）</p>
              <small class="text-muted">
                <i class="fas fa-clock"></i> ${this.breakStartTime} から休憩開始
              </small>
            </div>
          </div>
        `;
      }
    }

    breakStatusElement.innerHTML = html;

    if (html) {
      breakStatusElement.style.opacity = '1';
    } else {
      breakStatusElement.style.opacity = '0';
    }
  }

  /**
   * 中抜けステータス表示を更新
   */
  updateNakanukeStatusDisplay() {
    const nakanukeStatusElement = document.getElementById('nakanukeStatusDisplay');
    if (!nakanukeStatusElement) return;

    let html = '';

    if (this.isOnNakanuke) {
      const elapsed = this.getElapsedNakanukeMinutes();
      html = `
        <div class="break-status-content text-danger">
          <div class="break-status-icon">
            <i class="fas fa-door-open fa-2x"></i>
          </div>
          <div class="break-status-text">
            <p class="mb-1 fw-bold">中抜け中（${elapsed} 分経過）</p>
            <small class="text-muted">
              <i class="fas fa-clock"></i> ${this.nakanukeStartTime} から中抜け開始
            </small>
          </div>
        </div>
      `;
    }

    nakanukeStatusElement.innerHTML = html;

    if (html) {
      nakanukeStatusElement.style.opacity = '1';
    } else {
      nakanukeStatusElement.style.opacity = '0';
    }
  }

  /**
   * ボタン状態更新
   */
  updateButtonStates() {
    const clockInBtn = document.getElementById('clockInBtn');
    const clockOutBtn = document.getElementById('clockOutBtn');
    const breakStartBtn = document.getElementById('breakStartBtn');
    const breakEndBtn = document.getElementById('breakEndBtn');
    const nakanukeStartBtn = document.getElementById('nakanukeStartBtn');
    const nakanukeEndBtn = document.getElementById('nakanukeEndBtn');

    if (this.isWorking) {
      if (clockInBtn) clockInBtn.disabled = true;
      // 休憩中・中抜け中は退勤ボタンを無効化
      if (clockOutBtn) clockOutBtn.disabled = this.isOnBreak || this.isOnNakanuke;

      if (this.isOnBreak) {
        if (breakStartBtn) breakStartBtn.disabled = true;
        if (breakEndBtn) breakEndBtn.disabled = false;
        // 休憩中は中抜け不可
        if (nakanukeStartBtn) nakanukeStartBtn.disabled = true;
        if (nakanukeEndBtn) nakanukeEndBtn.disabled = true;
      } else if (this.isOnNakanuke) {
        // 中抜け中は休憩・退勤・日報不可
        if (breakStartBtn) breakStartBtn.disabled = true;
        if (breakEndBtn) breakEndBtn.disabled = true;
        if (nakanukeStartBtn) nakanukeStartBtn.disabled = true;
        if (nakanukeEndBtn) nakanukeEndBtn.disabled = false;
      } else {
        if (breakStartBtn) {
          breakStartBtn.disabled = this.currentAttendance.break_start ? true : false;
        }
        if (breakEndBtn) breakEndBtn.disabled = true;
        // 中抜け済みの場合は再度中抜け不可
        if (nakanukeStartBtn) {
          nakanukeStartBtn.disabled = (this.currentAttendance.nakanuke_minutes > 0) ? true : false;
        }
        if (nakanukeEndBtn) nakanukeEndBtn.disabled = true;
      }

      // 中抜け中は日報提出ボタンを無効化
      const submitBtn = document.getElementById('staffSubmitReportBtn');
      if (submitBtn) {
        submitBtn.disabled = this.isOnNakanuke || this.isOnBreak || !this.currentAttendance.clock_in;
      }
    } else {
      if (this.currentAttendance && this.currentAttendance.clock_out) {
        if (clockInBtn) clockInBtn.disabled = true;
      } else {
        if (clockInBtn) clockInBtn.disabled = false;
      }
      if (clockOutBtn) clockOutBtn.disabled = true;
      if (breakStartBtn) breakStartBtn.disabled = true;
      if (breakEndBtn) breakEndBtn.disabled = true;
      if (nakanukeStartBtn) nakanukeStartBtn.disabled = true;
      if (nakanukeEndBtn) nakanukeEndBtn.disabled = true;
    }
  }

  /**
   * 日報セクションの更新（常に表示。退勤前は提出ボタンを無効化）
   */
  async updateReportSection() {
    const reportSection = document.getElementById('staffReportSection');
    if (!reportSection) return;

    await this.loadReportForm(reportSection);
  }

  /**
   * 日報フォームを読み込み
   */
  async loadReportForm(container) {
    try {
      const response = await this.app.apiCall(API_ENDPOINTS.STAFF.DAILY_REPORT_TODAY);
      const existingReport = response.report;

      const attendance = this.currentAttendance || {};
      // 出勤後は提出可能（退勤を待たない）
      const canSubmit = !!attendance.clock_in && !this.isOnNakanuke && !this.isOnBreak;

      // 休憩時間を計算（実際の開始・終了時刻から）
      const breakMinutes = (attendance.break_start && attendance.break_end)
        ? calculateBreakDuration(attendance.break_start, attendance.break_end)
        : 0;

      // 中抜け時間
      const nakanukeMinutes = attendance.nakanuke_minutes || 0;

      // 実働時間は退勤後のみ計算、それ以外は'-'表示
      // 休憩と中抜けの時間を除外
      let workHours = '-';
      if (attendance.clock_in && attendance.clock_out) {
        const totalDeduction = breakMinutes + nakanukeMinutes;
        const hours = calculateWorkHours(attendance.clock_in, attendance.clock_out, totalDeduction);
        if (hours && hours > 0) {
          const totalMin = Math.round(hours * 60);
          const h = Math.floor(totalMin / 60);
          const m = totalMin % 60;
          workHours = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        }
      }

      container.innerHTML = this.generateReportForm(workHours, existingReport, breakMinutes, canSubmit, nakanukeMinutes);
      this.setupReportEventListeners();

    } catch (error) {
      console.error('日報フォーム読み込みエラー:', error);
      container.innerHTML = `
        <div class="alert alert-danger">
          <i class="fas fa-exclamation-triangle"></i> 日報フォームの読み込みに失敗しました
        </div>
      `;
    }
  }

  /**
   * 日報フォームHTML生成
   */
  generateReportForm(workHours, existingReport, breakMinutes = 0, canSubmit = true, nakanukeMinutes = 0) {
    const workReport = existingReport?.work_report || '';
    const communication = existingReport?.communication || '';
    const attendance = this.currentAttendance || {};
    const clockInDisplay = attendance.clock_in || '-';
    const clockOutDisplay = attendance.clock_out || '-';

    let breakDisplay = 'なし';
    if (attendance.break_start && attendance.break_end) {
      breakDisplay = `${attendance.break_start}〜${attendance.break_end}（${breakMinutes}分）`;
    } else if (attendance.break_start) {
      breakDisplay = `${attendance.break_start}〜（進行中）`;
    }

    let nakanukeDisplay = 'なし';
    if (this.isOnNakanuke) {
      nakanukeDisplay = `${this.nakanukeStartTime}〜（進行中）`;
    } else if (nakanukeMinutes > 0) {
      nakanukeDisplay = `${nakanukeMinutes}分`;
    }

    const isResubmit = !!existingReport;
    const submitBtnLabel = isResubmit ? '日報を再提出' : '日報を提出';
    const submitBtnDisabled = canSubmit ? '' : 'disabled';

    return `
      <div class="card">
        <div class="card-header bg-primary text-white">
          <h5 class="mb-0"><i class="fas fa-clipboard-list"></i> スタッフ日報</h5>
        </div>
        <div class="card-body">
          <div class="row mb-3">
            <div class="col-md-3">
              <div class="info-box">
                <label class="form-label">出勤時間</label>
                <div class="info-value">${clockInDisplay}</div>
              </div>
            </div>
            <div class="col-md-3">
              <div class="info-box">
                <label class="form-label">退勤時間</label>
                <div class="info-value">${clockOutDisplay}</div>
              </div>
            </div>
            <div class="col-md-2">
              <div class="info-box">
                <label class="form-label">休憩時間</label>
                <div class="info-value">${breakDisplay}</div>
              </div>
            </div>
            <div class="col-md-2">
              <div class="info-box">
                <label class="form-label">中抜け</label>
                <div class="info-value">${nakanukeDisplay}</div>
              </div>
            </div>
            <div class="col-md-2">
              <div class="info-box">
                <label class="form-label text-primary">実働時間</label>
                <div class="info-value text-primary fw-bold">${workHours}</div>
              </div>
            </div>
          </div>

          <hr>

          <form id="staffDailyReportForm">
            <div class="mb-3">
              <label for="staffWorkReport" class="form-label required">
                <i class="fas fa-tasks"></i> 本日の業務報告
              </label>
              <textarea
                class="form-control"
                id="staffWorkReport"
                rows="8"
                required
                placeholder="本日の業務内容、対応した利用者の状況、特記事項などを記入してください"
              >${workReport}</textarea>
            </div>

            <div class="mb-3">
              <label for="staffCommunication" class="form-label">
                <i class="fas fa-comment-dots"></i> 連絡事項
              </label>
              <textarea
                class="form-control"
                id="staffCommunication"
                rows="5"
                placeholder="次のシフトのスタッフへの申し送りや、重要な連絡事項があれば記入してください"
              >${communication}</textarea>
            </div>

            <div class="d-grid">
              <button type="submit" class="btn btn-primary btn-lg" id="staffSubmitReportBtn" ${submitBtnDisabled}>
                <i class="fas fa-paper-plane"></i> ${submitBtnLabel}
              </button>
            </div>
          </form>
        </div>
      </div>

      <style>
        .info-box {
          background: #f8f9fa;
          border-radius: 8px;
          padding: 10px;
          text-align: center;
        }
        .info-box .form-label {
          font-size: 0.875rem;
          color: #6c757d;
          margin-bottom: 5px;
        }
        .info-box .info-value {
          font-size: 1.1rem;
          font-weight: bold;
          color: #333;
        }
        .required::after {
          content: " *";
          color: #dc3545;
        }
      </style>
    `;
  }

  /**
   * 日報フォームのイベントリスナー設定
   */
  setupReportEventListeners() {
    const form = document.getElementById('staffDailyReportForm');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleReportSubmit();
      });
    }
  }

  /**
   * 日報提出処理
   */
  async handleReportSubmit() {
    try {
      const workReport = document.getElementById('staffWorkReport').value;
      const communication = document.getElementById('staffCommunication').value;

      if (!workReport || !workReport.trim()) {
        this.app.showNotification('業務報告を入力してください', 'warning');
        return;
      }

      const data = {
        date: this.currentAttendance.date,
        work_report: workReport,
        communication: communication
      };

      const response = await this.app.apiCall(API_ENDPOINTS.STAFF.DAILY_REPORT_SUBMIT, {
        method: 'POST',
        body: JSON.stringify(data)
      });

      if (response.success) {
        this.app.showNotification('日報を提出しました', 'success');

        // フォームは非表示にせず、再提出可能な状態で維持する
        await this.updateReportSection();
      } else {
        throw new Error(response.error || '日報の提出に失敗しました');
      }

    } catch (error) {
      console.error('日報提出エラー:', error);
      this.app.showNotification(error.message, 'danger');
    }
  }

  /**
   * クリーンアップ
   */
  destroy() {
    this.stopBreakTimer();
    this.stopNakanukeTimer();
  }
}
