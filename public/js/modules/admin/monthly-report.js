// modules/admin/monthly-report.js
// 管理者月別出勤簿機能

import { API_ENDPOINTS } from '../../constants/api-endpoints.js';

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

        // 申し送り関連
        const updateHandoverBtn = this.container.querySelector('#updateHandoverBtn');
        const refreshHandoverBtn = this.container.querySelector('#refreshHandoverBtn');
        
        if (updateHandoverBtn) {
            updateHandoverBtn.addEventListener('click', () => this.updateHandover());
        }
        
        if (refreshHandoverBtn) {
            refreshHandoverBtn.addEventListener('click', () => this.loadHandoverData());
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
        });
    }

    async show() {
        this.container.style.display = 'block';
        await this.loadData();
    }

    hide() {
        this.container.style.display = 'none';
    }

    async refresh() {
        await this.loadData();
        if (this.currentReportData) {
            await this.showMonthlyReport();
        }
        this.parent.showNotification('月別出勤簿を更新しました', 'info');
    }

    async loadData() {
        this.generateYearOptions();
        this.generateMonthOptions();
        await this.loadUsersForMonthlyReport();
        await this.loadHandoverData();
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
            const response = await this.parent.callApi(API_ENDPOINTS.ADMIN.USERS);
            const userSelect = this.container.querySelector('#monthlyUserSelect');
            
            if (userSelect) {
                let html = '<option value="">ユーザーを選択してください</option>';
                
                // 利用者を先に表示
                const users = response.users.filter(user => user.role === 'user');
                const staff = response.users.filter(user => user.role === 'staff');
                
                if (users.length > 0) {
                    html += '<optgroup label="利用者">';
                    users.forEach(user => {
                        const serviceDisplay = user.service_type ? ` (${this.parent.getServiceTypeDisplayName(user.service_type)})` : '';
                        const selected = user.id == this.selectedUserId ? 'selected' : '';
                        html += `<option value="${user.id}" ${selected}>${user.name}${serviceDisplay}</option>`;
                    });
                    html += '</optgroup>';
                }
                
                if (staff.length > 0) {
                    html += '<optgroup label="スタッフ">';
                    staff.forEach(user => {
                        const selected = user.id == this.selectedUserId ? 'selected' : '';
                        html += `<option value="${user.id}" ${selected}>${user.name}</option>`;
                    });
                    html += '</optgroup>';
                }
                
                userSelect.innerHTML = html;
            }
        } catch (error) {
            console.error('ユーザー読み込みエラー:', error);
        }
    }

    async showMonthlyReport() {
        const yearSelect = this.container.querySelector('#monthlyYearSelect');
        const monthSelect = this.container.querySelector('#monthlyMonthSelect');
        const userSelect = this.container.querySelector('#monthlyUserSelect');
        const displayContainer = this.container.querySelector('#monthlyReportDisplay');
        const selectionInfo = this.container.querySelector('#selectionInfo');
        
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
        
        // ローディング表示
        displayContainer.innerHTML = `
            <div class="text-center p-4">
                <div class="spinner-border" role="status">
                    <span class="visually-hidden">読み込み中...</span>
                </div>
                <p class="mt-2 text-muted">月別出勤記録を取得中...</p>
            </div>
        `;
        
        try {
            // 月次出勤データを取得
            const monthPadded = String(month).padStart(2, '0');
            const url = API_ENDPOINTS.ADMIN.ATTENDANCE_MONTHLY(year, monthPadded, userId);
            console.log('[月別出勤簿] API呼び出し:', url);
            
            const response = await this.parent.callApi(url);
            console.log('[月別出勤簿] APIレスポンス:', response);
            
            if (!response || !response.user) {
                this.parent.showNotification('ユーザーが見つかりません', 'danger');
                return;
            }
            
            // データを保存
            this.currentReportData = {
                year,
                month,
                user: response.user,
                records: response.records || []
            };
            
            // 選択状況を表示
            this.updateSelectionInfo();
            
            // 月次出勤記録を生成
            displayContainer.innerHTML = this.generateMonthlyReportHTML();
            
            // エクスポート・印刷ボタンを表示
            this.showExportButtons();
            
        } catch (error) {
            console.error('[月別出勤簿] エラー詳細:', error);
            this.parent.showNotification('月次出勤記録の取得に失敗しました', 'danger');
            this.showReportError('月次出勤記録の取得に失敗しました');
        }
    }

    updateSelectionInfo() {
        const selectionInfo = this.container.querySelector('#selectionInfo');
        if (!this.currentReportData) return;
        
        const { year, month, user } = this.currentReportData;
        const monthName = `${year}年${month}月`;
        const roleDisplay = this.parent.getRoleDisplayName(user.role);
        const serviceDisplay = user.service_type ? ` (${this.parent.getServiceTypeDisplayName(user.service_type)})` : '';
        
        selectionInfo.innerHTML = `
            <div class="row">
                <div class="col-md-8">
                    <h6 class="mb-0">
                        <i class="fas fa-calendar-alt"></i> ${monthName} - 
                        <i class="fas fa-user"></i> ${user.name}さん
                        <span class="badge bg-${this.parent.getRoleColor(user.role)} ms-2">${roleDisplay}</span>
                        ${serviceDisplay}
                    </h6>
                </div>
                <div class="col-md-4 text-end">
                    <small class="text-muted">
                        取得時刻: ${new Date().toLocaleString('ja-JP')}
                    </small>
                </div>
            </div>
        `;
        selectionInfo.style.display = 'block';
    }

    generateMonthlyReportHTML() {
        if (!this.currentReportData) return '';
        
        const { year, month, user, records } = this.currentReportData;
        const monthName = `${year}年${month}月`;
        const daysInMonth = new Date(year, month, 0).getDate();
        const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
        
        // 記録を日付でインデックス化
        const recordMap = {};
        records.forEach(record => {
            const date = new Date(record.date);
            const day = date.getDate();
            recordMap[day] = record;
        });
        
        let html = `
            <div class="monthly-attendance-report" id="printableReport">
                <div class="report-header mb-4">
                    <div class="row">
                        <div class="col-md-8">
                            <h4 class="mb-1">
                                <i class="fas fa-calendar-alt"></i> ${monthName} 出勤記録
                            </h4>
                            <h5 class="text-primary">
                                <i class="fas fa-user"></i> ${user.name}さん
                                <small class="text-muted ms-2">
                                    ${this.parent.getRoleDisplayName(user.role)}
                                    ${user.service_type ? '・' + this.parent.getServiceTypeDisplayName(user.service_type) : ''}
                                </small>
                            </h5>
                        </div>
                        <div class="col-md-4 text-end">
                            <div class="report-summary">
                                ${this.generateMonthlySummary(records)}
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="table-responsive">
                    <table class="table table-bordered table-sm monthly-table">
                        <thead class="table-primary">
                            <tr>
                                <th width="6%">日付</th>
                                <th width="6%">曜日</th>
                                <th width="8%">勤務場所</th>
                                <th width="8%">出勤時間</th>
                                <th width="8%">退勤時間</th>
                                <th width="8%">休憩時間</th>
                                <th width="8%">実働時間</th>
                                <th width="8%">ステータス</th>
                                <th width="25%">備考</th>
                                <th width="15%">操作</th>
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
                let breakDuration = 0;
                
                if (record.break_start) {
                    breakDuration = 1; // 60分固定
                    if (record.break_end) {
                        breakTimeDisplay = `${record.break_start}〜${record.break_end}`;
                    } else {
                        breakTimeDisplay = `${record.break_start}〜(60分)`;
                    }
                }
                
                // 実働時間の計算
                const grossWorkHours = this.parent.calculateWorkDuration(record);
                const netWorkHours = grossWorkHours ? parseFloat(grossWorkHours) - breakDuration : 0;
                
                if (netWorkHours > 0) totalWorkHours += netWorkHours;
                
                const serviceDisplay = user.service_type ? 
                    this.parent.getServiceTypeDisplayName(user.service_type) : 
                    (user.role === 'staff' || user.role === 'admin' ? '事業所' : '-');
                
                // 備考の生成
                let remarks = [];
                if (record.report_id) remarks.push('<span class="badge bg-success">日報提出</span>');
                if (record.comment) remarks.push('<span class="badge bg-info">コメントあり</span>');
                
                // 操作ボタンの表示（利用者の場合のみ）
                let actionButtons = '';
                if (user.role === 'user' && record.report_id) {
                    actionButtons = `
                        <button class="btn btn-sm btn-outline-primary btn-show-report" 
                                data-user-id="${user.id}" 
                                data-user-name="${user.name}" 
                                data-date="${dateStr}">
                            <i class="fas fa-file-alt"></i> 日報
                        </button>
                    `;
                }
                
                
                html += `
                    <tr class="${rowClass}">
                        <td class="text-center fw-bold">${day}</td>
                        <td class="text-center">${dayName}</td>
                        <td class="text-center">${serviceDisplay}</td>
                        <td class="text-center">${record.clock_in}</td>
                        <td class="text-center">${record.clock_out || '<span class="text-warning">未退勤</span>'}</td>
                        <td class="text-center small">${breakTimeDisplay}</td>
                        <td class="text-center">${netWorkHours > 0 ? netWorkHours.toFixed(1) + 'h' : '-'}</td>
                        <td class="text-center">${this.parent.getStatusBadge(record.status || 'normal')}</td>
                        <td class="small">${remarks.join(' ')}</td>
                        <td class="text-center">${actionButtons}</td>
                    </tr>
                `;
            } else {
                html += `
                    <tr class="${rowClass}">
                        <td class="text-center fw-bold">${day}</td>
                        <td class="text-center">${dayName}</td>
                        <td class="text-center text-muted">-</td>
                        <td class="text-center text-muted">-</td>
                        <td class="text-center text-muted">-</td>
                        <td class="text-center text-muted">-</td>
                        <td class="text-center text-muted">-</td>
                        <td class="text-center text-muted">-</td>
                        <td class="small text-muted">未出勤</td>
                        <td class="text-center text-muted">-</td>
                    </tr>
                `;
            }
        }
        
        html += `
                        </tbody>
                        <tfoot class="table-secondary">
                            <tr>
                                <th colspan="6" class="text-end">月間集計</th>
                                <th class="text-center">${totalWorkHours.toFixed(1)}時間</th>
                                <th colspan="3">出勤日数: ${totalWorkDays}日</th>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        `;
        
        return html;
    }

    generateMonthlySummary(records) {
        let workDays = 0;
        let totalHours = 0;
        let lateCount = 0;
        let absenceCount = 0;
        
        records.forEach(record => {
            if (record.clock_in) workDays++;
            
            const workHours = this.parent.calculateWorkDuration(record);
            if (workHours) totalHours += parseFloat(workHours);
            
            if (record.status === 'late') lateCount++;
            if (record.status === 'absence' || record.status === 'paid_leave') absenceCount++;
        });
        
        return `
            <div class="text-end">
                <div class="mb-1"><small class="text-muted">出勤日数:</small> <strong>${workDays}日</strong></div>
                <div class="mb-1"><small class="text-muted">総労働時間:</small> <strong>${totalHours.toFixed(1)}h</strong></div>
                <div class="mb-1"><small class="text-muted">遅刻:</small> <strong class="text-warning">${lateCount}回</strong></div>
                <div class="mb-1"><small class="text-muted">欠勤:</small> <strong class="text-danger">${absenceCount}回</strong></div>
            </div>
        `;
    }

    clearReport() {
        this.currentReportData = null;
        this.selectedUserId = null;
        
        const displayContainer = this.container.querySelector('#monthlyReportDisplay');
        const selectionInfo = this.container.querySelector('#selectionInfo');
        const userSelect = this.container.querySelector('#monthlyUserSelect');
        
        displayContainer.innerHTML = `
            <div class="text-center p-5">
                <i class="fas fa-calendar-alt fa-3x text-muted mb-3"></i>
                <h5 class="text-muted">月別出勤簿</h5>
                <p class="text-muted">年・月・ユーザーを選択して「表示」ボタンを押してください</p>
            </div>
        `;
        
        selectionInfo.style.display = 'none';
        if (userSelect) userSelect.value = '';
        
        this.hideExportButtons();
    }

    showExportButtons() {
        const printBtn = this.container.querySelector('#printMonthlyReportBtn');
        const exportBtn = this.container.querySelector('#exportExcelBtn');
        
        if (printBtn) printBtn.style.display = 'inline-block';
        if (exportBtn) exportBtn.style.display = 'inline-block';
    }

    hideExportButtons() {
        const printBtn = this.container.querySelector('#printMonthlyReportBtn');
        const exportBtn = this.container.querySelector('#exportExcelBtn');
        
        if (printBtn) printBtn.style.display = 'none';
        if (exportBtn) exportBtn.style.display = 'none';
    }

    printReport() {
        if (!this.currentReportData) {
            this.parent.showNotification('印刷するレポートがありません', 'warning');
            return;
        }
        
        // 印刷用の新しいウィンドウを開く
        const printWindow = window.open('', '_blank');
        const reportElement = this.container.querySelector('#printableReport');
        
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>月別出勤簿 - ${this.currentReportData.user.name}</title>
                <style>
                    body { font-family: sans-serif; margin: 20px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th, td { border: 1px solid #ddd; padding: 8px; text-align: center; font-size: 12px; }
                    th { background-color: #f8f9fa; font-weight: bold; }
                    .table-danger { background-color: #f8d7da; }
                    .table-info { background-color: #d1ecf1; }
                    .badge { padding: 2px 6px; border-radius: 3px; font-size: 10px; }
                    .bg-success { background-color: #d4edda; color: #155724; }
                    .bg-info { background-color: #d1ecf1; color: #0c5460; }
                    .bg-warning { background-color: #fff3cd; color: #856404; }
                    .bg-danger { background-color: #f8d7da; color: #721c24; }
                    .text-warning { color: #856404; }
                    @media print {
                        .btn { display: none; }
                        body { margin: 0; }
                    }
                </style>
            </head>
            <body>
                ${reportElement.outerHTML}
            </body>
            </html>
        `);
        
        printWindow.document.close();
        printWindow.focus();
        
        // 印刷ダイアログを表示
        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 250);
    }

    exportToExcel() {
        if (!this.currentReportData) {
            this.parent.showNotification('エクスポートするデータがありません', 'warning');
            return;
        }
        
        this.parent.showNotification('Excel出力機能は今後実装予定です', 'info');
    }

    async showReportDetail(userId, userName, date) {
        // 出勤管理モジュールの機能を利用（委譲）
        if (this.parent.subModules.attendanceManagement) {
            await this.parent.subModules.attendanceManagement.showReportDetail(userId, userName, date);
        }
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