// public/js/modules/shared/components/attendance-table.js
// 出勤記録テーブル表示の一元管理コンポーネント（修正版）

import { calculateWorkHours, calculateBreakDuration, getJapaneseDayOfWeek } from '../../../utils/date-time.js';
import { isJapaneseHoliday } from '../../../utils/holidays.js';

export class AttendanceTable {
  constructor(parentModule) {
    this.parent = parentModule;
    this.userRole = parentModule.userRole || parentModule.app.currentUser.role;
  }

  /**
   * 出勤記録テーブルを生成
   * @param {Array} records - 出勤記録データ
   * @param {Object} options - 表示オプション
   * @returns {string} HTML文字列
   */
  generateTable(records, options = {}) {
    const {
      showOnlyWorking = false,      // 出勤者のみ表示
      showDate = false,              // 日付列を表示
      showOperations = true,         // 操作列を表示
      context = 'attendance',        // 'attendance' or 'monthly'
      currentDate = null             // 現在の日付（月別出勤簿用）
    } = options;

    // 出勤者、出勤予定者のみフィルタリング
      const filteredRecords = showOnlyWorking
        ? records.filter(record => {
            const day = getJapaneseDayOfWeek(record.date);
            const workweekArray = (record.workweek ?? '').split(',');
            const isPlanned = workweekArray.includes(day);      //曜日で予定者を抽出
            const isPresent = !!record.clock_in;      //出勤時刻判定
            return isPlanned || isPresent;
          })
        : records;

    if (filteredRecords.length === 0) {
      return this.generateEmptyState(showOnlyWorking);
    }

    // ユーザーのロールを取得（テーブルのクラスに追加用）
    const userRole = filteredRecords[0]?.user_role || '';
    const roleClass = userRole ? `attendance-table-${userRole}` : '';

    return `
      <div class="table-responsive attendance-table ${roleClass}">
        <table class="table table-hover">
          ${this.generateTableHeader(options)}
          <tbody>
            ${filteredRecords.map(record =>
              this.generateTableRow(record, options)
            ).join('')}
          </tbody>
          ${this.generateTableFooter(filteredRecords, options)}
        </table>
      </div>
    `;
  }

  /**
   * テーブルヘッダー生成
   */
  generateTableHeader(options) {
    const { showDate, showOperations, context } = options;
    
    // 月別出勤簿用のヘッダー
    if (context === 'monthly') {
      // サービス区分列と送迎列の表示判定
      const showServiceType = options.showServiceType || false;
      const showTransportation = options.showTransportation || false;
      // 中抜け列表示判定（staffのみ）
      const showNakanuke = options.targetUserRole === 'staff';
      // userの場合は「日報」、staffの場合は「操作」
      const operationLabel = options.targetUserRole === 'user' ? '日報' : '操作';
      return `
        <thead class="table-primary">
          <tr>
            ${showDate ? '<th class="text-center" width="5%">日</th><th class="text-center" width="5%">曜</th>' : ''}
            ${showServiceType ? '<th class="text-center" width="6%">区分</th>' : ''}
            <th class="text-center" width="10%">出勤</th>
            <th class="text-center" width="10%">退勤</th>
            <th class="text-center" width="12%">休憩</th>
            ${showNakanuke ? '<th class="text-center nakanuke-col" width="6%">中抜け</th>' : ''}
            <th class="text-center" width="8%">実働</th>
            ${showTransportation ? '<th class="text-center transportation-col" width="4%">迎</th><th class="text-center transportation-col" width="4%">送</th>' : ''}
            <th class="text-center status-col" width="8%">状態</th>
            ${showOperations ? `<th class="text-center operation-col" width="20%">${operationLabel}</th>` : ''}
          </tr>
        </thead>
      `;
    }

    // 通常の出勤管理用ヘッダー
    return `
      <thead class="table-light">
        <tr>
          ${showDate ? '<th class="text-center" width="10%">日付</th>' : ''}
          <th class="text-center" width="12%">ユーザー</th>
          <th class="text-center" width="8%">権限</th>
          <th class="text-center" width="8%">出勤</th>
          <th class="text-center" width="8%">退勤</th>
          <th class="text-center" width="10%">休憩</th>
          <th class="text-center" width="5%">中抜け</th>
          <th class="text-center" width="7%">実働</th>
          <th class="text-center" width="8%">状態</th>
          <th class="text-center" width="10%">日報・コメント</th>
          ${showOperations ? '<th class="text-center" width="14%">操作</th>' : ''}
        </tr>
      </thead>
    `;
  }

  /**
   * テーブル行生成
   */
  generateTableRow(record, options) {
    const { showDate, showOperations, context, currentDate } = options;
    
    // 月別出勤簿用の特別な処理
    if (context === 'monthly') {
      return this.generateMonthlyTableRow(record, options);
    }

        // 月別出勤簿用の特別な処理
    if (!record.clock_in  && context !== 'monthly') {
      record.clock_in = `出勤予定`
    }

    // 通常の出勤管理用の行生成
    const roleClass = this.getRoleColor(record.user_role);
    const roleDisplay = this.getRoleDisplayName(record.user_role);
    const breakDisplay = this.formatBreakTime(record);
    const netHours = this.calculateWorkDurationDay(record);
    const statusBadge = this.getStatusBadge(record.status || 'normal');
    const nakanukeDisplay = this.formatNakanukeTime(record);
    const nakanukeStatusBadge = this.getNakanukeStatusBadge(record);
    const pendingBadge = record.has_pending_correction ? '<br><span class="badge bg-warning text-dark mt-1"><i class="fas fa-clock"></i> 承認待ち</span>' : '';
    const reportStatus = this.getReportCommentStatus(record);
    const operations = showOperations ?
      this.generateOperationButtons(record, context, currentDate) : '';

    return `
      <tr>
        ${showDate ? `<td>${this.formatDateCell(record.date)}</td>` : ''}
        <td><strong>${record.user_name || 'Unknown'}</strong></td>
        <td><span class="badge bg-${roleClass}">${roleDisplay}</span></td>
        <td class="text-center">${record.clock_in || '-'}</td>
        <td class="text-center">${record.clock_out || '-'}</td>
        <td class="text-center small">${breakDisplay}</td>
        <td class="text-center">${nakanukeDisplay}</td>
        <td class="text-center">${netHours || '-'}</td>
        <td class="text-center">${statusBadge}${nakanukeStatusBadge}${pendingBadge}</td>
        <td class="text-center">${reportStatus}</td>
        ${showOperations ? `<td class="text-center">${operations}</td>` : ''}
      </tr>
    `;
  }

  /**
   * 月別出勤簿用のテーブル行生成
   */
  generateMonthlyTableRow(record, options) {
    const { showOperations } = options;
    const showServiceType = options.showServiceType || false;
    const showTransportation = options.showTransportation || false;
    const showNakanuke = options.targetUserRole === 'staff';

    // 休憩時間表示
    const breakDisplay = this.formatBreakTime(record);

    // 中抜け表示
    const nakanukeDisplay = this.formatNakanukeTime(record);
    const nakanukeStatusBadge = this.getNakanukeStatusBadge(record);

    // 実働時間計算
    const netHours = this.calculateWorkDurationDay(record);

    // ステータス表示（利用者は非表示、スタッフ・管理者は表示）
    let statusBadge = '-';
    if (record.user_role !== 'user') {
      if (record.status) {
        statusBadge = this.getStatusBadge(record.status);
      } else if (record.clock_in) {
        statusBadge = this.getStatusBadge('normal');
      }
    }

    // 操作ボタン（日報マークを除去）
    const operations = showOperations ?
      this.generateMonthlyOperationButtons(record, 'monthly', record.date) : '';

    // 行クラス（日曜・土曜・祝日の色付け）
    let rowClass = '';
    const recordDate = new Date(record.date + 'T00:00:00');
    if (record.dayOfWeek === 0 || isJapaneseHoliday(recordDate)) rowClass = 'table-danger';
    else if (record.dayOfWeek === 6) rowClass = 'table-info';

    // 日の列をクリック可能にするためのdata属性を追加
    let dayCellClass = 'text-center';
    let dayCellAttrs = '';

    if (record.user_role === 'user') {
      // 利用者：日付クリックで編集モーダルを開く（視覚変化なし）
      const editData = {
        'data-record-id': record.id || '',
        'data-user-id': record.user_id,
        'data-user-name': record.user_name,
        'data-user-role': record.user_role,
        'data-date': record.date,
        'data-clock-in': record.clock_in || '',
        'data-clock-out': record.clock_out || '',
        'data-break-start': record.break_start_time || '',
        'data-break-end': record.break_end_time || '',
        'data-status': record.status || 'normal',
        'data-service-type': record.service_type || ''
      };
      dayCellAttrs = Object.entries(editData).map(([k, v]) => `${k}="${v}"`).join(' ');
      dayCellClass = 'text-center monthly-user-day-edit';
    } else {
      // スタッフ：日付クリックで日報表示（現状通り）
      const hasReport = ((record.user_role === 'staff' || record.user_role === 'admin') && record.staff_report_id);
      if (hasReport) {
        dayCellAttrs = `data-user-id="${record.user_id}" data-user-name="${record.user_name}" data-date="${record.date}" style="cursor: pointer;"`;
        dayCellClass = 'text-center monthly-day-cell';
      }
    }

    // サービス区分表示（ユーザーのservice_typeで判定、出勤日のみ）
    let serviceTypeCell = '';
    if (showServiceType) {
      let serviceLabel = '';
      if (record.clock_in) {
        serviceLabel = record.service_type === 'commute' ? '通所' : record.service_type === 'home' ? '在宅' : '';
      }
      serviceTypeCell = `<td class="text-center">${serviceLabel}</td>`;
    }

    // 送迎表示（出勤記録がある通所利用者のみ）
    let transportationCells = '';
    if (showTransportation) {
      const hasTransportation = record.transportation === 1 && record.clock_in;
      transportationCells = `<td class="text-center transportation-col">${hasTransportation ? '1' : ''}</td><td class="text-center transportation-col">${hasTransportation ? '1' : ''}</td>`;
    }

    // 中抜け列（staffのみ）
    const nakanukeCell = showNakanuke ? `<td class="text-center nakanuke-col">${nakanukeDisplay}</td>` : '';

    return `
      <tr class="${rowClass}">
        <td class="${dayCellClass}" ${dayCellAttrs}>${record.day}</td>
        <td class="text-center">${record.dayName}</td>
        ${serviceTypeCell}
        <td class="text-center">${record.clock_in || '-'}</td>
        <td class="text-center">${record.clock_out || '-'}</td>
        <td class="text-center small">${breakDisplay}</td>
        ${nakanukeCell}
        <td class="text-center">${netHours || '-'}</td>
        ${transportationCells}
        <td class="text-center status-col">${statusBadge}${nakanukeStatusBadge}${record.has_pending_correction ? '<br><span class="badge bg-warning text-dark mt-1" style="font-size:0.65em;"><i class="fas fa-clock"></i> 承認待ち</span>' : ''}</td>
        ${showOperations ? `<td class="text-center operation-col">${operations}</td>` : ''}
      </tr>
    `;
  }

   /**
   * 休憩時間のフォーマット（シンプル版）
   */
  formatBreakTime(record) {
    
    // スタッフ
    if (record.user_role === 'staff') {
      if (record.break_start) {
        return record.break_end ? 
          `${record.break_start}〜${record.break_end}` : 
          `${record.break_start}〜`;
      }
    }
    // 利用者
    else
      if (record.break_start_time) {
        return record.break_end_time ? 
          `${record.break_start_time}〜${record.break_end_time}` : 
          `${record.break_start_time}〜`;
      }  
    return '-';
  }

  /**
   * 中抜け時間のフォーマット
   */
  formatNakanukeTime(record) {
    if (record.user_role !== 'staff') return '-';

    // 中抜け中（開始あり・経過分0）
    if (record.nakanuke_start && (!record.nakanuke_minutes || record.nakanuke_minutes === 0)) {
      return `${record.nakanuke_start}〜`;
    }
    // 中抜け完了
    if (record.nakanuke_minutes && record.nakanuke_minutes > 0) {
      return `${record.nakanuke_minutes}分`;
    }
    return '-';
  }

  /**
   * 中抜けステータスバッジ取得
   */
  getNakanukeStatusBadge(record) {
    if (record.user_role !== 'staff') return '';

    // 中抜け中
    if (record.nakanuke_start && (!record.nakanuke_minutes || record.nakanuke_minutes === 0)) {
      return '<br><span class="badge bg-secondary">中抜け中</span>';
    }
    // 中抜け終了済み
    if (record.nakanuke_minutes && record.nakanuke_minutes > 0) {
      return '<br><span class="badge bg-secondary">中抜け</span>';
    }
    return '';
  }

  /**
   * 実働時間計算（休憩時間・中抜け時間考慮）
   */

  calculateWorkDurationDay(record) {
    if (!record.clock_in || !record.clock_out) return null;

    try {
      // 基本の勤務時間を計算
      const workHours = calculateWorkHours(
        record.clock_in,
        record.clock_out,
        0 // 休憩時間は後で引く
      );
      if (!workHours) return null;

      // 休憩時間の取得（実際の打刻時間から計算）
      let breakMinutes = 0;

      // スタッフ・管理者（実際の休憩開始・終了から計算）
      if (record.user_role === 'staff' || record.user_role === 'admin') {
        if (record.break_start && record.break_end) {
          breakMinutes = calculateBreakDuration(record.break_start, record.break_end);
        }
      }
      // 利用者（実際の休憩時間）
      if (record.user_role === 'user') {
        if (record.break_start_time && record.break_end_time) {
          breakMinutes = calculateBreakDuration(record.break_start_time, record.break_end_time);
        }
      }

      // 中抜け時間の控除（スタッフのみ）
      let nakanukeMinutes = 0;
      if (record.user_role === 'staff' && record.nakanuke_minutes) {
        nakanukeMinutes = parseInt(record.nakanuke_minutes) || 0;
      }

      const netMinutes = Math.round((workHours - (breakMinutes / 60) - (nakanukeMinutes / 60)) * 60);
      if (netMinutes <= 0) return null;
      const h = Math.floor(netMinutes / 60);
      const m = netMinutes % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

    } catch (error) {
      console.error('勤務時間計算エラー:', error);
      return null;
    }
  }

  /**
   * 日報・コメント状況の表示
   */
  getReportCommentStatus(record) {
    if (record.user_role !== 'user') {
      return '<span class="text-muted">-</span>';
    }
    
    let status = '';
    
    if (record.report_id) {
      status += '<span class="badge bg-success me-1">日報</span>';
      
      if (record.comment_id || record.comment) {
        status += '<span class="badge bg-info">コメント済</span>';
      } else {
        status += '<span class="badge bg-warning">コメント未</span>';
      }
    } else if (record.clock_out) {
      status = '<span class="badge bg-danger">日報未提出</span>';
    } else {
      status = '<span class="text-muted">-</span>';
    }
    
    return status;
  }

  /**
   * 操作ボタン生成
   */
  generateOperationButtons(record, context, currentDate) {
    const buttons = [];
    const date = currentDate || record.date;

    // 日報詳細ボタン（利用者の日報がある場合）
    if (record.user_role === 'user' && record.report_id) {
      buttons.push(`
        <button class="btn btn-sm btn-outline-primary btn-show-report"
                data-user-id="${record.user_id}"
                data-user-name="${record.user_name}"
                data-date="${date}"
                title="日報詳細・コメント">
          <i class="fas fa-file-alt"></i>
        </button>
      `);
    }

    // スタッフ日報詳細ボタン（adminのみ、スタッフの日報がある場合）
    if (this.userRole === 'admin' && record.user_role === 'staff' && record.staff_report_id) {
      buttons.push(`
        <button class="btn btn-sm btn-outline-info btn-show-staff-report"
                data-user-id="${record.user_id}"
                data-user-name="${record.user_name}"
                data-date="${date}"
                title="スタッフ日報詳細">
          <i class="fas fa-file-alt"></i>
        </button>
      `);
    }
    
    // 編集ボタン（管理者またはスタッフ）
    // admin画面ではuserの編集ボタンは非表示（staffのみ表示）
    // スタッフは利用者の出勤記録のみ編集可能
    if ((this.userRole === 'admin' && record.user_role !== 'user') || (this.userRole === 'staff' && record.user_role === 'user')) {
      const editData = {
        'data-record-id': record.id || '',
        'data-user-id': record.user_id,
        'data-user-name': record.user_name,
        'data-user-role': record.user_role,
        'data-date': date,
        'data-clock-in': record.clock_in || '',
        'data-clock-out': record.clock_out || '',
        'data-status': record.status || 'normal',
        'data-service-type': record.service_type || '',
        'data-nakanuke-minutes': record.nakanuke_minutes || 0
      };

      // 休憩データの追加
      if (record.user_role === 'user') {
        editData['data-break-start'] = record.break_start_time || '';
        editData['data-break-end'] = record.break_end_time || '';
      } else {
        editData['data-break-start'] = record.break_start || '';
        editData['data-break-end'] = record.break_end || '';
      }

      const editAttrs = Object.entries(editData)
        .map(([key, value]) => `${key}="${value}"`)
        .join(' ');

      buttons.push(`
        <button class="btn btn-sm btn-outline-warning btn-edit-attendance"
                ${editAttrs}
                title="編集">
          <i class="fas fa-edit"></i>
        </button>
      `);
    }

    return buttons.length > 0 ?
      `<div class="btn-group" role="group">${buttons.join('')}</div>` :
      '-';
  }

  /**
   * 月別出勤簿用の操作ボタン生成（日報マークなし）
   */
  generateMonthlyOperationButtons(record, context, currentDate) {
    const buttons = [];
    const date = currentDate || record.date;

    // 利用者の場合：日報マーク表示
    if (record.user_role === 'user') {
      // 日報ボタン（日報がある場合）
      if (record.report_id) {
        buttons.push(`
          <button class="btn btn-sm btn-outline-primary btn-show-report"
                  data-user-id="${record.user_id}"
                  data-user-name="${record.user_name}"
                  data-date="${date}"
                  title="日報">
            <i class="fas fa-file-alt"></i>
          </button>
        `);
      }

      // admin画面：日報マークのみ（操作は日付クリックで行う）
      if (this.userRole === 'admin') {
        return buttons.length > 0 ?
          `<div class="btn-group" role="group">${buttons.join('')}</div>` :
          '-';
      }

      // staff画面：日報マーク＋編集ボタンを並べて表示
    }

    // 編集ボタン（admin→staff記録、staff→user記録）
    if (this.userRole === 'admin' || (this.userRole === 'staff' && record.user_role === 'user')) {
      const editData = {
        'data-record-id': record.id || '',
        'data-user-id': record.user_id,
        'data-user-name': record.user_name,
        'data-user-role': record.user_role,
        'data-date': date,
        'data-clock-in': record.clock_in || '',
        'data-clock-out': record.clock_out || '',
        'data-status': record.status || 'normal',
        'data-service-type': record.service_type || '',
        'data-nakanuke-minutes': record.nakanuke_minutes || 0
      };

      // 休憩データ（利用者とスタッフで参照先が異なる）
      if (record.user_role === 'user') {
        editData['data-break-start'] = record.break_start_time || '';
        editData['data-break-end'] = record.break_end_time || '';
      } else {
        editData['data-break-start'] = record.break_start || '';
        editData['data-break-end'] = record.break_end || '';
      }

      const editAttrs = Object.entries(editData)
        .map(([key, value]) => `${key}="${value}"`)
        .join(' ');

      buttons.push(`
        <button class="btn btn-sm btn-outline-warning btn-edit-attendance"
                ${editAttrs}
                title="編集">
          <i class="fas fa-edit"></i>
        </button>
      `);
    }

    return buttons.length > 0 ?
      `<div class="btn-group" role="group">${buttons.join('')}</div>` :
      '-';
  }

  /**
   * 空状態の表示
   */
  generateEmptyState(showOnlyWorking) {
    const message = showOnlyWorking ? 
      '現在出勤している人はいません' : 
      '該当する記録がありません';
    
    return `
      <div class="text-center p-4">
        <i class="fas fa-inbox fa-3x text-muted mb-3"></i>
        <p class="text-muted">${message}</p>
      </div>
    `;
  }

  /**
   * テーブルフッター生成（集計情報）
   */
  generateTableFooter(records, options) {
    if (!options.showFooter) return '';
    
    const workingCount = records.filter(r => r.clock_in && !r.clock_out).length;
    const finishedCount = records.filter(r => r.clock_in && r.clock_out).length;
    
    return `
      <tfoot class="table-secondary">
        <tr>
          <td colspan="${options.showDate ? 9 : 8}" class="text-end">
            出勤中: ${workingCount}名 | 退勤済: ${finishedCount}名
          </td>
        </tr>
      </tfoot>
    `;
  }

  /**
   * 日付セルのフォーマット
   */
  formatDateCell(date) {
    const d = new Date(date);
    const day = d.getDate();
    const weekday = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
    
    return `${day}(${weekday})`;
  }

  // ヘルパーメソッド（親モジュールのメソッドを利用）
  getRoleColor(role) {
    return this.parent.getRoleColor ? 
      this.parent.getRoleColor(role) : 
      { 'user': 'primary', 'staff': 'success', 'admin': 'danger' }[role] || 'secondary';
  }

  getRoleDisplayName(role) {
    return this.parent.getRoleDisplayName ? 
      this.parent.getRoleDisplayName(role) : 
      { 'user': '利用者', 'staff': 'スタッフ', 'admin': '管理者' }[role] || role;
  }

  getStatusBadge(status) {
    return this.parent.getStatusBadge ? 
      this.parent.getStatusBadge(status) : 
      `<span class="badge bg-${this.getStatusColor(status)}">${this.getStatusText(status)}</span>`;
  }

  getStatusColor(status) {
    const colors = {
      'normal': 'success',
      'late': 'warning',
      'early': 'info',
      'absence': 'danger',
      'paid_leave': 'primary'
    };
    return colors[status] || 'secondary';
  }

  getStatusText(status) {
    const texts = {
      'normal': '正常',
      'late': '遅刻',
      'early': '早退',
      'absence': '欠勤',
      'paid_leave': '有給'
    };
    return texts[status] || status;
  }
}