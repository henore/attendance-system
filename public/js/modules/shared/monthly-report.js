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
        this.canEdit = this.isAdmin || this.isStaff; // 管理者・スタッフ編集可能
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
                                    ${this.isStaff ? '<small class="ms-2">（承認後に反映）</small>' : ''}
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

                <div class="row mb-3" id="monthlyEditNakanukeGroup" style="display: none;">
                    <div class="col-6">
                        <label for="monthlyEditNakanukeMinutes" class="form-label">中抜け経過分数</label>
                        <input type="number" class="form-control" id="monthlyEditNakanukeMinutes" min="0" placeholder="0">
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
                    <label for="monthlyEditReason" class="form-label">変更理由${this.isStaff ? ' <span class="text-danger">*</span>' : '（任意）'}</label>
                    <textarea class="form-control" id="monthlyEditReason" rows="3"
                              placeholder="変更理由を入力してください..."${this.isStaff ? ' required' : ''}></textarea>
                </div>

                <!-- 削除セクション（管理者のみ） -->
                ${this.isAdmin ? `
                <div class="border-top pt-3 mt-3" id="monthlyDeleteSection" style="display: none;">
                    <div class="alert alert-danger">
                        <h6 class="alert-heading"><i class="fas fa-exclamation-triangle"></i> 危険な操作</h6>
                        <p class="mb-2">この出勤記録を完全に削除します。この操作は取り消せません。</p>
                        <button type="button" class="btn btn-danger btn-sm" id="monthlyDeleteBtn">
                            <i class="fas fa-trash"></i> この出勤記録を削除する
                        </button>
                    </div>
                </div>
                ` : ''}

                <!-- 削除要望セクション（スタッフのみ） -->
                ${this.isStaff ? `
                <div class="border-top pt-3 mt-3" id="monthlyDeleteRequestSection" style="display: none;">
                    <div class="alert alert-warning">
                        <h6 class="alert-heading"><i class="fas fa-trash-alt"></i> 記録削除要望</h6>
                        <p class="mb-2">この出勤記録の削除を管理者に要望します。承認後に削除されます。</p>
                        <div class="mb-2">
                            <textarea class="form-control" id="monthlyDeleteRequestReason" rows="2"
                                      placeholder="削除理由を入力してください..." required></textarea>
                        </div>
                        <button type="button" class="btn btn-danger btn-sm" id="monthlyDeleteRequestBtn">
                            <i class="fas fa-paper-plane"></i> 削除要望を送信
                        </button>
                    </div>
                </div>
                ` : ''}
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
        
        // 編集可能ユーザーのイベントリスナー
        if (this.canEdit) {
            const exportBtn = this.container.querySelector('#exportExcelBtn');
            const saveAttendanceBtn = this.container.querySelector('#saveMonthlyAttendanceEditBtn');

            if (exportBtn) {
                exportBtn.addEventListener('click', () => this.exportToExcel());
            }

            if (saveAttendanceBtn) {
                saveAttendanceBtn.addEventListener('click', () => this.saveAttendanceEdit());
            }

            // 削除は管理者のみ
            if (this.isAdmin) {
                const deleteBtn = this.container.querySelector('#monthlyDeleteBtn');
                if (deleteBtn) {
                    deleteBtn.addEventListener('click', () => this.deleteAttendance());
                }
            }

            // 削除要望はスタッフのみ
            if (this.isStaff) {
                const deleteRequestBtn = this.container.querySelector('#monthlyDeleteRequestBtn');
                if (deleteRequestBtn) {
                    deleteRequestBtn.addEventListener('click', () => this.requestDeleteAttendance());
                }
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

            // 月別出勤簿：利用者の日付クリックで編集モーダルを開く
            if (this.canEdit && e.target.closest('.monthly-user-day-edit')) {
                const cell = e.target.closest('.monthly-user-day-edit');
                this.editAttendance(cell.dataset);
                return;
            }

            // 月別出勤簿：スタッフの日付クリックで日報表示
            if (e.target.closest('.monthly-day-cell')) {
                const cell = e.target.closest('.monthly-day-cell');
                const userId = cell.getAttribute('data-user-id');
                const userName = cell.getAttribute('data-user-name');
                const date = cell.getAttribute('data-date');

                if (userId && date) {
                    this.reportDetailModal.show(userId, userName, date);
                }
            }

            // 編集ボタン（管理者・スタッフ）
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
                
                // 各グループを追加（管理者は除外）
                ['user', 'staff'].forEach(role => {
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
                    service_type: record.service_type || user.service_type,
                    transportation: user.transportation
                };

                // 利用者の休憩記録を含める（APIから直接取得したデータをマッピング）
                if (user.role === 'user') {
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
                    service_no: user.service_no,
                    transportation: user.transportation,
                    clock_in: null,
                    clock_out: null
                });
            }
        }

        let html = `
            <div class="monthly-attendance-report monthly-report-${user.role}">
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
                    showFooter: false,       // フッターは独自実装
                    showServiceType: user.role === 'user' && (this.isAdmin || this.isStaff),
                    showTransportation: user.role === 'user' && user.service_type === 'commute' && user.transportation === 1 && (this.isAdmin || this.isStaff),
                    targetUserRole: user.role
                })}
                
                ${this.generateMonthlyFooter(dailyRecords, user)}
                ${user.role === 'user' ? this.generateUserJissekiPrint(year, month, user, dailyRecords) : ''}
                ${this.printManager.generatePrintStyles('monthly')}
            </div>
        `;
        
        return html;
    }

    generateMonthlyFooter(records, user) {
        // 集計
        const workingDays = records.filter(r => r.clock_in).length;
        let totalMinutes = 0;

        records.forEach(record => {
            if (record.clock_in && record.clock_out) {
                const hhmmStr = this.attendanceTable.calculateWorkDurationDay(record);
                if (hhmmStr && hhmmStr.includes(':')) {
                    const [h, m] = hhmmStr.split(':').map(Number);
                    totalMinutes += h * 60 + m;
                }
            }
        });

        // 送迎合計（送迎ありの通所利用者のみ）
        const showTransportation = user.role === 'user' && user.service_type === 'commute' && user.transportation === 1 && (this.isAdmin || this.isStaff);
        let transportationCells = '';
        if (showTransportation) {
            const transportationCount = records.filter(r => {
                return r.transportation && r.clock_in;
            }).length;
            const totalTransportation = transportationCount * 2; // 迎+送の合算
            transportationCells = `<th colspan="2" class="text-center transportation-col">送迎:${totalTransportation}</th>`;
        }

        // サービス区分列の有無でcolspan調整
        const showServiceType = user.role === 'user' && (this.isAdmin || this.isStaff);
        const baseColspan = showServiceType ? 3 : 2;

        return `
            <div class="table-responsive">
                <table class="table">
                    <tfoot class="table-secondary">
                        <tr>
                            <th colspan="${baseColspan}" class="text-center">月間集計</th>
                            <th colspan="2" class="text-center">出勤日数: ${workingDays}日</th>
                            <th colspan="2" class="text-center">総実働: ${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}</th>
                            ${transportationCells}
                            <th colspan="1" class="stamp print-only">印</th>
                        </tr>
                    </tfoot>
                </table>
            </div>
        `;
    }

    getWareki(year) {
        if (year >= 2019) return `令和${year - 2018}年`;
        if (year >= 1989) return `平成${year - 1988}年`;
        return `${year}年`;
    }

    generateUserJissekiPrint(year, month, user, dailyRecords) {
        const wareki = this.getWareki(year);
        const daysInMonth = getDaysInMonth(year, month);
        const dayNames = ['日', '月', '火', '水', '木', '金', '土'];

        let totalWorkDays = 0;
        let totalTransport = 0;
        let totalMinutes = 0;

        const recordMap = {};
        dailyRecords.forEach(record => {
            recordMap[record.day] = record;
            if (record.clock_in) {
                totalWorkDays++;
                if (record.transportation === 1) totalTransport++;
            }
            if (record.clock_in && record.clock_out) {
                const hhmmStr = this.attendanceTable.calculateWorkDurationDay(record);
                if (hhmmStr && hhmmStr.includes(':')) {
                    const [h, m] = hhmmStr.split(':').map(Number);
                    totalMinutes += h * 60 + m;
                }
            }
        });

        const totalHours = `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
        const totalTransportCount = totalTransport * 2;

        let dayRows = '';
        for (let day = 1; day <= 31; day++) {
            if (day <= daysInMonth) {
                const record = recordMap[day];
                const date = new Date(year, month - 1, day);
                const dayName = dayNames[date.getDay()];
                const isAttended = record && record.clock_in;

                const serviceStatus = isAttended ?
                    (record.service_type === 'commute' ? '通所' : record.service_type === 'home' ? '在宅' : '') : '';
                const clockIn = isAttended ? record.clock_in : '';
                const clockOut = isAttended && record.clock_out ? record.clock_out : '';
                const transportIn = isAttended && record.transportation === 1 ? '1' : '';
                const transportOut = transportIn;

                dayRows += `<tr>
                    <td>${day}</td><td>${dayName}</td>
                    <td>${serviceStatus}</td>
                    <td>${clockIn}</td><td>${clockOut}</td>
                    <td>${transportIn}</td><td>${transportOut}</td>
                    <td></td><td></td><td></td><td></td><td></td>
                    <td></td><td></td>
                </tr>`;
            } else {
                dayRows += `<tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`;
            }
        }

        return `
        <div class="user-jisseki-print d-none">
            <div class="jisseki-row1">
                <span class="jisseki-wareki">${wareki} ${month}月</span>
                <span class="jisseki-title">就労継続支援提供実績記録表</span>
            </div>
            <table class="jisseki-info">
                <tr>
                    <td class="jisseki-label">受給者番号</td>
                    <td class="jisseki-value">${user.service_no || ''}</td>
                    <td class="jisseki-label">支給決定障害者氏名</td>
                    <td class="jisseki-value">${user.name}</td>
                    <td class="jisseki-label">事業所番号</td>
                    <td class="jisseki-value">1412801597</td>
                </tr>
                <tr>
                    <td class="jisseki-label">契約支給量</td>
                    <td class="jisseki-value" colspan="2">就労支援B型　原則の日数</td>
                    <td class="jisseki-label">事業者及びその事業所</td>
                    <td class="jisseki-value" colspan="2">はっぴぃたいむ渋沢</td>
                </tr>
            </table>
            <table class="jisseki-main">
                <thead>
                    <tr>
                        <th rowspan="3" class="jcol-date">日付</th>
                        <th rowspan="3" class="jcol-day">曜日</th>
                        <th colspan="10">サービス提供実績</th>
                        <th rowspan="3" class="jcol-confirm">利用者<br>確認欄</th>
                        <th rowspan="3" class="jcol-note">備考</th>
                    </tr>
                    <tr>
                        <th rowspan="2" class="jcol-status">サービス提供<br>の状況</th>
                        <th rowspan="2" class="jcol-time">開始<br>時間</th>
                        <th rowspan="2" class="jcol-time">終了<br>時間</th>
                        <th colspan="2">送迎加算</th>
                        <th>訪問支援<br>特別加算</th>
                        <th rowspan="2" class="jcol-addon">食事提供<br>加算</th>
                        <th rowspan="2" class="jcol-addon">医療連携<br>体制加算</th>
                        <th rowspan="2" class="jcol-addon">地域協働<br>加算</th>
                        <th rowspan="2" class="jcol-addon">施設外<br>加算</th>
                    </tr>
                    <tr>
                        <th class="jcol-transport">往</th>
                        <th class="jcol-transport">復</th>
                        <th class="jcol-addon">時間数</th>
                    </tr>
                </thead>
                <tbody>
                    ${dayRows}
                </tbody>
                <tfoot>
                    <tr class="jisseki-total-row">
                        <td colspan="2" rowspan="2"><strong>合計</strong></td>
                        <td rowspan="2"></td>
                        <td rowspan="2"></td>
                        <td rowspan="2"></td>
                        <td colspan="2" rowspan="2">${totalTransportCount > 0 ? totalTransportCount + '回' : ''}</td>
                        <td rowspan="2">回</td>
                        <td rowspan="2">回</td>
                        <td rowspan="2">回</td>
                        <td rowspan="2">回</td>
                        <td rowspan="2">回</td>
                        <td class="jisseki-facility-cell">施設外支援<br>当月　　日</td>
                        <td rowspan="2"></td>
                    </tr>
                    <tr class="jisseki-total-row">
                        <td class="jisseki-facility-cell">累計　　日/180日</td>
                    </tr>
                    <tr class="jisseki-addon-row">
                        <td colspan="2">初期加算</td>
                        <td colspan="2">利用開始日</td>
                        <td colspan="2"></td>
                        <td colspan="2">30日目</td>
                        <td colspan="2"></td>
                        <td colspan="2">当月算定日数</td>
                        <td colspan="2">${totalWorkDays}</td>
                    </tr>
                    <tr class="jisseki-hours-row">
                        <td colspan="2">勤務時間</td>
                        <td colspan="4">${totalHours} 時間</td>
                        <td colspan="2"></td>
                        <td>1</td>
                        <td colspan="2">枚中</td>
                        <td>1</td>
                        <td colspan="2">枚</td>
                    </tr>
                </tfoot>
            </table>
            <div class="jisseki-stamp-area">印</div>
        </div>`;
    }

    // 以下、編集関連のメソッド
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

        // 中抜けフィールドの表示制御（スタッフのみ）
        const nakanukeGroup = document.getElementById('monthlyEditNakanukeGroup');
        const nakanukeInput = document.getElementById('monthlyEditNakanukeMinutes');
        if (nakanukeGroup && nakanukeInput) {
            if (data.userRole === 'staff') {
                nakanukeGroup.style.display = 'flex';
                nakanukeInput.value = data.nakanukeMinutes || 0;
            } else {
                nakanukeGroup.style.display = 'none';
                nakanukeInput.value = 0;
            }
        }

        // 削除セクションの表示制御（管理者のみ）
        const deleteSection = document.getElementById('monthlyDeleteSection');
        if (deleteSection) {
            deleteSection.style.display = (this.isAdmin && data.recordId) ? 'block' : 'none';
        }

        // 削除要望セクションの表示制御（スタッフのみ）
        const deleteRequestSection = document.getElementById('monthlyDeleteRequestSection');
        if (deleteRequestSection) {
            deleteRequestSection.style.display = (this.isStaff && data.recordId) ? 'block' : 'none';
            const reasonField = document.getElementById('monthlyDeleteRequestReason');
            if (reasonField) reasonField.value = '';
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

            // staffは理由必須、adminは任意
            if (this.isStaff && !reason.trim()) {
                this.app.showNotification('変更理由を入力してください', 'warning');
                return;
            }

            // 中抜け経過分数
            const nakanukeMinutesInput = document.getElementById('monthlyEditNakanukeMinutes');
            const nakanukeMinutes = nakanukeMinutesInput ? parseInt(nakanukeMinutesInput.value) || 0 : undefined;

            const requestData = {
                recordId: recordId || null,
                userId: userId,
                date: date,
                newClockIn: clockIn,
                newClockOut: clockOut,
                newBreakStart: breakStart,
                newBreakEnd: breakEnd,
                nakanukeMinutes: nakanukeMinutes,
                status: status,
                reason: reason
            };
            
            // 権限に応じてAPIエンドポイントを切り替え
            const endpoint = this.isAdmin
                ? API_ENDPOINTS.ADMIN.ATTENDANCE_CORRECT
                : API_ENDPOINTS.STAFF.ATTENDANCE_CORRECT;

            await this.app.apiCall(endpoint, {
                method: 'POST',
                body: JSON.stringify(requestData)
            });

            const message = this.isStaff
                ? '訂正申請を送信しました（管理者の承認後に反映されます）'
                : '出勤記録を更新しました';
            this.app.showNotification(message, 'success');
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

            // 削除API呼び出し
            const response = await this.app.apiCall(
                `/api/admin/attendance/${recordId}`,
                {
                    method: 'DELETE',
                    body: JSON.stringify({})
                }
            );

            // 成功メッセージ
            this.app.showNotification(response.message, 'success');

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

    async requestDeleteAttendance() {
        if (!this.isStaff) return;

        try {
            const recordId = document.getElementById('monthlyEditRecordId').value;
            const reason = document.getElementById('monthlyDeleteRequestReason').value;

            if (!recordId) {
                this.app.showNotification('削除する記録が選択されていません', 'warning');
                return;
            }

            if (!reason || !reason.trim()) {
                this.app.showNotification('削除理由を入力してください', 'warning');
                return;
            }

            await this.app.apiCall('/api/staff/attendance/delete-request', {
                method: 'POST',
                body: JSON.stringify({ recordId, reason: reason.trim() })
            });

            this.app.showNotification('削除要望を送信しました（管理者の承認待ち）', 'success');
            modalManager.hide('monthlyAttendanceEditModal');
            await this.showMonthlyReport();

        } catch (error) {
            console.error('削除要望エラー:', error);
            this.app.showNotification(
                error.message || '削除要望の送信に失敗しました',
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