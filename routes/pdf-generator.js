// routes/pdf-generator.js
// PDFKit による日報PDF生成（Puppeteer/Sharp 置き換え）

const PDFDocument = require('pdfkit');
const path = require('path');

const FONT_PATH = path.join(__dirname, '..', 'fonts', 'NotoSansJP-Regular.ttf');

// カラー定義（現行HTMLテンプレートと同じ配色）
const COLORS = {
  primary: '#667eea',
  primaryDark: '#764ba2',
  white: '#FFFFFF',
  background: '#f8f9fa',
  cardBg: '#f8f9ff',
  text: '#333333',
  textLight: '#666666',
  textMuted: '#888888',
  textVeryMuted: '#999999',
  border: '#e0e0e0',
  borderLight: '#e9ecef',
  success: '#28a745',
  info: '#17a2b8',
  warning: '#ffc107',
  serviceBg: '#f0f7ff',
  serviceBorder: '#4a90d9',
  sectionBg: '#E8F5E9',
  commentBg: '#667eea',
};

// 共通ヘルパー
function formatDateJapanese(dateString) {
  try {
    const d = new Date(dateString + 'T00:00:00+09:00');
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${weekdays[d.getDay()]}）`;
  } catch { return dateString; }
}

function formatAppetite(v) {
  return { good: '良好', normal: '普通', poor: '不振', none: 'なし' }[v] || v || '-';
}

function formatSleepQuality(v) {
  return { good: '眠れた', normal: '普通', poor: 'あまり眠れなかった', bad: '眠れなかった' }[v] || v || '-';
}

function formatInterviewRequest(v) {
  return { required: '必要', not_required: '不要', consultation: '相談がある', interview: '面談希望' }[v] || v;
}

function formatWorkLocation(v) {
  return { office: '通所', home: '在宅' }[v] || v;
}

function calculateSleepHours(bedtime, wakeupTime) {
  if (!bedtime || !wakeupTime) return '-';
  try {
    const [bH, bM] = bedtime.split(':').map(Number);
    const [wH, wM] = wakeupTime.split(':').map(Number);
    const bedMin = bH * 60 + bM;
    const wakeMin = wH * 60 + wM;
    let sleep = wakeMin >= bedMin ? wakeMin - bedMin : (1440 - bedMin) + wakeMin;
    if (bedMin > 720 && wakeMin < 720) sleep = (1440 - bedMin) + wakeMin;
    const h = Math.floor(sleep / 60);
    const m = sleep % 60;
    if (h === 0) return `${m}分`;
    if (m === 0) return `${h}時間`;
    return `${h}時間${m}分`;
  } catch { return '-'; }
}

// 紫グラデ背景の描画
function drawGradientBackground(doc) {
  const grad = doc.linearGradient(0, 0, doc.page.width, doc.page.height);
  grad.stop(0, COLORS.primary);
  grad.stop(1, COLORS.primaryDark);
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(grad);
}

// 角丸四角形
function drawRoundedRect(doc, x, y, w, h, r, fillColor) {
  doc.roundedRect(x, y, w, h, r).fill(fillColor);
}

// 左ボーダー付きカード
function drawLeftBorderCard(doc, x, y, w, h, borderColor, bgColor) {
  doc.roundedRect(x, y, w, h, 6).fill(bgColor);
  doc.rect(x, y, 3, h).fill(borderColor);
}

// テキストの高さを事前計算（fontSizeを反映してから測定）
function measureText(doc, text, opts = {}) {
  if (opts.fontSize) doc.fontSize(opts.fontSize);
  return doc.heightOfString(text || '', opts);
}

/**
 * ユーザー日報PDF生成
 */
function generateUserReportPDF(data) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 0 });
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.registerFont('NotoSansJP', FONT_PATH);
      doc.font('NotoSansJP');

      drawGradientBackground(doc);

      const margin = 30;
      const cardX = margin;
      const cardY = margin;
      const cardW = doc.page.width - margin * 2;
      const cardH = doc.page.height - margin * 2;

      drawRoundedRect(doc, cardX, cardY, cardW, cardH, 15, COLORS.white);

      const pad = 20;
      const contentX = cardX + pad;
      const contentW = cardW - pad * 2;
      let y = cardY + pad;

      // ヘッダー
      doc.fontSize(18).fillColor(COLORS.text);
      doc.text(`${data.user.name}さんの日報詳細`, contentX, y, { width: contentW, align: 'center' });
      y += 26;
      doc.fontSize(14).fillColor(COLORS.textLight);
      doc.text(formatDateJapanese(data.date), contentX, y, { width: contentW, align: 'center' });
      y += 22;

      // 区切り線
      doc.moveTo(contentX, y).lineTo(contentX + contentW, y).strokeColor(COLORS.primary).lineWidth(2).stroke();
      y += 12;

      // 出退勤情報（3列グリッド）
      const colW = (contentW - 16) / 3;
      const attItems = [
        { label: '出勤', value: data.attendance.clock_in, color: COLORS.success },
        { label: '休憩', value: data.breakTimeDisplay.split(' ')[0], color: COLORS.warning },
        { label: '退勤', value: data.attendance.clock_out === '-' ? '未退勤' : data.attendance.clock_out, color: data.attendance.clock_out !== '-' ? COLORS.info : COLORS.textMuted },
      ];
      attItems.forEach((item, i) => {
        const cx = contentX + i * (colW + 8);
        drawLeftBorderCard(doc, cx, y, colW, 40, COLORS.primary, COLORS.cardBg);
        doc.fontSize(8).fillColor(COLORS.textLight);
        doc.text(item.label, cx + 10, y + 6, { width: colW - 15 });
        doc.fontSize(14).fillColor(item.color);
        doc.text(item.value || '-', cx + 10, y + 18, { width: colW - 15 });
      });
      y += 50;

      // 区切り線
      doc.moveTo(contentX, y).lineTo(contentX + contentW, y).strokeColor(COLORS.borderLight).lineWidth(1).stroke();
      y += 10;

      // 日報内容タイトル
      doc.fontSize(13).fillColor(COLORS.text);
      doc.text('日報内容', contentX, y, { width: contentW });
      y += 20;

      // ラベル+値を描画するヘルパー
      const drawLabelValue = (label, value, opts = {}) => {
        if (!value && !opts.force) return;
        doc.fontSize(8).fillColor('#495057');
        doc.text(label, contentX, y, { width: contentW });
        y += 12;
        const textH = measureText(doc, value || '-', { width: contentW - 12, fontSize: opts.fontSize || 10 });
        drawRoundedRect(doc, contentX, y, contentW, Math.max(18, textH + 8), 4, COLORS.background);
        doc.fontSize(opts.fontSize || 10).fillColor(COLORS.text);
        doc.text(value || '-', contentX + 6, y + 4, { width: contentW - 12 });
        y += Math.max(18, textH + 8) + 6;
      };

      // 作業内容
      drawLabelValue('作業内容', data.report.work_content);

      // 作業場所・PC番号・施設外（横並び）
      const infoItems = [];
      if (data.report.work_location) infoItems.push(['作業場所', formatWorkLocation(data.report.work_location)]);
      if (data.report.pc_number) infoItems.push(['PC番号', data.report.pc_number]);
      if (data.report.external_work_location) infoItems.push(['施設外就労先', data.report.external_work_location]);
      if (infoItems.length > 0) {
        const iw = (contentW - (infoItems.length - 1) * 8) / infoItems.length;
        infoItems.forEach(([label, val], i) => {
          const ix = contentX + i * (iw + 8);
          doc.fontSize(8).fillColor('#495057');
          doc.text(label, ix, y, { width: iw });
          drawRoundedRect(doc, ix, y + 12, iw, 20, 4, COLORS.background);
          doc.fontSize(10).fillColor(COLORS.text);
          doc.text(val, ix + 4, y + 16, { width: iw - 8 });
        });
        y += 38;
      }

      // 連絡時間
      if (data.report.contact_time_1 || data.report.contact_time_2) {
        const cw = (contentW - 8) / 2;
        [['連絡時間1回目', data.report.contact_time_1 || '-'], ['連絡時間2回目', data.report.contact_time_2 || '-']].forEach(([label, val], i) => {
          const cx = contentX + i * (cw + 8);
          doc.fontSize(8).fillColor('#495057');
          doc.text(label, cx, y, { width: cw });
          drawRoundedRect(doc, cx, y + 12, cw, 20, 4, COLORS.background);
          doc.fontSize(10).fillColor(COLORS.text);
          doc.text(val, cx + 4, y + 16, { width: cw - 8 });
        });
        y += 38;
      }

      // 健康状態（4列）
      const healthItems = [
        ['体温', data.report.temperature ? `${data.report.temperature}℃` : '-'],
        ['食欲', formatAppetite(data.report.appetite)],
        ['頓服', data.report.medication_time ? `${data.report.medication_time}時` : 'なし'],
        ['睡眠', calculateSleepHours(data.report.bedtime, data.report.wakeup_time)],
      ];
      const hw = (contentW - 24) / 4;
      healthItems.forEach(([label, val], i) => {
        const hx = contentX + i * (hw + 8);
        doc.fontSize(8).fillColor('#495057');
        doc.text(label, hx, y, { width: hw });
        drawRoundedRect(doc, hx, y + 12, hw, 20, 4, COLORS.background);
        doc.fontSize(10).fillColor(COLORS.text);
        doc.text(val, hx + 4, y + 16, { width: hw - 8 });
      });
      y += 38;

      // 睡眠詳細（3列）
      if (data.report.bedtime || data.report.wakeup_time || data.report.sleep_quality) {
        const sw = (contentW - 16) / 3;
        const sleepItems = [
          ['就寝', data.report.bedtime || '-'],
          ['起床', data.report.wakeup_time || '-'],
          ['睡眠状態', formatSleepQuality(data.report.sleep_quality)],
        ];
        sleepItems.forEach(([label, val], i) => {
          const sx = contentX + i * (sw + 8);
          doc.fontSize(8).fillColor('#495057');
          doc.text(label, sx, y, { width: sw });
          drawRoundedRect(doc, sx, y + 12, sw, 20, 4, COLORS.background);
          doc.fontSize(10).fillColor(COLORS.text);
          doc.text(val, sx + 4, y + 16, { width: sw - 8 });
        });
        y += 38;
      }

      // 振り返り
      drawLabelValue('振り返り・感想', data.report.reflection, { fontSize: 11 });

      // 面談希望
      if (data.report.interview_request) {
        drawLabelValue('面談希望', formatInterviewRequest(data.report.interview_request));
      }

      // スタッフコメント（紫グラデ背景）
      if (data.comment) {
        const commentText = data.comment.comment || '';
        const commentH = measureText(doc, commentText, { width: contentW - 24, fontSize: 11 });
        const boxH = Math.max(60, commentH + 48);

        if (y + boxH > cardY + cardH - pad) {
          doc.addPage();
          drawGradientBackground(doc);
          drawRoundedRect(doc, cardX, cardY, cardW, cardH, 15, COLORS.white);
          y = cardY + pad;
        }

        const grad = doc.linearGradient(contentX, y, contentX + contentW, y);
        grad.stop(0, COLORS.primary);
        grad.stop(1, COLORS.primaryDark);
        doc.roundedRect(contentX, y, contentW, boxH, 8).fill(grad);

        doc.fontSize(9).fillColor(COLORS.white);
        doc.text('スタッフからのコメント', contentX + 12, y + 8, { width: contentW - 24 });

        doc.roundedRect(contentX + 8, y + 22, contentW - 16, boxH - 38, 5).fillOpacity(0.1).fill(COLORS.white);
        doc.fillOpacity(1);
        doc.fontSize(11).fillColor(COLORS.white);
        doc.text(commentText, contentX + 14, y + 26, { width: contentW - 28 });

        doc.fontSize(8).fillColor(COLORS.white).opacity(0.9);
        doc.text(`記入者: ${data.comment.staff_name}`, contentX + 12, y + boxH - 14, { width: contentW - 24, align: 'right' });
        doc.opacity(1);
        y += boxH + 8;
      }

      // サービス提供記録
      if (data.serviceEntry) {
        const se = data.serviceEntry;
        const seItems = [];
        if (se.work_content) seItems.push(['作業内容', se.work_content]);
        if (se.support_content) seItems.push(['支援内容', se.support_content]);
        if (se.user_condition) seItems.push(['利用者の様子', se.user_condition]);
        if (se.attendance_info) seItems.push(['勤怠', se.attendance_info]);

        if (seItems.length > 0) {
          let seH = 30;
          seItems.forEach(([, v]) => { seH += measureText(doc, v, { width: contentW - 40, fontSize: 9 }) + 20; });
          if (se.staff_name) seH += 16;

          if (y + seH > cardY + cardH - pad) {
            doc.addPage();
            drawGradientBackground(doc);
            drawRoundedRect(doc, cardX, cardY, cardW, cardH, 15, COLORS.white);
            y = cardY + pad;
          }

          drawRoundedRect(doc, contentX, y, contentW, seH, 8, COLORS.serviceBg);
          doc.rect(contentX, y, 4, seH).fill(COLORS.serviceBorder);

          doc.fontSize(10).fillColor(COLORS.text);
          doc.text('サービス提供記録', contentX + 12, y + 8, { width: contentW - 24 });
          let sy = y + 24;

          seItems.forEach(([label, val]) => {
            doc.fontSize(8).fillColor(COLORS.textMuted);
            doc.text(`${label}:`, contentX + 12, sy, { width: contentW - 30 });
            sy += 12;
            const th = measureText(doc, val, { width: contentW - 40, fontSize: 9 });
            drawRoundedRect(doc, contentX + 10, sy, contentW - 20, th + 6, 4, COLORS.white);
            doc.fontSize(9).fillColor(COLORS.text);
            doc.text(val, contentX + 14, sy + 3, { width: contentW - 28 });
            sy += th + 12;
          });

          if (se.staff_name) {
            doc.fontSize(7).fillColor(COLORS.textMuted);
            doc.text(`記入者: ${se.staff_name}`, contentX + 12, sy, { width: contentW - 24, align: 'right' });
          }
          y += seH + 8;
        }
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * スタッフ日報PDF生成
 */
function generateStaffReportPDF(staffReportData, userData, date) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 0 });
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.registerFont('NotoSansJP', FONT_PATH);
      doc.font('NotoSansJP');

      const { work_report, communication, attendance } = staffReportData;
      const displayDate = date || staffReportData.date;

      // 休憩表示
      let breakTimeDisplay = '-';
      if (attendance && attendance.break_start) {
        breakTimeDisplay = attendance.break_end
          ? `${attendance.break_start}〜${attendance.break_end} (60分)`
          : `${attendance.break_start}〜`;
      }

      // work_reportパース
      let entries = [];
      let freeText = '';
      if (work_report) {
        try {
          const parsed = JSON.parse(work_report);
          if (parsed && parsed.entries && Array.isArray(parsed.entries)) {
            entries = parsed.entries;
            freeText = parsed.free_text || '';
          } else if (Array.isArray(parsed)) {
            entries = parsed;
          }
        } catch {
          freeText = work_report;
        }
      }

      const filledEntries = entries.filter(e =>
        (e.work_content && e.work_content.trim()) ||
        (e.support_content && e.support_content.trim()) ||
        (e.user_condition && e.user_condition.trim()) ||
        (e.attendance_info && e.attendance_info.trim())
      );

      drawGradientBackground(doc);

      const margin = 30;
      const cardX = margin;
      const cardY = margin;
      const cardW = doc.page.width - margin * 2;
      const cardH = doc.page.height - margin * 2;

      drawRoundedRect(doc, cardX, cardY, cardW, cardH, 15, COLORS.white);

      const pad = 24;
      const contentX = cardX + pad;
      const contentW = cardW - pad * 2;
      let y = cardY + pad;

      // ヘッダー
      doc.fontSize(22).fillColor(COLORS.primary);
      doc.text('サービス提供記録', contentX, y, { width: contentW, align: 'center' });
      y += 30;
      doc.fontSize(14).fillColor('#555555');
      doc.text(userData.name || 'スタッフ', contentX, y, { width: contentW, align: 'center' });
      y += 22;

      // 区切り線
      doc.moveTo(contentX, y).lineTo(contentX + contentW, y).strokeColor(COLORS.primary).lineWidth(3).stroke();
      y += 16;

      // 日付
      doc.fontSize(12).fillColor(COLORS.textLight);
      doc.text(formatDateJapanese(displayDate), contentX, y, { width: contentW, align: 'center' });
      y += 22;

      // 出退勤（3列）
      const colW = (contentW - 16) / 3;
      const timeItems = [
        { label: '出勤', value: attendance ? (attendance.clock_in || '-') : '-' },
        { label: '休憩', value: breakTimeDisplay, small: true },
        { label: '退勤', value: attendance ? (attendance.clock_out || '-') : '-' },
      ];
      timeItems.forEach((item, i) => {
        const cx = contentX + i * (colW + 8);
        drawLeftBorderCard(doc, cx, y, colW, 44, COLORS.primary, COLORS.background);
        doc.fontSize(8).fillColor(COLORS.textMuted);
        doc.text(item.label, cx + 10, y + 6, { width: colW - 15 });
        doc.fontSize(item.small ? 10 : 14).fillColor(COLORS.text);
        doc.text(item.value, cx + 10, y + 20, { width: colW - 15 });
      });
      y += 56;

      // ページ溢れチェック用ヘルパー
      const ensureSpace = (needed) => {
        if (y + needed > cardY + cardH - pad) {
          doc.addPage();
          drawGradientBackground(doc);
          drawRoundedRect(doc, cardX, cardY, cardW, cardH, 15, COLORS.white);
          y = cardY + pad;
        }
      };

      // セクションタイトル描画
      const drawSectionTitle = (title) => {
        ensureSpace(30);
        doc.fontSize(11).fillColor(COLORS.primary);
        doc.text(title, contentX, y, { width: contentW });
        y += 16;
        doc.moveTo(contentX, y).lineTo(contentX + contentW, y).strokeColor(COLORS.border).lineWidth(2).stroke();
        y += 8;
      };

      // サービス提供記録及び業務報告
      drawSectionTitle('サービス提供記録及び業務報告');

      // freeText
      if (freeText) {
        const fh = measureText(doc, freeText, { width: contentW - 24, fontSize: 10 });
        ensureSpace(fh + 20);
        drawRoundedRect(doc, contentX, y, contentW, fh + 16, 8, COLORS.background);
        doc.fontSize(10).fillColor(COLORS.text);
        doc.text(freeText, contentX + 12, y + 8, { width: contentW - 24 });
        y += fh + 24;
      }

      // entries
      if (filledEntries.length > 0) {
        filledEntries.forEach(e => {
          const parts = [];
          if (e.work_content) parts.push(['作業内容', e.work_content]);
          if (e.support_content) parts.push(['支援内容', e.support_content]);
          if (e.user_condition) parts.push(['利用者の様子', e.user_condition]);
          if (e.attendance_info) parts.push(['勤怠', e.attendance_info]);

          let entryH = 20;
          parts.forEach(([, v]) => { entryH += measureText(doc, v, { width: contentW - 40, fontSize: 9 }) + 14; });

          ensureSpace(entryH + 8);
          drawRoundedRect(doc, contentX, y, contentW, entryH, 6, COLORS.background);
          doc.rect(contentX, y, 3, entryH).fill(COLORS.border);

          doc.fontSize(10).fillColor(COLORS.text);
          doc.text(e.user_name || '不明', contentX + 10, y + 5, { width: contentW - 20, continued: false });
          let ey = y + 18;

          parts.forEach(([label, val]) => {
            doc.fontSize(8).fillColor(COLORS.textMuted);
            doc.text(`${label}:`, contentX + 10, ey, { width: contentW - 20 });
            ey += 11;
            doc.fontSize(9).fillColor(COLORS.text);
            const th = measureText(doc, val, { width: contentW - 40, fontSize: 9 });
            doc.text(val, contentX + 14, ey, { width: contentW - 28 });
            ey += th + 4;
          });

          y += entryH + 8;
        });
      } else if (!freeText) {
        ensureSpace(30);
        drawRoundedRect(doc, contentX, y, contentW, 24, 8, COLORS.background);
        doc.fontSize(10).fillColor(COLORS.textVeryMuted);
        doc.text('記録なし', contentX + 12, y + 6, { width: contentW - 24 });
        y += 32;
      }

      // 業務報告
      if (communication) {
        drawSectionTitle('業務報告');
        const ch = measureText(doc, communication, { width: contentW - 24, fontSize: 10 });
        ensureSpace(ch + 20);
        drawRoundedRect(doc, contentX, y, contentW, ch + 16, 8, COLORS.background);
        doc.fontSize(10).fillColor(COLORS.text);
        doc.text(communication, contentX + 12, y + 8, { width: contentW - 24 });
        y += ch + 24;
      }

      // フッター
      const footerY = cardY + cardH - pad - 12;
      if (y < footerY) {
        doc.fontSize(8).fillColor(COLORS.textVeryMuted);
        doc.text(`出力日時: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`, contentX, footerY, { width: contentW, align: 'center' });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { generateUserReportPDF, generateStaffReportPDF };
