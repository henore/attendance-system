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
                /* タイトル */
                .monthly-attendance-report h5 {
                    font-size: 12px !important;
                    margin-bottom: 6px !important;
                    text-align: center;
                    border-bottom: 1px solid #333;
                    padding-bottom: 3px;
                }
                
                .monthly-attendance-report h5 small {
                    font-size: 8px !important;
                    display: block;
                    margin-top: 2px;
                }
                
                /* テーブル */
                .table-responsive {
                    overflow: visible !important;
                }
                
                .monthly-attendance-report table {
                    font-size: 7px !important;
                    width: 100% !important;
                    border-collapse: collapse !important;
                    margin: 0 !important;
                }
                
                .monthly-attendance-report th,
                .monthly-attendance-report td {
                    padding: 1px 2px !important;
                    border: 0.5px solid #333 !important;
                    text-align: center !important;
                    vertical-align: middle !important;
                    font-size: 7px !important;
                    line-height: 1 !important;
                    height: 14px !important;
                }
                
                .monthly-attendance-report thead th {
                    background-color: #f0f0f0 !important;
                    font-weight: bold !important;
                    color: black !important;
                    font-size: 6px !important;
                    height: 16px !important;
                }
                
                /* 列幅調整 */
                .date-column { width: 6% !important; }
                .time-column { width: 9% !important; }
                .status-column { width: 8% !important; }
                .work-hours-column { width: 10% !important; }
                
                /* 土日・祝日のスタイル（行レベル） */
                .weekend-row, .table-secondary {
                    background-color: #f8f8f8 !important;
                }
                
                .weekend-row td, .table-secondary td {
                    background-color: #f8f8f8 !important;
                    color: black !important;
                }
                
                .text-danger.fw-bold {
                    color: #dc3545 !important;
                    font-weight: bold !important;
                }
                
                /* 状態別カラー（印刷時も見やすく） */
                .text-success { color: #198754 !important; }
                .text-warning { color: #fd7e14 !important; }
                .text-danger { color: #dc3545 !important; }
                .text-primary { color: #0d6efd !important; }
                .text-info { color: #0dcaf0 !important; }
                .text-secondary { color: #6c757d !important; }
                .text-muted { color: #6c757d !important; }
                
                /* フッター */
                .monthly-attendance-report tfoot th {
                    background-color: #e8e8e8 !important;
                    font-weight: bold !important;
                    color: black !important;
                    font-size: 8px !important;
                    border: 1px solid #333 !important;
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