// modules/staff/index.js（完全修正版）
import BaseModule from '../../base-module.js';
import { StaffAttendanceHandler } from './attendance.js';
import { SharedAttendanceManagement } from '../shared/attendance-management.js';
import { StaffCommentHandler } from './comment.js';
import { StaffAttendanceBook } from './attendance-book.js';
import SharedMonthlyReport from '../shared/monthly-report.js';
import { StaffReportNotification } from './report-notification.js';
import { StaffLastReportModal } from './last-report-modal.js';
import { modalManager } from '../shared/modal-manager.js';
import SharedHandover from '../shared/handover.js';

export default class StaffModule extends BaseModule {
  constructor(app) {
    super(app);

    // APIコールメソッドの確実なバインディング
    this.apiCall = app.apiCall ? app.apiCall.bind(app) : this.app.apiCall.bind(this.app);
    this.showNotification = app.showNotification ? app.showNotification.bind(app) : this.app.showNotification.bind(this.app);
    
    // 状態管理（先に定義）
    this.state = {
      currentView: 'attendanceSection',
      currentAttendance: null,
      isWorking: false,
      breakStatus: null
    };
    
    this.beforeUnloadHandler = null;
    
    // 出退勤ハンドラー
    this.attendanceHandler = new StaffAttendanceHandler(
      this.apiCall,
      this.showNotification
    );
    
    // 共通出勤管理（ダッシュボード置き換え）
    this.attendanceManagement = null; // 遅延初期化

    // 申し送りハンドラー
    this.handoverSection = null; // 遅延初期化
    
    this.commentHandler = new StaffCommentHandler(
      this.apiCall,
      this.showNotification,
      this.currentUser
    );

    this.attendanceBook = new StaffAttendanceBook(
      this.apiCall,
      this.showNotification
    );
    
    // 月別出勤簿（共通化）
    this.monthlyReport = null; // 遅延初期化
    
    this.reportNotification = new StaffReportNotification(
      this.apiCall,
      this.showNotification,
      this.switchToSection.bind(this)
    );

    // StaffLastReportModalの初期化（メソッドを先に定義してから）
    this.lastReportModal = new StaffLastReportModal(
      (disabled) => this.updateClockInButtonState(disabled),
      this.showNotification
    );
  }

  // 出勤ボタンの状態を更新するメソッド（コンストラクタの後、initの前に定義）
  updateClockInButtonState(disabled) {
    const clockInBtn = document.getElementById('clockInBtn');
    if (clockInBtn) {
      clockInBtn.disabled = disabled;
    }
  }

  async init() {
    console.log('👥 スタッフモジュール初期化（統合版）');
    console.log('Current User:', this.currentUser);
    console.log('API Call function:', typeof this.apiCall);
    
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

        <!-- 2. 利用者出勤状況セクション（動的に作成） -->
        <!-- attendanceManagementがここに挿入される -->

        <!-- 3. 申し送り事項セクション（動的に作成） -->
        <!-- handoverSectionがここに挿入される -->

        <!-- 4. 出勤簿セクション -->
        <div id="attendanceBookSection" class="staff-section mb-4" style="display: none;">
          ${this.attendanceBook.render()}
        </div>

        <!-- 5. 月別出勤簿セクション -->
        <div id="monthlyAttendanceSection" class="staff-section mb-4" style="display: none;">
          <!-- 共通モジュールが動的に挿入される -->
        </div>
      </div>
    `;

    this.setupEventListeners();
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

  async initializeSharedModules() {
    const contentArea = document.querySelector('.staff-dashboard');
    
    try {
      // 共通出勤管理モジュール初期化
      this.attendanceManagement = new SharedAttendanceManagement(this.app, this);
      await this.attendanceManagement.init(contentArea);
      
      // 申し送りモジュール初期化
      this.handoverSection = new SharedHandover(this.app, this);
      await this.handoverSection.init(contentArea);
      
      // 月別出勤簿モジュール初期化（共通化）
      this.monthlyReport = new SharedMonthlyReport(this.app, this);
      await this.monthlyReport.init(contentArea);
      
      console.log('✅ 共通モジュール初期化完了');
    } catch (error) {
      console.error('❌ 共通モジュール初期化エラー:', error);
      this.showNotification('一部機能の初期化に失敗しました', 'warning');
    }
  }

  async loadInitialData() {
    try {
      // 今日の出勤状況取得
      await this.loadTodayAttendance();
      
      // 前回の未退勤チェック
      await this.checkLastRecord();
      
      // 初期画面表示
      await this.switchToSection('attendanceSection');
      
    } catch (error) {
      console.error('初期データ読み込みエラー:', error);
      this.app.showNotification('データの読み込みに失敗しました', 'danger');
    }
  }

  async switchToSection(sectionId) {
    console.log(`[StaffModule] 画面切り替え: ${sectionId}`);
    
    // 全てのセクションを非表示
    document.querySelectorAll('.staff-section').forEach(section => {
      section.style.display = 'none';
    });
    
    // 共通モジュールも非表示
    if (this.attendanceManagement) this.attendanceManagement.hide();
    if (this.handoverSection) this.handoverSection.hide();
    if (this.monthlyReport) this.monthlyReport.hide();
    
    // 指定されたセクションのみ表示
    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
      targetSection.style.display = 'block';
    }
    
    this.state.currentView = sectionId;
    
    // 各セクション固有の処理
    try {
      switch (sectionId) {
        case 'attendanceManagementSection':
          if (this.attendanceManagement) {
            await this.attendanceManagement.show();
          } else {
            console.error('出勤管理モジュールが初期化されていません');
          }
          break;
        case 'handoverSection':
          if (this.handoverSection) {
            await this.handoverSection.show();
          } else {
            console.error('申し送りモジュールが初期化されていません');
          }
          break;
        case 'attendanceBookSection':
          await this.attendanceBook.load();
          break;
        case 'monthlyAttendanceSection':
          if (this.monthlyReport) {
            await this.monthlyReport.show();
          } else {
            console.error('月別出勤簿モジュールが初期化されていません');
          }
          break;
      }
    } catch (error) {
      console.error(`セクション切り替えエラー (${sectionId}):`, error);
      this.showNotification('画面の切り替えに失敗しました', 'danger');
    }
  }

  /**
   * スタッフコメントモーダルを開く
   */
  async openStaffCommentModal(userId, userName) {
    await this.commentHandler.openModal(userId, userName);

    // コメント保存後に出勤管理を更新
    this.commentHandler.onSave = async () => {
      if (this.attendanceManagement) {
        await this.attendanceManagement.refresh();
      }
    };
  }

  /**
   * 日報詳細を表示
   */
  async showDailyReportDetail(userId, userName, date) {
    await this.commentHandler.showReportDetail(userId, userName, date);
  }

  /**
   * 未コメントの日報をチェック
   */
  async checkUncommentedReports() {
    return await this.commentHandler.getUncommentedReports();
  }

  /**
   * ログアウト時の処理
   */
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

  getServiceTypeDisplayName(serviceType) {
    const typeNames = {
      'commute': '通所',
      'home': '在宅'
    };
    return typeNames[serviceType] || serviceType;
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
      'late': '<span class="badge bg-warning text-dark">遅刻</span>',
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
      
      // 休憩時間の計算
      let breakMinutes = 0;
      if (record.break_start && record.break_end) {
        breakMinutes = 60; // スタッフは固定60分
      }
      
      const netHours = hours - (breakMinutes / 60);
      return netHours > 0 ? netHours.toFixed(1) : hours.toFixed(1);
    } catch (error) {
      console.error('勤務時間計算エラー:', error);
      return null;
    }
  }

  // 出退勤処理
  async handleClockIn() {
    try {
      const result = await this.attendanceHandler.clockIn();
      if (result.success) {
        this.state.currentAttendance = result.attendance;
        this.state.isWorking = true;
        // AttendanceHandlerの状態も更新
        this.attendanceHandler.isWorking = true;
        this.attendanceHandler.currentAttendance = result.attendance;
        
        this.updateAttendanceUI();
        this.updateButtonStates();
        this.updateBreakUI(); // 休憩UIも更新
      }
    } catch (error) {
      console.error('出勤処理エラー:', error);
    }
  }

  async handleClockOut() {
    try {
      const result = await this.attendanceHandler.clockOut(this.state.currentAttendance);
      if (result.success) {
        this.state.currentAttendance = result.attendance;
        this.state.isWorking = false;
        this.updateAttendanceUI();
        this.updateButtonStates();
      }
    } catch (error) {
      console.error('退勤処理エラー:', error);
    }
  }

  async handleBreakStart() {
    await this.attendanceHandler.handleBreakStart();
    this.updateBreakUI();
  }

  async handleBreakEnd() {
    await this.attendanceHandler.handleBreakEnd();
    this.updateBreakUI();
  }

  updateAttendanceUI() {
    const statusElement = document.getElementById('attendanceStatusDisplay');
    if (statusElement) {
      this.attendanceHandler.updateUI(this.state, statusElement, {
        onClockIn: () => this.handleClockIn(),
        onClockOut: () => this.handleClockOut()
      });
    }
  }

  updateBreakUI() {
    const breakElement = document.getElementById('breakManagementStatus');
    if (breakElement) {
      this.attendanceHandler.updateBreakUI(breakElement);
    }
  }

  updateButtonStates() {
    const clockInBtn = document.getElementById('clockInBtn');
    const clockOutBtn = document.getElementById('clockOutBtn');
    const breakStartBtn = document.getElementById('breakStartBtn');
    const breakEndBtn = document.getElementById('breakEndBtn');
    
    if (this.state.isWorking) {
      // 出勤中
      if (clockInBtn) clockInBtn.disabled = true;
      if (clockOutBtn) clockOutBtn.disabled = false;
      
      // 休憩ボタンの制御
      if (this.attendanceHandler.isOnBreak) {
        // 休憩中
        if (breakStartBtn) breakStartBtn.disabled = true;
        if (breakEndBtn) breakEndBtn.disabled = false;
      } else {
        // 休憩していない
        if (breakStartBtn) breakStartBtn.disabled = false;
        if (breakEndBtn) breakEndBtn.disabled = true;
      }
    } else {
      // 未出勤または退勤済み
      if (this.state.currentAttendance && this.state.currentAttendance.clock_out) {
        // 退勤済みの場合は出勤ボタンも無効化
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

  async loadTodayAttendance() {
    try {
      const result = await this.attendanceHandler.getTodayAttendance();
      this.state.currentAttendance = result.attendance;
      this.state.isWorking = result.isWorking;
      this.updateAttendanceUI();
      this.updateButtonStates();
    } catch (error) {
      console.error('今日の出勤状況取得エラー:', error);
    }
  }

  async checkLastRecord() {
    try {
      const response = await this.apiCall('/api/user/last-record');
      if (response.lastRecord && !response.lastRecord.has_report) {
        this.lastReportModal.show(response.lastRecord, () => {
          console.log('前回記録確認完了');
        });
      }
    } catch (error) {
      console.error('前回記録確認エラー:', error);
    }
  }

  setupPageLeaveWarning() {
    this.beforeUnloadHandler = async (e) => {
      if (this.state.isWorking) {
        e.preventDefault();
        e.returnValue = '出勤中です。ページを離れますか？';
      }
    };
    
    window.addEventListener('beforeunload', this.beforeUnloadHandler);
  }

  startTimeDisplay() {
    const updateTime = () => {
      const now = new Date();
      const timeString = now.toLocaleTimeString('ja-JP');
      const dateString = now.toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long'
      });
      
      const displayElement = document.getElementById('currentTimeDisplay');
      if (displayElement) {
        displayElement.innerHTML = `<i class="fas fa-clock"></i> ${dateString} ${timeString}`;
      }
    };
    
    updateTime();
    setInterval(updateTime, 1000);
  }

  destroy() {
    // 各ハンドラーのクリーンアップ
    if (this.attendanceHandler) {
      this.attendanceHandler.stopBreakTimeMonitoring?.();
    }
    
    if (this.attendanceManagement) {
      this.attendanceManagement.destroy();
    }
    
    if (this.handoverSection) {
      this.handoverSection.destroy();
    }
    
    if (this.monthlyReport) {
      this.monthlyReport.destroy();
    }
    
    if (this.reportNotification) {
      this.reportNotification.stopMonitoring();
    }
    
    if (this.attendanceBook) {
      this.attendanceBook.destroy();
    }
    
    // ページ離脱警告を削除
    if (this.beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this.beforeUnloadHandler);
    }
    
    // 親クラスのクリーンアップ
    super.destroy();
    
    console.log('👥 スタッフモジュールクリーンアップ完了');
  }
}