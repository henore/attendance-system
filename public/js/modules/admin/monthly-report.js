// modules/admin/monthly-report.js
// 管理者月別出勤簿機能（完全修正版 - 編集機能付き）

import { API_ENDPOINTS } from '../../constants/api-endpoints.js';
import { modalManager } from '../shared/modal-manager.js';
import { formatDate, getDaysInMonth, calculateWorkHours } from '../../utils/date-time.js';

export default class AdminMonthlyReport {
    constructor(app, parentModule) {
        this.app = app;
        this.parent = parentModule;
        this.container = null;
        this.selectedYear = new Date().getFullYear();
        this.selectedMonth = new Date().getMonth() + 1;
        this.selectedUserId = null;
        this.currentReportData = null;
        this.currentEditData = null;
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

            <!-- 出勤記録編集モーダル -->
            <div class="modal fade" id="monthlyAttendanceEditModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header bg-warning text-dark">
                            <h5 class="modal-title">
                                <i class="fas fa-edit"></i> 出勤記録編集
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <form id="monthlyAttendanceEditForm">
                                <input type="hidden" id="monthlyEditUserId">
                                <input type="hidden" id="monthlyEditDate">
                                
                                <div class="mb-3">
                                    <label class="form-label">対象日</label>
                                    <input type="text" class="form-control" id="monthlyEditDateDisplay" readonly>
                                </div>
                                
                                <div class="row mb-3">
                                    <div class="col-6">
                                        <label for="monthlyEditClockIn" class="form-label">出勤時間</label>
                                        <input type="time" class="form-control" id="monthlyEditClockIn">
                                    </div>
                                    <div class="col-6">
                                        <label for="monthlyEditClockOut" class="form-label">退勤時間</label>
                                        <input type="time" class="form-control" id="monthlyEditClockOut">
                                    </div>
                                </div>

                                <div class="row mb-3">
                                    <div class="col-6">
                                        <label for="monthlyEditBreakStart" class="form-label">休憩開始</label>
                                        <input type="time" class="form-control" id="monthlyEditBreakStart">
                                    </div>
                                    <div class="col-6">
                                        <label for="monthlyEditBreakEnd" class="form-label">休憩終了</label>
                                        <input type="time" class="form-control" id="monthlyEditBreakEnd">
                                    </div>
                                </div>

                                <div class="mb-3">
                                    <label for="monthlyEditReason" class="form-label">変更理由</label>
                                    <textarea class="form-control" id="monthlyEditReason" rows="3" 
                                              placeholder="変更理由を入力してください..." required></textarea>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                                <i class="fas fa-times"></i> キャンセル
                            </button>
                            <button type="button" class="btn btn-warning" id="saveMonthlyAttendanceEditBtn">
                                <i class="fas fa-save"></i> 変更保存
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- コメント編集モーダル -->
            <div class="modal fade" id="monthlyCommentEditModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header bg-info text-white">
                            <h5 class="modal-title">
                                <i class="fas fa-comment-edit"></i> コメント編集
                            </h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <input type="hidden" id="monthlyCommentEditUserId">
                            <input type="hidden" id="monthlyCommentEditDate">
                            
                            <div id="monthlyCommentReportContent">
                                <!-- 日報内容が表示される -->
                            </div>
                            
                            <hr>
                            
                            <div class="mb-3">
                                <label for="monthlyCommentEditText" class="form-label">
                                    <i class="fas fa-comment"></i> スタッフコメント
                                </label>
                                <textarea class="form-control" id="monthlyCommentEditText" rows="4" 
                                          placeholder="コメントを入力してください..." maxlength="500"></textarea>
                                <div class="text-end">
                                    <small class="text-muted">
                                        <span id="monthlyCommentCharCount">0</span>/500文字
                                    </small>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                                <i class="fas fa-times"></i> キャンセル
                            </button>
                            <button type="button" class="btn btn-primary" id="saveMonthlyCommentEditBtn">
                                <i class="fas fa-save"></i> 保存
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
            printBtn.addEventListener('click', () => window.print());
        }
        
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportToExcel());
        }

        // 編集保存ボタン
        const saveAttendanceBtn = this.container.querySelector('#saveMonthlyAttendanceEditBtn');
        const saveCommentBtn = this.container.querySelector('#saveMonthlyCommentEditBtn');
        
        if (saveAttendanceBtn) {
            saveAttendanceBtn.addEventListener('click', () => this.saveAttendanceEdit());
        }
        
        if (saveCommentBtn) {
            saveCommentBtn.addEventListener('click', () => this.saveCommentEdit());
        }

        // コメント文字数カウント
        const commentTextarea = this.container.querySelector('#monthlyCommentEditText');
        const charCount = this.container.querySelector('#monthlyCommentCharCount');
        
        if (commentTextarea && charCount) {
            commentTextarea.addEventListener('input', () => {
                charCount.textContent = commentTextarea.value.length;
            });
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
                this.editAttendance(btn.dataset);
            }
            
            // コメント編集ボタン
            if (e.target.closest('.btn-edit-comment')) {
                const btn = e.target.closest('.btn-edit-comment');
                this.editComment(btn.dataset);
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
            modalManager.register('monthlyAttendanceEditModal');
            modalManager.register('monthlyCommentEditModal');
        } catch (error) {
            console.error('モーダル登録エラー:', error);
        }
    }

    async loadData() {
        this.generateYearOptions();
        this.generateMonthOptions();
        await this.loadUsersForMonthlyReport();
    }

    /**
     * 年の選択肢を生成
     */
    generateYearOptions() {
        const yearSelect = this.container.querySelector('#monthlyYearSelect');
        if (!yearSelect) return;
        
        const currentYear = new Date().getFullYear();
        let html = '';
        
        for (let year = currentYear - 2; year <= currentYear + 1; year++) {
            const selected = year === this.selectedYear ? 'selected' : '';
            html += `<option value="${year}" ${selected}>${year}年</option>`;
        }
        
        yearSelect.innerHTML = html;
    }

    /**
     * 月の選択肢を生成
     */
    generateMonthOptions() {
        const monthSelect = this.container.querySelector('#monthlyMonthSelect');
        if (!monthSelect) return;
        
        let html = '';
        
        for (let month = 1; month <= 12; month++) {
            const selected = month === this.selectedMonth ? 'selected' : '';
            html += `<option value="${month}" ${selected}>${month}月</option>`;
        }
        
        monthSelect.innerHTML = html;
    }

    /**
     * ユーザー一覧を読み込み（修正版）
     */
    async loadUsersForMonthlyReport() {
        try {
            // 管理者用APIで全ユーザーを取得
            const response = await this.parent.callApi(API_ENDPOINTS.ADMIN.USERS);
            const userSelect = this.container.querySelector('#monthlyUserSelect');
            
            if (userSelect && response.users) {
                let html = '<option value="">ユーザーを選択してください</option>';
                
                // 権限別にグループ化
                const usersByRole = {
                    user: [],
                    staff: [],
                    admin: []
                };
                
                response.users.forEach(user => {
                    if (usersByRole[user.role]) {
                        usersByRole[user.role].push(user);
                    }
                });
                
                // 利用者グループ
                if (usersByRole.user.length > 0) {
                    html += '<optgroup label="利用者">';
                    usersByRole.user.forEach(user => {
                        const serviceDisplay = user.service_type ? 
                            ` (${this.parent.getServiceTypeDisplayName(user.service_type)})` : '';
                        html += `<option value="${user.id}">${user.name}${serviceDisplay}</option>`;
                    });
                    html += '</optgroup>';
                }
                
                // スタッフグループ
                if (usersByRole.staff.length > 0) {
                    html += '<optgroup label="スタッフ">';
                    usersByRole.staff.forEach(user => {
                        html += `<option value="${user.id}">${user.name}</option>`;
                    });
                    html += '</optgroup>';
                }
                
                // 管理者グループ
                if (usersByRole.admin.length > 0) {
                    html += '<optgroup label="管理者">';
                    usersByRole.admin.forEach(user => {
                        html += `<option value="${user.id}">${user.name}</option>`;
                    });
                    html += '</optgroup>';
                }
                
                userSelect.innerHTML = html;
                
                if (this.selectedUserId) {
                    userSelect.value = this.selectedUserId;
                }
            }
        } catch (error) {
            console.error('ユーザー読み込みエラー:', error);
            this.parent.showNotification('ユーザー一覧の読み込みに失敗しました', 'danger');
        }
    }

    /**
     * 月別出勤簿を表示
     */
    async showMonthlyReport() {
        const yearSelect = this.container.querySelector('#monthlyYearSelect');
        const monthSelect = this.container.querySelector('#monthlyMonthSelect');
        const userSelect = this.container.querySelector('#monthlyUserSelect');
        const displayContainer = this.container.querySelector('#monthlyReportDisplay');
        
        if (!yearSelect || !monthSelect || !userSelect || !displayContainer) return;
        
        const year = parseInt(yearSelect.value);
        const month = parseInt(monthSelect.value);
        const userId = userSelect.value;
        
        if (!userId) {
            this.parent.showNotification('ユーザーを選択してください', 'warning');
            return;
        }
        
        // 選択値を保存
        this.selectedYear = year;
        this.selectedMonth = month;
        this.selectedUserId = userId;
        
        try {
            // 管理者用APIエンドポイントを使用
            const response = await this.parent.callApi(
                API_ENDPOINTS.ADMIN.ATTENDANCE_MONTHLY(year, String(month).padStart(2, '0'), userId)
            );
            
            if (!response || !response.user) {
                this.parent.showNotification('データが見つかりません', 'danger');
                return;
            }
            
            // 月次出勤記録を生成
            displayContainer.innerHTML = this.generateMonthlyAttendanceReport(
                year, month, response.user, response.records || []
            );
            
            // ボタン表示
            const printBtn = this.container.querySelector('#printMonthlyReportBtn');
            const exportBtn = this.container.querySelector('#exportExcelBtn');
            if (printBtn) printBtn.style.display = 'inline-block';
            if (exportBtn) exportBtn.style.display = 'inline-block';
            
        } catch (error) {
            console.error('[月別出勤簿] エラー:', error);
            this.parent.showNotification('月次出勤記録の取得に失敗しました', 'danger');
        }
    }

    /**
     * 月次出勤記録レポートを生成（編集機能付き）
     */
    generateMonthlyAttendanceReport(year, month, user, records) {
        const monthName = `${year}年${month}月`;
        const daysInMonth = getDaysInMonth(year, month);
        const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
        
        // 記録を日付でインデックス化
        const recordMap = {};
        records.forEach(record => {
            const date = new Date(record.date);
            const day = date.getDate();
            recordMap[day] = record;
        });
        
        let html = `
            <div class="monthly-attendance-report">
                <h5 class="mb-3">
                    <i class="fas fa-user"></i> ${user.name}さんの${monthName}出勤記録
                    <small class="text-muted ms-2">
                        ${this.parent.getRoleDisplayName(user.role)}
                        ${user.service_type ? ` - ${this.parent.getServiceTypeDisplayName(user.service_type)}` : ''}
                    </small>
                </h5>
                <div class="table-responsive">
                    <table class="table table-bordered table-striped">
                        <thead class="table-primary">
                            <tr>
                                <th width="5%">日</th>
                                <th width="5%">曜</th>
                                <th width="10%">出勤</th>
                                <th width="10%">退勤</th>
                                <th width="15%">休憩</th>
                                <th width="8%">実働</th>
                                <th width="8%">状態</th>
                                <th width="15%">日報・コメント</th>
                                <th width="24%">操作</th>
                            </tr>
                        </thead>
                        <tbody>
        `;
        
        let totalWorkDays = 0;
        let totalWorkHours = 0;
        
        // 1日から月末まで表示
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month - 1, day);
            const dayOfWeek = date.getDay();
            const dayName = dayNames[dayOfWeek];
            const record = recordMap[day];
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            
            let rowClass = '';
            if (dayOfWeek === 0) rowClass = 'table-danger'; // 日曜日
            else if (dayOfWeek === 6) rowClass = 'table-info'; // 土曜日
            
            if (record && record.clock_in) {
                totalWorkDays++;
                
                // 休憩時間の表示
                let breakTimeDisplay = '-';
                let breakMinutes = 0;
                
                if (record.break_start) {
                    if (record.break_end) {
                        breakTimeDisplay = `${record.break_start}〜${record.break_end}`;
                        // 休憩時間を計算（簡易的に60分固定）
                        breakMinutes = 60;
                    } else {
                        breakTimeDisplay = `${record.break_start}〜(未終了)`;
                    }
                }
                
                // 実働時間の計算
                const workHours = calculateWorkHours(record.clock_in, record.clock_out, breakMinutes);
                if (workHours > 0) totalWorkHours += workHours;
                
                // ステータス表示
                const statusBadge = this.parent.getStatusBadge(record.status || 'normal');
                
                html += `
                    <tr class="${rowClass}">
                        <td class="text-center">${day}</td>
                        <td class="text-center">${dayName}</td>
                        <td class="text-center">${record.clock_in}</td>
                        <td class="text-center">${record.clock_out || '未退勤'}</td>
                        <td class="text-center small">${breakTimeDisplay}</td>
                        <td class="text-center">${workHours ? workHours.toFixed(1) + 'h' : '-'}</td>
                        <td class="text-center">${statusBadge}</td>
                        <td class="text-center">
                            ${record.report_id ? '<span class="badge bg-success me-1">日報</span>' : ''}
                            ${record.comment_id ? '<span class="badge bg-info">コメント</span>' : ''}
                        </td>
                        <td class="text-center">
                            <div class="btn-group btn-group-sm" role="group">
                                <button class="btn btn-outline-warning btn-edit-attendance" 
                                        data-user-id="${user.id}"
                                        data-user-name="${user.name}"
                                        data-date="${dateStr}"
                                        data-clock-in="${record.clock_in}"
                                        data-clock-out="${record.clock_out || ''}"
                                        data-break-start="${record.break_start || ''}"
                                        data-break-end="${record.break_end || ''}"
                                        title="出勤記録編集">
                                    <i class="fas fa-edit"></i>
                                </button>
                                ${user.role === 'user' && record.report_id ? `
                                    <button class="btn btn-outline-primary btn-show-report" 
                                            data-user-id="${user.id}"
                                            data-user-name="${user.name}"
                                            data-date="${dateStr}"
                                            title="日報詳細">
                                        <i class="fas fa-file-alt"></i>
                                    </button>
                                    <button class="btn btn-outline-info btn-edit-comment" 
                                            data-user-id="${user.id}"
                                            data-user-name="${user.name}"
                                            data-date="${dateStr}"
                                            title="コメント編集">
                                        <i class="fas fa-comment"></i>
                                    </button>
                                ` : ''}
                            </div>
                        </td>
                    </tr>
                `;
            } else {
                html += `
                    <tr class="${rowClass}">
                        <td class="text-center">${day}</td>
                        <td class="text-center">${dayName}</td>
                        <td class="text-center">-</td>
                        <td class="text-center">-</td>
                        <td class="text-center">-</td>
                        <td class="text-center">-</td>
                        <td class="text-center">-</td>
                        <td class="text-center">-</td>
                        <td class="text-center">
                            <button class="btn btn-sm btn-outline-secondary btn-edit-attendance" 
                                    data-user-id="${user.id}"
                                    data-user-name="${user.name}"
                                    data-date="${dateStr}"
                                    data-clock-in=""
                                    data-clock-out=""
                                    data-break-start=""
                                    data-break-end=""
                                    title="新規登録">
                                <i class="fas fa-plus"></i>
                            </button>
                        </td>
                    </tr>
                `;
            }
        }
        
        html += `
                        </tbody>
                        <tfoot class="table-secondary">
                            <tr>
                                <th colspan="5" class="text-end">月間集計</th>
                                <th class="text-center">${totalWorkHours.toFixed(1)}h</th>
                                <th colspan="3">出勤日数: ${totalWorkDays}日</th>
                            </tr>
                        </tfoot>
                    </table>
                </div>
                
                <!-- 印刷用スタイル -->
                <style>
                    @media print {
                        .admin-menu, .custom-card-header, .row.mb-4 { display: none !important; }
                        .monthly-attendance-report table { font-size: 10px; }
                        .btn { display: none !important; }
                    }
                </style>
            </div>
        `;
        
        return html;
    }

    /**
     * 出勤記録編集
     */
    async editAttendance(data) {
        this.currentEditData = data;
        
        // フォームに値を設定
        const dateDisplay = this.container.querySelector('#monthlyEditDateDisplay');
        const clockIn = this.container.querySelector('#monthlyEditClockIn');
        const clockOut = this.container.querySelector('#monthlyEditClockOut');
        const breakStart = this.container.querySelector('#monthlyEditBreakStart');
        const breakEnd = this.container.querySelector('#monthlyEditBreakEnd');
        const reason = this.container.querySelector('#monthlyEditReason');
        
        if (dateDisplay) {
            dateDisplay.value = formatDate(data.date, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                weekday: 'long'
            });
        }
        
        document.getElementById('monthlyEditUserId').value = data.userId;
        document.getElementById('monthlyEditDate').value = data.date;
        
        if (clockIn) clockIn.value = data.clockIn || '';
        if (clockOut) clockOut.value = data.clockOut || '';
        if (breakStart) breakStart.value = data.breakStart || '';
        if (breakEnd) breakEnd.value = data.breakEnd || '';
        if (reason) reason.value = '';
        
        // モーダル表示
        modalManager.show('monthlyAttendanceEditModal');
    }

    /**
     * 出勤記録編集を保存
     */
    async saveAttendanceEdit() {
        try {
            const userId = document.getElementById('monthlyEditUserId').value;
            const date = document.getElementById('monthlyEditDate').value;
            const clockIn = document.getElementById('monthlyEditClockIn').value;
            const clockOut = document.getElementById('monthlyEditClockOut').value;
            const breakStart = document.getElementById('monthlyEditBreakStart').value;
            const breakEnd = document.getElementById('monthlyEditBreakEnd').value;
            const reason = document.getElementById('monthlyEditReason').value;
            
            if (!reason.trim()) {
                this.parent.showNotification('変更理由を入力してください', 'warning');
                return;
            }
            
            // 既存記録の検索
            const searchParams = new URLSearchParams({ date: date, userId: userId });
            const searchResponse = await this.parent.callApi(
                `${API_ENDPOINTS.ADMIN.ATTENDANCE_SEARCH}?${searchParams}`
            );
            
            const existingRecord = searchResponse.records && searchResponse.records.length > 0 ? 
                searchResponse.records[0] : null;
            
            const requestData = {
                recordId: existingRecord ? existingRecord.id : null,
                userId: userId,
                date: date,
                newClockIn: clockIn,
                newClockOut: clockOut,
                breakStart: breakStart,
                breakEnd: breakEnd,
                reason: reason
            };
            
            await this.parent.callApi(API_ENDPOINTS.ADMIN.ATTENDANCE_CORRECT, {
                method: 'POST',
                body: JSON.stringify(requestData)
            });
            
            this.parent.showNotification('出勤記録を更新しました', 'success');
            
            // モーダルを閉じる
            modalManager.hide('monthlyAttendanceEditModal');
            
            // 月別出勤簿を再表示
            await this.showMonthlyReport();
            
        } catch (error) {
            console.error('出勤記録更新エラー:', error);
            this.parent.showNotification(error.message || '出勤記録の更新に失敗しました', 'danger');
        }
    }

    /**
     * コメント編集
     */
    async editComment(data) {
        try {
            // 日報データを取得
            const response = await this.parent.callApi(
                API_ENDPOINTS.STAFF.REPORT(data.userId, data.date)
            );
            
            if (!response.report) {
                this.parent.showNotification('日報が見つかりません', 'warning');
                return;
            }
            
            // フォームに値を設定
            document.getElementById('monthlyCommentEditUserId').value = data.userId;
            document.getElementById('monthlyCommentEditDate').value = data.date;
            
            // 日報内容を表示
            const reportContent = document.getElementById('monthlyCommentReportContent');
            if (reportContent) {
                reportContent.innerHTML = this.generateReportSummary(response);
            }
            
            // 既存コメントを設定
            const commentTextarea = document.getElementById('monthlyCommentEditText');
            const charCount = document.getElementById('monthlyCommentCharCount');
            
            if (commentTextarea && response.comment) {
                commentTextarea.value = response.comment.comment || '';
                if (charCount) {
                    charCount.textContent = commentTextarea.value.length;
                }
            }
            
            // モーダル表示
            modalManager.show('monthlyCommentEditModal');
            
        } catch (error) {
            console.error('コメント編集エラー:', error);
            this.parent.showNotification('コメント情報の取得に失敗しました', 'danger');
        }
    }

    /**
     * コメント編集を保存
     */
    async saveCommentEdit() {
        try {
            const userId = document.getElementById('monthlyCommentEditUserId').value;
            const date = document.getElementById('monthlyCommentEditDate').value;
            const comment = document.getElementById('monthlyCommentEditText').value.trim();
            
            if (!comment) {
                this.parent.showNotification('コメントを入力してください', 'warning');
                return;
            }
            
            await this.parent.callApi(API_ENDPOINTS.STAFF.COMMENT, {
                method: 'POST',
                body: JSON.stringify({
                    userId: userId,
                    date: date,
                    comment: comment
                })
            });
            
            this.parent.showNotification('コメントを更新しました', 'success');
            
            // モーダルを閉じる
            modalManager.hide('monthlyCommentEditModal');
            
            // 月別出勤簿を再表示
            await this.showMonthlyReport();
            
        } catch (error) {
            console.error('コメント保存エラー:', error);
            this.parent.showNotification(error.message || 'コメントの保存に失敗しました', 'danger');
        }
    }

    /**
     * 日報サマリーを生成
     */
    generateReportSummary(data) {
        const { user, attendance, report } = data;
        
        return `
            <h6 class="mb-3"><i class="fas fa-file-alt"></i> ${user.name}さんの日報内容</h6>
            
            <div class="row mb-3">
                <div class="col-6">
                    <label class="text-muted small">出勤時間</label>
                    <div class="fw-bold">${attendance ? attendance.clock_in : '-'}</div>
                </div>
                <div class="col-6">
                    <label class="text-muted small">退勤時間</label>
                    <div class="fw-bold">${attendance ? attendance.clock_out : '-'}</div>
                </div>
            </div>
            
            <div class="mb-3">
                <label class="text-muted small">作業内容</label>
                <div class="bg-light p-2 rounded">${report.work_content || ''}</div>
            </div>
            
            <div class="mb-3">
                <label class="text-muted small">振り返り・感想</label>
                <div class="bg-light p-2 rounded">${report.reflection || ''}</div>
            </div>
        `;
    }

    /**
     * レポートをクリア
     */
    clearReport() {
        const displayContainer = this.container.querySelector('#monthlyReportDisplay');
        if (displayContainer) {
            displayContainer.innerHTML = `
                <div class="text-center p-5">
                    <i class="fas fa-calendar-alt fa-3x text-muted mb-3"></i>
                    <h5 class="text-muted">月別出勤簿</h5>
                    <p class="text-muted">年・月・ユーザーを選択して「表示」ボタンを押してください</p>
                </div>
            `;
        }
        
        // ボタン非表示
        const printBtn = this.container.querySelector('#printMonthlyReportBtn');
        const exportBtn = this.container.querySelector('#exportExcelBtn');
        if (printBtn) printBtn.style.display = 'none';
        if (exportBtn) exportBtn.style.display = 'none';
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