// modules/admin/index.js（申し送り機能修正版）
import BaseModule from '../../base-module.js';
import { modalManager } from '../shared/modal-manager.js';
import { SharedAttendanceManagement } from '../shared/attendance-management.js';
import AdminUserManagement from './user-management.js';
import SharedMonthlyReport from '../shared/monthly-report.js';
import SharedHandover from '../shared/handover.js';
import AdminAuditLog from './audit-log.js';

// グローバルに modalManager を公開（一時的な対処）
window.modalManager = modalManager;

export default class AdminModule extends BaseModule {
    constructor(app) {
        super(app);
        this.currentView = 'attendanceManagement';
        this.subModules = {};
        this.selectedYear = new Date().getFullYear();
        this.selectedMonth = new Date().getMonth() + 1;
        this.selectedUserId = null;
        
        // 共通出勤管理モジュール
        this.attendanceManagement = null; // 遅延初期化
        // 申し送りモジュール
        this.handoverSection = null; // 遅延初期化
    }

    async init() {
        console.log('🔧 管理者モジュール初期化（統合版）');
        
        // グローバルに公開（イベントハンドラ用）
        window.adminModule = this;
        
        this.render();
        await this.initializeSubModules();
        
        // 初回表示のためにダッシュボードを明示的に表示
        await this.switchToView('attendanceManagement');
    }

    render() {
        const content = document.getElementById('app-content');
        content.innerHTML = `
            <div class="admin-dashboard">
                <!-- 管理者メニュー（画面切り替え） -->
                <div class="admin-menu mb-4">
                    <div class="btn-group w-100" role="group">
                        <button class="btn btn-outline-primary admin-menu-btn active" data-target="attendanceManagement">
                            <i class="fas fa-clock"></i> 出勤記録管理
                        </button>
                        <button class="btn btn-outline-primary admin-menu-btn" data-target="userManagement">
                            <i class="fas fa-users-cog"></i> ユーザー管理
                        </button>
                        <button class="btn btn-outline-primary admin-menu-btn" data-target="handoverSection">
                            <i class="fas fa-exchange-alt"></i> 申し送り
                        </button>
                        <button class="btn btn-outline-primary admin-menu-btn" data-target="monthlyReport">
                            <i class="fas fa-calendar-alt"></i> 月別出勤簿
                        </button>
                        <button class="btn btn-outline-primary admin-menu-btn" data-target="auditLog">
                            <i class="fas fa-clipboard-list"></i> 監査ログ
                        </button>
                    </div>
                </div>

                <!-- コンテンツエリア -->
                <div id="adminContentArea">
                    <!-- 各サブモジュールのコンテンツがここに表示される -->
                </div>
            </div>
        `;
        
        this.setupEventListeners();
    }

    setupEventListeners() {
        // メニューボタン（画面切り替え）
        document.querySelectorAll('.admin-menu-btn').forEach(btn => {
            this.addEventListener(btn, 'click', (e) => {
                const targetView = e.target.closest('button').getAttribute('data-target');
                this.switchToView(targetView);
                
                // ボタンのアクティブ状態を更新
                document.querySelectorAll('.admin-menu-btn').forEach(b => b.classList.remove('active'));
                e.target.closest('button').classList.add('active');
            });
        });
    }

    async initializeSubModules() {
        const contentArea = document.getElementById('adminContentArea');
        
        // 共通出勤管理モジュール
        this.attendanceManagement = new SharedAttendanceManagement(this.app, this);
        await this.attendanceManagement.init(contentArea);

        // 申し送りモジュール（修正：初期化を追加）
        this.handoverSection = new SharedHandover(this.app, this);
        await this.handoverSection.init(contentArea);

        // 月別出勤簿モジュール（共通化）
        this.monthlyReport = new SharedMonthlyReport(this.app, this);
        await this.monthlyReport.init(contentArea);

        // 各サブモジュールを初期化
        this.subModules = {
            userManagement: new AdminUserManagement(this.app, this),
            auditLog: new AdminAuditLog(this.app, this)
        };

        // すべてのサブモジュールを初期化
        for (const [key, module] of Object.entries(this.subModules)) {
            await module.init(contentArea);
        }
    }

    async switchToView(viewName) {
        console.log(`[AdminModule] 画面切り替え: ${viewName}`);
        
        // 全てのセクションを非表示
        this.attendanceManagement?.hide();
        this.handoverSection?.hide();
        this.monthlyReport?.hide();
        Object.values(this.subModules).forEach(module => {
            if (module.hide) {
                module.hide();
            }
        });

        // 新しいビューを表示
        if (viewName === 'attendanceManagement') {
            await this.attendanceManagement?.show();
        } else if (viewName === 'handoverSection') {
            await this.handoverSection?.show();
        } else if (viewName === 'monthlyReport') {
            await this.monthlyReport?.show();
        } else if (this.subModules[viewName]) {
            await this.subModules[viewName].show();
        } else {
            console.error(`[AdminModule] 未知のビュー: ${viewName}`);
        }

        this.currentView = viewName;
    }

    // 以下、既存のメソッドはそのまま...

    destroy() {
        // 共通出勤管理モジュールのクリーンアップ
        this.attendanceManagement?.destroy();
        
        // 申し送りモジュールのクリーンアップ
        this.handoverSection?.destroy();
        
        // 月別出勤簿モジュールのクリーンアップ
        this.monthlyReport?.destroy();

        // 各サブモジュールをクリーンアップ
        Object.values(this.subModules).forEach(module => {
            if (module.destroy) {
                module.destroy();
            }
        });

        // 親クラスのクリーンアップ
        super.destroy();
        
        console.log('🔧 管理者モジュールクリーンアップ完了');
    }
}