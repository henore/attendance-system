// public/js/modules/shared/modals/report-detail-content.js
// 日報詳細モーダルのコンテンツ生成（HTML描画・ラベル変換・ユーティリティ）

/**
 * 日報詳細コンテンツを生成
 * @param {Object} data - currentData
 * @param {string} userRole - 表示ユーザーの権限
 * @returns {string} HTML
 */
export function generateDetailContent(data, userRole) {
  const { user, attendance, report, comment, breakRecord, staffReport } = data;

  // 休憩時間の表示
  let breakTimeDisplay = '-';
  if (user.role === 'user') {
    if (breakRecord && breakRecord.start_time) {
      breakTimeDisplay = breakRecord.end_time ?
        `${breakRecord.start_time}〜${breakRecord.end_time} (${breakRecord.duration || 60}分)` :
        `${breakRecord.start_time}〜 (進行中)`;
    }
  } else if (user.role !== 'user' && attendance) {
    if (attendance.break_start) {
      breakTimeDisplay = attendance.break_end ?
        `${attendance.break_start}〜${attendance.break_end} (60分)` :
        `${attendance.break_start}〜 (進行中)`;
    }
  }

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
          <div class="detail-value">${breakTimeDisplay}</div>
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

    <!-- 日報内容（利用者のみ） -->
    ${user.role === 'user' && report ? generateUserReportSection(report, userRole) : ''}

    <!-- サービス提供記録（staff/adminの場合） -->
    ${(user.role === 'staff' || user.role === 'admin') && staffReport ? `
      <div class="staff-daily-report-section">
        <h6><i class="fas fa-clipboard-list"></i> サービス提供記録</h6>

        <div class="mb-3">
          <label class="past-form-label"><i class="fas fa-tasks"></i> 本日のサービス提供記録及び業務報告</label>
          ${renderStaffWorkReport(staffReport.work_report)}
        </div>

        ${staffReport.communication ? `
          <div class="mb-3">
            <label class="past-form-label"><i class="fas fa-clipboard"></i> 業務報告</label>
            <div class="text-content bg-light p-3 rounded">${staffReport.communication}</div>
          </div>
        ` : ''}
      </div>

      <hr>
    ` : ''}
  `;
}

/**
 * 利用者日報セクションを生成（admin編集モード対応）
 */
function generateUserReportSection(report, userRole) {
  const isAdmin = userRole === 'admin';
  const labelClass = isAdmin ? 'form-label' : 'past-form-label';

  return `
    <div class="report-summary">
      <h6><i class="fas fa-file-alt"></i> 日報内容</h6>

      <!-- 作業内容 -->
      <div class="mb-3">
        <label class="past-form-label"><i class="fas fa-tasks"></i> 作業内容</label>
        ${isAdmin ? `
          <textarea
            class="form-control admin-editable"
            id="editWorkContent"
            rows="3"
            maxlength="500">${report.work_content || ''}</textarea>
        ` : `
          <div class="text-content">${report.work_content || ''}</div>
        `}
      </div>

      <!-- 作業場所・PC番号・施設外就労先 -->
      <div class="row mb-3">
        ${isAdmin ? `
          <div class="col-4">
            <label class="form-label">
              <i class="fas fa-building text-info"></i> 施設外就労先
            </label>
            <input
              type="text"
              class="form-control admin-editable"
              id="editExternalWorkLocation"
              value="${report.external_work_location || ''}"
              maxlength="100">
          </div>
          <div class="col-4">
            <label class="form-label">
              <i class="fas fa-map-marker-alt text-primary"></i> 作業場所
            </label>
            <select class="form-control admin-editable" id="editWorkLocation">
              <option value="">選択してください</option>
              <option value="office" ${report.work_location === 'office' ? 'selected' : ''}>通所</option>
              <option value="home" ${report.work_location === 'home' ? 'selected' : ''}>在宅</option>
            </select>
          </div>
          <div class="col-4">
            <label class="form-label">
              <i class="fas fa-desktop text-success"></i> PC番号
            </label>
            <select class="form-control admin-editable" id="editPcNumber">
              <option value="">選択してください</option>
              ${Array.from({length: 20}, (_, i) => i + 1).map(num =>
                `<option value="${num}" ${report.pc_number == num ? 'selected' : ''}>${num}</option>`
              ).join('')}
              ${['A', 'B', 'C', 'D'].map(letter =>
                `<option value="${letter}" ${report.pc_number === letter ? 'selected' : ''}>${letter}</option>`
              ).join('')}
            </select>
          </div>
        ` : `
          ${report.external_work_location ? `
            <div class="col-6">
              <label class="past-form-label">
                <i class="fas fa-building text-info"></i> 施設外就労先
              </label>
              <div class="past-form-value text-info">${report.external_work_location}</div>
            </div>
          ` : ''}
          ${report.work_location ? `
            <div class="col-3">
              <label class="past-form-label">
                <i class="fas fa-map-marker-alt text-primary"></i> 作業場所
              </label>
              <div class="past-form-value text-primary">${getWorkLocationLabel(report.work_location)}</div>
            </div>
          ` : ''}
          ${report.pc_number ? `
            <div class="col-3">
              <label class="past-form-label">
                <i class="fas fa-desktop text-success"></i> PC番号
              </label>
              <div class="past-form-value text-success">${report.pc_number}</div>
            </div>
          ` : ''}
        `}
      </div>

      <!-- 連絡時間 -->
      ${isAdmin ? `
      <div class="row mb-3">
        <div class="col-6">
          <label class="form-label"><i class="fas fa-phone"></i> 連絡時間1回目</label>
          <input type="time" class="form-control admin-editable" id="editContactTime1" value="${report.contact_time_1 || ''}">
        </div>
        <div class="col-6">
          <label class="form-label"><i class="fas fa-phone"></i> 連絡時間2回目</label>
          <input type="time" class="form-control admin-editable" id="editContactTime2" value="${report.contact_time_2 || ''}">
        </div>
      </div>
      ` : `
      ${report.contact_time_1 || report.contact_time_2 ? `
      <div class="row mb-3">
        <div class="col-6">
          <label class="past-form-label"><i class="fas fa-phone"></i> 連絡時間1回目</label>
          <div class="past-form-value">${report.contact_time_1 || '-'}</div>
        </div>
        <div class="col-6">
          <label class="past-form-label"><i class="fas fa-phone"></i> 連絡時間2回目</label>
          <div class="past-form-value">${report.contact_time_2 || '-'}</div>
        </div>
      </div>
      ` : ''}
      `}

      <!-- 健康状態 -->
      <div class="row mb-3">
        <div class="col-3">
          <label class="${labelClass}"><i class="fas fa-thermometer-half"></i> 体温</label>
          ${isAdmin ? `
            <input
              type="number"
              class="form-control admin-editable"
              id="editTemperature"
              value="${report.temperature || ''}"
              min="35"
              max="42"
              step="0.1">
          ` : `
            <div class="past-form-value">${report.temperature}℃</div>
          `}
        </div>
        <div class="col-3">
          <label class="${labelClass}"><i class="fas fa-utensils"></i> 食欲</label>
          ${isAdmin ? `
            <select class="form-control admin-editable" id="editAppetite">
              <option value="good" ${report.appetite === 'good' ? 'selected' : ''}>良好</option>
              <option value="none" ${report.appetite === 'none' ? 'selected' : ''}>なし</option>
            </select>
          ` : `
            <div class="past-form-value">${getAppetiteLabel(report.appetite)}</div>
          `}
        </div>
        <div class="col-3">
          <label class="${labelClass}"><i class="fas fa-pills"></i> 頓服服用</label>
          ${isAdmin ? `
            <select class="form-control admin-editable" id="editMedicationTime">
              <option value="">なし</option>
              ${Array.from({length: 24}, (_, i) => i + 1).map(hour =>
                `<option value="${hour}" ${report.medication_time === hour ? 'selected' : ''}>${hour}時頃</option>`
              ).join('')}
            </select>
          ` : `
            <div class="past-form-value">${report.medication_time ? report.medication_time + '時頃' : 'なし'}</div>
          `}
        </div>
        <div class="col-3">
          <label class="past-form-label"><i class="fas fa-bed"></i> 睡眠時間</label>
          <div class="past-form-value">${calculateSleepHours(report.bedtime, report.wakeup_time)}</div>
        </div>
      </div>

      <!-- 睡眠情報（詳細） -->
      <div class="row mb-3">
        <div class="col-4">
          <label class="${labelClass}"><i class="fas fa-moon"></i> 就寝時間</label>
          ${isAdmin ? `
            <input
              type="time"
              class="form-control admin-editable"
              id="editBedtime"
              value="${report.bedtime || ''}">
          ` : `
            <div class="past-form-value">${report.bedtime || '-'}</div>
          `}
        </div>
        <div class="col-4">
          <label class="${labelClass}"><i class="fas fa-sun"></i> 起床時間</label>
          ${isAdmin ? `
            <input
              type="time"
              class="form-control admin-editable"
              id="editWakeupTime"
              value="${report.wakeup_time || ''}">
          ` : `
            <div class="past-form-value">${report.wakeup_time || '-'}</div>
          `}
        </div>
        <div class="col-4">
          <label class="${labelClass}"><i class="fas fa-bed"></i> 睡眠状態</label>
          ${isAdmin ? `
            <select class="form-control admin-editable" id="editSleepQuality">
              <option value="good" ${report.sleep_quality === 'good' ? 'selected' : ''}>眠れた</option>
              <option value="poor" ${report.sleep_quality === 'poor' ? 'selected' : ''}>あまり眠れなかった</option>
              <option value="bad" ${report.sleep_quality === 'bad' ? 'selected' : ''}>眠れなかった</option>
            </select>
          ` : `
            <div class="past-form-value">${getSleepQualityLabel(report.sleep_quality)}</div>
          `}
        </div>
      </div>

      <!-- 振り返り -->
      <div class="mb-3">
        <label class="${labelClass}"><i class="fas fa-lightbulb"></i> 振り返り・感想</label>
        ${isAdmin ? `
          <textarea
            class="form-control admin-editable"
            id="editReflection"
            rows="3"
            maxlength="500">${report.reflection || ''}</textarea>
        ` : `
          <div class="text-content">${report.reflection || ''}</div>
        `}
      </div>

      <!-- 面談希望 -->
      <div class="mb-3">
        <label class="${labelClass}"><i class="fas fa-comments"></i> 面談希望</label>
        ${isAdmin ? `
          <select class="form-control admin-editable" id="editInterviewRequest">
            <option value="">なし</option>
            <option value="consultation" ${report.interview_request === 'consultation' ? 'selected' : ''}>相談がある</option>
            <option value="interview" ${report.interview_request === 'interview' ? 'selected' : ''}>面談希望</option>
          </select>
        ` : `
          ${report.interview_request ? `
            <div class="past-form-value text-info">${getInterviewRequestLabel(report.interview_request)}</div>
          ` : ''}
        `}
      </div>
    </div>

    <hr>
  `;
}

/**
 * 受給者証有効期限の警告HTML生成
 */
export function generateCertificateExpiryWarning(user) {
  if (!user || !user.certificate_expiry) return '';

  const expiry = new Date(user.certificate_expiry);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);

  const oneMonthLater = new Date(today);
  oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);

  if (expiry <= oneMonthLater && expiry >= today) {
    const month = expiry.getMonth() + 1;
    const day = expiry.getDate();
    return `
      <div class="alert alert-danger mb-3" style="font-weight: bold;">
        <i class="fas fa-exclamation-triangle"></i>
        受給者証の有効期限が近付いています、${month}月${day}日まで
      </div>
    `;
  }
  return '';
}

/**
 * スタッフのwork_reportを表示用HTMLに変換（JSON形式・旧テキスト形式両対応）
 */
export function renderStaffWorkReport(workReport) {
  if (!workReport) return '<div class="text-content bg-light p-3 rounded">-</div>';
  try {
    const parsed = JSON.parse(workReport);
    let freeText = '';
    let entries = [];

    if (parsed && parsed.entries && Array.isArray(parsed.entries)) {
      freeText = parsed.free_text || '';
      entries = parsed.entries;
    } else if (Array.isArray(parsed)) {
      entries = parsed;
    }

    let html = '';
    if (freeText) {
      html += `<div class="border rounded p-2 mb-2 bg-light" style="white-space: pre-wrap;">${freeText}</div>`;
    }

    const filled = entries.filter(e =>
      (e.work_content && e.work_content.trim()) ||
      (e.support_content && e.support_content.trim()) ||
      (e.user_condition && e.user_condition.trim())
    );

    if (filled.length === 0 && !freeText) return '<div class="text-muted small">記録なし</div>';

    filled.forEach(e => {
      const parts = [];
      parts.push(`<span class="fw-bold">${e.user_name || '不明'}</span>`);
      if (e.work_content) parts.push(`<span class="text-muted">作業内容:</span>${e.work_content}`);
      if (e.support_content) parts.push(`<span class="text-muted">支援内容:</span>${e.support_content}`);
      if (e.user_condition) parts.push(`<span class="text-muted">利用者の様子:</span>${e.user_condition}`);
      if (e.attendance_info) parts.push(`<span class="text-muted">勤怠:</span>${e.attendance_info}`);
      html += `<div class="small border-bottom py-1">${parts.join(' ｜ ')}</div>`;
    });

    return html;
  } catch { /* 旧テキスト形式 */ }
  return `<div class="text-content bg-light p-3 rounded">${workReport}</div>`;
}

/**
 * 就寝時間と起床時間から睡眠時間を計算
 */
export function calculateSleepHours(bedtime, wakeupTime) {
  if (!bedtime || !wakeupTime) return '-';

  try {
    const [bedHours, bedMinutes] = bedtime.split(':').map(Number);
    const [wakeHours, wakeMinutes] = wakeupTime.split(':').map(Number);

    const bedTotalMinutes = bedHours * 60 + bedMinutes;
    const wakeTotalMinutes = wakeHours * 60 + wakeMinutes;

    let sleepMinutes;

    if (wakeTotalMinutes >= bedTotalMinutes) {
      if (bedTotalMinutes > 12 * 60 && wakeTotalMinutes < 12 * 60) {
        sleepMinutes = (24 * 60 - bedTotalMinutes) + wakeTotalMinutes;
      } else {
        sleepMinutes = wakeTotalMinutes - bedTotalMinutes;
      }
    } else {
      sleepMinutes = (24 * 60 - bedTotalMinutes) + wakeTotalMinutes;
    }

    const hours = Math.floor(sleepMinutes / 60);
    const minutes = sleepMinutes % 60;

    if (hours === 0) return `${minutes}分`;
    if (minutes === 0) return `${hours}時間`;
    return `${hours}時間${minutes}分`;

  } catch (error) {
    console.error('睡眠時間計算エラー:', error);
    return '-';
  }
}

// ラベル変換ヘルパー
export function getAppetiteLabel(value) {
  const labels = { 'good': '良好', 'normal': '普通', 'poor': '不振', 'none': 'なし' };
  return labels[value] || value;
}

export function getSleepQualityLabel(value) {
  const labels = { 'good': '眠れた', 'normal': '普通', 'poor': 'あまり眠れなかった', 'bad': '眠れなかった' };
  return labels[value] || value;
}

export function getInterviewRequestLabel(value) {
  const labels = { 'required': '必要', 'not_required': '不要', 'consultation': '相談がある', 'interview': '面談希望' };
  return labels[value] || value;
}

export function getWorkLocationLabel(value) {
  const labels = { 'office': '通所', 'home': '在宅' };
  return labels[value] || value;
}

export function escapeAttr(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
