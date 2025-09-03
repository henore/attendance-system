// public/js/modules/shared/components/attendance-table.js
// 出勤記録テーブル表示の一元管理コンポーネント（修正版）

import { calculateWorkHours ,getJapaneseDayOfWeek} from '../../../utils/date-time.js';

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
    console.log('generateTableデータ内容確認', records);
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
 
    return `
      <div class="table-responsive attendance-table">
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
      return `
        <thead class="table-primary">
          <tr>
            ${showDate ? '<th width="5%">日</th><th width="5%">曜</th>' : ''}
            <th width="10%">出勤</th>
            <th width="10%">退勤</th>
            <th width="15%">休憩</th>
            <th width="8%">実働</th>
            <th width="8%">状態</th>
            ${showOperations ? '<th width="24%">操作</th>' : ''}
          </tr>
        </thead>
      `;
    }
    
    // 通常の出勤管理用ヘッダー
    return `
      <thead class="table-light">
        <tr>
          ${showDate ? '<th width="10%">日付</th>' : ''}
          <th width="15%">ユーザー</th>
          <th width="10%">権限</th>
          <th width="10%">出勤</th>
          <th width="10%">退勤</th>
          <th width="12%">休憩</th>
          <th width="8%">実働</th>
          <th width="8%">状態</th>
          <th width="12%">日報・コメント</th>
          ${showOperations ? '<th width="15%">操作</th>' : ''}
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
        <td class="text-center">${netHours ? netHours + 'h' : '-'}</td>
        <td class="text-center">${statusBadge}</td>
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
    
    // 休憩時間表示
    const breakDisplay = this.formatBreakTime(record);
    
    // 実働時間計算
    const netHours = this.calculateWorkDurationDay(record);

    // ステータス表示
    const statusBadge = record.clock_in ? 
      this.getStatusBadge(record.status || 'normal') : '-';
    
    // 操作ボタン（日報マークを除去）
    const operations = showOperations ? 
      this.generateMonthlyOperationButtons(record, 'monthly', record.date) : '';

    // 行クラス（日曜・土曜の色付け）
    let rowClass = '';
    if (record.dayOfWeek === 0) rowClass = 'table-danger';
    else if (record.dayOfWeek === 6) rowClass = 'table-info';

    // 日の列をクリック可能にするためのdata属性を追加
    const dayClickAttrs = record.user_role === 'user' && record.report_id ? 
      `data-user-id="${record.user_id}" data-user-name="${record.user_name}" data-date="${record.date}" style="cursor: pointer;"` : '';

    return `
      <tr class="${rowClass}">
        <td class="text-center monthly-day-cell" ${dayClickAttrs}>${record.day}</td>
        <td class="text-center">${record.dayName}</td>
        <td class="text-center">${record.clock_in || '-'}</td>
        <td class="text-center">${record.clock_out || '-'}</td>
        <td class="text-center small">${breakDisplay}</td>
        <td class="text-center">${netHours ? netHours + 'h' : '-'}</td>
        <td class="text-center">${statusBadge}</td>
        ${showOperations ? `<td class="text-center">${operations}</td>` : ''}
      </tr>
    `;
  }

   /**
   * 休憩時間のフォーマット（シンプル版）
   */
  formatBreakTime(record) {
    console.log('[DEBUG formatBreakTime] レコード:', {
      user_name: record.user_name,
      user_role: record.user_role,
      break_start: record.break_start,
      break_end: record.break_end,
      break_start_time: record.break_start_time,
      break_end_time: record.break_end_time,
    });
    
    // スタッフ
    if (record.user_role === 'staff') {
      if (record.break_start) {
        console.log('[DEBUG] スタッフ/管理者の休憩:', record.break_start, record.break_end);
        return record.break_end ? 
          `${record.break_start}〜${record.break_end}` : 
          `${record.break_start}〜`;
      }
    }
    // 利用者
    else
      if (record.break_start_time) {
        console.log('[DEBUG] 利用者の休憩(break_start_time):', record.break_start_time, record.break_end_time);
        return record.break_end_time ? 
          `${record.break_start_time}〜${record.break_end_time}` : 
          `${record.break_start_time}〜`;
      }  
    console.log('[DEBUG] 休憩なし');
    return '-';
  }

  /**
   * 実働時間計算（休憩時間考慮）
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
      console.log('[DEBUG] 実働のスタッフ休憩:', record.break_start, record.break_end);
      console.log('[DEBUG] 実働のUSER休憩:', record.break_start_time, record.break_end_time);
      if (!workHours) return null;
      
        // 休憩時間の取得
        let breakMinutes = 0;
        
        // スタッフ・管理者（固定60分）
        if (record.user_role === 'staff') {
          if (record.break_start && record.break_end) {
            breakMinutes = 60;
          }
        }
        // 利用者（実際の休憩時間）
        if (record.user_role === 'user') {
          if (record.break_start_time && record.break_end_time){
            breakMinutes = 60; // デフォルト
          }
        }
      
      const netHours = workHours - (breakMinutes / 60);
      console.log('[DEBUG] 実働時間:', netHours);
      return netHours.toFixed(2);
      
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
    
    // 編集ボタン（管理者のみ）
    if (this.userRole === 'admin') {
      const editData = {
        'data-record-id': record.id || '',
        'data-user-id': record.user_id,
        'data-user-name': record.user_name,
        'data-user-role': record.user_role,
        'data-date': date,
        'data-clock-in': record.clock_in || '',
        'data-clock-out': record.clock_out || '',
        'data-status': record.status || 'normal'
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
    
    // 編集ボタン（管理者のみ）
    if (this.userRole === 'admin') {
      const editData = {
        'data-record-id': record.id || '',
        'data-user-id': record.user_id,
        'data-user-name': record.user_name,
        'data-user-role': record.user_role,
        'data-date': date,
        'data-clock-in': record.clock_in || '',
        'data-clock-out': record.clock_out || '',
        'data-status': record.status || 'normal'
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