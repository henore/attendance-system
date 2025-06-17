// modules/admin/index.js
// 管理者モジュール - メイン制御（修正版）

import BaseModule from '../../base-module.js';
import { modalManager } from '../shared/modal-manager.js';
import AdminDashboard from './dashboard.js';
import AdminUserManagement from './user-management.js';
import AdminAttendanceManagement from './attendance-management.js';
import AdminMonthlyReport from './monthly-report.js';
import AdminHandover from './handover.js';
import AdminAuditLog from './audit-log.js';

// グローバルに modalManager を公開（一時的な対処）
window.modalManager = modalManager;

export default class AdminModule extends BaseModule {
    constructor(app) {
        super(app);
        this.currentView = 'dashboard';
        this.subModules = {};
        this.selectedYear = new Date().getFullYear();
        this.selectedMonth = new Date().getMonth() + 1;
        this.selectedUserId = null;
    }

    async init() {
        console.log('🔧 管理者モジュール初期化');
        
        // グローバルに公開（イベントハンドラ用）
        window.adminModule = this;
        
        this.render();
        await this.initializeSubModules();
        
        // 初回表示のためにダッシュボードを明示的に表示
        await this.switchToView('dashboard');
    }

    render() {
        const content = document.getElementById('app-content');
        content.innerHTML = `
     <div class="admin-dashboard">
            <!-- 管理者メニュー（画面切り替え） -->
            <div class="staff-menu mb-4">
                <div class="btn-group w-100" role="group">
                    <button class="btn btn-outline-primary admin-menu-btn active" data-target="dashboard">
                        <i class="fas fa-tachometer-alt"></i> ダッシュボード
                    </button>
                    <button class="btn btn-outline-primary admin-menu-btn" data-target="userManagement">
                        <i class="fas fa-users-cog"></i> ユーザー管理
                    </button>
                    <button class="btn btn-outline-primary admin-menu-btn" data-target="attendanceManagement">
                        <i class="fas fa-clock"></i> 出勤管理
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
        
        // 各サブモジュールを初期化
        this.subModules = {
            dashboard: new AdminDashboard(this.app, this),
            userManagement: new AdminUserManagement(this.app, this),
            attendanceManagement: new AdminAttendanceManagement(this.app, this),
            handoverSection: new AdminHandover(this.app, this),
            monthlyReport: new AdminMonthlyReport(this.app, this),
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
        Object.values(this.subModules).forEach(module => {
            if (module.hide) {
                module.hide();
            }
        });

        // 新しいビューを表示
        if (this.subModules[viewName]) {
            await this.subModules[viewName].show();
            this.currentView = viewName;
        } else {
            console.error(`[AdminModule] 未知のビュー: ${viewName}`);
        }
    }

    // 以下は既存のメソッドをそのまま使用
    getSharedState() {
        return {
            selectedYear: this.selectedYear,
            selectedMonth: this.selectedMonth,
            selectedUserId: this.selectedUserId
        };
    }

    updateSharedState(updates) {
        Object.assign(this, updates);
    }

    async callApi(endpoint, options = {}) {
        return await this.apiCall(endpoint, options);
    }

    showNotification(message, type = 'info') {
        this.app.showNotification(message, type);
    }

    async showConfirm(options) {
        return await modalManager.confirm(options);
    }

    showModal(id, data = {}) {
        modalManager.show(id, data);
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
        const serviceTypes = {
            'commute': '通所',
            'home': '在宅'
        };
        return serviceTypes[serviceType] || serviceType;
    }

    getRoleColor(role) {
        const colors = {
            'user': 'primary',
            'staff': 'success',
            'admin': 'danger'
        };
        return colors[role] || 'secondary';
    }

    calculateWorkDuration(attendance) {
        if (!attendance || !attendance.clock_in || !attendance.clock_out) {
            return null;
        }
        
        try {
            const clockIn = new Date('1970-01-01 ' + attendance.clock_in);
            const clockOut = new Date('1970-01-01 ' + attendance.clock_out);
            const durationMs = clockOut - clockIn;
            const hours = durationMs / (1000 * 60 * 60);
            
            if (hours > 0) {
                return hours.toFixed(1);
            }
        } catch (error) {
            console.error('勤務時間計算エラー:', error);
        }
        
        return null;
    }

    getStatusBadge(status) {
        const statusConfig = {
            'normal': { class: 'bg-success', text: '正常' },
            'late': { class: 'bg-warning text-dark', text: '遅刻' },
            'early': { class: 'bg-info', text: '早退' },
            'absence': { class: 'bg-danger', text: '欠勤' },
            'paid_leave': { class: 'bg-primary', text: '有給欠勤' }
        };
        
        const config = statusConfig[status] || statusConfig['normal'];
        return `<span class="badge ${config.class}">${config.text}</span>`;
    }

    destroy() {
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