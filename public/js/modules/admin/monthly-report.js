
// modules/admin/monthly-report.js
// 管理者月別出勤簿機能（モーダル修正版）

import { API_ENDPOINTS } from '../../constants/api-endpoints.js';
import { modalManager } from '../shared/modal-manager.js';
import { formatDate } from '../../utils/date-time.js'; // 追加

export default class AdminMonthlyReport {
    constructor(app, parentModule) {
        this.app = app;
        this.parent = parentModule;
        this.container = null;
        this.selectedYear = new Date().getFullYear();
        this.selectedMonth = new Date().getMonth() + 1;
        this.selectedUserId = null;
        this.currentReportData = null;
    }

    async init(containerElement) {
        this.container = document.createElement('div');
        this.container.id = 'monthlyReportSection';
        this.container.className = 'admin-section';
        this.container.style.display = 'none';
        
        containerElement.appendChild(this.container);
        this.render();
        this.setupEventListeners();
    }

    render() {
        this.container.innerHTML = `
            <div class="custom-card">
                <div class="custom-card-header">
                    <h5><i class="fas fa-calendar-alt"></i> 月別出勤簿</h5>
                    <div class="btn-group">
                        <button class="btn btn-outline-light btn-sm" id="exportExcelBtn" style="display: none;">
                            <i class="fas fa-file-excel"></i> Excel出力
                        </button>
                        <button class="btn btn-outline-light btn-sm" id="printMonthlyReportBtn" style="display: none;">
                            <i class="fas fa-print"></i> 印刷
                        </button>
                    </div>
                </div>
                <div class="card-body">
                    <!-- 選択フィルター -->
                    <div class="row mb-4">
                        <div class="col-md-2">
                            <label for="monthlyYearSelect" class="form-label">年</label>
                            <select class="form-control" id="monthlyYearSelect">
                                <!-- 年のオプションが動的に生成される -->
                            </select>
                        </div>
                        <div class="col-md-2">
                            <label for="monthlyMonthSelect" class="form-label">月</label>
                            <select class="form-control" id="monthlyMonthSelect">
                                <!-- 月のオプションが動的に生成される -->
                            </select>
                        </div>
                        <div class="col-md-4">
                            <label for="monthlyUserSelect" class="form-label">ユーザー</label>
                            <select class="form-control" id="monthlyUserSelect">
                                <option value="">ユーザーを選択してください</option>
                                <!-- ユーザーのオプションが動的に生成される -->
                            </select>
                        </div>
                        <div class="col-md-2 d-flex align-items-end">
                            <button class="btn btn-primary w-100" id="showMonthlyReportBtn">
                                <i class="fas fa-search"></i> 表示
                            </button>
                        </div>
                        <div class="col-md-2 d-flex align-items-end">
                            <button class="btn btn-outline-secondary w-100" id="clearMonthlyReportBtn">
                                <i class="fas fa-times"></i> クリア
                            </button>
                        </div>
                    </div>
                    
                    <!-- 選択状況表示 -->
                    <div id="selectionInfo" class="alert alert-info" style="display: none;">
                        <!-- 選択された条件の表示 -->
                    </div>
                    
                    <!-- 月別出勤記録表示エリア -->
                    <div id="monthlyReportDisplay">
                        <div class="text-center p-5">
                            <i class="fas fa-calendar-alt fa-3x text-muted mb-3"></i>
                            <h5 class="text-muted">月別出勤簿</h5>
                            <p class="text-muted">年・月・ユーザーを選択して「表示」ボタンを押してください</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 日報詳細表示モーダル -->
            <div class="modal fade" id="adminMonthlyReportDetailModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header bg-primary text-white">
                            <h5 class="modal-title" id="adminMonthlyReportDetailTitle">
                                <i class="fas fa-file-alt"></i> 日報詳細
                            </h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body" id="adminMonthlyReportDetailContent">
                            <!-- 日報詳細がここに表示される -->
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                                <i class="fas fa-times"></i> 閉じる
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    setupEventListeners() {
        // 年月変更時の選択肢更新
        const yearSelect = this.container.querySelector('#monthlyYearSelect');
        const monthSelect = this.container.querySelector('#monthlyMonthSelect');
        
        if (yearSelect) {
            yearSelect.addEventListener('change', () => {
                this.selectedYear = parseInt(yearSelect.value);
            });
        }
        
        if (monthSelect) {
            monthSelect.addEventListener('change', () => {
                this.selectedMonth = parseInt(monthSelect.value);
            });
        }

        // 表示・クリアボタン
        const showBtn = this.container.querySelector('#showMonthlyReportBtn');
        const clearBtn = this.container.querySelector('#clearMonthlyReportBtn');
        
        if (showBtn) {
            showBtn.addEventListener('click', () => this.showMonthlyReport());
        }
        
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearReport());
        }

        // 印刷・エクスポートボタン
        const printBtn = this.container.querySelector('#printMonthlyReportBtn');
        const exportBtn = this.container.querySelector('#exportExcelBtn');
        
        if (printBtn) {
            printBtn.addEventListener('click', () => this.printReport());
        }
        
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportToExcel());
        }

        // イベント委譲で動的ボタンを処理
        this.container.addEventListener('click', (e) => {
            // 日報詳細ボタン
            if (e.target.closest('.btn-show-report')) {
                const btn = e.target.closest('.btn-show-report');
                const userId = btn.getAttribute('data-user-id');
                const userName = btn.getAttribute('data-user-name');
                const date = btn.getAttribute('data-date');
                this.showReportDetail(userId, userName, date);
            }
            
            // 編集ボタン
            if (e.target.closest('.btn-edit-attendance')) {
                const btn = e.target.closest('.btn-edit-attendance');
                const userId = btn.getAttribute('data-user-id');
                const userName = btn.getAttribute('data-user-name');
                const userRole = btn.getAttribute('data-user-role');
                const recordId = btn.getAttribute('data-record-id');
                const date = btn.getAttribute('data-date');
                const clockIn = btn.getAttribute('data-clock-in');
                const clockOut = btn.getAttribute('data-clock-out');
                const status = btn.getAttribute('data-status');
                
                // 出勤管理モジュールの編集機能を使用
                const attendanceModule = this.parent.subModules.attendanceManagement;
                if (attendanceModule) {
                    attendanceModule.editAttendance(userId, userName, userRole, recordId, date, clockIn, clockOut, status);
                }
            }
        });
    }

    async show() {
        this.container.style.display = 'block';
        await this.loadData();
        // モーダルを登録
        this.registerModals();
    }

    hide() {
        this.container.style.display = 'none';
    }

    registerModals() {
        // モーダルマネージャーに登録
        try {
            modalManager.register('adminMonthlyReportDetailModal');
        } catch (error) {
            console.error('モーダル登録エラー:', error);
        }
    }

    // 日報詳細表示（修正版）
    async showReportDetail(userId, userName, date) {
        try {
            const response = await this.parent.callApi(API_ENDPOINTS.STAFF.REPORT(userId, date));
            
            if (!response.report) {
                this.parent.showNotification('この日の日報はありません', 'info');
                return;
            }

            // モーダルタイトル設定
            const formattedDate = formatDate(date, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                weekday: 'long'
            });
            
            const title = this.container.querySelector('#adminMonthlyReportDetailTitle');
            const content = this.container.querySelector('#adminMonthlyReportDetailContent');
            
            title.innerHTML = `<i class="fas fa-file-alt"></i> ${userName}さんの日報詳細 - ${formattedDate}`;
            content.innerHTML = this.generateReportDetailContent(response);

            // Bootstrap モーダルを直接使用
            const modal = new bootstrap.Modal(this.container.querySelector('#adminMonthlyReportDetailModal'));
            modal.show();

        } catch (error) {
            console.error('日報詳細取得エラー:', error);
            this.parent.showNotification('日報の取得に失敗しました', 'danger');
        }
    }

    // 日報詳細コンテンツを生成
    generateReportDetailContent(data) {
        const { user, attendance, report, comment, breakRecord } = data;
        
        return `
            <!-- 出勤情報 -->
            <div class="row mb-3">
                <div class="col-4">
                    <div class="detail-section">
                        <h6><i class="fas fa-clock text-success"></i> 出勤時間</h6>
                        <div class="detail-value h4 text-success">${attendance ? attendance.clock_in : '-'}</div>
                    </div>
                </div>
                <div class="col-4">
                    <div class="detail-section">
                        <h6><i class="fas fa-coffee text-warning"></i> 休憩時間</h6>
                        <div class="detail-value h4 text-warning">
                            ${breakRecord && breakRecord.start_time ? 
                                `${breakRecord.start_time}〜${breakRecord.end_time || ''}` : 
                                '-'}
                        </div>
                    </div>
                </div>
                <div class="col-4">
                    <div class="detail-section">
                        <h6><i class="fas fa-clock text-info"></i> 退勤時間</h6>
                        <div class="detail-value h4 ${attendance && attendance.clock_out ? 'text-info' : 'text-muted'}">${attendance ? (attendance.clock_out || '未退勤') : '-'}</div>
                    </div>
                </div>
            </div>

            <hr>

            <!-- 日報内容 -->
            <div class="report-summary">
                <h6><i class="fas fa-file-alt"></i> 日報内容</h6>
                
                <!-- 作業内容 -->
                <div class="mb-3">
                    <label class="past-form-label"><i class="fas fa-tasks"></i> 作業内容</label>
                    <div class="text-content">${report.work_content || ''}</div>
                </div>

                <!-- 健康状態 -->
                <div class="row mb-3">
                    <div class="col-4">
                        <label class="past-form-label"><i class="fas fa-thermometer-half"></i> 体温</label>
                        <div class="past-form-value">${report.temperature}℃</div>
                    </div>
                    <div class="col-4">
                        <label class="past-form-label"><i class="fas fa-utensils"></i> 食欲</label>
                        <div class="past-form-value">${this.getAppetiteLabel(report.appetite)}</div>
                    </div>
                    <div class="col-4">
                        <label class="past-form-label"><i class="fas fa-pills"></i> 頓服服用</label>
                        <div class="past-form-value">${report.medication_time ? report.medication_time + '時頃' : 'なし'}</div>
                    </div>
                </div>

                <!-- 睡眠情報 -->
                <div class="row mb-3">
                    <div class="col-4">
                        <label class="past-form-label"><i class="fas fa-bed"></i> 就寝時間</label>
                        <div class="past-form-value">${report.bedtime || '-'}</div>
                    </div>
                    <div class="col-4">
                        <label class="past-form-label"><i class="fas fa-sun"></i> 起床時間</label>
                        <div class="past-form-value">${report.wakeup_time || '-'}</div>
                    </div>
                    <div class="col-4">
                        <label class="past-form-label"><i class="fas fa-moon"></i> 睡眠状態</label>
                        <div class="past-form-value">${this.getSleepQualityLabel(report.sleep_quality)}</div>
                    </div>
                </div>

                <!-- 振り返り -->
                <div class="mb-3">
                    <label class="past-form-label"><i class="fas fa-lightbulb"></i> 振り返り・感想</label>
                    <div class="text-content">${report.reflection || ''}</div>
                </div>

                <!-- 面談希望 -->
                ${report.interview_request ? `
                    <div class="mb-3">
                        <label class="past-form-label"><i class="fas fa-comments"></i> 面談希望</label>
                        <div class="past-form-value text-info">${this.getInterviewRequestLabel(report.interview_request)}</div>
                    </div>
                ` : ''}
            </div>

            <!-- スタッフコメント -->
            ${comment && comment.comment ? `
                <hr>
                <div class="staff-comment-display">
                    <h6><i class="fas fa-comment"></i> スタッフコメント</h6>
                    <div class="comment-box bg-light p-3">
                        ${comment.comment}
                    </div>
                    <small class="text-muted">
                        <i class="fas fa-user"></i> 記入者: スタッフ | 
                        <i class="fas fa-clock"></i> 記入日時: ${new Date(comment.created_at).toLocaleString('ja-JP')}
                    </small>
                </div>
            ` : `
                <hr>
                <div class="alert alert-warning">
                    <i class="fas fa-exclamation-triangle"></i> スタッフコメントはまだ記入されていません
                </div>
            `}
        `;
    }

    showReportError(message) {
        const displayContainer = this.container.querySelector('#monthlyReportDisplay');
        displayContainer.innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-triangle"></i> ${message}
            </div>
        `;
    }

    destroy() {
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }
}