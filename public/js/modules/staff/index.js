// modules/staff/index.js（申し送り機能修正版）
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
    
    // 出退勤ハンドラー
    this.attendanceHandler = new StaffAttendanceHandler(
      this.apiCall.bind(this),
      this.app.showNotification.bind(this.app)
    );
    
    // 共通出勤管理（ダッシュボード置き換え）
    this.attendanceManagement = null; // 遅延初期化

    // 申し送りハンドラー（修正：正しい引数で初期化）
    this.handoverSection = null; // 遅延初期化
    
    this.commentHandler = new StaffCommentHandler(
      this.apiCall.bind(this),
      this.app.showNotification.bind(this.app),
      this.currentUser
    );

    this.attendanceBook = new StaffAttendanceBook(
      this.apiCall.bind(this),
      this.app.showNotification.bind(this.app)
    );
    
    // 月別出勤簿（共通化）
    this.monthlyReport = null; // 遅延初期化
    
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

  async initializeSharedModules() {
    const contentArea = document.querySelector('.staff-dashboard');
    
    // 共通出勤管理モジュール初期化
    this.attendanceManagement = new SharedAttendanceManagement(this.app, this);
    await this.attendanceManagement.init(contentArea);
    
    // 申し送りモジュール初期化（修正）
    this.handoverSection = new SharedHandover(this.app, this);
    await this.handoverSection.init(contentArea);
    
    // 月別出勤簿モジュール初期化（共通化）
    this.monthlyReport = new SharedMonthlyReport(this.app, this);
    await this.monthlyReport.init(contentArea);
  }

  renderAttendanceSection() {
    // 申し送り表示を削除（別セクションで表示するため）
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

  // 他のメソッドは変更なし...

  async switchToSection(sectionId) {
    console.log(`[StaffModule] 画面切り替え: ${sectionId}`);
    
    // 全てのセクションを非表示
    document.querySelectorAll('.staff-section').forEach(section => {
      section.style.display = 'none';
    });
    
    // 共通モジュールも非表示
    this.attendanceManagement?.hide();
    this.handoverSection?.hide();
    this.monthlyReport?.hide();
    
    // 指定されたセクションのみ表示
    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
      targetSection.style.display = 'block';
    }
    
    this.state.currentView = sectionId;
    
    // 各セクション固有の処理
    switch (sectionId) {
      case 'attendanceManagementSection':
        await this.attendanceManagement?.show();
        break;
      case 'handoverSection':
        await this.handoverSection?.show();
        break;
      case 'attendanceBookSection':
        await this.attendanceBook.load();
        break;
      case 'monthlyAttendanceSection':
        await this.monthlyReport?.show();
        break;
    }
  }

  // 以下、既存のメソッドはそのまま...
  
  getServiceTypeDisplayName(type) {
    const types = {
      'commute': '通所',
      'home': '在宅'
    };
    return types[type] || type;
  }

  destroy() {
    // 各ハンドラーのクリーンアップ
    this.attendanceHandler?.stopBreakTimeMonitoring();
    this.attendanceManagement?.destroy();
    this.handoverSection?.destroy();
    this.monthlyReport?.destroy();
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