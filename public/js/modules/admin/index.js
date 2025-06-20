// modules/admin/index.js
// 管理者モジュール - 統合版（共通出勤管理使用）

import BaseModule from '../../base-module.js';
import { modalManager } from '../shared/modal-manager.js';
import { SharedAttendanceManagement } from '../shared/attendance-management.js';
import AdminUserManagement from './user-management.js';
import AdminMonthlyReport from './monthly-report.js';
import { SharedHandover } from '../shared/handover.js';
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

        //申し送り
        this.handoverSection = null;
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

    renderDashboardSummary() {
        return `
            <div class="custom-card">
                <div class="custom-card-header">
                    <h5><i class="fas fa-tachometer-alt"></i> 本日の状況サマリー</h5>
                    <button class="btn btn-outline-light btn-sm" id="refreshSummaryBtn">
                        <i class="fas fa-sync"></i> 更新
                    </button>
                </div>
                <div class="card-body">
                    <div id="summaryContent">
                        <div class="text-center p-3">
                            <div class="spinner-border text-primary" role="status">
                                <span class="visually-hidden">読み込み中...</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
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
        
        //出勤者管理
        this.attendanceManagement = new SharedAttendanceManagement(this.app, this);
        await this.attendanceManagement.init(contentArea);
        //申し送り
        this.handoverSection = new SharedHandover(this.app, this);
        await this.handoverSection.init(contentArea);

        // 各サブモジュールを初期化
        this.subModules = {
            userManagement: new AdminUserManagement(this.app, this),
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
        this.attendanceManagement?.hide();
        Object.values(this.subModules).forEach(module => {
            if (module.hide) {
                module.hide();
            }
        });

        // 新しいビューを表示
        if (viewName === 'attendanceManagement') {
            await this.attendanceManagement?.show();
        } else if (this.subModules[viewName]) {
            await this.subModules[viewName].show();
        } else {
            console.error(`[AdminModule] 未知のビュー: ${viewName}`);
        }

        this.currentView = viewName;
    }

    async updateDashboardSummary() {
        try {
            const summaryContent = document.getElementById('summaryContent');
            
            // ローディング表示
            summaryContent.innerHTML = `
                <div class="text-center p-3">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">更新中...</span>
                    </div>
                </div>
            `;

            // 今日の全体状況取得
            const response = await this.apiCall('/api/admin/status/today');
            const users = response.users || [];
            
            // 統計計算
            const stats = this.calculateDashboardStats(users);
            
            // サマリー表示更新
            summaryContent.innerHTML = this.generateSummaryHTML(stats);

        } catch (error) {
            console.error('ダッシュボードサマリー更新エラー:', error);
            const summaryContent = document.getElementById('summaryContent');
            summaryContent.innerHTML = `
                <div class="alert alert-danger">
                    <i class="fas fa-exclamation-triangle"></i> 
                    サマリーの更新に失敗しました
                </div>
            `;
        }
    }

    calculateDashboardStats(users) {
        const stats = {
            total: users.length,
            working: 0,
            finished: 0,
            notArrived: 0,
            reportSubmitted: 0,
            reportPending: 0,
            commentPending: 0,
            userStats: { total: 0, working: 0, finished: 0, notArrived: 0 },
            staffStats: { total: 0, working: 0, finished: 0, notArrived: 0 }
        };

        users.forEach(user => {
            const isUser = user.role === 'user';
            const isStaff = user.role === 'staff' || user.role === 'admin';

            // 全体統計
            if (user.clock_in) {
                if (user.clock_out) {
                    stats.finished++;
                    if (isUser && !user.report_id) {
                        stats.reportPending++;
                    }
                } else {
                    stats.working++;
                }
            } else {
                stats.notArrived++;
            }

            // 日報統計（利用者のみ）
            if (isUser) {
                if (user.report_id) {
                    stats.reportSubmitted++;
                    if (!user.comment) {
                        stats.commentPending++;
                    }
                }
                
                // 利用者別統計
                stats.userStats.total++;
                if (user.clock_in) {
                    if (user.clock_out) {
                        stats.userStats.finished++;
                    } else {
                        stats.userStats.working++;
                    }
                } else {
                    stats.userStats.notArrived++;
                }
            }

            // スタッフ別統計
            if (isStaff) {
                stats.staffStats.total++;
                if (user.clock_in) {
                    if (user.clock_out) {
                        stats.staffStats.finished++;
                    } else {
                        stats.staffStats.working++;
                    }
                } else {
                    stats.staffStats.notArrived++;
                }
            }
        });

        return stats;
    }

    generateSummaryHTML(stats) {
        return `
            <div class="row">
                <!-- 全体統計 -->
                <div class="col-md-4">
                    <h6><i class="fas fa-chart-pie"></i> 全体出勤状況</h6>
                    <div class="stats-grid">
                        <div class="stat-item">
                            <div class="stat-value text-success">${stats.working}</div>
                            <div class="stat-label">出勤中</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value text-info">${stats.finished}</div>
                            <div class="stat-label">退勤済み</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value text-muted">${stats.notArrived}</div>
                            <div class="stat-label">未出勤</div>
                        </div>
                    </div>
                </div>

                <!-- 利用者統計 -->
                <div class="col-md-4">
                    <h6><i class="fas fa-users"></i> 利用者状況</h6>
                    <div class="stats-grid">
                        <div class="stat-item">
                            <div class="stat-value text-primary">${stats.userStats.working}</div>
                            <div class="stat-label">作業中</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value text-warning">${stats.reportPending}</div>
                            <div class="stat-label">日報未提出</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value text-danger">${stats.commentPending}</div>
                            <div class="stat-label">コメント未記入</div>
                        </div>
                    </div>
                </div>

                <!-- スタッフ統計 -->
                <div class="col-md-4">
                    <h6><i class="fas fa-user-tie"></i> スタッフ状況</h6>
                    <div class="stats-grid">
                        <div class="stat-item">
                            <div class="stat-value text-success">${stats.staffStats.working}</div>
                            <div class="stat-label">勤務中</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value text-info">${stats.staffStats.finished}</div>
                            <div class="stat-label">退勤済み</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value text-muted">${stats.staffStats.notArrived}</div>
                            <div class="stat-label">未出勤</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 要注意事項 -->
            ${this.generateAlerts(stats)}
        `;
    }

    generateAlerts(stats) {
        let alerts = '';

        if (stats.commentPending > 0) {
            alerts += `
                <div class="alert alert-warning mt-3">
                    <i class="fas fa-exclamation-triangle"></i>
                    <strong>コメント未記入の日報が${stats.commentPending}件あります</strong>
                    <br>出勤記録管理画面でコメントを記入してください。
                </div>
            `;
        }

        if (stats.reportPending > 0) {
            alerts += `
                <div class="alert alert-info mt-3">
                    <i class="fas fa-file-exclamation"></i>
                    退勤済みで日報未提出の利用者が${stats.reportPending}名います
                </div>
            `;
        }

        return alerts;
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

    getServiceTypeDisplayName(type) {
    const types = {
        'commute': '通所',
        'home': '在宅'
    };
    return types[type] || type;
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
    const badges = {
        'normal': '<span class="badge bg-success">正常</span>',
        'late': '<span class="badge bg-warning text-dark">遅刻</span>',
        'early': '<span class="badge bg-info">早退</span>',
        'absence': '<span class="badge bg-danger">欠勤</span>',
        'paid_leave': '<span class="badge bg-primary">有給</span>'
    };
    return badges[status] || `<span class="badge bg-secondary">${status}</span>`;
    }

    destroy() {
        // 共通出勤管理モジュールのクリーンアップ
        this.attendanceManagement?.destroy();

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