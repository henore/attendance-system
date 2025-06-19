// modules/staff/index.js
// スタッフ機能モジュール - メインクラス

import BaseModule from '../../base-module.js';
import { StaffAttendanceHandler } from './attendance.js';
import { StaffDashboard } from './dashboard.js';
import { StaffCommentHandler } from './comment.js';
import { StaffHandoverHandler } from './handover.js';
import { StaffAttendanceBook } from './attendance-book.js';
import { StaffMonthlyReport } from './monthly-report.js';
import { StaffReportNotification } from './report-notification.js';
import { MESSAGES } from '../../constants/labels.js';
import AttendanceManagement from '../shared/attendance-management.js';

export default class StaffModule extends BaseModule {
  constructor(app) {
    super(app);
    
    // サブモジュール初期化
    this.attendanceHandler = new StaffAttendanceHandler(
      this.apiCall.bind(this),
      this.app.showNotification.bind(this.app)
    );
    
    this.dashboard = new StaffDashboard(
      this.apiCall.bind(this),
      this.app.showNotification.bind(this.app),
      this.openStaffCommentModal.bind(this)
    );
    
    this.commentHandler = new StaffCommentHandler(
      this.apiCall.bind(this),
      this.app.showNotification.bind(this.app),
      this.currentUser
    );
    
    this.handoverHandler = new StaffHandoverHandler(
      this.apiCall.bind(this),
      this.app.showNotification.bind(this.app)
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
    
    // 状態管理
    this.state = {
      currentView: 'attendance',
      currentAttendance: null,
      isWorking: false
    };
    
    // インターバル管理
    this.dashboardUpdateInterval = null;
    this.reportCheckInterval = null;
    this.beforeUnloadHandler = null;
  }

  async init() {
    console.log('👥 スタッフモジュール初期化');
    this.render();
    await this.loadInitialData();
    
    // 日報提出監視開始
    this.reportNotification.startMonitoring();
    
    // ダッシュボード自動更新開始
    this.dashboard.startAutoUpdate();
    
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
            <button class="btn btn-outline-primary staff-menu-btn" data-target="dashboardSection">
              <i class="fas fa-tachometer-alt"></i> ダッシュボード
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

        <!-- 1. 出退勤セクション -->
        <div id="attendanceSection" class="staff-section mb-4">
          ${this.renderAttendanceSection()}
        </div>

        <!-- 2. ダッシュボードセクション -->
        <div id="dashboardSection" class="staff-section mb-4" style="display: none;">
          ${this.dashboard.render()}
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
    this.dashboard.init();
    this.handoverHandler.init();
    this.monthlyReport.init();
  }

  /**
   * 出退勤セクションをレンダリング
   */
  renderAttendanceSection() {
    return `
      <div class="row">
        <div class="col-md-6">
          <div class="status-card">
            <h5><i class="fas fa-user-clock"></i> スタッフ出勤状況</h5>
            <div id="staffAttendanceStatus">
              <p class="mb-3">本日はまだ出勤していません</p>
              <button class="btn btn-clock btn-clock-in" id="staffClockInBtn">
                <i class="fas fa-clock"></i> 出勤
              </button>
            </div>
          </div>
        </div>
        <div class="col-md-6">
          <div class="status-card">
            <h6><i class="fas fa-coffee"></i> 休憩管理</h6>
            <div id="breakManagementStatus">
              <p class="text-muted">出勤後に休憩機能が利用できます</p>
              <button class="btn btn-info" id="breakStartBtn" disabled>
                <i class="fas fa-pause"></i> 休憩開始
              </button>
            </div>
            <div id="breakTimeDisplay" class="mt-2" style="display: none;">
              <small class="text-muted">休憩時間: <span id="breakDuration">00:00</span></small>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 申し送り事項（常時表示） -->
      <div class="row mt-4">
        <div class="col-12">
          ${this.handoverHandler.renderQuick()}
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
    this.addEventListenerById('staffClockInBtn', 'click', () => this.handleClockIn());
    
    // 休憩ボタン
    this.addEventListenerById('breakStartBtn', 'click', () => this.attendanceHandler.handleBreakStart());
  }

  async loadInitialData() {
    await this.loadTodayAttendance();
    await this.handoverHandler.loadData();
    await this.switchToSection('attendanceSection');
  }

  /**
   * 今日の出勤状況を読み込み
   */
  async loadTodayAttendance() {
    const result = await this.attendanceHandler.getTodayAttendance();
    
    this.state.currentAttendance = result.attendance;
    this.state.isWorking = result.isWorking;
    
    this.updateAttendanceUI();
  }

  /**
   * 出勤状況UIを更新
   */
  updateAttendanceUI() {
    const statusElement = document.getElementById('staffAttendanceStatus');
    const breakElement = document.getElementById('breakManagementStatus');
    
    this.attendanceHandler.updateUI(this.state, statusElement, {
      onClockIn: () => this.handleClockIn(),
      onClockOut: () => this.handleClockOut()
    });
    
    if (this.state.isWorking) {
      this.attendanceHandler.updateBreakUI(breakElement);
    }
  }

  /**
   * 出勤処理
   */
  async handleClockIn() {
      const result = await this.attendanceHandler.clockIn();
      if (result.success) {
          this.state.currentAttendance = result.attendance;
          this.state.isWorking = true;
          
          // 休憩ハンドラーの状態をリセット
          this.attendanceHandler.isWorking = true;  // 追加
          this.attendanceHandler.currentAttendance = result.attendance;  // 追加
          
          this.updateAttendanceUI();
          
          // 休憩ボタンを有効化
          const breakBtn = document.getElementById('breakStartBtn');
          if (breakBtn) {
              breakBtn.disabled = false;
          }
      }
  }

  updateAttendanceUI() {
    const statusElement = document.getElementById('staffAttendanceStatus');
    const breakElement = document.getElementById('breakManagementStatus');
    
    this.attendanceHandler.updateUI(this.state, statusElement, {
        onClockIn: () => this.handleClockIn(),
        onClockOut: () => this.handleClockOut()
    });
    
    // 休憩UIの更新を修正
    if (this.state.isWorking) {
        // 休憩ハンドラーに正しい状態を渡す
        this.attendanceHandler.isWorking = true;
        this.attendanceHandler.updateBreakUI(breakElement);
    } else {
        // 出勤していない場合は休憩ボタンを無効化
        if (breakElement) {
            breakElement.innerHTML = `
                <p class="text-muted">出勤後に休憩機能が利用できます</p>
                <button class="btn btn-info" id="breakStartBtn" disabled>
                    <i class="fas fa-pause"></i> 休憩開始
                </button>
            `;
        }
    }
  }

  /**
   * 退勤処理
   */
  async handleClockOut() {
    // 未コメントの日報をチェック
    const uncommentedReports = await this.checkUncommentedReports();
    if (uncommentedReports.length > 0) {
      const userNames = uncommentedReports.map(report => report.user_name).join('、');
      const confirmMessage = `以下の利用者の日報にまだコメントが記入されていません：\n${userNames}\n\nコメント記入は必須です。このまま退勤しますか？`;
      
      if (!confirm(confirmMessage)) {
        this.app.showNotification('日報へのコメント記入を完了してから退勤してください', 'warning');
        return;
      }
    }

    const result = await this.attendanceHandler.clockOut(this.state.currentAttendance);
    if (result.success) {
      this.state.currentAttendance = result.attendance;
      this.state.isWorking = false;
      this.updateAttendanceUI();
    }
  }

  /**
   * 画面切り替え
   */
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
        case 'dashboardSection':
          await this.dashboard.loadData();
          this.dashboard.startAutoUpdate();
          break;
        case 'attendanceBookSection':
          await this.attendanceBook.load();
          this.dashboard.stopAutoUpdate();
          break;
        case 'handoverSection':
          await this.handoverHandler.loadData();
          this.dashboard.stopAutoUpdate();
          break;
        case 'monthlyAttendanceSection':
          await this.monthlyReport.loadInitialData();
          this.dashboard.stopAutoUpdate();
          break;
        default:
          this.dashboard.stopAutoUpdate();
          break;
      }
    }
  }

  /**
   * スタッフコメントモーダルを開く
   */
  async openStaffCommentModal(userId, userName) {
    await this.commentHandler.openModal(userId, userName);
    
    // コメント保存後にダッシュボードを更新
    this.commentHandler.onSave = async () => {
      await this.dashboard.loadData();
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
   * ページ離脱警告設定
   */
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

  /**
   * クリーンアップ
   */
  destroy() {
    // 各ハンドラーのクリーンアップ
    this.attendanceHandler.stopBreakTimeMonitoring();
    this.dashboard.stopAutoUpdate();
    this.reportNotification.stopMonitoring();
    
    // ページ離脱警告を削除
    if (this.beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this.beforeUnloadHandler);
    }
    
    // 親クラスのクリーンアップ
    super.destroy();
    
    console.log('👥 スタッフモジュールクリーンアップ完了');
  }
}