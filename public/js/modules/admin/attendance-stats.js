// modules/admin/attendance-stats.js
// 出勤人数管理機能

import { API_ENDPOINTS } from '../../constants/api-endpoints.js';
import { getDaysInMonth } from '../../utils/date-time.js';

export default class AttendanceStats {
    constructor(app, parentModule) {
        this.app = app;
        this.parent = parentModule;
        this.container = null;
        this.selectedYear = new Date().getFullYear();
        this.selectedMonth = new Date().getMonth() + 1;
    }

    async init(containerElement) {
        this.container = document.createElement('div');
        this.container.id = 'attendanceStatsSection';
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
                    <h5><i class="fas fa-chart-bar"></i> 出勤人数管理</h5>
                </div>
                <div class="card-body">
                    <div class="row mb-4">
                        <div class="col-md-2">
                            <label for="statsYearSelect" class="form-label">年</label>
                            <select class="form-control" id="statsYearSelect"></select>
                        </div>
                        <div class="col-md-2">
                            <label for="statsMonthSelect" class="form-label">月</label>
                            <select class="form-control" id="statsMonthSelect"></select>
                        </div>
                        <div class="col-md-2 d-flex align-items-end">
                            <button class="btn btn-primary w-100" id="showStatsBtn">
                                <i class="fas fa-search"></i> 表示
                            </button>
                        </div>
                    </div>
                    <div id="statsDisplay">
                        <div class="text-center p-5">
                            <i class="fas fa-chart-bar fa-3x text-muted mb-3"></i>
                            <h5 class="text-muted">出勤人数管理</h5>
                            <p class="text-muted">年・月を選択して「表示」ボタンを押してください</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
        this.populateSelects();
    }

    populateSelects() {
        const yearSelect = this.container.querySelector('#statsYearSelect');
        const monthSelect = this.container.querySelector('#statsMonthSelect');
        const currentYear = new Date().getFullYear();

        for (let y = currentYear - 2; y <= currentYear + 1; y++) {
            yearSelect.innerHTML += `<option value="${y}" ${y === this.selectedYear ? 'selected' : ''}>${y}年</option>`;
        }
        for (let m = 1; m <= 12; m++) {
            monthSelect.innerHTML += `<option value="${m}" ${m === this.selectedMonth ? 'selected' : ''}>${m}月</option>`;
        }
    }

    setupEventListeners() {
        this.container.querySelector('#showStatsBtn').addEventListener('click', () => this.loadStats());
    }

    async show() {
        this.container.style.display = 'block';
        await this.loadStats();
    }

    hide() {
        this.container.style.display = 'none';
    }

    async loadStats() {
        const year = parseInt(this.container.querySelector('#statsYearSelect').value);
        const month = parseInt(this.container.querySelector('#statsMonthSelect').value);
        this.selectedYear = year;
        this.selectedMonth = month;

        try {
            const response = await this.app.apiCall(
                `${API_ENDPOINTS.ADMIN.ATTENDANCE_STATS}?year=${year}&month=${month}`
            );

            if (!response || !response.success) {
                this.app.showNotification('データの取得に失敗しました', 'danger');
                return;
            }

            this.renderStats(response);
        } catch (error) {
            console.error('出勤人数統計エラー:', error);
            this.app.showNotification('出勤人数統計の取得に失敗しました', 'danger');
        }
    }

    renderStats(data) {
        const { userCount, dailyCounts, year, month, daysInMonth } = data;
        const dayNames = ['日', '月', '火', '水', '木', '金', '土'];

        const dailyMap = {};
        dailyCounts.forEach(d => {
            const day = new Date(d.date).getDate();
            dailyMap[day] = d.count;
        });

        let totalAttendance = 0;
        dailyCounts.forEach(d => { totalAttendance += d.count; });

        let workingDays = 0;
        for (let d = 1; d <= daysInMonth; d++) {
            if (dailyMap[d]) workingDays++;
        }

        const dailyAverage = workingDays > 0 ? (totalAttendance / workingDays) : 0;

        // 週ごとの集計
        const weeks = this.calculateWeeklyStats(year, month, daysInMonth, dailyMap, dayNames);

        const display = this.container.querySelector('#statsDisplay');
        display.innerHTML = `
            <div class="row mb-4">
                <div class="col-md-3">
                    <div class="card text-center border-primary">
                        <div class="card-body">
                            <h6 class="text-muted">利用者数</h6>
                            <h3 class="text-primary">${userCount}<small class="fs-6">人</small></h3>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card text-center border-success">
                        <div class="card-body">
                            <h6 class="text-muted">月延べ出勤数</h6>
                            <h3 class="text-success">${totalAttendance}<small class="fs-6">人日</small></h3>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card text-center border-info">
                        <div class="card-body">
                            <h6 class="text-muted">毎日の平均勤務人数</h6>
                            <h3 class="text-info">${dailyAverage.toFixed(1)}<small class="fs-6">人/日</small></h3>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card text-center border-secondary">
                        <div class="card-body">
                            <h6 class="text-muted">売上達成率</h6>
                            <h3 class="text-secondary">-<small class="fs-6">%</small></h3>
                            <small class="text-muted">（要件待ち）</small>
                        </div>
                    </div>
                </div>
            </div>

            <h6 class="mb-3"><i class="fas fa-calendar-week"></i> 週別平均出勤人数</h6>
            ${this.renderWeeklyTable(weeks)}

            <h6 class="mt-4 mb-3"><i class="fas fa-list"></i> 日別出勤人数</h6>
            ${this.renderDailyTable(year, month, daysInMonth, dailyMap, dayNames)}
        `;
    }

    calculateWeeklyStats(year, month, daysInMonth, dailyMap, dayNames) {
        const weeks = [];
        let weekStart = 1;
        let weekAttendance = 0;
        let weekWorkingDays = 0;

        for (let d = 1; d <= daysInMonth; d++) {
            const date = new Date(year, month - 1, d);
            const dow = date.getDay();

            if (dailyMap[d]) {
                weekAttendance += dailyMap[d];
                weekWorkingDays++;
            }

            // 土曜日 or 月末で週を締める
            if (dow === 6 || d === daysInMonth) {
                const avg = weekWorkingDays > 0 ? weekAttendance / weekWorkingDays : 0;
                weeks.push({
                    label: `${month}/${weekStart}〜${month}/${d}`,
                    totalAttendance: weekAttendance,
                    workingDays: weekWorkingDays,
                    average: avg
                });
                weekStart = d + 1;
                weekAttendance = 0;
                weekWorkingDays = 0;
            }
        }
        return weeks;
    }

    renderWeeklyTable(weeks) {
        let rows = weeks.map((w, i) => {
            const isAlert = w.average > 0 && w.average < 3;
            const rowClass = isAlert ? 'table-danger' : '';
            const textClass = isAlert ? 'fw-bold text-danger' : '';
            return `
                <tr class="${rowClass}">
                    <td>第${i + 1}週</td>
                    <td>${w.label}</td>
                    <td>${w.workingDays}日</td>
                    <td>${w.totalAttendance}人日</td>
                    <td class="${textClass}">${w.average.toFixed(1)}人/日${isAlert ? ' <i class="fas fa-exclamation-triangle"></i>' : ''}</td>
                </tr>`;
        }).join('');

        return `
            <div class="table-responsive">
                <table class="table table-bordered table-hover">
                    <thead class="table-light">
                        <tr>
                            <th width="10%">週</th>
                            <th width="25%">期間</th>
                            <th width="15%">稼働日数</th>
                            <th width="20%">延べ出勤数</th>
                            <th width="30%">平均出勤人数</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;
    }

    renderDailyTable(year, month, daysInMonth, dailyMap, dayNames) {
        let rows = '';
        for (let d = 1; d <= daysInMonth; d++) {
            const date = new Date(year, month - 1, d);
            const dow = date.getDay();
            const dayName = dayNames[dow];
            const count = dailyMap[d] || 0;
            const isWeekend = dow === 0 || dow === 6;
            const rowClass = isWeekend ? (dow === 0 ? 'table-danger' : 'table-info') : '';

            rows += `
                <tr class="${rowClass}">
                    <td>${month}/${d}</td>
                    <td>${dayName}</td>
                    <td>${count > 0 ? count + '人' : '-'}</td>
                </tr>`;
        }

        return `
            <div class="table-responsive">
                <table class="table table-bordered table-hover">
                    <thead class="table-light">
                        <tr>
                            <th width="30%">日付</th>
                            <th width="20%">曜日</th>
                            <th width="50%">出勤人数</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;
    }

    destroy() {
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }
}
