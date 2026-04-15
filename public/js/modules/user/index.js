import BaseModule from '../../base-module.js';
import { UserAttendanceHandler } from './attendance.js';
import { UserReportHandler } from './report.js';
import { UserBreakHandler } from './break.js';
import { UserAttendanceCalendar } from './calendar.js';
import { TermsModal } from './terms-modal.js';
import { LastReportModal } from './last-report-modal.js';
import { ConfirmationModal } from './confirmation-modal.js';
import { getCurrentTime } from '../../utils/date-time.js';

export default class UserModule extends BaseModule {
  constructor(app) {
    super(app);
    
    // サブモジュール初期化
    this.attendanceHandler = new UserAttendanceHandler(
      this.apiCall.bind(this),
      this.app.showNotification.bind(this.app),
      this.currentUser
    );
    
    this.reportHandler = new UserReportHandler(
      this.apiCall.bind(this),
      this.app.showNotification.bind(this.app)
    );

    // confirmationModalを先に初期化
    this.confirmationModal = new ConfirmationModal();

    this.breakHandler = new UserBreakHandler(
      this.apiCall.bind(this),
      this.app.showNotification.bind(this.app),
      this.currentUser,
      this.confirmationModal
    );
    
    this.calendar = new UserAttendanceCalendar(
      this.apiCall.bind(this),
      this.app.showNotification.bind(this.app)
    );
    
    this.lastReportModal = new LastReportModal(
      this.attendanceHandler.updateClockInButtonState.bind(this.attendanceHandler),
      this.app.showNotification.bind(this.app)
    );
    
    this.termsModal = new TermsModal(
      this.attendanceHandler.updateClockInButtonState.bind(this.attendanceHandler),
      this.app.showNotification.bind(this.app)
    );

    // 状態管理
    this.state = {
      currentAttendance: null,
      isWorking: false,
      hasTodayReport: false,
      hasConfirmedLastReport: false,
      hasAcceptedTerms: false,  // 利用規約同意フラグ追加
      lastReportData: null,
      hasClockInToday: false
    };
    
    // ページ離脱警告用
    this.beforeUnloadHandler = null;
    this.visibilityChangeHandler = null;
  }

  async init() {
    this.render();
    await this.loadInitialData();
    this.setupPageLeaveWarning();
    
    // モーダル表示は出勤前のみ
    if (!this.state.hasClockInToday) {
      await this.showInitialModals();
    }
  }

  /**
   * 初回モーダル表示（前回記録確認→利用規約）
   */
  async showInitialModals() {
    // 1. 前回記録確認モーダル
    const lastReport = await this.attendanceHandler.getLastReport();
    if (lastReport) {
      this.state.lastReportData = lastReport;
      
      // 前回記録確認モーダルを表示し、確認完了を待つ
      await new Promise((resolve) => {
        this.lastReportModal.show(lastReport, () => {
          this.state.hasConfirmedLastReport = true;
          resolve();
        });
      });
      
      // モーダルが完全に閉じるまで待機
      await new Promise(resolve => setTimeout(resolve, 500));
    } else {
      this.state.hasConfirmedLastReport = true;
    }
    
    // 2. 利用規約モーダル
    await new Promise((resolve) => {
      this.termsModal.show(() => {
        this.state.hasAcceptedTerms = true;
        resolve();
      });
    });
  }

  /**
   * 出勤処理
   */
  async handleClockIn() {
    // 前回記録の確認チェック
    if (this.state.lastReportData && !this.state.hasConfirmedLastReport) {
      this.app.showNotification('前回の記録を確認してください', 'warning');
      return;
    }

    // 利用規約の同意チェック
    if (!this.state.hasAcceptedTerms) {
      this.app.showNotification('利用規約に同意してください', 'warning');
      return;
    }

    // 出勤予定時刻を計算
    const currentTime = getCurrentTime();
    const scheduledTime = this.attendanceHandler.roundClockInTime(currentTime);

    // 確認モーダルを表示
    const confirmed = await this.confirmationModal.show({
      title: '出勤確認',
      message: '出勤時刻は以下になります。出勤しますか？',
      time: scheduledTime,
      confirmText: 'はい',
      cancelText: 'いいえ',
      icon: 'fa-sign-in-alt'
    });

    // いいえの場合は処理を中断
    if (!confirmed) {
      this.app.showNotification('出勤をキャンセルしました', 'info');
      return;
    }

    // はいの場合は出勤処理を実行
    const result = await this.attendanceHandler.clockIn();
    if (result.success) {
      this.state.currentAttendance = result.attendance;
      this.state.isWorking = true;
      this.state.hasClockInToday = true;

      this.breakHandler.resetBreakState();
      this.updateAttendanceUI();
      this.updateLogoutButtonVisibility();

      // 出勤後の警告設定を更新
      this.updatePageLeaveWarning();

      this.app.showNotification('出勤しました。本日の業務を開始してください。', 'success');
    }
  }

  render() {
    const content = document.getElementById('app-content');
    content.innerHTML = `
      <div class="user-dashboard">
        <!-- 出退勤セクション -->
        <div class="row mb-4">
          <div class="col-md-6">
            <div class="status-card">
              <h5><i class="fas fa-user-clock"></i> 出勤状況</h5>
              <div id="userAttendanceStatus">
                <p class="mb-3">本日はまだ出勤していません</p>
                <button class="btn btn-clock btn-clock-in" id="userClockInBtn">
                  <i class="fas fa-clock"></i> 出勤
                </button>
              </div>
            </div>
          </div>
          <div class="col-md-6">
            <div class="status-card">
              <h6><i class="fas fa-coffee"></i> 休憩管理</h6>
              <div id="userBreakStatus">
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
              </div>
              <div id="userBreakTimeDisplay" class="mt-2" style="display: none;">
                <small class="text-muted">休憩時間: <span id="userBreakDuration">00:00</span></small>
              </div>
              <div id="userShortBreakDisplay" class="mt-2" style="display: none;">
                <div class="progress" style="height: 20px;">
                  <div class="progress-bar progress-bar-striped progress-bar-animated" id="shortBreakProgressBar" role="progressbar" style="width: 0%">
                    <span id="shortBreakTimer">10:00</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 日報セクション -->
        <div class="row mb-4">
          <div class="col-12">
            <div class="custom-card">
              <div class="custom-card-header">
                <h5><i class="fas fa-file-alt"></i> 日報入力</h5>
                <button class="btn btn-outline-light btn-sm" id="refreshReportBtn">
                  <i class="fas fa-sync"></i> 更新
                </button>
              </div>
              <div class="card-body">
                <div id="reportFormContainer">
                  <!-- 日報フォームがここに表示される -->
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 出勤履歴カレンダー -->
        <div class="row mb-4">
          <div class="col-12">
            <div class="custom-card">
              <div class="custom-card-header">
                <h5><i class="fas fa-calendar-alt"></i> 出勤履歴</h5>
                <button class="btn btn-outline-light btn-sm" id="refreshCalendarBtn">
                  <i class="fas fa-sync"></i> 更新
                </button>
              </div>
              <div class="card-body">
                <div id="attendanceCalendarContainer">
                  <!-- 出勤履歴カレンダーがここに表示される -->
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- スタッフコメント表示 -->
        <div class="row mb-4" id="staffCommentSection" style="display: none;">
          <div class="col-12">
            <div class="custom-card">
              <div class="custom-card-header bg-info text-white">
                <h5><i class="fas fa-comment"></i> スタッフからのコメント</h5>
                <button class="btn btn-outline-light btn-sm" id="markCommentReadBtn">
                  <i class="fas fa-check"></i> 確認済み
                </button>
              </div>
              <div class="card-body">
                <div id="staffCommentContent">
                  <!-- スタッフコメントがここに表示される -->
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.setupEventListeners();
  }

  setupEventListeners() {
    // 出退勤ボタン
    this.addEventListenerById('userClockInBtn', 'click', () => this.handleClockIn());

    // 日報更新
    this.addEventListenerById('refreshReportBtn', 'click', () => this.loadReportForm());

    // カレンダー更新
    this.addEventListenerById('refreshCalendarBtn', 'click', () => this.refreshCalendar());

    // スタッフコメント
    this.addEventListenerById('markCommentReadBtn', 'click', () => this.markCommentAsRead());

    // 小休憩ボタン
    this.addEventListenerById('userShortBreakBtn', 'click', () => this.breakHandler.handleShortBreakStart());

    // 中抜けボタン
    this.addEventListenerById('userAbsenceBtn', 'click', () => this.breakHandler.handleAbsenceStart());

    // 日報フォームのイベント（動的生成のため委譲）
    document.addEventListener('submit', (e) => {
      if (e.target.id === 'reportForm') {
        e.preventDefault();
        this.reportHandler.submitReport(e);
      }
    });
  }

  async loadInitialData() {
    await this.loadTodayAttendance();
    await this.loadReportForm();
    await this.checkUnreadComments();
    await this.loadAttendanceCalendar();
  }

  /**
   * 今日の出勤状況を読み込み
   */
  async loadTodayAttendance() {
    const result = await this.attendanceHandler.getTodayAttendance();

    this.state.currentAttendance = result.attendance;
    this.state.isWorking = result.isWorking;
    this.state.hasTodayReport = result.hasReport;

    // 今日出勤したかのフラグを設定
    this.state.hasClockInToday = !!(result.attendance && result.attendance.clock_in);

    // 既に出勤している場合は、モーダル確認済みとする
    if (this.state.hasClockInToday) {
      this.state.hasConfirmedLastReport = true;
      this.state.hasAcceptedTerms = true;
    }

    if (result.attendance) {
    await this.breakHandler.loadBreakStatus(this.state.currentAttendance);
    }

    // 日報提出時のコールバックを設定（ページリロード後も機能するように）
    this.reportHandler.onReportSubmit = () => {
      this.state.hasTodayReport = true;
      this.updateLogoutButtonVisibility();
    };

    this.updateAttendanceUI();
    this.updateLogoutButtonVisibility();
  }

  /**
   * 出勤状況UIを更新
   */
  updateAttendanceUI() {
    const statusElement = document.getElementById('userAttendanceStatus');
    
    this.attendanceHandler.updateUI(this.state, statusElement, {
      onClockIn: () => this.handleClockIn(),
      onClockOut: () => this.handleClockOut()
    });
    
    if (this.state.isWorking) {
      this.breakHandler.updateUI(statusElement);
    } else if (this.state.hasWorkedToday && !this.state.isWorking) {
      // 退勤後の状態
      this.breakHandler.disableUI();
    } else {
      // 出勤前の状態
      this.breakHandler.updateUI(statusElement);
    }
  }

  updateLogoutButtonVisibility() {
    // 退勤済みかつ日報提出済みの場合にログアウトボタンを表示
    const isFinishedWorkAndReport = !this.state.isWorking && 
                                    this.state.currentAttendance && 
                                    this.state.currentAttendance.clock_out && 
                                    this.state.hasTodayReport;
    
    // 出勤前の場合もログアウトボタンを表示
    const isBeforeWork = !this.state.hasClockInToday;
    
    if (isFinishedWorkAndReport || isBeforeWork) {
      this.app.showLogoutButtonForUser();
    } else {
      this.app.hideLogoutButtonForUser();
    }
  }

  /**
   * 退勤処理（修正版）
   */
  async handleClockOut() {
    // 休憩中チェック（在宅者のみ）
    if (this.breakHandler.isOnBreak && this.currentUser.service_type === 'home') {
      if (!confirm('現在休憩中です。\n休憩を終了して退勤処理を行いますか？')) {
        return;
      }
    }

    // 退勤予定時刻を計算
    const currentTime = getCurrentTime();
    const scheduledTime = this.attendanceHandler.roundClockOutTime(currentTime);

    // 確認モーダルを表示
    const confirmed = await this.confirmationModal.show({
      title: '退勤確認',
      message: '退勤時刻は以下になります。退勤しますか？',
      time: scheduledTime,
      confirmText: 'はい',
      cancelText: 'いいえ',
      icon: 'fa-sign-out-alt'
    });

    // いいえの場合は処理を中断
    if (!confirmed) {
      this.app.showNotification('退勤をキャンセルしました', 'info');
      return;
    }

    // はいの場合は退勤処理を実行
    const result = await this.attendanceHandler.clockOut(this.state.currentAttendance);
    if (result.success) {
      this.state.currentAttendance = result.attendance;
      this.state.isWorking = false;

      // 休憩を強制終了
      if (this.breakHandler.isOnBreak) {
        this.breakHandler.isOnBreak = false;
        this.breakHandler.stopBreakTimeMonitoring();
        this.breakHandler.clearAutoBreakEnd();
      }

      this.updateAttendanceUI();
      await this.loadReportForm();

      // 退勤時はログアウトボタンを非表示（日報提出後に表示）
      this.app.hideLogoutButtonForUser();

      this.app.showNotification('退勤しました。日報の入力をお願いします。', 'info');
    }
  }

  /**
   * 日報フォームを読み込み（修正版）
   */
  async loadReportForm() {
    const container = document.getElementById('reportFormContainer');
    await this.reportHandler.loadForm(container, this.state.currentAttendance);
    this.state.hasTodayReport = this.reportHandler.hasTodayReport;

    // 日報提出状況に応じて警告を更新
    this.updatePageLeaveWarning();

    // 日報提出状況に応じてログアウトボタンを制御
    if (this.state.hasTodayReport) {
      // 日報提出済みの場合のみログアウトボタンを表示
      this.updateLogoutButtonVisibility();
    } else if (this.state.hasClockInToday) {
      // 出勤済みで日報未提出の場合は非表示
      this.app.hideLogoutButtonForUser();
    }
  }

  /**
   * カレンダーを読み込み
   */
  async loadAttendanceCalendar() {
    const container = document.getElementById('attendanceCalendarContainer');
    if (container) {
      await this.calendar.render(container);
    }
  }

  /**
   * カレンダーを更新
   */
  async refreshCalendar() {
    await this.calendar.refresh();
    this.app.showNotification('カレンダーを更新しました', 'info');
  }

  /**
   * 未読コメントチェック
   */
  async checkUnreadComments() {
    try {
      const response = await this.apiCall('/api/user/staff-comment/unread');
      if (response.hasUnreadComment) {
        this.showUnreadCommentSection(response);
      }
    } catch (error) {
      console.error('未読コメント確認エラー:', error);
    }
  }

  /**
   * コメントを既読にする
   */
  async markCommentAsRead() {
    try {
      const response = await this.apiCall('/api/user/staff-comment/unread');
      if (response.hasUnreadComment) {
        await this.apiCall('/api/user/staff-comment/mark-read', {
          method: 'POST',
          body: JSON.stringify({ commentId: response.comment.id })
        });
        
        this.app.showNotification('コメントを確認済みにしました', 'success');
        document.getElementById('staffCommentSection').style.display = 'none';
      }
    } catch (error) {
      console.error('コメント既読エラー:', error);
    }
  }

  /**
   * 未読コメントセクションを表示
   */
  showUnreadCommentSection(data) {
  const section = document.getElementById('staffCommentSection');
  const content = document.getElementById('staffCommentContent');
  
  if (section && content) {
    section.style.display = 'block';
    content.innerHTML = `
      <div class="unread-comment-box bg-info bg-opacity-10 border border-info rounded p-3">
        <div class="comment-content mb-3">
          <h6 class="text-info mb-2">
            <i class="fas fa-bell"></i> 新しいメッセージがあります
          </h6>
          <div class="comment-text bg-white p-3 rounded border">
            ${data.comment.comment}
          </div>
        </div>
        <div class="comment-author-info border-top border-info border-opacity-25 pt-2">
          <div class="row">
            <div class="col-md-6">
              <small class="text-muted">
                <i class="fas fa-user text-info"></i> 
                <strong>記入者: ${data.comment.staff_name || 'スタッフ'}</strong>
              </small>
            </div>
            <div class="col-md-6 text-md-end">
              <small class="text-muted">
                <i class="fas fa-clock text-secondary"></i> 
                記入日時: ${new Date(data.comment.created_at).toLocaleString('ja-JP')}
              </small>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

  /**
   * ページ離脱警告設定（修正版）
   */
  setupPageLeaveWarning() {
    this.beforeUnloadHandler = (e) => {
      // 出勤したが退勤していない、または退勤したが日報未提出の場合に警告
      if (this.shouldShowLeaveWarning()) {
        const message = this.getLeaveWarningMessage();
        e.preventDefault();
        e.returnValue = message;
        return message;
      }
    };
    
    // ページ離脱・リロード警告
    window.addEventListener('beforeunload', this.beforeUnloadHandler);
    
    // ブラウザタブ/ウィンドウを閉じる時の警告
    this.visibilityChangeHandler = () => {
      if (document.visibilityState === 'hidden' && this.shouldShowLeaveWarning()) {
        // バックグラウンドに移行した場合の処理
      }
    };
    
    document.addEventListener('visibilitychange', this.visibilityChangeHandler);
  }

  /**
   * ページ離脱警告を更新
   */
  updatePageLeaveWarning() {
    // 何もしない（既にイベントリスナーが設定済み）
    // 状態が変わるたびにshouldShowLeaveWarningが適切に判定される
  }

  /**
   * 離脱警告を表示すべきかの判定
   */
  shouldShowLeaveWarning() {
    // 今日出勤した場合のみ警告を表示
    if (!this.state.hasClockInToday) {
      return false;
    }
    
    // 出勤中の場合は警告
    if (this.state.isWorking) {
      return true;
    }
    
    // 退勤済みだが日報未提出の場合も警告
    if (!this.state.isWorking && !this.state.hasTodayReport) {
      return true;
    }
    
    return false;
  }

  /**
   * 離脱警告メッセージを取得
   */
  getLeaveWarningMessage() {
    if (this.state.isWorking && !this.state.hasTodayReport) {
      return '退勤と日報提出が完了していません。このまま終了しますか？';
    } else if (this.state.isWorking) {
      return '出勤中です。退勤処理を行わずにページを離れますか？';
    } else if (!this.state.hasTodayReport) {
      return '日報が未提出です。このまま終了しますか？';
    }
    
    return '作業が完了していない可能性があります。このまま終了しますか？';
  }

  /**
   * ログアウト処理（日報提出チェック付き）
   * @returns {Promise<boolean>} ログアウト可能かどうか
   */
  async handleLogout() {
    // 出勤前の場合はログアウト可能
    if (!this.state.hasClockInToday) {
      return true;
    }

    // 勤務中の場合はログアウト不可
    if (this.state.isWorking) {
      this.app.showNotification('勤務中はログアウトできません。先に退勤処理を行ってください。', 'warning');
      return false;
    }

    // 退勤済みだが日報未提出の場合はログアウト不可
    if (!this.state.hasTodayReport) {
      this.app.showNotification('日報を提出してからログアウトしてください。', 'warning');
      return false;
    }

    // 退勤済みかつ日報提出済みの場合のみログアウト可能
    return true;
  }

  /**
   * クリーンアップ
   */
  destroy() {
    // 各ハンドラーのクリーンアップ
    this.breakHandler.stopBreakTimeMonitoring();
    
    // ページ離脱警告を削除
    if (this.beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this.beforeUnloadHandler);
    }
    
    if (this.visibilityChangeHandler) {
      document.removeEventListener('visibilitychange', this.visibilityChangeHandler);
    }
    
    // 親クラスのクリーンアップ
    super.destroy();
    
  }
}