// modules/shared/monthly-report.js
// 共通月別出勤簿機能（管理者・スタッフ共用）

import { API_ENDPOINTS } from '../../constants/api-endpoints.js';
import { modalManager } from './modal-manager.js';
import { formatDate, getDaysInMonth, calculateWorkHours } from '../../utils/date-time.js';
import { formatServiceType, formatWorkHours as formatWorkHoursDisplay } from '../../utils/formatter.js';

export default class SharedMonthlyReport {
    constructor(app, parentModule) {
        this.app = app;
        this.parent = parentModule;
        this.container = null;
        
        // 現在の選択状態
        this.selectedYear = new Date().getFullYear();
        this.selectedMonth = new Date().getMonth() + 1;
        this.selectedUserId = null;
        
        // 権限情報
        this.userRole = app.currentUser.role;
        this.isAdmin = this.userRole === 'admin';
        this.isStaff = this.userRole === 'staff';
        
        // 表示モード
        this.canEdit = this.isAdmin; // 管理者のみ編集可能
        this.canViewAllUsers = this.isAdmin; // 管理者は全ユーザー表示
        this.canPrint = true; // 全権限で印刷可能
    }

    async init(containerElement) {
        this.container = document.createElement('div');
        this.container.id = 'monthlyReportSection';
        this.container.className = 'shared-section';
        this.container.style.display = 'none';
        
        containerElement.appendChild(this.container);
        this.render();
        this.setupEventListeners();
        this.registerModals();
    }

    render() {
        const headerButtons = this.getHeaderButtons();
        
        this.container.innerHTML = `
            <div class="custom-card">
                <div class="custom-card-header">
                    <h5><i class="fas fa-calendar-alt"></i> 月別出勤簿</h5>
                    <div class="btn-group">
                        ${headerButtons}
                    </div>
                </div>
                <div class="card-body">
                    ${this.renderFilters()}
                    
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

            ${this.renderModals()}
        `;
    }

    getHeaderButtons() {
        let buttons = '';
        
        if (this.canPrint) {
            buttons += `
                <button class="btn btn-outline-light btn-sm" id="printMonthlyReportBtn" style="display: none;">
                    <i class="fas fa-print"></i> 印刷
                </button>
            `;
        }
        
        if (this.isAdmin) {
            buttons += `
                <button class="btn btn-outline-light btn-sm" id="exportExcelBtn" style="display: none;">
                    <i class="fas fa-file-excel"></i> Excel出力
                </button>
            `;
        }
        
        return buttons;
    }

    renderFilters() {
        return `
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
                    <label for="monthlyUserSelect" class="form-label">
                        ${this.isStaff ? '利用者' : 'ユーザー'}
                    </label>
                    <select class="form-control" id="monthlyUserSelect">
                        <option value="">選択してください</option>
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
        `;
    }

    renderModals() {
        let modals = '';
        
        // 日報詳細モーダル（共通）
        modals += `
            <div class="modal fade" id="monthlyReportDetailModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header bg-primary text-white">
                            <h5 class="modal-title" id="monthlyReportDetailTitle">
                                <i class="fas fa-file-alt"></i> 日報詳細
                            </h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body" id="monthlyReportDetailContent">
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
        
        // 編集モーダル（管理者のみ）
        if (this.canEdit) {
            modals += `
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
                                ${this.renderEditForm()}
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
                                ${this.renderCommentEditForm()}
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
        
        return modals;
    }

    renderEditForm() {
        return `
            <form id="monthlyAttendanceEditForm">
                <input type="hidden" id="monthlyEditUserId">
                <input type="hidden" id="monthlyEditDate">
                <input type="hidden" id="monthlyEditRecordId">
                
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
                    <label for="monthlyEditStatus" class="form-label">状態</label>
                    <select class="form-control" id="monthlyEditStatus">
                        <option value="normal">正常</option>
                        <option value="late">遅刻</option>
                        <option value="early">早退</option>
                        <option value="absence">欠勤</option>
                        <option value="paid_leave">有給</option>
                    </select>
                </div>

                <div class="mb-3">
                    <label for="monthlyEditReason" class="form-label">変更理由 <span class="text-danger">*</span></label>
                    <textarea class="form-control" id="monthlyEditReason" rows="3" 
                              placeholder="変更理由を入力してください..." required></textarea>
                </div>
            </form>
        `;
    }

    renderCommentEditForm() {
        return `
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
        `;
    }

    setupEventListeners() {
        // 基本的なイベントリスナー
        const showBtn = this.container.querySelector('#showMonthlyReportBtn');
        const clearBtn = this.container.querySelector('#clearMonthlyReportBtn');
        const printBtn = this.container.querySelector('#printMonthlyReportBtn');
        
        if (showBtn) {
            showBtn.addEventListener('click', () => this.showMonthlyReport());
        }
        
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearReport());
        }
        
        if (printBtn) {
            printBtn.addEventListener('click', () => window.print());
        }
        
        // 管理者用のイベントリスナー
        if (this.canEdit) {
            const exportBtn = this.container.querySelector('#exportExcelBtn');
            const saveAttendanceBtn = this.container.querySelector('#saveMonthlyAttendanceEditBtn');
            const saveCommentBtn = this.container.querySelector('#saveMonthlyCommentEditBtn');
            
            if (exportBtn) {
                exportBtn.addEventListener('click', () => this.exportToExcel());
            }
            
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
            
            // 編集ボタン（管理者のみ）
            if (this.canEdit) {
                if (e.target.closest('.btn-edit-attendance')) {
                    const btn = e.target.closest('.btn-edit-attendance');
                    this.editAttendance(btn.dataset);
                }
                
                if (e.target.closest('.btn-edit-comment')) {
                    const btn = e.target.closest('.btn-edit-comment');
                    this.editComment(btn.dataset);
                }
            }
        });
    }

    registerModals() {
        try {
            modalManager.register('monthlyReportDetailModal');
            
            if (this.canEdit) {
                modalManager.register('monthlyAttendanceEditModal');
                modalManager.register('monthlyCommentEditModal');
            }
        } catch (error) {
            console.error('モーダル登録エラー:', error);
        }
    }

    async show() {
        this.container.style.display = 'block';
        await this.loadData();
    }

    hide() {
        this.container.style.display = 'none';
    }

    async loadData() {
        this.generateYearOptions();
        this.generateMonthOptions();
        await this.loadUsersForMonthlyReport();
    }

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

    async loadUsersForMonthlyReport() {
        try {
            const userSelect = this.container.querySelector('#monthlyUserSelect');
            if (!userSelect) return;
            
            let users = [];
            
            if (this.isStaff) {
                // スタッフは利用者のみ
                const response = await this.parent.callApi(API_ENDPOINTS.STAFF.USERS_LIST);
                users = response.users || [];
            } else if (this.isAdmin) {
                // 管理者は全ユーザー
                const response = await this.parent.callApi(API_ENDPOINTS.ADMIN.USERS);
                users = response.users || [];
            }
            
            let html = '<option value="">選択してください</option>';
            
            if (this.isStaff) {
                // スタッフ：利用者のみ（シンプル表示）
                users.forEach(user => {
                    const serviceDisplay = user.service_type ? 
                        ` (${this.parent.getServiceTypeDisplayName(user.service_type)})` : '';
                    html += `<option value="${user.id}">${user.name}${serviceDisplay}</option>`;
                });
            } else {
                // 管理者：権限別にグループ化
                const usersByRole = {
                    user: [],
                    staff: [],
                    admin: []
                };
                
                users.forEach(user => {
                    if (usersByRole[user.role]) {
                        usersByRole[user.role].push(user);
                    }
                });
                
                // 各グループを追加
                ['user', 'staff', 'admin'].forEach(role => {
                    if (usersByRole[role].length > 0) {
                        const groupLabel = this.parent.getRoleDisplayName(role);
                        html += `<optgroup label="${groupLabel}">`;
                        
                        usersByRole[role].forEach(user => {
                            const serviceDisplay = user.service_type && role === 'user' ? 
                                ` (${this.parent.getServiceTypeDisplayName(user.service_type)})` : '';
                            html += `<option value="${user.id}">${user.name}${serviceDisplay}</option>`;
                        });
                        
                        html += '</optgroup>';
                    }
                });
            }
            
            userSelect.innerHTML = html;
            
            if (this.selectedUserId) {
                userSelect.value = this.selectedUserId;
            }
            
        } catch (error) {
            console.error('ユーザー読み込みエラー:', error);
            this.parent.showNotification('ユーザー一覧の読み込みに失敗しました', 'danger');
        }
    }

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
            // APIエンドポイントを権限によって切り替え
            let response;
            const monthPadded = String(month).padStart(2, '0');
            
            if (this.isAdmin) {
                // 管理者APIを使用
                response = await this.parent.callApi(
                    API_ENDPOINTS.ADMIN.ATTENDANCE_MONTHLY(year, monthPadded, userId)
                );
            } else {
                // スタッフAPIを使用
                response = await this.parent.callApi(
                    API_ENDPOINTS.STAFF.MONTHLY_ATTENDANCE(year, monthPadded, userId)
                );
            }
            
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
        
        // 各日付のレコードを生成
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month - 1, day);
            const dayOfWeek = date.getDay();
            const dayName = dayNames[dayOfWeek];
            const record = recordMap[day];
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            
            let rowClass = '';
            if (dayOfWeek === 0) rowClass = 'table-danger'; // 日曜日
            else if (dayOfWeek === 6) rowClass = 'table-info'; // 土曜日
            
            html += this.generateDayRow(
                day, dayName, dateStr, record, user, rowClass, 
                { totalWorkDays, totalWorkHours }
            );
            
            // 集計更新
            if (record && record.clock_in) {
                totalWorkDays++;
                const workHours = this.parent.calculateWorkDuration(record);
                if (workHours) {
                    totalWorkHours += parseFloat(workHours);
                }
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
                ${this.getPrintStyles()}
            </div>
        `;
        
        return html;
    }

    generateDayRow(day, dayName, dateStr, record, user, rowClass, totals) {
        if (record && record.clock_in) {
            // 休憩時間の表示
            let breakTimeDisplay = '-';
            if (record.break_start) {
                breakTimeDisplay = record.break_end ? 
                    `${record.break_start}〜${record.break_end}` : 
                    `${record.break_start}〜(未終了)`;
            }
            
            // 実働時間
            const workHours = this.parent.calculateWorkDuration(record);
            
            // ステータス表示
            const statusBadge = this.parent.getStatusBadge(record.status || 'normal');
            
            // 操作ボタン
            const operationButtons = this.generateOperationButtons(user, record, dateStr);
            
            return `
                <tr class="${rowClass}">
                    <td class="text-center">${day}</td>
                    <td class="text-center">${dayName}</td>
                    <td class="text-center">${record.clock_in}</td>
                    <td class="text-center">${record.clock_out || '未退勤'}</td>
                    <td class="text-center small">${breakTimeDisplay}</td>
                    <td class="text-center">${workHours ? workHours + 'h' : '-'}</td>
                    <td class="text-center">${statusBadge}</td>
                    <td class="text-center">
                        ${record.report_id ? '<span class="badge bg-success me-1">日報</span>' : ''}
                        ${record.comment_id || record.comment ? '<span class="badge bg-info">コメント</span>' : ''}
                    </td>
                    <td class="text-center">${operationButtons}</td>
                </tr>
            `;
        } else {
            // 未出勤の日
            const operationButtons = this.canEdit ? `
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
            ` : '-';
            
            return `
                <tr class="${rowClass}">
                    <td class="text-center">${day}</td>
                    <td class="text-center">${dayName}</td>
                    <td class="text-center">-</td>
                    <td class="text-center">-</td>
                    <td class="text-center">-</td>
                    <td class="text-center">-</td>
                    <td class="text-center">-</td>
                    <td class="text-center">-</td>
                    <td class="text-center">${operationButtons}</td>
                </tr>
            `;
        }
    }

    generateOperationButtons(user, record, dateStr) {
        let buttons = '<div class="btn-group btn-group-sm" role="group">';
        
        // 編集ボタン（管理者のみ）
        if (this.canEdit && record) {
            buttons += `
                <button class="btn btn-outline-warning btn-edit-attendance" 
                        data-record-id="${record.id || ''}"
                        data-user-id="${user.id}"
                        data-user-name="${user.name}"
                        data-date="${dateStr}"
                        data-clock-in="${record.clock_in || ''}"
                        data-clock-out="${record.clock_out || ''}"
                        data-break-start="${record.break_start || ''}"
                        data-break-end="${record.break_end || ''}"
                        data-status="${record.status || 'normal'}"
                        title="出勤記録編集">
                    <i class="fas fa-edit"></i>
                </button>
            `;
        }
        
        // 日報詳細ボタン（利用者の日報がある場合）
        if (user.role === 'user' && record && record.report_id) {
            buttons += `
                <button class="btn btn-outline-primary btn-show-report" 
                        data-user-id="${user.id}"
                        data-user-name="${user.name}"
                        data-date="${dateStr}"
                        title="日報詳細">
                    <i class="fas fa-file-alt"></i>
                </button>
            `;
            
            // コメント編集ボタン（管理者のみ）
            if (this.canEdit) {
                buttons += `
                    <button class="btn btn-outline-info btn-edit-comment" 
                            data-user-id="${user.id}"
                            data-user-name="${user.name}"
                            data-date="${dateStr}"
                            title="コメント編集">
                        <i class="fas fa-comment"></i>
                    </button>
                `;
            }
        }
        
        buttons += '</div>';
        
        return buttons === '<div class="btn-group btn-group-sm" role="group"></div>' ? '-' : buttons;
    }

    getPrintStyles() {
        return `
            <style>
                @media print {
                    .shared-section .custom-card-header,
                    .shared-section .row.mb-4,
                    .btn { 
                        display: none !important; 
                    }
                    .monthly-attendance-report table { 
                        font-size: 10px; 
                    }
                }
            </style>
        `;
    }

    // 以下、編集関連のメソッド（管理者のみ使用）
    async editAttendance(data) {
        if (!this.canEdit) return;
        
        // フォームに値を設定
        document.getElementById('monthlyEditUserId').value = data.userId;
        document.getElementById('monthlyEditDate').value = data.date;
        document.getElementById('monthlyEditRecordId').value = data.recordId || '';
        
        const dateDisplay = document.getElementById('monthlyEditDateDisplay');
        if (dateDisplay) {
            dateDisplay.value = formatDate(data.date, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                weekday: 'long'
            });
        }
        
        document.getElementById('monthlyEditClockIn').value = data.clockIn || '';
        document.getElementById('monthlyEditClockOut').value = data.clockOut || '';
        document.getElementById('monthlyEditBreakStart').value = data.breakStart || '';
        document.getElementById('monthlyEditBreakEnd').value = data.breakEnd || '';
        document.getElementById('monthlyEditStatus').value = data.status || 'normal';
        document.getElementById('monthlyEditReason').value = '';
        
        // モーダル表示
        modalManager.show('monthlyAttendanceEditModal');
    }

    async saveAttendanceEdit() {
        if (!this.canEdit) return;
        
        try {
            const recordId = document.getElementById('monthlyEditRecordId').value;
            const userId = document.getElementById('monthlyEditUserId').value;
            const date = document.getElementById('monthlyEditDate').value;
            const clockIn = document.getElementById('monthlyEditClockIn').value;
            const clockOut = document.getElementById('monthlyEditClockOut').value;
            const breakStart = document.getElementById('monthlyEditBreakStart').value;
            const breakEnd = document.getElementById('monthlyEditBreakEnd').value;
            const status = document.getElementById('monthlyEditStatus').value;
            const reason = document.getElementById('monthlyEditReason').value;
            
            if (!reason.trim()) {
                this.parent.showNotification('変更理由を入力してください', 'warning');
                return;
            }
            
            const requestData = {
                recordId: recordId || null,
                userId: userId,
                date: date,
                newClockIn: clockIn,
                newClockOut: clockOut,
                newBreakStart: breakStart,
                newBreakEnd: breakEnd,
                status: status,
                reason: reason
            };
            
            await this.parent.callApi(API_ENDPOINTS.ADMIN.ATTENDANCE_CORRECT, {
                method: 'POST',
                body: JSON.stringify(requestData)
            });
            
            this.parent.showNotification('出勤記録を更新しました', 'success');
            modalManager.hide('monthlyAttendanceEditModal');
            
            // 再表示
            await this.showMonthlyReport();
            
        } catch (error) {
            console.error('出勤記録更新エラー:', error);
            this.parent.showNotification(error.message || '出勤記録の更新に失敗しました', 'danger');
        }
    }

    async editComment(data) {
        if (!this.canEdit) return;
        
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

    async saveCommentEdit() {
        if (!this.canEdit) return;
        
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
            modalManager.hide('monthlyCommentEditModal');
            
            // 再表示
            await this.showMonthlyReport();
            
        } catch (error) {
            console.error('コメント保存エラー:', error);
            this.parent.showNotification(error.message || 'コメントの保存に失敗しました', 'danger');
        }
    }

    // 日報詳細表示（共通）
    async showReportDetail(userId, userName, date) {
        try {
            const response = await this.parent.callApi(API_ENDPOINTS.STAFF.REPORT(userId, date));
            
            if (!response.report) {
                this.parent.showNotification('この日の日報はありません', 'info');
                return;
            }

            const formattedDate = formatDate(date, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                weekday: 'long'
            });
            
            const title = this.container.querySelector('#monthlyReportDetailTitle');
            const content = this.container.querySelector('#monthlyReportDetailContent');
            
            if (title) {
                title.innerHTML = `<i class="fas fa-file-alt"></i> ${userName}さんの日報詳細 - ${formattedDate}`;
            }
            
            if (content) {
                content.innerHTML = this.generateReportDetailContent(response);
            }

            // モーダル表示
            const modal = new bootstrap.Modal(this.container.querySelector('#monthlyReportDetailModal'));
            modal.show();

        } catch (error) {
            console.error('日報詳細取得エラー:', error);
            this.parent.showNotification('日報の取得に失敗しました', 'danger');
        }
    }

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
                    <div class="fw-bold">${attendance ? (attendance.clock_out || '未退勤') : '-'}</div>
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

    generateReportDetailContent(data) {
        const { user, attendance, report, comment } = data;
        
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
                            ${this.getBreakTimeDisplay(data)}
                        </div>
                    </div>
                </div>
                <div class="col-4">
                    <div class="detail-section">
                        <h6><i class="fas fa-clock text-info"></i> 退勤時間</h6>
                        <div class="detail-value h4 ${attendance && attendance.clock_out ? 'text-info' : 'text-muted'}">
                            ${attendance ? (attendance.clock_out || '未退勤') : '-'}
                        </div>
                    </div>
                </div>
            </div>

            <hr>

            <!-- 日報内容 -->
            <div class="report-summary">
                <h6><i class="fas fa-file-alt"></i> 日報内容</h6>
                
                ${this.generateReportFields(report)}
            </div>

            <!-- スタッフコメント -->
            ${this.generateCommentSection(comment)}
        `;
    }

    getBreakTimeDisplay(data) {
        const { attendance, breakRecord } = data;
        
        if (breakRecord && breakRecord.start_time) {
            return `${breakRecord.start_time}〜${breakRecord.end_time || ''}`;
        } else if (attendance && attendance.break_start) {
            return `${attendance.break_start}〜${attendance.break_end || ''}`;
        }
        
        return '-';
    }

    generateReportFields(report) {
        return `
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
        `;
    }

    generateCommentSection(comment) {
        if (comment && comment.comment) {
            return `
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
            `;
        } else {
            return `
                <hr>
                <div class="alert alert-warning">
                    <i class="fas fa-exclamation-triangle"></i> スタッフコメントはまだ記入されていません
                </div>
            `;
        }
    }

    // ヘルパーメソッド
    getAppetiteLabel(value) {
        const labels = {
            'good': '良好',
            'normal': '普通',
            'poor': '不振'
        };
        return labels[value] || value;
    }

    getSleepQualityLabel(value) {
        const labels = {
            'good': '良好',
            'normal': '普通',
            'poor': '不良'
        };
        return labels[value] || value;
    }

    getInterviewRequestLabel(value) {
        const labels = {
            'required': '必要',
            'not_required': '不要'
        };
        return labels[value] || value;
    }

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

    async exportToExcel() {
        if (!this.canEdit) return;
        
        // Excel出力機能は別途実装が必要
        this.parent.showNotification('Excel出力機能は準備中です', 'info');
    }

    destroy() {
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }
}