// modules/staff/index.js（簡潔化版）
import BaseModule from '../../base-module.js';
import { StaffAttendanceUI } from './attendance.js';
import { SharedAttendanceManagement } from '../shared/attendance-management.js';
import { StaffAttendanceBook } from './calendar.js';
import SharedMonthlyReport from '../shared/monthly-report.js';
import { StaffReportNotification } from './report-notification.js';
import SharedHandover from '../shared/handover.js';
import TrialVisitsManager from '../shared/trial-visits.js';
import StaffApproval from './approval.js';
import { getCurrentDate, formatDateTime } from '../../utils/date-time.js';

export default class StaffModule extends BaseModule {
  constructor(app) {
    super(app);
    
    // 状態管理
    this.state = {
      currentView: 'attendanceSection'
    };
    
    // UI制御モジュール
    this.attendanceUI = new StaffAttendanceUI(app, this);
    
    // 共通モジュール（遅延初期化）
    this.attendanceManagement = null;
    this.handoverSection = null;
    this.monthlyReport = null;
    this.trialVisitsManager = null;
    this.staffApproval = null; // 稟議申請モジュール

    // スタッフ専用モジュール
    this.attendanceBook = new StaffAttendanceBook(
      this.app.apiCall.bind(this.app),
      this.app.showNotification.bind(this.app)
    );

    this.reportNotification = new StaffReportNotification(
      this.app.apiCall.bind(this.app),
      this.app.showNotification.bind(this.app),
      this.switchToSection.bind(this)
    );


    this.beforeUnloadHandler = null;
  }

  async init() {
    console.log('👥 スタッフモジュール初期化');
    
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
        <!-- スタッフメニュー -->
        <div class="staff-menu mb-4">
          <div class="btn-group w-100" role="group">
            <button class="btn btn-outline-primary staff-menu-btn active" data-target="attendanceSection">
              <i class="fas fa-clock"></i> 出退勤
            </button>
            <button class="btn btn-outline-primary staff-menu-btn" data-target="attendanceManagementSection">
              <i class="fas fa-users"></i> 利用者出勤状況
            </button>
            <button class="btn btn-outline-primary staff-menu-btn" data-target="approvalSection">
              <i class="fas fa-file-signature"></i> 稟議申請
            </button>
            <button class="btn btn-outline-primary staff-menu-btn" data-target="trialVisits">
              <i class="fas fa-user-friends"></i> 体験入所管理
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

        <!-- 通知バッジ -->
        <div id="notificationBadge" class="notification-badge" style="display: none;">0</div>

        <!-- 1. 出退勤セクション -->
        <div id="attendanceSection" class="staff-section mb-4">
          ${this.renderAttendanceSection()}
        </div>

        <!-- 2. 利用者出勤状況セクション（動的に作成） -->
        <!-- 3. 申し送り事項セクション（動的に作成） -->

        <!-- 4. 出勤簿セクション -->
        <div id="attendanceBookSection" class="staff-section mb-4" style="display: none;">
          ${this.attendanceBook.render()}
        </div>

        <!-- 5. 月別出勤簿セクション（動的に作成） -->
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

        <!-- 休憩ステータス専用表示 -->
        <div id="breakStatusDisplay" class="break-status-display">
          <!-- 動的に更新される -->
        </div>

        <!-- ステータス表示 -->
        <div id="attendanceStatusDisplay" class="status-display">
          <!-- 動的に更新される -->
        </div>

        <!-- 日報セクション（常時表示） -->
        <div id="staffReportSection" class="mt-4">
          <div class="text-center text-muted p-4">
            <i class="fas fa-spinner fa-spin fa-2x mb-3"></i>
            <p>日報フォームを読み込み中...</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

  setupEventListeners() {
    // メニューボタン
    document.querySelectorAll('.staff-menu-btn').forEach(btn => {
      this.addEventListener(btn, 'click', (e) => {
        const targetId = e.target.closest('button').getAttribute('data-target');
        this.switchToSection(targetId);
        
        // ボタンのアクティブ状態を更新
        document.querySelectorAll('.staff-menu-btn').forEach(b => b.classList.remove('active'));
        e.target.closest('button').classList.add('active');
      });
    });
    
    // 出退勤ボタン（AttendanceUIに委譲）
    this.addEventListenerById('clockInBtn', 'click', () => this.attendanceUI.handleClockIn());
    this.addEventListenerById('clockOutBtn', 'click', () => this.attendanceUI.handleClockOut());
    
    // 休憩ボタン（AttendanceUIに委譲）
    this.addEventListenerById('breakStartBtn', 'click', () => this.attendanceUI.handleBreakStart());
    this.addEventListenerById('breakEndBtn', 'click', () => this.attendanceUI.handleBreakEnd());

    // 時刻表示の更新
    this.startTimeDisplay();
  }

  async initializeSharedModules() {
    const contentArea = document.querySelector('.staff-dashboard');

    try {
      // 共通出勤管理モジュール
      this.attendanceManagement = new SharedAttendanceManagement(this.app, this);
      await this.attendanceManagement.init(contentArea);

      // 申し送りモジュール
      this.handoverSection = new SharedHandover(this.app, this);
      await this.handoverSection.init(contentArea);

      // 月別出勤簿モジュール
      this.monthlyReport = new SharedMonthlyReport(this.app, this);
      await this.monthlyReport.init(contentArea);

      // 稟議申請モジュール
      this.staffApproval = new StaffApproval(this.app, this);
      await this.staffApproval.init(contentArea);

      // グローバルに公開（イベントハンドラ用）
      window.staffApproval = this.staffApproval;

      console.log('✅ 共通モジュール初期化完了');
    } catch (error) {
      console.error('❌ 共通モジュール初期化エラー:', error);
      this.showNotification('一部機能の初期化に失敗しました', 'warning');
    }
  }

  async loadInitialData() {
    try {
      // 今日の出勤状況取得（AttendanceUIに委譲）
      await this.attendanceUI.loadTodayAttendance();
      
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
    if (this.trialVisitsManager) this.trialVisitsManager.hide();
    if (this.staffApproval) this.staffApproval.hide();

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
          }
          break;
        case 'approvalSection':
          if (this.staffApproval) {
            await this.staffApproval.show();
          }
          break;
        case 'trialVisits':
          await this.showTrialVisits();
          break;
        case 'handoverSection':
          if (this.handoverSection) {
            await this.handoverSection.show();
          }
          break;
        case 'attendanceBookSection':
          await this.attendanceBook.load();
          break;
        case 'monthlyAttendanceSection':
          if (this.monthlyReport) {
            await this.monthlyReport.show();
          }
          break;
      }
    } catch (error) {
      console.error(`セクション切り替えエラー (${sectionId}):`, error);
      this.showNotification('画面の切り替えに失敗しました', 'danger');
    }
  }

  // 体験入所管理画面表示
  async showTrialVisits() {
    if (!this.trialVisitsManager) {
      this.trialVisitsManager = new TrialVisitsManager(this.app);
      // グローバルに公開（削除処理等で使用）
      window.trialVisitsManager = this.trialVisitsManager;
    }
    
    // セクション作成
    const staffDashboard = document.querySelector('.staff-dashboard');
    let trialSection = document.getElementById('trialVisits');
    
    if (!trialSection) {
      trialSection = document.createElement('div');
      trialSection.id = 'trialVisits';
      trialSection.className = 'staff-section mb-4';
      trialSection.style.display = 'none';
      staffDashboard.appendChild(trialSection);
    }
    
    // 体験入所管理画面を表示
    trialSection.innerHTML = this.trialVisitsManager.render();
    trialSection.style.display = 'block';
    
    // 初期化
    await this.trialVisitsManager.init();
  }

  /**
   * ログアウト時の処理（コメント未記入チェック）
   */
  async handleLogout() {
    const uncommentedReports = await this.attendanceManagement?.searchAttendanceRecords();
    // 未コメントがある場合の確認処理
    // TODO: 実装
    return true;
  }

  updateClockInButtonState(disabled) {
    const clockInBtn = document.getElementById('clockInBtn');
    if (clockInBtn) {
      clockInBtn.disabled = disabled;
    }
  }

  async checkLastRecord() {
    try {
      const response = await this.app.apiCall('/api/user/last-record');
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
    this.beforeUnloadHandler = (e) => {
      if (this.attendanceUI.isWorking) {
        e.preventDefault();
        e.returnValue = '出勤中です。ページを離れますか？';
      }
    };
    
    window.addEventListener('beforeunload', this.beforeUnloadHandler);
  }

  startTimeDisplay() {
    const updateTime = () => {
      const displayElement = document.getElementById('currentTimeDisplay');
      if (displayElement) {
        displayElement.innerHTML = `<i class="fas fa-clock"></i> ${formatDateTime(new Date(), 'datetime')}`;
      }
    };
    
    updateTime();
    setInterval(updateTime, 1000);
  }

  // 共通メソッド（SharedModulesから使用）
callApi(endpoint, options = {}) {
  console.log('[StaffModule callApi] 呼び出し:', endpoint, options);
  return this.app.apiCall(endpoint, options);
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

  destroy() {
    // 各モジュールのクリーンアップ
    if (this.attendanceUI) {
      this.attendanceUI.destroy();
    }

    if (this.attendanceManagement) {
      this.attendanceManagement.destroy();
    }

    if (this.handoverSection) {
      this.handoverSection.destroy();
    }

    if (this.trialVisitsManager) {
      this.trialVisitsManager.destroy();
      this.trialVisitsManager = null;
      window.trialVisitsManager = null;
    }

    if (this.monthlyReport) {
      this.monthlyReport.destroy();
    }

    if (this.staffApproval) {
      this.staffApproval.destroy();
      this.staffApproval = null;
      window.staffApproval = null;
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