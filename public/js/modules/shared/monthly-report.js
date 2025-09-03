// modules/shared/monthly-report.js
// 共通月別出勤簿機能（実働時間計算修正版）

import { API_ENDPOINTS } from '../../constants/api-endpoints.js';
import { modalManager } from './modal-manager.js';
import { formatDate, getDaysInMonth, formatDateTime } from '../../utils/date-time.js';
import { AttendanceTable } from './components/attendance-table.js';
import { ReportDetailModal } from './modals/report-detail-modal.js';
import { PrintManager } from'./managers/print-manager.js';
import { preloadHolidays } from '../../utils/holidays.js';

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
        
        // 新しいコンポーネント
        this.attendanceTable = new AttendanceTable(parentModule);
        this.reportDetailModal = new ReportDetailModal(app, parentModule);
        this.printManager = new PrintManager(app, parentModule);
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
        
        // 日報詳細モーダルを初期化
        this.reportDetailModal.init(containerElement);
        
        // 印刷マネージャーを初期化
        this.printManager.init(this.container);
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
        // 編集モーダル（管理者のみ）
        if (this.canEdit) {
            return `
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
            `;
        }
        
        return '';
    }

    renderEditForm() {
        return `
            <form id="monthlyAttendanceEditForm">
                <input type="hidden" id="monthlyEditRecordId">
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

                <!-- 削除セクション -->
                <div class="border-top pt-3 mt-3" id="monthlyDeleteSection" style="display: none;">
                    <div class="alert alert-danger">
                        <h6 class="alert-heading"><i class="fas fa-exclamation-triangle"></i> 危険な操作</h6>
                        <p class="mb-2">この出勤記録を完全に削除します。この操作は取り消せません。</p>
                        <button type="button" class="btn btn-danger btn-sm" id="monthlyDeleteBtn">
                            <i class="fas fa-trash"></i> この出勤記録を削除する
                        </button>
                    </div>
                </div>
            </form>
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
            printBtn.addEventListener('click', () => this.printManager.printMonthlyReport());
        }
        
        // 管理者用のイベントリスナー
        if (this.canEdit) {
            const exportBtn = this.container.querySelector('#exportExcelBtn');
            const saveAttendanceBtn = this.container.querySelector('#saveMonthlyAttendanceEditBtn');
            const deleteBtn = this.container.querySelector('#monthlyDeleteBtn');
            
            if (exportBtn) {
                exportBtn.addEventListener('click', () => this.exportToExcel());
            }
            
            if (saveAttendanceBtn) {
                saveAttendanceBtn.addEventListener('click', () => this.saveAttendanceEdit());
            }
            
            if (deleteBtn) {
                deleteBtn.addEventListener('click', () => this.deleteAttendance());
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
                this.reportDetailModal.show(userId, userName, date);
            }
            
            // 月別出勤簿の日の列クリック
            if (e.target.closest('.monthly-day-cell')) {
                const cell = e.target.closest('.monthly-day-cell');
                const userId = cell.getAttribute('data-user-id');
                const userName = cell.getAttribute('data-user-name');
                const date = cell.getAttribute('data-date');
                
                if (userId && date) {
                    this.reportDetailModal.show(userId, userName, date);
                }
            }
            
            // 編集ボタン（管理者のみ）
            if (this.canEdit && e.target.closest('.btn-edit-attendance')) {
                const btn = e.target.closest('.btn-edit-attendance');
                this.editAttendance(btn.dataset);
            }
        });
    }

    registerModals() {
        try {
            if (this.canEdit) {
                modalManager.register('monthlyAttendanceEditModal');
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
                const response = await this.app.apiCall(API_ENDPOINTS.STAFF.USERS_LIST);
                users = response.users || [];
            } else if (this.isAdmin) {
                // 管理者は全ユーザー
                const response = await this.app.apiCall(API_ENDPOINTS.ADMIN.USERS);
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
            this.app.showNotification('ユーザー一覧の読み込みに失敗しました', 'danger');
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
            this.app.showNotification('ユーザーを選択してください', 'warning');
            return;
        }
        
        // 選択値を保存
        this.selectedYear = year;
        this.selectedMonth = month;
        this.selectedUserId = userId;
        
        try {
            // 祝日データを事前読み込み
            try {
                await preloadHolidays();
            } catch (error) {
                console.warn('祝日データ取得失敗:', error);
            }

            // APIエンドポイントを権限によって切り替え
            let response;
            const monthPadded = String(month).padStart(2, '0');
            
            if (this.isAdmin) {
                // 管理者APIを使用
                response = await this.app.apiCall(
                    API_ENDPOINTS.ADMIN.ATTENDANCE_MONTHLY(year, monthPadded, userId)
                );
            } else {
                // スタッフAPIを使用
                response = await this.app.apiCall(
                    API_ENDPOINTS.STAFF.MONTHLY_ATTENDANCE(year, monthPadded, userId)
                );
            }
            
            if (!response || !response.user) {
                this.app.showNotification('データが見つかりません', 'danger');
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
            this.app.showNotification('月次出勤記録の取得に失敗しました', 'danger');
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
        
        // 日付ごとの仮想レコードを作成
        const dailyRecords = [];
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month - 1, day);
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const record = recordMap[day];
            
            if (record) {
                // 既存のレコードに日付情報を追加（休憩データも含む）
                const dailyRecord = {
                    ...record,
                    date: dateStr,
                    day: day,
                    dayOfWeek: date.getDay(),
                    dayName: dayNames[date.getDay()],
                    user_id: user.id,
                    user_name: user.name,
                    user_role: user.role,
                    service_no: user.service_no,
                    service_type: user.service_type
                };

                // 利用者の休憩記録を含める（APIから直接取得したデータをマッピング）
                if (user.role === 'user' && user.service_type !== 'home') {
                    // break_recordsテーブルからのデータ（admin/staff APIはbreak_start/break_endとして返す）
                    if (record.break_start || record.break_end) {
                        dailyRecord.breakRecord = {
                            start_time: record.break_start,
                            end_time: record.break_end,
                            duration: record.break_duration || 60
                        };
                        // attendance-table.jsでも使用するために別名でも保持
                        dailyRecord.break_start_time = record.break_start;
                        dailyRecord.break_end_time = record.break_end;
                        dailyRecord.break_duration = record.break_duration;
                    }
                }
                
                dailyRecords.push(dailyRecord);
            } else {
                // 空のレコードを作成
                dailyRecords.push({
                    date: dateStr,
                    day: day,
                    dayOfWeek: date.getDay(),
                    dayName: dayNames[date.getDay()],
                    user_id: user.id,
                    user_name: user.name,
                    user_role: user.role,
                    service_type: user.service_type,
                    service_no:user.service_no,
                    clock_in: null,
                    clock_out: null
                });
            }
        }

        let html = `
            <div class="monthly-attendance-report">
                <h5 class="mb-3">
                    <i class="fas fa-user"></i> ${user.name}さんの${monthName}出勤記録
                    <small class="text-muted ms-2">
                        ${this.parent.getRoleDisplayName(user.role)}
                        ${user.service_type ? ` - ${this.parent.getServiceTypeDisplayName(user.service_type)}` : ''}
                    </small>
                    <span>${user.service_no ? `受給者番号:${user.service_no}` : ''}</span>
                  </h5>
                
                ${this.attendanceTable.generateTable(dailyRecords, {
                    showOnlyWorking: false,  // 月別は全日付表示
                    showDate: true,          // 日付列を表示
                    showOperations: true,
                    context: 'monthly',
                    showFooter: false       // フッターは独自実装
                })}
                
                ${this.generateMonthlyFooter(dailyRecords)}
                ${this.printManager.generatePrintStyles('monthly')}
            </div>
        `;
        
        return html;
    }

    generateMonthlyFooter(records) {
        // 集計
        const workingDays = records.filter(r => r.clock_in).length;
        let totalWorkHours = 0;

        const roundToQuarter = (num) => Math.round(num * 4) / 4;
        
        records.forEach(record => {
            if (record.clock_in && record.clock_out) {
                // AttendanceTableクラスのcalculateWorkDurationDayメソッドを使用
                const hours = this.attendanceTable.calculateWorkDurationDay(record);
                console.log('[DEBUG] calculateWorkDurationDay result:', hours, 'for record:', {
                    user_name: record.user_name,
                    date: record.date,
                    clock_in: record.clock_in,
                    clock_out: record.clock_out,
                    break_start_time: record.break_start_time,
                    break_end_time: record.break_end_time
                });
                if (hours) {
                    const roundedHours = roundToQuarter(parseFloat(hours));
                    totalWorkHours += roundedHours;
                }
            }
        });
        
        return `
            <div class="table-responsive">
                <table class="table">
                    <tfoot class="table-secondary">
                        <tr>
                            <th colspan="2" class="text-center">月間集計</th>
                            <th colspan="2" class="text-center">出勤日数: ${workingDays}日</th>
                            <th colspan="4" class="text-center">総実働: ${totalWorkHours.toFixed(2)}時間</th>
                            <th colspan="1" class="stamp print-only">印</th>
                        </tr>
                    </tfoot>
                </table>
            </div>
        `;
    }


    // 以下、編集関連のメソッド（管理者のみ使用）
    async editAttendance(data) {
        if (!this.canEdit) return;
        
        // フォームに値を設定
        document.getElementById('monthlyEditRecordId').value = data.recordId || '';
        document.getElementById('monthlyEditUserId').value = data.userId;
        document.getElementById('monthlyEditDate').value = data.date;
        
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
        
        // 削除セクションの表示制御
        const deleteSection = document.getElementById('monthlyDeleteSection');
        if (deleteSection) {
            deleteSection.style.display = data.recordId ? 'block' : 'none';
        }
        
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
                this.app.showNotification('変更理由を入力してください', 'warning');
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
            
            await this.app.apiCall(API_ENDPOINTS.ADMIN.ATTENDANCE_CORRECT, {
                method: 'POST',
                body: JSON.stringify(requestData)
            });
            
            this.app.showNotification('出勤記録を更新しました', 'success');
            modalManager.hide('monthlyAttendanceEditModal');
            
            // 再表示
            await this.showMonthlyReport();
            
        } catch (error) {
            console.error('出勤記録更新エラー:', error);
            this.app.showNotification(error.message || '出勤記録の更新に失敗しました', 'danger');
        }
    }

    async deleteAttendance() {
        if (!this.canEdit) return;
        
        try {
            const recordId = document.getElementById('monthlyEditRecordId').value;
            const dateDisplay = document.getElementById('monthlyEditDateDisplay').value;
            
            if (!recordId) {
                this.app.showNotification('削除する記録が選択されていません', 'warning');
                return;
            }
            
            // 確認ダイアログ
            const confirmed = await modalManager.confirm({
                title: '出勤記録の削除確認',
                message: `${dateDisplay}の出勤記録を完全に削除します。\n\nこの操作は取り消せません。本当に削除しますか？`,
                confirmText: '削除する',
                confirmClass: 'btn-danger',
                cancelText: 'キャンセル'
            });
            
            if (!confirmed) return;
            
            // 削除理由の入力
            const reason = prompt('削除理由を入力してください（必須）');
            
            if (!reason || !reason.trim()) {
                this.app.showNotification('削除理由を入力してください', 'warning');
                return;
            }
            
            // 削除API呼び出し
            const response = await this.app.apiCall(
                `/api/admin/attendance/${recordId}`,
                {
                    method: 'DELETE',
                    body: JSON.stringify({ reason: reason.trim() })
                }
            );
            
            // 成功メッセージ
            this.app.showNotification(response.message, 'success');
            
            // 警告がある場合は表示
            if (response.warnings && response.warnings.length > 0) {
                response.warnings.forEach(warning => {
                    this.app.showNotification(warning, 'warning');
                });
            }
            
            // モーダルを閉じる
            modalManager.hide('monthlyAttendanceEditModal');
            
            // リスト更新
            await this.showMonthlyReport();
            
        } catch (error) {
            console.error('出勤記録削除エラー:', error);
            this.app.showNotification(
                error.message || '出勤記録の削除に失敗しました', 
                'danger'
            );
        }
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
        this.app.showNotification('Excel出力機能は準備中です', 'info');
    }

    // コメント保存時のコールバック
    onCommentSaved() {
        // 画面を更新（必要に応じて）
        // 月別出勤簿では特に更新不要
    }

    destroy() {
        // モーダルのクリーンアップ
        if (this.reportDetailModal) {
            this.reportDetailModal.destroy();
        }
        
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }
}