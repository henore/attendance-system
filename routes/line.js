// routes/line.js
// LINE Messaging API統合（画像要件対応版）

const express = require('express');
const puppeteer = require('puppeteer');
const sharp = require('sharp'); // 画像処理ライブラリ（要インストール）
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const router = express.Router();


// 必要なディレクトリを作成
async function ensureDirectories() {
  const dirs = ['temp', 'public/temp', 'public/images']; 
  for (const dir of dirs) {
    const fullPath = path.join(__dirname, '..', dir);
    try {
      await fs.mkdir(fullPath, { recursive: true });
      console.log(`📁 ディレクトリ作成/確認: ${fullPath}`);
    } catch (error) {
      console.error(`ディレクトリ作成エラー ${dir}:`, error.message);
    }
  }
}

// 起動時にディレクトリを作成
ensureDirectories();

/**
 * 日報画像生成（LINE API要件対応版）
 */
router.post('/generate-report-image', async (req, res) => {
  let browser = null;
  try {
    const { reportData, userData, commentData, date } = req.body;
    
    console.log('[画像生成] 開始:', { 
      userName: userData?.name, 
      date: date || reportData?.date,
      hasReportData: !!reportData,
      hasUserData: !!userData,
      hasCommentData: !!commentData
    });
    
    // 必須データの検証
    if (!reportData || !userData) {
      throw new Error('必須データ（reportData, userData）が不足しています');
    }
    
    // データの正規化
    const normalizedData = normalizeReportData(reportData, userData, commentData, date);
    
    // HTMLテンプレートを生成（正方形レイアウト対応）
    const html = generateSquareLayoutHTML(normalizedData);
    
    // Puppeteerで画像生成
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--single-process'
      ]
    });
    
    const page = await browser.newPage();
    
    // 日本語フォントの設定
    await page.evaluateOnNewDocument(() => {
      document.documentElement.style.fontFamily = '"Noto Sans JP", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", sans-serif';
    });
    
    // 正方形のビューポート設定
    await page.setViewport({ width: 1024, height: 1024, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    // レンダリング完了を待つ
    const { setTimeout } = require('node:timers/promises');
    await setTimeout(2000);

    // スクリーンショット取得（PNG形式で一旦取得）
    const pngBuffer = await page.screenshot({
      type: 'png',
      fullPage: false, // ビューポートサイズで固定
      encoding: 'binary'
    });
    
    await browser.close();
    browser = null;
    
    // sharpを使用して画像を処理
    const imageId = `report_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    const imageDir = path.join(__dirname, '..', 'public', 'images');
    
    // 1024x1024のオリジナル画像（JPEG変換）
    const originalPath = path.join(imageDir, `${imageId}_original.jpg`);
    await sharp(pngBuffer)
      .resize(1024, 1024, { 
        fit: 'cover',
        position: 'top'
      })
      .jpeg({ 
        progressive: true,
        mozjpeg: true
      })
      .toFile(originalPath);
       
    
    console.log('[画像生成] 完了:', {
      imageId,
    });
    
    res.json({ 
      success: true, 
      imageId,
      originalSize: originalPath,
      imageUrl: `/images/${imageId}_original.jpg`,
      message: '画像生成完了'
    });
    
  } catch (error) {
    console.error('[画像生成] エラー:', error);
    if (browser) await browser.close();
    
    res.status(500).json({ 
      success: false, 
      message: '画像生成に失敗しました: ' + error.message
    });
  }
});

/**
 * 正方形レイアウト用HTMLテンプレート生成（全内容表示版）
 */
function generateSquareLayoutHTML(data) {
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
          font-size: 24px;
          font-weight: bold;
          color: #333;
          margin-bottom: 3px;
        }
        
        .date {
          font-size: 18px;
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
          font-size: 10px;
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
          font-size: 14px;
          font-weight: 600;
          color: #495057;
          margin-bottom: 2px;
        }
        
        .past-form-value {
          font-size: 10px;
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
          font-size: 22px;
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
          font-size: 22px;
          line-height: 1.3;
          background: rgba(255,255,255,0.1);
          padding: 8px;
          border-radius: 5px;
          margin-bottom: 4px;
          white-space: pre-wrap;
        }
        
        .comment-author {
          font-size: 16px;
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

          ${data.report.external_work_location ? `
            <div class="form-section compact">
              <label class="past-form-label">🏢 施設外就労先</label>
              <div class="past-form-value">${data.report.external_work_location}</div>
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
      external_work_location: reportData.external_work_location || null,
      temperature: reportData.temperature || '-',
      appetite: reportData.appetite || null,
      sleep_quality: reportData.sleep_quality || null,
      bedtime: reportData.bedtime || null,
      wakeup_time: reportData.wakeup_time || null,
      medication_time: reportData.medication_time || null,
      reflection: reportData.reflection || '',
      interview_request: reportData.interview_request || null
    },
    comment: commentData && commentData.comment ? {
      comment: commentData.comment,
      staff_name: commentData.staff_name,
      created_at: commentData.created_at
    } : null
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
    'good': '良好', 
    'normal': '普通',
    'poor': '不良',
    'bad': '悪い' 
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

module.exports = router;