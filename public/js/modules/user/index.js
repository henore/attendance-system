// modules/user/index.js
// 利用者機能モジュール - メインクラス

import BaseModule from '../../base-module.js';
import { UserAttendanceHandler } from './attendance.js';
import { UserReportHandler } from './report.js';
import { UserBreakHandler } from './break.js';
import { UserAttendanceCalendar } from './calendar.js';
import { modalManager } from '../shared/modal-manager.js';
import { LastReportModal } from './last-report-modal.js';
import { MESSAGES } from '../../constants/labels.js';

export default class UserModule extends BaseModule {
  constructor(app) {
    super(app);
    
    // サブモジュール初期化
    this.attendanceHandler = new UserAttendanceHandler(
      this.apiCall.bind(this),
      this.app.showNotification.bind(this.app)
    );
    
    this.reportHandler = new UserReportHandler(
      this.apiCall.bind(this),
      this.app.showNotification.bind(this.app)
    );
    
    this.breakHandler = new UserBreakHandler(
      this.apiCall.bind(this),
      this.app.showNotification.bind(this.app),
      this.currentUser
    );
    
    this.calendar = new UserAttendanceCalendar(
      this.apiCall.bind(this),
      this.app.showNotification.bind(this.app)
    );
    
    this.lastReportModal = new LastReportModal(
      this.attendanceHandler.updateClockInButtonState.bind(this.attendanceHandler),
      this.app.showNotification.bind(this.app)
    );
    
    // 状態管理
    this.state = {
      currentAttendance: null,
      isWorking: false,
      hasTodayReport: false,
      hasConfirmedLastReport: false,
      lastReportData: null
    };
    
    // ページ離脱警告用
    this.beforeUnloadHandler = null;
  }

  async init() {
    console.log('👤 利用者モジュール初期化');
    this.render();
    await this.loadInitialData();
    this.setupPageLeaveWarning();
    await this.checkAndShowLastReportModal();
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
                <button class="btn btn-info" id="userBreakBtn" disabled>
                  <i class="fas fa-pause"></i> 休憩
                </button>
              </div>
              <div id="userBreakTimeDisplay" class="mt-2" style="display: none;">
                <small class="text-muted">休憩時間: <span id="userBreakDuration">00:00</span></small>
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
    
    // 日報フォームのイベント（動的生成のため委譲）
    document.addEventListener('submit', (e) => {
      if (e.target.id === 'reportForm') {
        e.preventDefault();
        this.reportHandler.submitReport(e, this.state.currentAttendance);
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
    
    if (result.attendance) {
      await this.breakHandler.loadBreakStatus(this.state.currentAttendance);
    }
    
    this.updateAttendanceUI();
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
    } else {
      this.breakHandler.disableUI();
    }
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

    const result = await this.attendanceHandler.clockIn();
    if (result.success) {
      this.state.currentAttendance = result.attendance;
      this.state.isWorking = true;
      this.breakHandler.resetBreakState();
      this.updateAttendanceUI();
    }
  }

  /**
   * 退勤処理
   */
  async handleClockOut() {
    // 休憩中チェック（在宅者のみ）
    if (this.breakHandler.isOnBreak && this.currentUser.service_type === 'home') {
      if (!confirm('休憩中です。休憩を終了して退勤しますか？')) {
        return;
      }
    }

    const result = await this.attendanceHandler.clockOut(this.state.currentAttendance);
    if (result.success) {
      this.state.currentAttendance = result.attendance;
      this.state.isWorking = false;
      this.breakHandler.stopBreakTimeMonitoring();
      this.updateAttendanceUI();
      this.loadReportForm();
    }
  }

  /**
   * 日報フォームを読み込み
   */
  async loadReportForm() {
    const container = document.getElementById('reportFormContainer');
    await this.reportHandler.loadForm(container, this.state.currentAttendance);
    this.state.hasTodayReport = this.reportHandler.hasTodayReport;
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
   * 前回出勤記録の確認
   */
  async checkAndShowLastReportModal() {
    if (this.state.currentAttendance && this.state.currentAttendance.clock_in) {
      return;
    }

    const lastReport = await this.attendanceHandler.getLastReport();
    if (lastReport) {
      this.state.lastReportData = lastReport;
      this.lastReportModal.show(lastReport, () => {
        this.state.hasConfirmedLastReport = true;
      });
    }
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
        <div class="comment-box">${data.comment.comment}</div>
        <small class="text-muted">
          記入者: ${data.comment.staff_name} | 
          記入日時: ${new Date(data.comment.created_at).toLocaleString('ja-JP')}
        </small>
      `;
    }
  }

  /**
   * ページ離脱警告設定
   */
  setupPageLeaveWarning() {
    this.beforeUnloadHandler = (e) => {
      if (this.state.isWorking && !this.state.hasTodayReport) {
        const message = '退勤と日報提出が完了していません。このまま終了しますか？';
        e.preventDefault();
        e.returnValue = message;
        return message;
      }
    };
    
    window.addEventListener('beforeunload', this.beforeUnloadHandler);
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
    
    // 親クラスのクリーンアップ
    super.destroy();
    
    console.log('👤 利用者モジュールクリーンアップ完了');
  }
}