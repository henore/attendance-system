// modules/staff/index.js
// スタッフ機能モジュール - 統合版（ダッシュボード廃止、出勤管理統合）

import BaseModule from '../../base-module.js';
import { StaffAttendanceHandler } from './attendance.js';
import { SharedAttendanceManagement } from '../shared/attendance-management.js';
import { StaffCommentHandler } from './comment.js';
import { StaffAttendanceBook } from './attendance-book.js';
import { StaffMonthlyReport } from './monthly-report.js';
import { StaffReportNotification } from './report-notification.js';
import { StaffLastReportModal } from './last-report-modal.js';
import { modalManager } from '../shared/modal-manager.js';
import SharedHandover from '../shared/handover.js';

export default class StaffModule extends BaseModule {
  constructor(app) {
    super(app);
    
    // 出退勤ハンドラー
    this.attendanceHandler = new StaffAttendanceHandler(
      this.apiCall.bind(this),
      this.app.showNotification.bind(this.app)
    );
    
    // 共通出勤管理（ダッシュボード置き換え）
    this.StaffAttendanceHandler = null; // 遅延初期化

     //申し送りハンドラー
    this.handoverHandler = new SharedHandover(
      this.apiCall.bind(this),
      this.app.showNotification.bind(this.app),
      this.currentUser
    );
    
    this.commentHandler = new StaffCommentHandler(
      this.apiCall.bind(this),
      this.app.showNotification.bind(this.app),
      this.currentUser
    );

    this.attendanceBook = new StaffAttendanceBook(
      this.apiCall.bind(this),
      this.app.showNotification.bind(this.app)
    );
    
    this.monthlyReport = new StaffMonthlyReport(
      this.apiCall.bind(this),
      this.app.showNotification.bind(this.app),
      this.showDailyReportDetail.bind(this)
    );
    
    this.reportNotification = new StaffReportNotification(
      this.apiCall.bind(this),
      this.app.showNotification.bind(this.app),
      this.switchToSection.bind(this)
    );

    this.lastReportModal = new StaffLastReportModal(
      this.updateClockInButtonState.bind(this),
      this.app.showNotification.bind(this.app)
    );
    
    // 状態管理
    this.state = {
      currentView: 'attendanceSection',
      currentAttendance: null,
      isWorking: false,
      breakStatus: null
    };
    
    this.beforeUnloadHandler = null;
  }

  async init() {
    console.log('👥 スタッフモジュール初期化（統合版）');
    this.render();
    await this.initializeSharedModules();
    await this.loadInitialData();
    
    // 日報提出監視開始
    this.reportNotification.startMonitoring();
    
    // ページ離脱警告設定
    this.setupPageLeaveWarning();
  }

  render() {
    const content = document.getElementById('app-content');
    content.innerHTML = `
      <div class="staff-dashboard">
        <!-- スタッフメニュー（画面切り替え） -->
        <div class="staff-menu mb-4">
          <div class="btn-group w-100" role="group">
            <button class="btn btn-outline-primary staff-menu-btn active" data-target="attendanceSection">
              <i class="fas fa-clock"></i> 出退勤
            </button>
            <button class="btn btn-outline-primary staff-menu-btn" data-target="attendanceManagementSection">
              <i class="fas fa-users"></i> 利用者出勤状況
            </button>
            <button class="btn btn-outline-primary staff-menu-btn" data-target="handoverSection">
              <i class="fas fa-exchange-alt"></i> 申し送り
            </button>
            <button class="btn btn-outline-primary staff-menu-btn" data-target="attendanceBookSection">
              <i class="fas fa-calendar-check"></i> 出勤簿
            </button>
            <button class="btn btn-outline-primary staff-menu-btn" data-target="monthlyAttendanceSection">
              <i class="fas fa-calendar-alt"></i> 月別出勤簿
            </button>
          </div>
        </div>

        <!-- 通知バッジ（日報提出時） -->
        <div id="notificationBadge" class="notification-badge" style="display: none;">0</div>

        <!-- 1. 出退勤セクション -->
        <div id="attendanceSection" class="staff-section mb-4">
          ${this.renderAttendanceSection()}
        </div>

        <!-- 3. 申し送り事項セクション -->
        <div id="handoverSection" class="staff-section mb-4" style="display: none;">
          ${this.handoverHandler.render()}
        </div>

        <!-- 4. 出勤簿セクション -->
        <div id="attendanceBookSection" class="staff-section mb-4" style="display: none;">
          ${this.attendanceBook.render()}
        </div>

        <!-- 5. 月別出勤簿セクション -->
        <div id="monthlyAttendanceSection" class="staff-section mb-4" style="display: none;">
          ${this.monthlyReport.render()}
        </div>
      </div>
    `;

    this.setupEventListeners();
    
    // 各サブモジュールの初期化
    this.handoverHandler.init();
    this.monthlyReport.init();
  }

  async initializeSharedModules() {
    const contentArea = document.getElementById('app-content');
    
    // 共通出勤管理モジュール初期化
    this.attendanceManagement = new SharedAttendanceManagement(this.app, this);
    await this.attendanceManagement.init(contentArea);
   }

  renderAttendanceSection() {
    return `
      <div class="custom-card">
        <div class="custom-card-header">
          <h5><i class="fas fa-user-tie"></i> スタッフ出退勤</h5>
          <div class="header-status">
            <span id="currentTimeDisplay"></span>
          </div>
        </div>
        <div class="card-body">
          <!-- 出退勤ボタン -->
          <div class="row mb-4">
            <div class="col-md-6">
              <button class="btn btn-success btn-lg w-100" id="clockInBtn">
                <i class="fas fa-play"></i> 出勤
              </button>
            </div>
            <div class="col-md-6">
              <button class="btn btn-info btn-lg w-100" id="clockOutBtn" disabled>
                <i class="fas fa-stop"></i> 退勤
              </button>
            </div>
          </div>

          <!-- 休憩ボタン -->
          <div class="row mb-4">
            <div class="col-md-6">
              <button class="btn btn-warning btn-lg w-100" id="breakStartBtn" disabled>
                <i class="fas fa-coffee"></i> 休憩開始
              </button>
            </div>
            <div class="col-md-6">
              <button class="btn btn-outline-warning btn-lg w-100" id="breakEndBtn" disabled>
                <i class="fas fa-coffee"></i> 休憩終了
              </button>
            </div>
          </div>

          <!-- ステータス表示 -->
          <div id="attendanceStatusDisplay" class="status-display">
            <!-- 動的に更新される -->
          </div>
        </div>
      </div>
      
      <!-- 申し送り事項（常時表示） -->
      <div class="row mt-4">
        <div class="col-12">
          ${this.handoverHandler.render()}
        </div>
      </div>
    `;
  }

  setupEventListeners() {
    // メニューボタン（画面切り替え）
    document.querySelectorAll('.staff-menu-btn').forEach(btn => {
      this.addEventListener(btn, 'click', (e) => {
        const targetId = e.target.closest('button').getAttribute('data-target');
        this.switchToSection(targetId);
        
        // ボタンのアクティブ状態を更新
        document.querySelectorAll('.staff-menu-btn').forEach(b => b.classList.remove('active'));
        e.target.closest('button').classList.add('active');
      });
    });
    
    // 出退勤ボタン
    this.addEventListenerById('clockInBtn', 'click', () => this.handleClockIn());
    this.addEventListenerById('clockOutBtn', 'click', () => this.handleClockOut());
    
    // 休憩ボタン
    this.addEventListenerById('breakStartBtn', 'click', () => this.handleBreakStart());
    this.addEventListenerById('breakEndBtn', 'click', () => this.handleBreakEnd());

    // 時刻表示の更新
    this.startTimeDisplay();
  }

  async loadInitialData() {
    try {
      // 今日の出勤状況取得
      await this.loadTodayAttendance();
      
      // 前回の未退勤チェック
      await this.checkLastRecord();
      
      // 申し送り事項読み込み
      await this.handoverHandler.loadData();
      
      // 初期画面表示
      await this.switchToSection('attendanceSection');
      
    } catch (error) {
      console.error('初期データ読み込みエラー:', error);
      this.app.showNotification('データの読み込みに失敗しました', 'danger');
    }
  }

  async loadTodayAttendance() {
    try {
      const today = new Date().toISOString().split('T')[0];
      const response = await this.apiCall(`/api/staff/attendance/${today}`);
      
      this.state.currentAttendance = response.attendance;
      this.state.isWorking = response.attendance && response.attendance.clock_in && !response.attendance.clock_out;
      
      this.updateAttendanceDisplay();
      this.updateButtonStates();
      
    } catch (error) {
      console.error('今日の出勤状況取得エラー:', error);
    }
  }

  async checkLastRecord() {
    try {
      const response = await this.apiCall('/api/user/last-record');
      
      if (response.needsConfirmation) {
        this.lastReportModal.show(response.lastRecord, () => {
          console.log('前回記録確認完了');
        });
      }
      
    } catch (error) {
      console.error('前回記録チェックエラー:', error);
    }
  }

  async handleClockIn() {
    try {
      const response = await this.apiCall('/api/attendance/clock-in', {
        method: 'POST'
      });
      
      this.state.currentAttendance = response.attendance;
      this.state.isWorking = true;
      this.updateAttendanceDisplay();
      this.updateButtonStates();
      this.app.showNotification(response.message, 'success');
      
    } catch (error) {
      console.error('出勤エラー:', error);
      this.app.showNotification(error.message || '出勤処理に失敗しました', 'danger');
    }
  }

  async handleClockOut() {
    try {
      // 未コメント日報チェック
      const response = await this.apiCall('/api/staff/clock-out', {
        method: 'POST'
      });
      
      this.state.currentAttendance = { ...this.state.currentAttendance, clock_out: response.time };
      this.state.isWorking = false;
      this.updateAttendanceDisplay();
      this.updateButtonStates();
      this.app.showNotification(response.message, 'success');
      
    } catch (error) {
      if (error.uncommentedReports) {
        this.showUncommentedReportsWarning(error.uncommentedReports);
      } else {
        console.error('退勤エラー:', error);
        this.app.showNotification(error.message || '退勤処理に失敗しました', 'danger');
      }
    }
  }

  async handleBreakStart() {
    try {
      const response = await this.apiCall('/api/staff/break/start', {
        method: 'POST'
      });
      
      this.state.breakStatus = {
        start_time: response.startTime,
        end_time: response.endTime,
        duration: response.duration
      };
      
      this.updateAttendanceDisplay();
      this.updateButtonStates();
      this.app.showNotification(response.message, 'success');
      
    } catch (error) {
      console.error('休憩開始エラー:', error);
      this.app.showNotification(error.message || '休憩開始に失敗しました', 'danger');
    }
  }

  async handleBreakEnd() {
    try {
      const response = await this.apiCall('/api/staff/break/end', {
        method: 'POST'
      });
      
      if (this.state.breakStatus) {
        this.state.breakStatus.end_time = response.endTime;
        this.state.breakStatus.duration = response.duration;
      }
      
      this.updateAttendanceDisplay();
      this.updateButtonStates();
      this.app.showNotification(response.message, 'success');
      
    } catch (error) {
      console.error('休憩終了エラー:', error);
      this.app.showNotification(error.message || '休憩終了に失敗しました', 'danger');
    }
  }

  updateAttendanceDisplay() {
    const display = document.getElementById('attendanceStatusDisplay');
    if (!display) return;

    let html = '';
    
    if (this.state.currentAttendance) {
      html = `
        <div class="row">
          <div class="col-md-4 text-center">
            <div class="status-item">
              <i class="fas fa-play text-success"></i>
              <div class="status-label">出勤時間</div>
              <div class="status-value">${this.state.currentAttendance.clock_in || '-'}</div>
            </div>
          </div>
          <div class="col-md-4 text-center">
            <div class="status-item">
              <i class="fas fa-coffee text-warning"></i>
              <div class="status-label">休憩時間</div>
              <div class="status-value">${this.getBreakDisplay()}</div>
            </div>
          </div>
          <div class="col-md-4 text-center">
            <div class="status-item">
              <i class="fas fa-stop text-info"></i>
              <div class="status-label">退勤時間</div>
              <div class="status-value">${this.state.currentAttendance.clock_out || '-'}</div>
            </div>
          </div>
        </div>
      `;
    } else {
      html = '<p class="text-muted text-center">本日の出勤記録はありません</p>';
    }
    
    display.innerHTML = html;
  }

  getBreakDisplay() {
    if (!this.state.breakStatus) return '-';
    
    if (this.state.breakStatus.end_time) {
      return `${this.state.breakStatus.start_time}〜${this.state.breakStatus.end_time} (${this.state.breakStatus.duration}分)`;
    } else {
      return `${this.state.breakStatus.start_time}〜 (進行中)`;
    }
  }

  updateButtonStates() {
    const clockInBtn = document.getElementById('clockInBtn');
    const clockOutBtn = document.getElementById('clockOutBtn');
    const breakStartBtn = document.getElementById('breakStartBtn');
    const breakEndBtn = document.getElementById('breakEndBtn');

    if (!this.state.currentAttendance || !this.state.currentAttendance.clock_in) {
      // 未出勤状態
      clockInBtn.disabled = false;
      clockOutBtn.disabled = true;
      breakStartBtn.disabled = true;
      breakEndBtn.disabled = true;
    } else if (this.state.currentAttendance.clock_out) {
      // 退勤済み状態
      clockInBtn.disabled = true;
      clockOutBtn.disabled = true;
      breakStartBtn.disabled = true;
      breakEndBtn.disabled = true;
    } else {
      // 出勤中状態
      clockInBtn.disabled = true;
      clockOutBtn.disabled = false;
      
      // 休憩ボタンの状態
      if (this.state.breakStatus && !this.state.breakStatus.end_time) {
        // 休憩中
        breakStartBtn.disabled = true;
        breakEndBtn.disabled = false;
      } else {
        // 休憩未取得 or 休憩終了済み
        breakStartBtn.disabled = this.state.breakStatus !== null; // 1日1回のみ
        breakEndBtn.disabled = true;
      }
    }
  }

  updateClockInButtonState(disabled) {
    const clockInBtn = document.getElementById('clockInBtn');
    if (clockInBtn) {
      clockInBtn.disabled = disabled;
    }
  }

  showUncommentedReportsWarning(uncommentedReports) {
    const reportList = uncommentedReports.map(r => `• ${r.userName}さん`).join('<br>');
    
    const content = `
      <div class="alert alert-warning">
        <i class="fas fa-exclamation-triangle"></i> 
        <strong>未コメントの日報があります</strong>
      </div>
      <p>以下の利用者の日報にコメントを記入してから退勤してください：</p>
      <div class="uncommented-list mb-3">
        ${reportList}
      </div>
      <p class="text-muted">利用者出勤状況画面でコメントを記入できます。</p>
    `;

    const modalId = modalManager.create({
      id: 'uncommentedReportsModal',
      title: '<i class="fas fa-comment-exclamation"></i> 退勤前の確認',
      content: content,
      size: 'modal-md',
      headerClass: 'bg-warning text-dark',
      saveButton: true,
      saveButtonText: 'コメント記入画面へ',
      saveButtonClass: 'btn-primary',
      onSave: () => {
        modalManager.hide('uncommentedReportsModal');
        this.switchToSection('attendanceManagementSection');
      }
    });

    modalManager.show(modalId);
  }

  startTimeDisplay() {
    const updateTime = () => {
      const timeDisplay = document.getElementById('currentTimeDisplay');
      if (timeDisplay) {
        const now = new Date();
        timeDisplay.textContent = now.toLocaleTimeString('ja-JP');
      }
    };

    updateTime();
    setInterval(updateTime, 1000);
  }

  async switchToSection(sectionId) {
    // 全てのセクションを非表示
    document.querySelectorAll('.staff-section').forEach(section => {
      section.style.display = 'none';
    });
    
    // 指定されたセクションのみ表示
    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
      targetSection.style.display = 'block';
      this.state.currentView = sectionId;
      
      switch (sectionId) {
        case 'attendanceManagementSection':
          await this.attendanceManagement?.show();
          break;
        case 'attendanceBookSection':
          this.attendanceManagement?.hide();
          await this.attendanceBook.load();
          break;
        case 'handoverSection':
          this.attendanceManagement?.hide();
          await this.handoverHandler.loadData();
          break;
        case 'monthlyAttendanceSection':
          this.attendanceManagement?.hide();
          await this.monthlyReport.loadInitialData();
          break;
        default:
          this.attendanceManagement?.hide();
          break;
      }
    }
  }

  async openStaffCommentModal(userId, userName) {
    await this.commentHandler.openModal(userId, userName);
    
    // コメント保存後に出勤管理を更新
    this.commentHandler.onSave = async () => {
      if (this.attendanceManagement) {
        await this.attendanceManagement.refresh();
      }
    };
  }

  async showDailyReportDetail(userId, userName, date) {
    await this.commentHandler.showReportDetail(userId, userName, date);
  }

  async checkUncommentedReports() {
    return await this.commentHandler.getUncommentedReports();
  }

  setupPageLeaveWarning() {
    this.beforeUnloadHandler = async (e) => {
      const uncommentedReports = await this.checkUncommentedReports();
      if (uncommentedReports.length > 0) {
        const userNames = uncommentedReports.map(report => report.user_name).join('、');
        const message = `以下の利用者の日報にコメントが未記入です：\n${userNames}\n\nこのまま終了しますか？`;
        e.preventDefault();
        e.returnValue = message;
        return message;
      }
    };
    
    window.addEventListener('beforeunload', this.beforeUnloadHandler);
  }

  async handleLogout() {
    const uncommentedReports = await this.checkUncommentedReports();
    if (uncommentedReports.length > 0) {
      const userNames = uncommentedReports.map(report => report.user_name).join('、');
      const confirmMessage = `以下の利用者の日報にまだコメントが記入されていません：\n${userNames}\n\nコメント記入は必須です。このままログアウトしますか？`;
      
      if (!confirm(confirmMessage)) {
        return false; // ログアウトをキャンセル
      }
    }
    
    return true; // ログアウトを続行
  }

  // 通知バッジ更新
  updateNotificationBadge() {
    const badge = document.getElementById('notificationBadge');
    const count = this.reportNotification.getPendingNotificationCount();
    
    if (badge) {
      if (count > 0) {
        badge.textContent = count;
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
      }
    }
  }

  // 共通メソッド（SharedAttendanceManagementから使用）
  async callApi(endpoint, options = {}) {
    return await this.apiCall(endpoint, options);
  }

  showNotification(message, type = 'info') {
    this.app.showNotification(message, type);
  }

  getRoleDisplayName(role) {
    const roleNames = {
      'user': '利用者',
      'staff': 'スタッフ',
      'admin': '管理者'
    };
    return roleNames[role] || role;
  }

  getRoleColor(role) {
    const colors = {
      'user': 'primary',
      'staff': 'success',
      'admin': 'danger'
    };
    return colors[role] || 'secondary';
  }

  getStatusBadge(status) {
    const badges = {
      'normal': '<span class="badge bg-success">正常</span>',
      'late': '<span class="badge bg-warning">遅刻</span>',
      'early': '<span class="badge bg-info">早退</span>',
      'absence': '<span class="badge bg-danger">欠勤</span>',
      'paid_leave': '<span class="badge bg-primary">有給欠勤</span>'
    };
    return badges[status] || `<span class="badge bg-secondary">${status}</span>`;
  }

  calculateWorkDuration(record) {
    if (!record.clock_in || !record.clock_out) return null;
    
    try {
      const start = new Date(`1970-01-01 ${record.clock_in}`);
      const end = new Date(`1970-01-01 ${record.clock_out}`);
      const durationMs = end - start;
      const hours = durationMs / (1000 * 60 * 60);
      
      // 休憩時間の計算（修正版）
      let breakMinutes = 0;
      
      // スタッフ・管理者の場合
      if (record.user_role === 'staff' || record.user_role === 'admin') {
        // 実際に休憩を取った場合のみ（break_startが存在する場合）
        if (record.break_start && record.break_end) {
          breakMinutes = 60; // 固定60分
        }
        // break_startのみある場合（休憩中）は計算しない
      }
      // 利用者の場合
      else if (record.user_role === 'user') {
        // 在宅勤務（service_type='home'）の場合は休憩時間を引かない
        if (record.service_type === 'home') {
          breakMinutes = 0;
        }
        // 通所の場合
        else {
          // breakRecordが存在し、実際に休憩を取った場合のみ
          if (record.breakRecord && record.breakRecord.start_time && record.breakRecord.end_time) {
            breakMinutes = record.breakRecord.duration || 60;
          }
          // 古いデータ用：breakフィールドを確認
          else if (record.break && record.break.start && record.break.end) {
            breakMinutes = record.break.duration || 60;
          }
          // 休憩中または休憩を取っていない場合は引かない
        }
      }
      
      const netHours = hours - (breakMinutes / 60);
      
      return netHours > 0 ? netHours.toFixed(1) : hours.toFixed(1);
    } catch (error) {
      console.error('勤務時間計算エラー:', error);
      return null;
    }
  }

  destroy() {
    // 各ハンドラーのクリーンアップ
    this.attendanceHandler?.stopBreakTimeMonitoring();
    this.attendanceManagement?.destroy();
    this.reportNotification?.stopMonitoring();
    
    // ページ離脱警告を削除
    if (this.beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this.beforeUnloadHandler);
    }
    
    // 親クラスのクリーンアップ
    super.destroy();
    
    console.log('👥 スタッフモジュールクリーンアップ完了');
  }
}