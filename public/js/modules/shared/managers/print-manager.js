// modules/shared/managers/print-manager.js
// 印刷機能専用管理クラス

import { calculateWorkHours, calculateBreakDuration } from '../../../utils/date-time.js';

export class PrintManager {
    constructor(app, parentModule) {
        this.app = app;
        this.parent = parentModule;
        this.originalTitle = '';
        this.isInitialized = false;
    }

    /**
     * 印刷機能の初期化
     * @param {HTMLElement} container - 対象のコンテナ要素
     */
    init(container) {
        this.container = container;
        this.setupCopyFunctionality();
        this.isInitialized = true;
    }

    /**
     * 月別出勤簿の印刷用テーブル生成
     * @param {Array} records - 出勤記録データ
     * @param {Object} options - オプション設定
     * @returns {string} - 生成されたHTMLテーブル
     */
    generatePrintableTable(records, options = {}) {
        const defaults = {
            showOperations: false,
            tableId: 'printableAttendanceTable',
            context: 'monthly'
        };
        const config = { ...defaults, ...options };

        let html = `
            <div class="table-responsive">
                <table class="table table-sm table-bordered" id="${config.tableId}">
                    <thead class="table-secondary">
                        <tr>
                            <th class="date-column">日付</th>
                            <th class="date-column">曜日</th>
                            <th class="time-column">出勤</th>
                            <th class="time-column">退勤</th>
                            <th class="time-column">休憩開始</th>
                            <th class="time-column">休憩終了</th>
                            <th class="work-hours-column">実働時間</th>
                            <th class="status-column">状態</th>
                            ${config.showOperations ? '<th class="operation-column d-print-none">操作</th>' : ''}
                        </tr>
                    </thead>
                    <tbody>
        `;

        records.forEach(record => {
            const isWeekend = record.dayOfWeek === 0 || record.dayOfWeek === 6;
            const rowClass = isWeekend ? 'weekend-row' : '';
            
            // 実働時間表示（計算済みデータを使用）
            let workHours = '';
            if (record.calculated_work_hours !== undefined) {
                // 計算済みの値を使用
                workHours = record.calculated_work_hours;
            } else if (record.clock_in && record.clock_out) {
                try {
                    const breakMinutes = record.break_start && record.break_end ? 
                        calculateBreakDuration(record.break_start, record.break_end) : 0;
                    const hours = calculateWorkHours(record.clock_in, record.clock_out, breakMinutes);
                    workHours = hours ? `${hours.toFixed(1)}h` : '';
                } catch (error) {
                    console.error('勤務時間計算エラー:', error);
                    workHours = '-';
                }
            }

            // 状態表示とカラー
            const statusDisplay = this.getStatusDisplayName(record.status);
            const statusClass = this.getStatusClass(record.status);

            html += `
                <tr class="${rowClass}" data-date="${record.date}">
                    <td class="date-column">${record.day}</td>
                    <td class="date-column text-${isWeekend ? 'danger' : 'dark'}">${record.dayName}</td>
                    <td class="time-column copyable-time" data-time="${record.clock_in || ''}" title="クリックでコピー">
                        ${record.clock_in || '-'}
                        ${record.clock_in ? '<i class="fas fa-copy copy-btn d-print-none ms-1 text-muted"></i>' : ''}
                    </td>
                    <td class="time-column copyable-time" data-time="${record.clock_out || ''}" title="クリックでコピー">
                        ${record.clock_out || '-'}
                        ${record.clock_out ? '<i class="fas fa-copy copy-btn d-print-none ms-1 text-muted"></i>' : ''}
                    </td>
                    <td class="time-column">${record.break_start || '-'}</td>
                    <td class="time-column">${record.break_end || '-'}</td>
                    <td class="work-hours-column text-info">${workHours}</td>
                    <td class="status-column ${statusClass}">${statusDisplay}</td>
                    ${config.showOperations ? `<td class="operation-column d-print-none">${this.generateRowOperations(record, { canEdit: config.canEdit })}</td>` : ''}
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
            </div>
        `;

        return html;
    }

    /**
     * 行操作ボタンの生成
     * @param {Object} record - 出勤記録
     * @param {Object} options - オプション設定
     * @returns {string} - 操作ボタンHTML
     */
    generateRowOperations(record, options = {}) {
        const { canEdit = false } = options;
        let html = '';
        
        if (record.clock_in || record.clock_out) {
            // 日報詳細ボタン
            html += `
                <button class="btn btn-outline-primary btn-sm btn-show-report me-1" 
                        data-user-id="${record.user_id}"
                        data-user-name="${record.user_name}"
                        data-date="${record.date}"
                        title="日報詳細">
                    <i class="fas fa-eye"></i>
                </button>
            `;
            
            // 編集ボタン（管理者のみ）
            if (canEdit) {
                html += `
                    <button class="btn btn-outline-warning btn-sm btn-edit-attendance"
                            data-record-id="${record.id || ''}"
                            data-user-id="${record.user_id}"
                            data-date="${record.date}"
                            data-clock-in="${record.clock_in || ''}"
                            data-clock-out="${record.clock_out || ''}"
                            data-break-start="${record.break_start || ''}"
                            data-break-end="${record.break_end || ''}"
                            data-status="${record.status || 'normal'}"
                            title="編集">
                        <i class="fas fa-edit"></i>
                    </button>
                `;
            }
        }
        
        return html;
    }

    /**
     * 出勤状態の表示名を取得
     * @param {string} status - 出勤状態
     * @returns {string} - 表示名
     */
    getStatusDisplayName(status) {
        const statusMap = {
            'normal': '正常',
            'late': '遅刻',
            'early': '早退',
            'absence': '欠勤',
            'paid_leave': '有給',
            'sick_leave': '病欠',
            'special_leave': '特休'
        };
        
        return statusMap[status] || '-';
    }

    /**
     * 出勤状態に応じたCSSクラスを取得
     * @param {string} status - 出勤状態
     * @returns {string} - CSSクラス
     */
    getStatusClass(status) {
        const statusClasses = {
            'normal': 'text-success',
            'late': 'text-warning',
            'early': 'text-warning', 
            'absence': 'text-danger',
            'paid_leave': 'text-primary',
            'sick_leave': 'text-info',
            'special_leave': 'text-secondary'
        };
        
        return statusClasses[status] || 'text-muted';
    }

    /**
     * 印刷用スタイルの生成
     * @param {string} type - 印刷タイプ ('monthly', 'daily', 'summary')
     * @returns {string} - 印刷用CSS
     */
    generatePrintStyles(type = 'monthly') {
        const baseStyles = `
            @media print {
                /* 非表示要素（既存CSSに合わせる） */
                .shared-section .custom-card-header,
                .shared-section .row.mb-4,
                .btn, .btn-group, .alert, .modal,
                .navbar, .sidebar, .operation-column,
                .copy-btn, nav, header, footer,
                .d-print-none { 
                    display: none !important; 
                }
                
                /* ページ設定 */
                @page {
                    size: A4;
                    margin: 8mm 6mm;
                }
                
                /* 全体レイアウト（既存CSSベース） */
                body {
                    margin: 0 !important;
                    padding: 0 !important;
                    font-size: var(--font-size-sm) !important;
                    line-height: 1.1 !important;
                    background: white !important;
                    color: var(--dark-color) !important;
                }
                
                .custom-card, .card-body {
                    border: none !important;
                    box-shadow: none !important;
                    margin: 0 !important;
                    padding: 0 !important;
                }
                
                /* レイアウト調整 */
                .container, .container-fluid {
                    margin: 0 !important;
                    padding: 0 !important;
                    max-width: none !important;
                }
            }
        `;

        const monthlyStyles = `
            @media print {
                /* 基本的な印刷設定 */
                @page {
                    size: A4;
                    margin: 10mm;
                }
                
                body {
                    margin: 0;
                    font-size: 10pt;
                    font-family: "游ゴシック", "Yu Gothic", sans-serif;
                }
                
                /* ヘッダーとフィルター部分を非表示 */
                .shared-section .custom-card-header,
                .shared-section .row.mb-4,
                .btn,
                .btn-group,
                .btn-outline-light,
                .btn-primary,
                .btn-secondary { 
                    display: none !important; 
                }
                
                /* カード枠線を削除 */
                .custom-card {
                    border: none !important;
                    box-shadow: none !important;
                }
                
                /* 月別出勤簿のタイトル */
                .monthly-attendance-report h5 {
                    font-size: 14pt;
                    margin-bottom: 10px;
                    font-weight: bold;
                }
                
                .monthly-attendance-report small {
                    font-size: 10pt;
                }
                
                /* テーブルの印刷設定 */
                .monthly-attendance-report table { 
                    font-size: 9pt;
                    width: 100%;
                    border-collapse: collapse;
                    table-layout: fixed;
                }
                
                .monthly-attendance-report table th,
                .monthly-attendance-report table td {
                    padding: 3px 5px;
                    border: 1px solid #333;
                    text-align: center;
                }
                
                /* テーブルヘッダー */
                .table-primary {
                    background-color: #e3f2fd !important;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }
                
                /* 月別出勤簿の印刷時に非表示にしたい列（利用者の場合） */
                .attendance-table-user thead tr th:nth-child(7),  /* 状態 */
                .attendance-table-user tbody tr td:nth-child(7),
                .attendance-table thead tr th:nth-child(8),  /* 日報・コメント */
                .attendance-table tbody tr td:nth-child(8),
                .attendance-table thead tr th:nth-child(9),  /* 操作 */
                .attendance-table tbody tr td:nth-child(9) {
                    display: none !important;
                }

                /* カラム幅の調整（利用者: 状態列なしの6列分） */
                .attendance-table-user thead tr th:nth-child(1) { width: 8%; }  /* 日 */
                .attendance-table-user thead tr th:nth-child(2) { width: 8%; }  /* 曜 */
                .attendance-table-user thead tr th:nth-child(3) { width: 15%; } /* 出勤 */
                .attendance-table-user thead tr th:nth-child(4) { width: 15%; } /* 退勤 */
                .attendance-table-user thead tr th:nth-child(5) { width: 26%; } /* 休憩 */
                .attendance-table-user thead tr th:nth-child(6) { width: 12%; } /* 実働 */

                /* カラム幅の調整（スタッフ・管理者: 状態列ありの7列分） */
                .attendance-table-staff thead tr th:nth-child(1),
                .attendance-table-admin thead tr th:nth-child(1) { width: 7%; }  /* 日 */
                .attendance-table-staff thead tr th:nth-child(2),
                .attendance-table-admin thead tr th:nth-child(2) { width: 7%; }  /* 曜 */
                .attendance-table-staff thead tr th:nth-child(3),
                .attendance-table-admin thead tr th:nth-child(3) { width: 13%; } /* 出勤 */
                .attendance-table-staff thead tr th:nth-child(4),
                .attendance-table-admin thead tr th:nth-child(4) { width: 13%; } /* 退勤 */
                .attendance-table-staff thead tr th:nth-child(5),
                .attendance-table-admin thead tr th:nth-child(5) { width: 22%; } /* 休憩 */
                .attendance-table-staff thead tr th:nth-child(6),
                .attendance-table-admin thead tr th:nth-child(6) { width: 10%; } /* 実働 */
                .attendance-table-staff thead tr th:nth-child(7),
                .attendance-table-admin thead tr th:nth-child(7) { width: 10%; } /* 状態 */
                
                /* 土日の背景色 */
                .table-danger { /* 日曜日 */
                    background-color: #ffebee !important;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }
                
                .table-info { /* 土曜日 */
                    background-color: #e3f2fd !important;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }
                
                /* 月間集計のスタイル */
                .table-secondary {
                    background-color: #f0f0f0 !important;
                }
                .table-secondary th {
                   height: 75px; 
                }
                .stamp{
                    font-size:6px;
                }
                
                /* バッジのスタイル（利用者テーブルでは非表示） */
                .attendance-table-user .badge {
                    display: none !important;
                }

                /* スタッフ・管理者テーブルのバッジは表示（印刷用スタイル） */
                .attendance-table-staff .badge,
                .attendance-table-admin .badge {
                    display: inline-block !important;
                    padding: 2px 6px;
                    font-size: 8pt;
                    border-radius: 3px;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }
                /* 正常（bg-success）は印刷時に非表示 */
                .attendance-table-staff .badge.bg-success,
                .attendance-table-admin .badge.bg-success {
                    display: none !important;
                }
                .attendance-table-staff .badge.bg-warning,
                .attendance-table-admin .badge.bg-warning {
                    background-color: #ffc107 !important;
                    color: black !important;
                }
                .attendance-table-staff .badge.bg-danger,
                .attendance-table-admin .badge.bg-danger {
                    background-color: #dc3545 !important;
                    color: white !important;
                }
                .attendance-table-staff .badge.bg-primary,
                .attendance-table-admin .badge.bg-primary {
                    background-color: #0d6efd !important;
                    color: white !important;
                }
                .attendance-table-staff .badge.bg-info,
                .attendance-table-admin .badge.bg-info {
                    background-color: #0dcaf0 !important;
                    color: black !important;
                }
                .attendance-table-staff .badge.bg-secondary,
                .attendance-table-admin .badge.bg-secondary {
                    background-color: #6c757d !important;
                    color: white !important;
                }
                
                /* 改ページ制御 */
                .monthly-attendance-report {
                    page-break-inside: avoid;
                }
                
                /* テーブル行の高さを固定 */
                .monthly-attendance-report tbody tr {
                    height: 20px;
                }
                
                /* フォントサイズの微調整 */
                .monthly-attendance-report .text-nowrap {
                    font-size: 8pt;
                }
                
                /* 余白の調整 */
                .table-responsive {
                    margin: 0;
                    padding: 0;
                }
                
                /* ページヘッダー（必要に応じて） */
                .print-header {
                    display: block !important;
                    text-align: center;
                    margin-bottom: 20px;
                }
                
                /* 印刷時のみ表示される要素 */
                .print-only {
                    display: block !important;
                }
                
                .screen-only {
                    display: none !important;
                }
            }
        `;

        return `<style>${baseStyles}${type === 'monthly' ? monthlyStyles : ''}
            /* 通常表示でのスタイル */
            .copyable-time {
                cursor: pointer;
                transition: background-color 0.2s;
            }
            
            .copyable-time:hover {
                background-color: #f8f9fa;
            }
            
            .copy-btn {
                opacity: 0.5;
                transition: opacity 0.2s;
            }
            
            .copyable-time:hover .copy-btn {
                opacity: 1;
            }
            
            /* 土日のスタイル（行レベル） */
            .weekend-row, .table-secondary {
                background-color: #f8f9fa;
            }
            
            .weekend-row td, .table-secondary td {
                background-color: #f8f9fa !important;
            }
            
            .text-danger.fw-bold {
                color: #dc3545;
                font-weight: bold;
            }
        </style>`;
    }

    /**
     * コピー機能のセットアップ
     */
    setupCopyFunctionality() {
        if (!this.container) return;

        this.container.addEventListener('click', async (e) => {
            const copyableElement = e.target.closest('.copyable-time');
            if (copyableElement) {
                const timeValue = copyableElement.getAttribute('data-time');
                if (timeValue && timeValue !== '') {
                    try {
                        await navigator.clipboard.writeText(timeValue);
                        this.showCopyFeedback(copyableElement);
                    } catch (error) {
                        this.fallbackCopyToClipboard(timeValue);
                        this.showCopyFeedback(copyableElement);
                    }
                }
            }
        });
    }

    /**
     * コピー成功のフィードバック表示
     * @param {HTMLElement} element - コピー対象要素
     */
    showCopyFeedback(element) {
        const copyIcon = element.querySelector('.copy-btn');
        if (copyIcon) {
            const originalClass = copyIcon.className;
            copyIcon.className = 'fas fa-check copy-btn d-print-none ms-1 text-success';
            
            setTimeout(() => {
                copyIcon.className = originalClass;
            }, 1000);
        }
        
        this.app.showNotification('時刻をコピーしました', 'success', 1500);
    }

    /**
     * フォールバックコピー機能（古いブラウザ対応）
     * @param {string} text - コピーするテキスト
     */
    fallbackCopyToClipboard(text) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
            document.execCommand('copy');
        } catch (error) {
            console.error('Fallback copy failed:', error);
        }
        
        document.body.removeChild(textArea);
    }

    /**
     * 印刷前の準備処理
     * @param {Object} options - 印刷オプション
     * @returns {string} - 元のページタイトル
     */
    beforePrint(options = {}) {
        document.body.classList.add('printing');
        
        this.originalTitle = document.title;
        
        // ページタイトルの設定
        if (options.title) {
            document.title = options.title;
        } else if (options.selectors) {
            const { yearSelector, monthSelector, userSelector } = options.selectors;
            const yearEl = this.container.querySelector(yearSelector);
            const monthEl = this.container.querySelector(monthSelector);
            const userEl = this.container.querySelector(userSelector);
            
            if (yearEl && monthEl && userEl) {
                const year = yearEl.value;
                const month = monthEl.value;
                const userName = userEl.selectedOptions[0]?.text || '';
                document.title = `月別出勤簿_${userName}_${year}年${month}月`;
            }
        }
        
        return this.originalTitle;
    }

    /**
     * 印刷後の後処理
     * @param {string} originalTitle - 元のページタイトル
     */
    afterPrint(originalTitle = null) {
        document.body.classList.remove('printing');
        document.title = originalTitle || this.originalTitle;
    }

    /**
     * 印刷実行
     * @param {Object} options - 印刷オプション
     */
    executePrint(options = {}) {
        const originalTitle = this.beforePrint(options);
        
        // 印刷実行
        window.print();
        
        // 印刷完了後の処理（少し遅延）
        setTimeout(() => {
            this.afterPrint(originalTitle);
        }, 1000);
    }

    /**
     * 月別出勤簿印刷の実行
     * @param {HTMLElement} container - コンテナ要素
     */
    printMonthlyReport(container = null) {
        const targetContainer = container || this.container;
        
        this.executePrint({
            selectors: {
                yearSelector: '#monthlyYearSelect',
                monthSelector: '#monthlyMonthSelect',
                userSelector: '#monthlyUserSelect'
            }
        });
    }

    /**
     * 破棄処理
     */
    destroy() {
        this.container = null;
        this.originalTitle = '';
        this.isInitialized = false;
    }
}