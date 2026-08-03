// routes/line.js
// LINE Messaging API統合（画像要件対応版）

const express = require('express');
// const puppeteer = require('puppeteer');
// const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { generateUserReportPDF, generateStaffReportPDF } = require('./pdf-generator');

const router = express.Router();

// tempディレクトリの作成と古いファイルのクリーンアップ
const TEMP_DIR = path.join(__dirname, '..', 'temp');

async function initTempDirectory() {
  await fs.mkdir(TEMP_DIR, { recursive: true });

  // 1時間以上前の古いファイルを一括削除
  try {
    const files = await fs.readdir(TEMP_DIR);
    const now = Date.now();
    const ONE_HOUR = 60 * 60 * 1000;

    for (const file of files) {
      try {
        const filePath = path.join(TEMP_DIR, file);
        const stat = await fs.stat(filePath);
        if (now - stat.mtimeMs > ONE_HOUR) {
          await fs.unlink(filePath);
          console.log(`[temp cleanup] 削除: ${file}`);
        }
      } catch (err) {
        if (err.code !== 'ENOENT') console.error(`[temp cleanup] エラー: ${file}`, err.message);
      }
    }
  } catch (err) {
    console.error('[temp cleanup] ディレクトリ読み取りエラー:', err.message);
  }
}

// 起動時に実行
initTempDirectory();

/**
 * 日報PDF生成
 */
router.post('/generate-report-image', async (req, res) => {
  try {
    const { reportData, userData, commentData, date } = req.body;

    console.log('[PDF生成] 開始:', {
      userName: userData?.name,
      date: date || reportData?.date,
    });

    if (!reportData || !userData) {
      throw new Error('必須データ（reportData, userData）が不足しています');
    }

    const normalizedData = normalizeReportData(reportData, userData, commentData, date);
    const pdfBuffer = await generateUserReportPDF(normalizedData);

    const fileId = `report_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    const fileName = `${fileId}.pdf`;
    const filePath = path.join(TEMP_DIR, fileName);
    await fs.writeFile(filePath, pdfBuffer);

    console.log('[PDF生成] 完了:', { fileId });

    res.json({
      success: true,
      imageId: fileId,
      imageUrl: `/api/line/download-pdf/${encodeURIComponent(fileName)}`,
      fileName,
      message: 'PDF生成完了'
    });

  } catch (error) {
    console.error('[PDF生成] エラー:', error);
    res.status(500).json({
      success: false,
      message: 'PDF生成に失敗しました: ' + error.message
    });
  }
});

/* === 旧・Puppeteer/Sharp画像生成（コメントアウト） ===
router.post('/generate-report-image-legacy', async (req, res) => {
  let browser = null;
  try {
    const { reportData, userData, commentData, date } = req.body;
    if (!reportData || !userData) {
      throw new Error('必須データ（reportData, userData）が不足しています');
    }
    const normalizedData = normalizeReportData(reportData, userData, commentData, date);
    const html = generateSquareLayoutHTML(normalizedData);
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu','--single-process'],
      timeout: 30000
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1024, height: 1024, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const { setTimeout } = require('node:timers/promises');
    await setTimeout(2000);
    const pngBuffer = await page.screenshot({ type: 'png', fullPage: false, encoding: 'binary' });
    await browser.close();
    browser = null;
    const imageId = `report_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    const fileName = `${imageId}_original.jpg`;
    const originalPath = path.join(TEMP_DIR, fileName);
    await sharp(pngBuffer).resize(1024, 1024, { fit: 'cover', position: 'top' }).jpeg({ progressive: true, mozjpeg: true }).toFile(originalPath);
    res.json({ success: true, imageId, imageUrl: `/api/line/download-image/${encodeURIComponent(fileName)}`, fileName });
  } catch (error) {
    if (browser) await browser.close();
    res.status(500).json({ success: false, message: error.message });
  }
});
=== 旧・Puppeteer/Sharp画像生成ここまで === */

/**
 * 画像ダウンロード（ダウンロード完了後に自動削除）
 */
router.get('/download-image/:fileName', (req, res) => {
  const { fileName } = req.params;

  // セキュリティチェック: パストラバーサル攻撃を防ぐ
  if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
    return res.status(400).json({ success: false, message: '無効なファイル名です' });
  }

  const filePath = path.join(TEMP_DIR, fileName);
  // クエリパラメータで表示用ファイル名を指定可能
  const downloadName = req.query.name || fileName;

  res.set('Content-Type', 'image/jpeg');
  res.download(filePath, downloadName, (err) => {
    // ダウンロード完了後（成功・失敗問わず）ファイルを削除
    fs.unlink(filePath).catch(unlinkErr => {
      if (unlinkErr.code !== 'ENOENT') {
        console.error('[画像削除] エラー:', unlinkErr.message);
      }
    });

    if (err && !res.headersSent) {
      console.error('[画像ダウンロード] エラー:', err.message);
      res.status(404).json({ success: false, message: 'ファイルが見つかりません' });
    }
  });
});

/**
 * PDFダウンロード（ダウンロード完了後に自動削除）
 */
router.get('/download-pdf/:fileName', (req, res) => {
  const { fileName } = req.params;

  if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
    return res.status(400).json({ success: false, message: '無効なファイル名です' });
  }

  const filePath = path.join(TEMP_DIR, fileName);
  const downloadName = req.query.name || fileName;

  res.set('Content-Type', 'application/pdf');
  res.download(filePath, downloadName, (err) => {
    fs.unlink(filePath).catch(unlinkErr => {
      if (unlinkErr.code !== 'ENOENT') {
        console.error('[PDF削除] エラー:', unlinkErr.message);
      }
    });

    if (err && !res.headersSent) {
      console.error('[PDFダウンロード] エラー:', err.message);
      res.status(404).json({ success: false, message: 'ファイルが見つかりません' });
    }
  });
});

/**
 * 正方形レイアウト用HTMLテンプレート生成（全内容表示版）- コメントアウト済みの旧コードから参照
 */
function escapeHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function generateSquareLayoutHTML(data) {
  const esc = escapeHtml;
  return `
    <!DOCTYPE html>
    <html lang="ja">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>日報詳細</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: "Noto Sans JP", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", sans-serif;
          width: 1024px;
          height: 1024px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }
        
        .report-container {
          background: white;
          border-radius: 15px;
          padding: 25px;
          width: 960px;
          height: 960px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.2);
          overflow-y: auto;
          display: flex;
          flex-direction: column;
        }
        
        /* スクロールバー非表示 */
        .report-container::-webkit-scrollbar {
          display: none;
        }
        
        .header {
          text-align: center;
          margin-bottom: 15px;
          border-bottom: 2px solid #667eea;
          padding-bottom: 10px;
        }
        
        .title {
          font-size: 30px;
          font-weight: bold;
          color: #333;
          margin-bottom: 3px;
        }
        
        .date {
          font-size: 30px;
          color: #666;
        }
        
        /* コンパクトな出勤情報 */
        .attendance-row {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 8px;
          margin-bottom: 15px;
        }
        
        .detail-section {
          text-align: center;
          padding: 8px 5px;
          background: #f8f9ff;
          border-radius: 6px;
          border-left: 3px solid #667eea;
          font-size: 20px;
        }
        
        .detail-section h6 {
          font-size: 20px;
          color: #666;
          margin: 0 0 3px 0;
        }
        
        .detail-value {
          font-size: 30px;
          font-weight: bold;
        }
        
        .text-success { color: #28a745; }
        .text-info { color: #17a2b8; }
        .text-warning { color: #ffc107; }
        .text-muted { color: #6c757d; }
        
        hr {
          border: none;
          border-top: 1px solid #e9ecef;
          margin: 10px 0;
        }
        
        /* 日報内容 - よりコンパクトに */
        .report-summary h6 {
            font-size: 30px;
          font-weight: bold;
          color: #333;
          margin-bottom: 10px;
        }
        
        .form-section {
          margin-bottom: 8px;
        }
        
        .past-form-label {
          font-size: 16px;
          font-weight: 600;
          color: #495057;
          margin-bottom: 2px;
        }
        
        .past-form-value {
          font-size: 16px;
          color: #333;
          padding: 4px 8px;
          background: #f8f9fa;
          border-radius: 4px;
        }
        
        .text-content {
          font-size: 20px;
          line-height: 1.3;
          color: #333;
          background: #f8f9fa;
          padding: 6px 8px;
          border-radius: 4px;
          white-space: pre-wrap;
        }
        
        /* 作業内容は高さ制限 */
        .work-content {
          max-height: 65px;
          overflow-y: auto;
        }
        
        /* 振り返りは基本2行程度なので制限なし */
        .reflection-content {
          min-height: 30px;
          font-size: 24px;
        }
        
        /* 作業情報行 */
        .work-info-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-bottom: 8px;
        }
        
        /* 健康状態 - 2行表示 */
        .health-row {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 6px;
          margin-bottom: 8px;
        }
        
        .health-detail-row {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 6px;
          margin-bottom: 8px;
        }
        
        /* スタッフコメント */
        .comment-section {
          background: linear-gradient(135deg, #667eea, #764ba2);
          color: white;
          padding: 12px;
          border-radius: 8px;
          margin-top: auto;
        }
        
        .comment-title {
          font-size: 18px;
          font-weight: bold;
          margin-bottom: 6px;
        }
        
        .comment-content {
          font-size: 24px;
          line-height: 1.3;
          background: rgba(255,255,255,0.1);
          padding: 8px;
          border-radius: 5px;
          margin-bottom: 4px;
          white-space: pre-wrap;
        }
        
        .comment-author {
          font-size: 18px;
          opacity: 0.9;
          text-align: right;
        }
        
        /* 小さめのフォント調整 */
        .form-section.compact {
          margin-bottom: 6px;
        }
        
        .form-section.compact .past-form-value {
          font-size: 26px;
          padding: 3px 6px;
        }

        /* サービス提供記録 */
        .service-entry-section {
          background: #f0f7ff;
          padding: 12px;
          border-radius: 8px;
          border-left: 4px solid #4a90d9;
          margin-top: 8px;
        }
        .service-entry-title {
          font-size: 18px;
          font-weight: bold;
          color: #333;
          margin-bottom: 8px;
        }
        .service-entry-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
        }
        .service-entry-item {
          font-size: 16px;
          color: #333;
          background: white;
          padding: 4px 8px;
          border-radius: 4px;
        }
        .service-entry-label {
          color: #666;
          font-weight: 600;
        }
        .service-entry-author {
          font-size: 14px;
          color: #888;
          text-align: right;
          margin-top: 6px;
        }
      </style>
    </head>
    <body>
      <div class="report-container">
        <!-- ヘッダー -->
        <div class="header">
          <div class="title">📋 ${data.user.name}さんの日報詳細</div>
          <div class="date">${formatDateJapanese(data.date)}</div>
        </div>
        
        <!-- 出勤情報 -->
        <div class="attendance-row">
          <div class="detail-section">
            <h6>🕘 出勤</h6>
            <div class="detail-value text-success">${data.attendance.clock_in}</div>
          </div>
          <div class="detail-section">
            <h6>☕ 休憩</h6>
            <div class="detail-value text-warning">${data.breakTimeDisplay.split(' ')[0]}</div>
          </div>
          <div class="detail-section">
            <h6>🕕 退勤</h6>
            <div class="detail-value ${data.attendance.clock_out !== '-' ? 'text-info' : 'text-muted'}">
              ${data.attendance.clock_out === '-' ? '未退勤' : data.attendance.clock_out}
            </div>
          </div>
        </div>

        <hr>

        <!-- 日報内容（全表示版） -->
        <div class="report-summary">
          <h6>📝 日報内容</h6>
          
          <!-- 作業内容 -->
          <div class="form-section">
            <label class="past-form-label">📋 作業内容</label>
            <div class="text-content work-content">${data.report.work_content || ''}</div>
          </div>

          <!-- 作業場所・PC番号・施設外就労先 -->
          <div class="work-info-row">
            ${data.report.work_location ? `
              <div class="form-section compact">
                <label class="past-form-label">📍 作業場所</label>
                <div class="past-form-value">${formatWorkLocation(data.report.work_location)}</div>
              </div>
            ` : ''}
            ${data.report.pc_number ? `
              <div class="form-section compact">
                <label class="past-form-label">💻 PC番号</label>
                <div class="past-form-value">${data.report.pc_number}</div>
              </div>
            ` : ''}
            ${data.report.external_work_location ? `
              <div class="form-section compact">
                <label class="past-form-label">🏢 施設外就労先</label>
                <div class="past-form-value">${data.report.external_work_location}</div>
              </div>
            ` : ''}
          </div>

          ${data.report.contact_time_1 || data.report.contact_time_2 ? `
          <!-- 連絡時間 -->
          <div class="work-info-row">
            <div class="form-section compact">
              <label class="past-form-label">📞 連絡時間1回目</label>
              <div class="past-form-value">${data.report.contact_time_1 || '-'}</div>
            </div>
            <div class="form-section compact">
              <label class="past-form-label">📞 連絡時間2回目</label>
              <div class="past-form-value">${data.report.contact_time_2 || '-'}</div>
            </div>
          </div>
          ` : ''}

          <!-- 健康状態（1行目） -->
          <div class="health-row">
            <div class="form-section compact">
              <label class="past-form-label">🌡️ 体温</label>
              <div class="past-form-value">${data.report.temperature}℃</div>
            </div>
            <div class="form-section compact">
              <label class="past-form-label">🍽️ 食欲</label>
              <div class="past-form-value">${formatAppetite(data.report.appetite)}</div>
            </div>
            <div class="form-section compact">
              <label class="past-form-label">💊 頓服</label>
              <div class="past-form-value">${data.report.medication_time ? data.report.medication_time + '時' : 'なし'}</div>
            </div>
            <div class="form-section compact">
              <label class="past-form-label">😴 睡眠</label>
              <div class="past-form-value">${calculateSleepHours(data.report.bedtime, data.report.wakeup_time)}</div>
            </div>
          </div>

          <!-- 睡眠情報詳細（2行目） -->
          ${(data.report.bedtime || data.report.wakeup_time || data.report.sleep_quality) ? `
            <div class="health-detail-row">
              <div class="form-section compact">
                <label class="past-form-label">🌙 就寝</label>
                <div class="past-form-value">${data.report.bedtime || '-'}</div>
              </div>
              <div class="form-section compact">
                <label class="past-form-label">☀️ 起床</label>
                <div class="past-form-value">${data.report.wakeup_time || '-'}</div>
              </div>
              <div class="form-section compact">
                <label class="past-form-label">😴 睡眠状態</label>
                <div class="past-form-value">${formatSleepQuality(data.report.sleep_quality)}</div>
              </div>
            </div>
          ` : ''}

          <!-- 振り返り（基本2行程度なので余裕を持たせる） -->
          <div class="form-section">
            <label class="past-form-label">💭 振り返り・感想</label>
            <div class="text-content reflection-content">${data.report.reflection || ''}</div>
          </div>

          ${data.report.interview_request ? `
            <div class="form-section compact">
              <label class="past-form-label">💬 面談希望</label>
              <div class="past-form-value">${formatInterviewRequest(data.report.interview_request)}</div>
            </div>
          ` : ''}
        </div>

        ${data.comment ? `
          <!-- スタッフコメント -->
          <div class="comment-section">
            <div class="comment-title">💬 スタッフからのコメント</div>
            <div class="comment-content">${data.comment.comment}</div>
            <div class="comment-author">記入者: ${data.comment.staff_name}</div>
          </div>
        ` : ''}

        ${data.serviceEntry ? `
          <!-- サービス提供記録 -->
          <div class="service-entry-section">
            <div class="service-entry-title">📋 サービス提供記録</div>
            <div class="service-entry-grid">
              ${data.serviceEntry.work_content ? `<div class="service-entry-item"><span class="service-entry-label">作業内容:</span> ${esc(data.serviceEntry.work_content)}</div>` : ''}
              ${data.serviceEntry.support_content ? `<div class="service-entry-item"><span class="service-entry-label">支援内容:</span> ${esc(data.serviceEntry.support_content)}</div>` : ''}
              ${data.serviceEntry.user_condition ? `<div class="service-entry-item"><span class="service-entry-label">利用者の様子:</span> ${esc(data.serviceEntry.user_condition)}</div>` : ''}
              ${data.serviceEntry.attendance_info ? `<div class="service-entry-item"><span class="service-entry-label">勤怠:</span> ${esc(data.serviceEntry.attendance_info)}</div>` : ''}
            </div>
            ${data.serviceEntry.staff_name ? `<div class="service-entry-author">記入者: ${esc(data.serviceEntry.staff_name)}</div>` : ''}
          </div>
        ` : ''}
      </div>
    </body>
    </html>
  `;
}

// データ正規化とヘルパー関数は既存のものを使用
function normalizeReportData(reportData, userData, commentData, date) {
  // 既存の実装を維持
  const attendance = {
    clock_in: reportData.clock_in || reportData.attendance?.clock_in || '-',
    clock_out: reportData.clock_out || reportData.attendance?.clock_out || '-',
    break_start: reportData.break_start || reportData.attendance?.break_start || null,
    break_end: reportData.break_end || reportData.attendance?.break_end || null
  };

  let breakTimeDisplay = '-';
  if (userData.role === 'user' && userData.service_type !== 'home') {
    if (reportData.breakRecord && reportData.breakRecord.start_time) {
      breakTimeDisplay = reportData.breakRecord.end_time ? 
        `${reportData.breakRecord.start_time}〜${reportData.breakRecord.end_time} (${reportData.breakRecord.duration || 60}分)` : 
        `${reportData.breakRecord.start_time}〜 (進行中)`;
    }
  } else if (userData.role !== 'user' && attendance.break_start) {
    breakTimeDisplay = attendance.break_end ? 
      `${attendance.break_start}〜${attendance.break_end} (60分)` : 
      `${attendance.break_start}〜 (進行中)`;
  }

  return {
    user: userData,
    date: date || reportData.date,
    attendance: attendance,
    breakTimeDisplay: breakTimeDisplay,
    report: {
      work_content: reportData.work_content || '',
      work_location: reportData.work_location || null,
      pc_number: reportData.pc_number || null,
      external_work_location: reportData.external_work_location || null,
      temperature: reportData.temperature || '-',
      appetite: reportData.appetite || null,
      sleep_quality: reportData.sleep_quality || null,
      bedtime: reportData.bedtime || null,
      wakeup_time: reportData.wakeup_time || null,
      medication_time: reportData.medication_time || null,
      reflection: reportData.reflection || '',
      interview_request: reportData.interview_request || null,
      contact_time_1: reportData.contact_time_1 || null,
      contact_time_2: reportData.contact_time_2 || null
    },
    comment: commentData && commentData.comment ? {
      comment: commentData.comment,
      staff_name: commentData.staff_name,
      created_at: commentData.created_at
    } : null,
    serviceEntry: reportData.serviceEntry || null
  };
}

// ヘルパー関数
function formatDateJapanese(dateString) {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    });
  } catch (error) {
    return dateString;
  }
}

function formatAppetite(appetite) {
  const labels = { 
    'good': '良好', 
    'normal': '普通',
    'poor': '不振',
    'none': 'なし' 
  };
  return labels[appetite] || appetite || '-';
}

function formatSleepQuality(quality) {
  const labels = {
    'good': '眠れた',
    'normal': '普通',
    'poor': 'あまり眠れなかった',
    'bad': '眠れなかった'
  };
  return labels[quality] || quality || '-';
}

function formatInterviewRequest(value) {
  const labels = {
    'required': '必要',
    'not_required': '不要',
    'consultation': '相談がある',
    'interview': '面談希望'
  };
  return labels[value] || value;
}

function formatWorkLocation(location) {
  const labels = {
    'office': '通所',
    'home': '在宅'
  };
  return labels[location] || location;
}

function calculateSleepHours(bedtime, wakeupTime) {
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
    
    if (hours === 0) {
      return `${minutes}分`;
    } else if (minutes === 0) {
      return `${hours}時間`;
    } else {
      return `${hours}時間${minutes}分`;
    }
    
  } catch (error) {
    console.error('睡眠時間計算エラー:', error);
    return '-';
  }
}

/**
 * スタッフ日報PDF生成
 */
router.post('/generate-staff-report-image', async (req, res) => {
  try {
    const { staffReportData, userData, date } = req.body;

    console.log('[スタッフ日報PDF生成] 開始:', {
      userName: userData?.name,
      date: date || staffReportData?.date,
    });

    if (!staffReportData || !userData) {
      throw new Error('必須データ（staffReportData, userData）が不足しています');
    }

    const pdfBuffer = await generateStaffReportPDF(staffReportData, userData, date);

    const fileId = `staff_report_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    const fileName = `${fileId}.pdf`;
    const filePath = path.join(TEMP_DIR, fileName);
    await fs.writeFile(filePath, pdfBuffer);

    console.log('[スタッフ日報PDF生成] 完了:', { fileId });

    res.json({
      success: true,
      imageId: fileId,
      imageUrl: `/api/line/download-pdf/${encodeURIComponent(fileName)}`,
      fileName
    });

  } catch (error) {
    console.error('[スタッフ日報PDF生成エラー]:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'スタッフ日報PDFの生成に失敗しました'
    });
  }
});

/* === 旧・スタッフ日報Puppeteer/Sharp画像生成（コメントアウト） ===
router.post('/generate-staff-report-image-legacy', async (req, res) => {
  let browser = null;
  try {
    const { staffReportData, userData, date } = req.body;
    if (!staffReportData || !userData) throw new Error('必須データ不足');
    const html = generateStaffReportHTML(staffReportData, userData, date);
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu','--single-process'],
      timeout: 30000
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1024, height: 1024, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const { setTimeout } = require('node:timers/promises');
    await setTimeout(2000);
    const pngBuffer = await page.screenshot({ type: 'png', fullPage: false, encoding: 'binary' });
    await browser.close();
    browser = null;
    const imageId = `staff_report_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    const fileName = `${imageId}_original.jpg`;
    await sharp(pngBuffer).resize(1024, 1024, { fit: 'cover', position: 'top' }).jpeg({ progressive: true, mozjpeg: true }).toFile(path.join(TEMP_DIR, fileName));
    res.json({ success: true, imageId, imageUrl: `/api/line/download-image/${encodeURIComponent(fileName)}`, fileName });
  } catch (error) {
    if (browser) try { await browser.close(); } catch {}
    res.status(500).json({ success: false, message: error.message });
  }
});
=== 旧・スタッフ日報画像生成ここまで === */

/**
 * スタッフ日報用HTMLテンプレート生成
 */
function generateStaffReportHTML(staffReportData, userData, date) {
  const { work_report, communication, attendance } = staffReportData;
  const displayDate = date || staffReportData.date;

  // 休憩時間表示
  let breakTimeDisplay = '-';
  if (attendance && attendance.break_start) {
    breakTimeDisplay = attendance.break_end ?
      `${attendance.break_start}〜${attendance.break_end} (60分)` :
      `${attendance.break_start}〜`;
  }

  // HTMLエスケープ
  const esc = (str) => (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // work_reportをパースしてHTML化
  let workReportHTML = '';
  if (work_report) {
    try {
      const parsed = JSON.parse(work_report);
      let entries = [];
      let freeText = '';
      if (parsed && parsed.entries && Array.isArray(parsed.entries)) {
        entries = parsed.entries;
        freeText = parsed.free_text || '';
      } else if (Array.isArray(parsed)) {
        entries = parsed;
      }

      if (freeText) {
        workReportHTML += `<div style="margin-bottom:12px;">${esc(freeText)}</div>`;
      }

      const filled = entries.filter(e =>
        (e.work_content && e.work_content.trim()) ||
        (e.support_content && e.support_content.trim()) ||
        (e.user_condition && e.user_condition.trim()) ||
        (e.attendance_info && e.attendance_info.trim())
      );
      filled.forEach(e => {
        const parts = [];
        if (e.work_content) parts.push(`<span style="color:#888;">作業内容:</span>${esc(e.work_content)}`);
        if (e.support_content) parts.push(`<span style="color:#888;">支援内容:</span>${esc(e.support_content)}`);
        if (e.user_condition) parts.push(`<span style="color:#888;">利用者の様子:</span>${esc(e.user_condition)}`);
        if (e.attendance_info) parts.push(`<span style="color:#888;">勤怠:</span>${esc(e.attendance_info)}`);
        workReportHTML += `<div style="padding:8px 0;border-bottom:1px solid #e0e0e0;"><strong>${esc(e.user_name) || '不明'}</strong>　${parts.join('　')}</div>`;
      });

      if (!freeText && filled.length === 0) {
        workReportHTML = '<div style="color:#999;">記録なし</div>';
      }
    } catch {
      workReportHTML = esc(work_report);
    }
  }

  return `
    <!DOCTYPE html>
    <html lang="ja">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>スタッフ日報</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          width: 1024px;
          height: 1024px;
          font-family: "Noto Sans JP", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 40px;
        }

        .container {
          width: 100%;
          height: 100%;
          background: white;
          border-radius: 24px;
          padding: 48px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          overflow: hidden;
        }

        .header {
          text-align: center;
          margin-bottom: 36px;
          padding-bottom: 24px;
          border-bottom: 3px solid #667eea;
        }

        .title {
          font-size: 42px;
          font-weight: bold;
          color: #667eea;
          margin-bottom: 12px;
        }

        .subtitle {
          font-size: 28px;
          color: #555;
        }

        .date-info {
          text-align: center;
          font-size: 24px;
          color: #666;
          margin-bottom: 32px;
        }

        .section {
          margin-bottom: 28px;
        }

        .section-title {
          font-size: 20px;
          font-weight: bold;
          color: #667eea;
          margin-bottom: 12px;
          padding-bottom: 8px;
          border-bottom: 2px solid #e0e0e0;
        }

        .time-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
          margin-bottom: 28px;
        }

        .time-item {
          background: #f8f9fa;
          padding: 16px;
          border-radius: 12px;
          border-left: 4px solid #667eea;
        }

        .time-label {
          font-size: 16px;
          color: #888;
          margin-bottom: 8px;
        }

        .time-value {
          font-size: 28px;
          font-weight: bold;
          color: #333;
        }

        .content-box {
          background: #f8f9fa;
          padding: 20px;
          border-radius: 12px;
          min-height: 120px;
          font-size: 18px;
          line-height: 1.8;
          color: #333;
          white-space: pre-wrap;
        }

        .content-box-html {
          background: #f8f9fa;
          padding: 20px;
          border-radius: 12px;
          min-height: 120px;
          font-size: 18px;
          line-height: 1.8;
          color: #333;
        }

        .footer {
          margin-top: 32px;
          text-align: center;
          font-size: 16px;
          color: #999;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="title">サービス提供記録</div>
          <div class="subtitle">${userData.name || 'スタッフ'}</div>
        </div>

        <div class="date-info">${displayDate}</div>

        <div class="time-grid">
          <div class="time-item">
            <div class="time-label">出勤</div>
            <div class="time-value">${attendance ? (attendance.clock_in || '-') : '-'}</div>
          </div>
          <div class="time-item">
            <div class="time-label">休憩</div>
            <div class="time-value" style="font-size: 20px;">${breakTimeDisplay}</div>
          </div>
          <div class="time-item">
            <div class="time-label">退勤</div>
            <div class="time-value">${attendance ? (attendance.clock_out || '-') : '-'}</div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">サービス提供記録及び業務報告</div>
          <div class="content-box-html">${workReportHTML || ''}</div>
        </div>

        ${communication ? `
          <div class="section">
            <div class="section-title">業務報告</div>
            <div class="content-box">${esc(communication)}</div>
          </div>
        ` : ''}

        <div class="footer">
          出力日時: ${new Date().toLocaleString('ja-JP')}
        </div>
      </div>
    </body>
    </html>
  `;
}

module.exports = router;