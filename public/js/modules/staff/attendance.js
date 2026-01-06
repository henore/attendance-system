// modules/staff/attendance.js
// スタッフの出退勤UI制御（簡潔版）

import { API_ENDPOINTS } from '../../constants/api-endpoints.js';
import { getCurrentTime, getCurrentDate } from '../../utils/date-time.js';
import { ConfirmationModal } from '../user/confirmation-modal.js';
import { StaffDailyReportModal } from './daily-report-modal.js';

export class StaffAttendanceUI {
  constructor(app, parentModule) {
    this.app = app;
    this.parent = parentModule;

    // 確認ダイアログ
    this.confirmationModal = new ConfirmationModal();
    this.dailyReportModal = new StaffDailyReportModal(
      this.app.apiCall.bind(this.app),
      this.app.showNotification.bind(this.app)
    );

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
      const currentTime = getCurrentTime();

      // 確認ダイアログを表示
      const confirmed = await this.confirmationModal.show({
        title: '出勤確認',
        message: '出勤時刻は以下になります。出勤しますか？',
        time: currentTime,
        confirmText: 'はい',
        cancelText: 'いいえ',
        icon: 'fa-sign-in-alt'
      });

      // いいえの場合は処理を中断
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
      // 休憩中の場合は確認
      if (this.isOnBreak) {
        const confirmMessage = '現在休憩中です。\n急病・早退等の理由で退勤する場合は「OK」を押してください。\n休憩を終了してから退勤する場合は「キャンセル」を押してください。';
        if (!confirm(confirmMessage)) {
          return false;
        }
        // 休憩を自動終了
        await this.handleBreakEnd(true);
      }

      const currentTime = getCurrentTime();

      // 確認ダイアログを表示
      const confirmed = await this.confirmationModal.show({
        title: '退勤確認',
        message: '退勤時刻は以下になります。退勤しますか？',
        time: currentTime,
        confirmText: 'はい',
        cancelText: 'いいえ',
        icon: 'fa-sign-out-alt'
      });

      // いいえの場合は処理を中断
      if (!confirmed) {
        this.app.showNotification('退勤をキャンセルしました', 'info');
        return false;
      }

      const response = await this.app.apiCall(API_ENDPOINTS.STAFF.CLOCK_OUT, {
        method: 'POST'
      });

      if (response.success) {
        this.isWorking = false;
        this.currentAttendance.clock_out = response.time;
        this.currentAttendance.date = getCurrentDate();
        this.updateUI();
        this.app.showNotification('退勤しました', 'success');

        // 日報モーダルを表示
        await this.showDailyReportModal();
        return true;
      }
    } catch (error) {
      console.error('退勤処理エラー:', error);

      // 未コメントの日報がある場合の処理
      if (error.message && error.message.includes('未コメント')) {
        const uncommentedReports = error.uncommentedReports || [];
        const userNames = uncommentedReports.map(r => r.user_name).join('、');

        // 確認ダイアログを表示
        const shouldProceed = confirm(
          `以下の利用者の日報にコメントが記入されていません：\n${userNames}\n\nコメント未入力ですが退勤しますか？`
        );

        if (shouldProceed) {
          // 強制退勤処理
          await this.forceClockOut();
        }
      } else {
        this.app.showNotification(error.message || '退勤処理に失敗しました', 'danger');
      }
      return false;
    }
  }

  /**
   * 日報モーダルを表示
   */
  async showDailyReportModal() {
    try {
      await this.dailyReportModal.show(this.currentAttendance, () => {
        // 日報提出完了時の処理
        console.log('日報提出完了');
      });
    } catch (error) {
      console.error('日報モーダル表示エラー:', error);
    }
  }

  /**
   * 強制退勤処理（未コメント日報があっても退勤）
   */
  async forceClockOut() {
    try {
      // 休憩中の場合は自動終了
      if (this.isOnBreak) {
        await this.handleBreakEnd(true);
      }

      // 強制退勤APIを呼び出し（未コメントチェックをスキップ）
      const response = await this.app.apiCall('/api/staff/force-clock-out', {
        method: 'POST'
      });

      if (response.success) {
        this.isWorking = false;
        this.currentAttendance.clock_out = response.time;
        this.updateUI();
        this.app.showNotification('退勤しました（未コメント日報あり）', 'warning');
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

      // 確認ダイアログを表示
      const confirmed = await this.confirmationModal.show({
        title: '休憩確認',
        message: '休憩を開始しますか？',
        time: `${currentTime} 開始（60分間）`,
        confirmText: 'はい',
        cancelText: 'いいえ',
        icon: 'fa-coffee'
      });

      // いいえの場合は処理を中断
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
      
      // 休憩終了情報を記録
      if (this.currentAttendance) {
        this.currentAttendance.break_start = response.breakStart;
        this.currentAttendance.break_end = response.endTime;
      }
      
      this.updateUI();
      
      // 休憩ステータス表示をクリア
      this.updateBreakStatusDisplay();
      
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
      
      // 休憩状態のチェック
      if (response.attendance.break_start && !response.attendance.break_end) {
        // 休憩中の状態を復元
        this.isOnBreak = true;
        this.breakStartTime = response.attendance.break_start;
        
        // 経過時間をチェック
        const elapsed = this.getElapsedBreakMinutes();
        
        if (elapsed >= 60) {
          // 60分経過している場合は自動終了
          await this.handleBreakEnd(true);
        } else {
          // 残り時間でタイマーを再設定
          const remainingMinutes = 60 - elapsed;
          this.breakCheckInterval = setTimeout(() => {
            this.handleBreakEnd(true);
          }, remainingMinutes * 60 * 1000);
          
          // ボタン状態と休憩ステータス更新のインターバルも設定
          this.breakButtonUpdateInterval = setInterval(() => {
            this.updateButtonStates();
            this.updateBreakStatusDisplay();
          }, 30 * 1000);
        }
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
    } else if (this.currentAttendance.break_start && this.currentAttendance.break_end) {
      // 休憩済みの場合の表示
      html += `
        <div class="alert alert-info">
          <i class="fas fa-coffee"></i> 
          休憩済み（${this.currentAttendance.break_start}〜${this.currentAttendance.break_end}）
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
    
    // 退勤済みでも休憩情報を表示
    if (this.currentAttendance.break_start && this.currentAttendance.break_end) {
      html += `
        <div class="alert alert-secondary">
          <i class="fas fa-coffee"></i> 
          休憩時間（${this.currentAttendance.break_start}〜${this.currentAttendance.break_end}）
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
}

// 休憩ステータス専用の表示を更新するメソッド
updateBreakStatusDisplay() {
  const breakStatusElement = document.getElementById('breakStatusDisplay');
  if (!breakStatusElement) return;
  
  let html = '';
  
  if (this.isOnBreak) {
    const elapsed = this.getElapsedBreakMinutes();
    const remaining = Math.max(0, 60 - elapsed);
    
    if (elapsed >= 60) {
      html = `
        <p class="text-danger">
          <i class="fas fa-exclamation-circle"></i> 
          休憩時間が60分を超過しています
        </p>
        <small>自動的に終了処理を行います</small>
      `;
    } else {
      html = `
        <p class="text-warning">
          <i class="fas fa-coffee"></i> 
          休憩中（残り ${remaining} 分）
        </p>
        <small>${this.breakStartTime} から休憩開始</small>
      `;
    }
  }
  
  breakStatusElement.innerHTML = html;
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
      if (breakEndBtn) {
        // 60分経過チェック
        if (this.breakStartTime) {
          const elapsed = this.getElapsedBreakMinutes();
          breakEndBtn.disabled = elapsed >= 60;
        } else {
          breakEndBtn.disabled = false;
        }
      }
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


// modules/staff/attendance.js の修正部分

// handleBreakEnd メソッドを修正
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
      
      // 休憩終了情報を記録
      if (this.currentAttendance) {
        this.currentAttendance.break_start = response.breakStart;
        this.currentAttendance.break_end = response.endTime;
      }
      
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

// updateAttendanceDisplay メソッドを修正
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
      // 休憩済みの場合の表示
      html += `
        <div class="alert alert-info">
          <i class="fas fa-coffee"></i> 
          休憩済み（${this.currentAttendance.break_start}〜${this.currentAttendance.break_end}）
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
    
    // 退勤済みでも休憩情報を表示
    if (this.currentAttendance.break_start && this.currentAttendance.break_end) {
      html += `
        <div class="alert alert-secondary">
          <i class="fas fa-coffee"></i> 
          休憩時間（${this.currentAttendance.break_start}〜${this.currentAttendance.break_end}）
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
}

// 休憩ステータス専用の表示を更新する新メソッド
updateBreakStatusDisplay() {
  const breakStatusElement = document.getElementById('breakStatusDisplay');
  if (!breakStatusElement) return;
  
  let html = '';
  
  if (this.isOnBreak) {
    const elapsed = this.getElapsedBreakMinutes();
    const remaining = Math.max(0, 60 - elapsed);
    
    if (elapsed >= 60) {
      html = `
        <div class="break-status-content text-danger">
          <div class="break-status-icon">
            <i class="fas fa-exclamation-circle fa-2x"></i>
          </div>
          <div class="break-status-text">
            <p class="mb-1 fw-bold">休憩時間が60分を超過しています</p>
            <small class="text-muted">自動的に終了処理を行います</small>
          </div>
        </div>
      `;
    } else {
      const progressPercent = (elapsed / 60) * 100;
      html = `
        <div class="break-status-content">
          <div class="break-status-icon text-warning">
            <i class="fas fa-coffee fa-2x"></i>
          </div>
          <div class="break-status-text">
            <p class="mb-1 fw-bold">休憩中（残り ${remaining} 分）</p>
            <div class="progress mb-2" style="height: 8px;">
              <div class="progress-bar bg-warning" role="progressbar" 
                   style="width: ${progressPercent}%" 
                   aria-valuenow="${elapsed}" 
                   aria-valuemin="0" 
                   aria-valuemax="60">
              </div>
            </div>
            <small class="text-muted">
              <i class="fas fa-clock"></i> ${this.breakStartTime} から休憩開始
            </small>
          </div>
        </div>
      `;
    }
  }
  
  breakStatusElement.innerHTML = html;
  
  // 表示をスムーズに切り替える
  if (html) {
    breakStatusElement.style.opacity = '1';
  } else {
    breakStatusElement.style.opacity = '0';
  }
}

// updateButtonStates メソッドを修正（60分経過判定追加）
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
      if (breakEndBtn) {
        // 60分経過チェック
        if (this.breakStartTime) {
          const elapsed = this.getElapsedBreakMinutes();
          breakEndBtn.disabled = elapsed >= 60;
        } else {
          breakEndBtn.disabled = false;
        }
      }
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

// 休憩経過時間を取得する新しいメソッド
getElapsedBreakMinutes() {
  if (!this.breakStartTime) return 0;
  
  const now = new Date();
  const [startHours, startMinutes] = this.breakStartTime.split(':').map(Number);
  const startTime = new Date();
  startTime.setHours(startHours, startMinutes, 0, 0);
  
  const elapsed = Math.floor((now - startTime) / 1000 / 60);
  return elapsed;
}

// startBreakTimer メソッドを修正（ボタン状態更新を追加）
startBreakTimer() {
  // 60分後に自動終了
  this.breakCheckInterval = setTimeout(() => {
    this.handleBreakEnd(true);
  }, 60 * 60 * 1000);
  
  // 30秒ごとにボタン状態と休憩ステータスを更新
  this.breakButtonUpdateInterval = setInterval(() => {
    this.updateButtonStates();
    this.updateBreakStatusDisplay();
  }, 30 * 1000);
  
  // 初回の休憩ステータス表示
  this.updateBreakStatusDisplay();
}


// stopBreakTimer メソッドを修正
stopBreakTimer() {
  if (this.breakCheckInterval) {
    clearTimeout(this.breakCheckInterval);
    this.breakCheckInterval = null;
  }
  if (this.breakButtonUpdateInterval) {
    clearInterval(this.breakButtonUpdateInterval);
    this.breakButtonUpdateInterval = null;
  }
}

  /**
   * クリーンアップ
   */
// destroy メソッドも更新
destroy() {
  this.stopBreakTimer();
}
}