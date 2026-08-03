// routes/excel-export.js
// Excel出力API（月別出勤簿エクスポート）
const express = require('express');
const ExcelJS = require('exceljs');
const { calculateWorkHours, calculateBreakDuration, timeToMinutes } = require('../utils/date-time');

module.exports = function (dbGet, dbAll, dbRun, requireAuth, requireRole) {
    const router = express.Router();

    // 和暦変換
    function getWareki(year) {
        if (year >= 2019) return `令和${year - 2018}年`;
        if (year >= 1989) return `平成${year - 1988}年`;
        return `${year}年`;
    }

    // 実働時間計算（サーバーサイド版）
    function calcWorkMinutes(record) {
        if (!record.clock_in || !record.clock_out) return 0;
        const workHours = calculateWorkHours(record.clock_in, record.clock_out, 0);
        if (!workHours) return 0;

        let breakMin = 0;
        if (record.break_start && record.break_end) {
            breakMin = calculateBreakDuration(record.break_start, record.break_end);
        }
        let nakanukeMin = 0;
        if (record.nakanuke_minutes) {
            nakanukeMin = parseInt(record.nakanuke_minutes) || 0;
        }
        const net = Math.round(workHours * 60) - breakMin - nakanukeMin;
        return net > 0 ? net : 0;
    }

    // 分をHH:MM形式に変換
    function minToHHMM(min) {
        const h = Math.floor(min / 60);
        const m = min % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    // 月の日数取得
    function getDaysInMonth(year, month) {
        return new Date(year, month, 0).getDate();
    }

    // 曜日名
    const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

    // ===============================
    // パターン1: 月別出勤簿（実績記録票形式）
    // ===============================
    router.get('/monthly-attendance/:year/:month/:userId', requireAuth, requireRole(['admin']), async (req, res) => {
        try {
            const { year, month, userId } = req.params;
            const y = parseInt(year);
            const m = parseInt(month);

            if (!y || !m || !userId) {
                return res.status(400).json({ success: false, error: 'パラメータが不正です' });
            }

            const user = await dbGet(
                `SELECT id, username, name, role, service_type, service_no, workweek, transportation, hourly_wage
                 FROM users WHERE id = ? AND is_active >= 1`,
                [userId]
            );
            if (!user) {
                return res.status(404).json({ success: false, error: 'ユーザーが見つかりません' });
            }

            const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
            const endDate = `${y}-${String(m).padStart(2, '0')}-31`;

            const records = await dbAll(`
                SELECT
                    a.*,
                    a.nakanuke_start, a.nakanuke_minutes,
                    u.service_type,
                    CASE
                        WHEN u.role = 'user' THEN br.start_time
                        ELSE a.break_start
                    END as break_start,
                    CASE
                        WHEN u.role = 'user' THEN br.end_time
                        ELSE a.break_end
                    END as break_end,
                    CASE
                        WHEN u.role = 'user' THEN br.duration
                        ELSE NULL
                    END as break_duration
                FROM attendance a
                JOIN users u ON a.user_id = u.id
                LEFT JOIN break_records br ON a.user_id = br.user_id AND a.date = br.date AND u.role = 'user'
                WHERE a.user_id = ? AND a.date BETWEEN ? AND ?
                ORDER BY a.date
            `, [userId, startDate, endDate]);

            const recordMap = {};
            records.forEach(r => {
                const d = new Date(r.date);
                recordMap[d.getDate()] = r;
            });

            const daysInMonth = getDaysInMonth(y, m);
            const workbook = new ExcelJS.Workbook();

            if (user.role === 'user') {
                await buildUserJissekiSheet(workbook, y, m, user, recordMap, daysInMonth);
            } else {
                await buildStaffAttendanceSheet(workbook, y, m, user, recordMap, daysInMonth);
            }

            const filename = encodeURIComponent(`実績${y}_${user.name}.xlsx`);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);

            await workbook.xlsx.write(res);
            res.end();

        } catch (error) {
            console.error('Excel出力エラー:', error);
            res.status(500).json({ success: false, error: 'Excel出力に失敗しました' });
        }
    });

    // ===============================
    // パターン1-B: 年間一括（月別シート）
    // ===============================
    router.get('/monthly-attendance-yearly/:year/:userId', requireAuth, requireRole(['admin']), async (req, res) => {
        try {
            const { year, userId } = req.params;
            const y = parseInt(year);

            if (!y || !userId) {
                return res.status(400).json({ success: false, error: 'パラメータが不正です' });
            }

            const user = await dbGet(
                `SELECT id, username, name, role, service_type, service_no, workweek, transportation, hourly_wage
                 FROM users WHERE id = ? AND is_active >= 1`,
                [userId]
            );
            if (!user) {
                return res.status(404).json({ success: false, error: 'ユーザーが見つかりません' });
            }

            // 該当年に出勤記録がある月を取得
            const months = await dbAll(`
                SELECT DISTINCT CAST(strftime('%m', date) AS INTEGER) as month
                FROM attendance
                WHERE user_id = ? AND strftime('%Y', date) = ?
                ORDER BY month
            `, [userId, String(y)]);

            if (months.length === 0) {
                return res.status(404).json({ success: false, error: `${y}年の出勤記録がありません` });
            }

            const workbook = new ExcelJS.Workbook();

            for (const { month: m } of months) {
                const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
                const endDate = `${y}-${String(m).padStart(2, '0')}-31`;
                const daysInMonth = getDaysInMonth(y, m);

                const records = await dbAll(`
                    SELECT a.*, a.nakanuke_start, a.nakanuke_minutes, u.service_type,
                        CASE WHEN u.role = 'user' THEN br.start_time ELSE a.break_start END as break_start,
                        CASE WHEN u.role = 'user' THEN br.end_time ELSE a.break_end END as break_end,
                        CASE WHEN u.role = 'user' THEN br.duration ELSE NULL END as break_duration
                    FROM attendance a
                    JOIN users u ON a.user_id = u.id
                    LEFT JOIN break_records br ON a.user_id = br.user_id AND a.date = br.date AND u.role = 'user'
                    WHERE a.user_id = ? AND a.date BETWEEN ? AND ?
                    ORDER BY a.date
                `, [userId, startDate, endDate]);

                const recordMap = {};
                records.forEach(r => {
                    const d = new Date(r.date);
                    recordMap[d.getDate()] = r;
                });

                if (user.role === 'user') {
                    await buildUserJissekiSheet(workbook, y, m, user, recordMap, daysInMonth);
                } else {
                    await buildStaffAttendanceSheet(workbook, y, m, user, recordMap, daysInMonth);
                }
            }

            const filename = encodeURIComponent(`実績${y}_${user.name}.xlsx`);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);

            await workbook.xlsx.write(res);
            res.end();

        } catch (error) {
            console.error('年間Excel出力エラー:', error);
            res.status(500).json({ success: false, error: '年間Excel出力に失敗しました' });
        }
    });

    // 利用者の実績記録票シート生成
    async function buildUserJissekiSheet(workbook, year, month, user, recordMap, daysInMonth) {
        const ws = workbook.addWorksheet(`${month}月`);
        ws.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 };

        // A列は空列、B〜Oにデータ配置（15列）
        const C = 2; // データ開始列オフセット
        const LAST = C + 13; // 最終列 = 15
        ws.columns = [
            { width: 2 },    // A: 空列
            { width: 5 },    // B: 日付
            { width: 5 },    // C: 曜日
            { width: 9 },    // D: サービス提供の状況
            { width: 8 },    // E: 開始時間
            { width: 8 },    // F: 終了時間
            { width: 3.5 },  // G: 送迎往 (70%)
            { width: 3.5 },  // H: 送迎復 (70%)
            { width: 8 },    // I: 訪問支援特別加算
            { width: 5 },    // J: 食事提供加算 (70%)
            { width: 5 },    // K: 医療連携体制加算 (70%)
            { width: 5 },    // L: 地域協働加算 (70%)
            { width: 5 },    // M: 施設外加算 (70%)
            { width: 6.3 },  // N: 利用者確認欄 (70%)
            { width: 10 },   // O: 備考
        ];

        const thinBorder = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
        };
        const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
        const centerAlign = { horizontal: 'center', vertical: 'middle', wrapText: true };

        // 1行目は空行
        let row = 2;

        // ヘッダー行: 和暦 + タイトル
        ws.mergeCells(row, C, row, C + 1);
        ws.getCell(row, C).value = `${getWareki(year)} ${month}月`;
        ws.getCell(row, C).font = { size: 10 };
        ws.mergeCells(row, C + 2, row, C + 10);
        ws.getCell(row, C + 2).value = '就労継続支援提供実績記録票';
        ws.getCell(row, C + 2).font = { size: 14, bold: true };
        ws.getCell(row, C + 2).alignment = { horizontal: 'center', vertical: 'middle' };
        row++;

        // 情報行1
        ws.getCell(row, C).value = '受給者番号';
        ws.getCell(row, C).fill = headerFill;
        ws.getCell(row, C).font = { size: 8, bold: true };
        ws.getCell(row, C).alignment = centerAlign;
        ws.getCell(row, C).border = thinBorder;
        ws.mergeCells(row, C + 1, row, C + 3);
        ws.getCell(row, C + 1).value = user.service_no || '';
        ws.getCell(row, C + 1).alignment = centerAlign;
        ws.getCell(row, C + 1).border = thinBorder;
        ws.getCell(row, C + 4).value = '支給決定障害者氏名';
        ws.getCell(row, C + 4).fill = headerFill;
        ws.getCell(row, C + 4).font = { size: 8, bold: true };
        ws.getCell(row, C + 4).alignment = centerAlign;
        ws.getCell(row, C + 4).border = thinBorder;
        ws.mergeCells(row, C + 5, row, C + 8);
        ws.getCell(row, C + 5).value = user.name;
        ws.getCell(row, C + 5).alignment = centerAlign;
        ws.getCell(row, C + 5).border = thinBorder;
        ws.getCell(row, C + 9).value = '事業所番号';
        ws.getCell(row, C + 9).fill = headerFill;
        ws.getCell(row, C + 9).font = { size: 8, bold: true };
        ws.getCell(row, C + 9).alignment = centerAlign;
        ws.getCell(row, C + 9).border = thinBorder;
        ws.mergeCells(row, C + 10, row, C + 13);
        ws.getCell(row, C + 10).value = '1412801597';
        ws.getCell(row, C + 10).alignment = centerAlign;
        ws.getCell(row, C + 10).border = thinBorder;
        row++;

        // 情報行2（高さ半分）
        ws.getCell(row, C).value = '契約支給量';
        ws.getCell(row, C).fill = headerFill;
        ws.getCell(row, C).font = { size: 8, bold: true };
        ws.getCell(row, C).alignment = centerAlign;
        ws.getCell(row, C).border = thinBorder;
        ws.mergeCells(row, C + 1, row, C + 5);
        ws.getCell(row, C + 1).value = '就労支援B型　原則の日数';
        ws.getCell(row, C + 1).alignment = centerAlign;
        ws.getCell(row, C + 1).border = thinBorder;
        ws.mergeCells(row, C + 6, row, C + 8);
        ws.getCell(row, C + 6).value = '事業者及びその事業所';
        ws.getCell(row, C + 6).fill = headerFill;
        ws.getCell(row, C + 6).font = { size: 8, bold: true };
        ws.getCell(row, C + 6).alignment = centerAlign;
        ws.getCell(row, C + 6).border = thinBorder;
        ws.mergeCells(row, C + 9, row, C + 13);
        ws.getCell(row, C + 9).value = 'はっぴぃたいむ渋沢';
        ws.getCell(row, C + 9).alignment = centerAlign;
        ws.getCell(row, C + 9).border = thinBorder;
        ws.getRow(row).height = 25;
        row++;

        // メインテーブルヘッダー（3行）
        const headerStartRow = row;

        // ヘッダー行1
        ws.getCell(row, C).value = '日付';
        ws.mergeCells(row, C, row + 2, C);
        ws.getCell(row, C + 1).value = '曜日';
        ws.mergeCells(row, C + 1, row + 2, C + 1);
        ws.mergeCells(row, C + 2, row, C + 11);
        ws.getCell(row, C + 2).value = 'サービス提供実績';
        ws.getCell(row, C + 12).value = '利用者\n確認欄';
        ws.mergeCells(row, C + 12, row + 2, C + 12);
        ws.getCell(row, C + 13).value = '備考';
        ws.mergeCells(row, C + 13, row + 2, C + 13);
        row++;

        // ヘッダー行2
        ws.getCell(row, C + 2).value = 'サービス提供\nの状況';
        ws.mergeCells(row, C + 2, row + 1, C + 2);
        ws.getCell(row, C + 3).value = '開始\n時間';
        ws.mergeCells(row, C + 3, row + 1, C + 3);
        ws.getCell(row, C + 4).value = '終了\n時間';
        ws.mergeCells(row, C + 4, row + 1, C + 4);
        ws.mergeCells(row, C + 5, row, C + 6);
        ws.getCell(row, C + 5).value = '送迎加算';
        ws.getCell(row, C + 7).value = '訪問支援\n特別加算';
        ws.getCell(row, C + 8).value = '食事提供\n加算';
        ws.mergeCells(row, C + 8, row + 1, C + 8);
        ws.getCell(row, C + 9).value = '医療連携\n体制加算';
        ws.mergeCells(row, C + 9, row + 1, C + 9);
        ws.getCell(row, C + 10).value = '地域協働\n加算';
        ws.mergeCells(row, C + 10, row + 1, C + 10);
        ws.getCell(row, C + 11).value = '施設外\n加算';
        ws.mergeCells(row, C + 11, row + 1, C + 11);
        row++;

        // ヘッダー行3
        ws.getCell(row, C + 5).value = '往';
        ws.getCell(row, C + 6).value = '復';
        ws.getCell(row, C + 7).value = '時間数';
        row++;

        // ヘッダーセルのスタイル適用
        const smallFontCols = [C + 7, C + 8, C + 9, C + 10, C + 11];
        const noBoldCols = [C + 5, C + 7, C + 8, C + 9, C + 10, C + 11];
        for (let r = headerStartRow; r < row; r++) {
            for (let c = C; c <= LAST; c++) {
                const cell = ws.getCell(r, c);
                cell.fill = headerFill;
                const isBold = !noBoldCols.includes(c);
                cell.font = smallFontCols.includes(c)
                    ? { size: 5.5, bold: false }
                    : { size: 7, bold: isBold };
                cell.alignment = centerAlign;
                cell.border = thinBorder;
            }
            ws.getRow(r).height = (r === headerStartRow) ? 22 : 18;
        }

        // データ行（31行固定、行高2倍、縦横中央）
        let totalWorkDays = 0;
        let totalTransport = 0;
        let totalMinutes = 0;

        for (let day = 1; day <= 31; day++) {
            if (day <= daysInMonth) {
                const record = recordMap[day];
                const date = new Date(year, month - 1, day);
                const dayName = DAY_NAMES[date.getDay()];
                const isAttended = record && record.clock_in;

                ws.getCell(row, C).value = day;
                ws.getCell(row, C + 1).value = dayName;

                if (date.getDay() === 0) {
                    ws.getCell(row, C + 1).font = { size: 8, color: { argb: 'FFFF0000' } };
                } else if (date.getDay() === 6) {
                    ws.getCell(row, C + 1).font = { size: 8, color: { argb: 'FF0000FF' } };
                } else {
                    ws.getCell(row, C + 1).font = { size: 8 };
                }

                if (isAttended) {
                    totalWorkDays++;
                    const serviceStatus = record.service_type === 'commute' ? '通所' : record.service_type === 'home' ? '在宅' : '';
                    ws.getCell(row, C + 2).value = serviceStatus;
                    ws.getCell(row, C + 3).value = record.clock_in;
                    ws.getCell(row, C + 4).value = record.clock_out || '';

                    if (user.transportation === 1) {
                        ws.getCell(row, C + 5).value = '1';
                        ws.getCell(row, C + 6).value = '1';
                        totalTransport++;
                    }

                    const workMin = calcWorkMinutes(record);
                    totalMinutes += workMin;
                }
            }

            for (let c = C; c <= LAST; c++) {
                const cell = ws.getCell(row, c);
                cell.border = thinBorder;
                cell.alignment = centerAlign;
                if (!cell.font) cell.font = { size: 8 };
            }
            ws.getRow(row).height = 36;
            row++;
        }

        // 合計行（小さめ）
        const totalRow1 = row;
        ws.mergeCells(row, C, row + 1, C + 4);
        ws.getCell(row, C).value = '合計';
        ws.getCell(row, C).font = { size: 9, bold: true };
        ws.getCell(row, C).alignment = centerAlign;
        ws.mergeCells(row, C + 5, row + 1, C + 6);
        ws.getCell(row, C + 5).value = totalTransport > 0 ? `${totalTransport * 2}回` : '回';
        ws.getCell(row, C + 5).alignment = centerAlign;

        [C + 7, C + 8, C + 9, C + 10, C + 11].forEach(c => {
            ws.mergeCells(row, c, row + 1, c);
            ws.getCell(row, c).value = '回';
            ws.getCell(row, c).alignment = centerAlign;
        });

        ws.getCell(row, C + 12).value = '施設外支援\n当月　　日';
        ws.getCell(row, C + 12).font = { size: 7 };
        ws.getCell(row, C + 12).alignment = centerAlign;
        ws.mergeCells(row, C + 13, row + 1, C + 13);
        ws.getCell(row, C + 13).value = '';
        row++;
        ws.getCell(row, C + 12).value = '累計　　日/180日';
        ws.getCell(row, C + 12).font = { size: 7 };
        ws.getCell(row, C + 12).alignment = centerAlign;

        for (let r = totalRow1; r <= row; r++) {
            ws.getRow(r).height = 14;
            for (let c = C; c <= LAST; c++) {
                ws.getCell(r, c).border = thinBorder;
            }
        }
        row++;

        // 空行
        row++;

        // 初期加算行
        ws.mergeCells(row, C, row, C + 1);
        ws.getCell(row, C).value = '初期加算';
        ws.getCell(row, C).border = thinBorder;
        ws.getCell(row, C).alignment = centerAlign;
        ws.getCell(row, C).font = { size: 8 };
        ws.mergeCells(row, C + 2, row, C + 3);
        ws.getCell(row, C + 2).value = '利用開始日';
        ws.getCell(row, C + 2).border = thinBorder;
        ws.getCell(row, C + 2).alignment = centerAlign;
        ws.getCell(row, C + 2).font = { size: 8 };
        ws.mergeCells(row, C + 4, row, C + 5);
        ws.getCell(row, C + 4).value = '';
        ws.getCell(row, C + 4).border = thinBorder;
        ws.mergeCells(row, C + 6, row, C + 7);
        ws.getCell(row, C + 6).value = '30日目';
        ws.getCell(row, C + 6).border = thinBorder;
        ws.getCell(row, C + 6).alignment = centerAlign;
        ws.getCell(row, C + 6).font = { size: 8 };
        ws.mergeCells(row, C + 8, row, C + 9);
        ws.getCell(row, C + 8).value = '';
        ws.getCell(row, C + 8).border = thinBorder;
        ws.mergeCells(row, C + 10, row, C + 11);
        ws.getCell(row, C + 10).value = '当月算定日数';
        ws.getCell(row, C + 10).border = thinBorder;
        ws.getCell(row, C + 10).alignment = centerAlign;
        ws.getCell(row, C + 10).font = { size: 8 };
        ws.mergeCells(row, C + 12, row, C + 13);
        ws.getCell(row, C + 12).value = totalWorkDays;
        ws.getCell(row, C + 12).border = thinBorder;
        ws.getCell(row, C + 12).alignment = centerAlign;
        ws.getCell(row, C + 12).font = { size: 8 };
        row++;

        // 勤務時間合計 + 枚数
        row++;
        ws.mergeCells(row, C, row, C + 6);
        ws.getCell(row, C).value = `勤務時間　${minToHHMM(totalMinutes)} 時間`;
        ws.getCell(row, C).font = { size: 10, bold: true };
        ws.mergeCells(row, C + 9, row, C + 13);
        ws.getCell(row, C + 9).value = '1 枚中 1 枚';
        ws.getCell(row, C + 9).alignment = { horizontal: 'right', vertical: 'middle' };
        ws.getCell(row, C + 9).font = { size: 10 };
    }

    // スタッフ・管理者の月別出勤簿シート生成
    async function buildStaffAttendanceSheet(workbook, year, month, user, recordMap, daysInMonth) {
        const ws = workbook.addWorksheet(`${month}月`);
        ws.pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 1 };

        const thinBorder = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
        };
        const centerAlign = { horizontal: 'center', vertical: 'middle', wrapText: true };
        const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3F2FD' } };
        const isStaff = user.role === 'staff';

        // 列幅
        const cols = [
            { width: 5 },   // A: 日
            { width: 5 },   // B: 曜
            { width: 9 },   // C: 出勤
            { width: 9 },   // D: 退勤
            { width: 18 },  // E: 休憩
            ...(isStaff ? [{ width: 8 }] : []),  // F: 中抜け（staffのみ）
            { width: 9 },   // 実働
            { width: 8 },   // 状態
        ];
        ws.columns = cols;
        const totalCols = cols.length;

        let row = 1;

        // タイトル
        ws.mergeCells(row, 1, row, totalCols);
        const roleLabel = user.role === 'staff' ? 'スタッフ' : '管理者';
        ws.getCell(row, 1).value = `${user.name}さんの${year}年${month}月出勤記録（${roleLabel}）`;
        ws.getCell(row, 1).font = { size: 14, bold: true };
        ws.getCell(row, 1).alignment = { horizontal: 'center', vertical: 'middle' };
        row += 2;

        // ヘッダー
        const headers = ['日', '曜', '出勤', '退勤', '休憩'];
        if (isStaff) headers.push('中抜け');
        headers.push('実働', '状態');

        headers.forEach((h, i) => {
            const cell = ws.getCell(row, i + 1);
            cell.value = h;
            cell.fill = headerFill;
            cell.font = { size: 9, bold: true };
            cell.alignment = centerAlign;
            cell.border = thinBorder;
        });
        row++;

        // データ行
        let totalWorkDays = 0;
        let totalMinutes = 0;

        for (let day = 1; day <= daysInMonth; day++) {
            const record = recordMap[day];
            const date = new Date(year, month - 1, day);
            const dayName = DAY_NAMES[date.getDay()];
            let col = 1;

            ws.getCell(row, col).value = day;
            ws.getCell(row, col).alignment = centerAlign;
            ws.getCell(row, col).border = thinBorder;
            col++;

            ws.getCell(row, col).value = dayName;
            ws.getCell(row, col).alignment = centerAlign;
            ws.getCell(row, col).border = thinBorder;
            if (date.getDay() === 0) {
                ws.getCell(row, col).font = { size: 8, color: { argb: 'FFFF0000' } };
            } else if (date.getDay() === 6) {
                ws.getCell(row, col).font = { size: 8, color: { argb: 'FF0000FF' } };
            }
            col++;

            if (record && record.clock_in) {
                totalWorkDays++;
                ws.getCell(row, col).value = record.clock_in;
                col++;
                ws.getCell(row, col).value = record.clock_out || '';
                col++;

                // 休憩
                let breakDisplay = '';
                if (record.break_start && record.break_end) {
                    breakDisplay = `${record.break_start}〜${record.break_end}`;
                } else if (record.break_start) {
                    breakDisplay = `${record.break_start}〜`;
                }
                ws.getCell(row, col).value = breakDisplay;
                col++;

                // 中抜け（staffのみ）
                if (isStaff) {
                    let nakanukeDisplay = '';
                    if (record.nakanuke_minutes && record.nakanuke_minutes > 0) {
                        nakanukeDisplay = `${record.nakanuke_minutes}分`;
                    }
                    ws.getCell(row, col).value = nakanukeDisplay;
                    col++;
                }

                // 実働
                const workMin = calcWorkMinutes(record);
                totalMinutes += workMin;
                ws.getCell(row, col).value = workMin > 0 ? minToHHMM(workMin) : '';
                col++;

                // 状態
                const statusMap = { normal: '正常', late: '遅刻', early: '早退', absence: '欠勤', paid_leave: '有給' };
                ws.getCell(row, col).value = statusMap[record.status] || '-';
                col++;
            } else {
                // 空行
                for (let i = col; i <= totalCols; i++) {
                    ws.getCell(row, i).value = '';
                }
            }

            // ボーダー適用
            for (let c = 1; c <= totalCols; c++) {
                const cell = ws.getCell(row, c);
                cell.border = thinBorder;
                cell.alignment = centerAlign;
                if (!cell.font) cell.font = { size: 8 };
            }

            // 土日の背景色
            if (date.getDay() === 0) {
                for (let c = 1; c <= totalCols; c++) {
                    ws.getCell(row, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEBEE' } };
                }
            } else if (date.getDay() === 6) {
                for (let c = 1; c <= totalCols; c++) {
                    ws.getCell(row, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3F2FD' } };
                }
            }

            row++;
        }

        // 集計行
        ws.mergeCells(row, 1, row, 2);
        ws.getCell(row, 1).value = '月間集計';
        ws.getCell(row, 1).font = { size: 9, bold: true };
        ws.getCell(row, 1).alignment = centerAlign;
        ws.getCell(row, 1).border = thinBorder;

        ws.mergeCells(row, 3, row, 4);
        ws.getCell(row, 3).value = `出勤日数: ${totalWorkDays}日`;
        ws.getCell(row, 3).alignment = centerAlign;
        ws.getCell(row, 3).border = thinBorder;

        const restCols = isStaff ? [5, 6, 7, 8] : [5, 6, 7];
        const midIdx = Math.floor(restCols.length / 2);
        ws.mergeCells(row, restCols[0], row, restCols[restCols.length - 1]);
        ws.getCell(row, restCols[0]).value = `総実働: ${minToHHMM(totalMinutes)}`;
        ws.getCell(row, restCols[0]).alignment = centerAlign;
        ws.getCell(row, restCols[0]).border = thinBorder;

        for (let c = 1; c <= totalCols; c++) {
            ws.getCell(row, c).border = thinBorder;
            ws.getCell(row, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
        }
    }

    // ===============================
    // パターン2: 日報+サービス提供記録（日別シート）
    // ===============================
    router.get('/daily-reports/:year/:month/:userId', requireAuth, requireRole(['admin']), async (req, res) => {
        try {
            const { year, month, userId } = req.params;
            const y = parseInt(year);
            const m = parseInt(month);

            if (!y || !m || !userId) {
                return res.status(400).json({ success: false, error: 'パラメータが不正です' });
            }

            const user = await dbGet(
                `SELECT id, username, name, role, service_type, service_no, workweek, transportation
                 FROM users WHERE id = ? AND is_active >= 1`,
                [userId]
            );
            if (!user) {
                return res.status(404).json({ success: false, error: 'ユーザーが見つかりません' });
            }

            const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
            const endDate = `${y}-${String(m).padStart(2, '0')}-31`;
            const daysInMonth = getDaysInMonth(y, m);

            // 出勤記録
            const attendance = await dbAll(`
                SELECT a.*,
                    CASE WHEN u.role = 'user' THEN br.start_time ELSE a.break_start END as break_start,
                    CASE WHEN u.role = 'user' THEN br.end_time ELSE a.break_end END as break_end
                FROM attendance a
                JOIN users u ON a.user_id = u.id
                LEFT JOIN break_records br ON a.user_id = br.user_id AND a.date = br.date AND u.role = 'user'
                WHERE a.user_id = ? AND a.date BETWEEN ? AND ?
                ORDER BY a.date
            `, [userId, startDate, endDate]);

            // 日報
            const reports = await dbAll(
                `SELECT * FROM daily_reports WHERE user_id = ? AND date BETWEEN ? AND ? ORDER BY date`,
                [userId, startDate, endDate]
            );

            // スタッフコメント
            const comments = await dbAll(`
                SELECT sc.*, u.name as staff_name
                FROM staff_comments sc
                JOIN users u ON sc.staff_id = u.id
                WHERE sc.user_id = ? AND sc.date BETWEEN ? AND ?
                ORDER BY sc.date
            `, [userId, startDate, endDate]);

            // サービス提供記録（staff_daily_reportsの中からこのユーザーへのエントリを検索）
            const serviceEntries = await dbAll(`
                SELECT sdr.date, sdr.work_report, u.name as staff_name
                FROM staff_daily_reports sdr
                JOIN users u ON sdr.staff_id = u.id
                WHERE sdr.date BETWEEN ? AND ?
                ORDER BY sdr.date
            `, [startDate, endDate]);

            // データをマップ化
            const attendanceMap = {};
            attendance.forEach(r => { attendanceMap[r.date] = r; });
            const reportMap = {};
            reports.forEach(r => { reportMap[r.date] = r; });
            const commentMap = {};
            comments.forEach(r => { commentMap[r.date] = r; });

            // サービス提供記録をユーザーIDでフィルタ
            const serviceMap = {};
            serviceEntries.forEach(entry => {
                try {
                    const parsed = JSON.parse(entry.work_report);
                    const entries = parsed.entries || [];
                    const userEntries = entries.filter(e => String(e.user_id) === String(userId));
                    if (userEntries.length > 0) {
                        if (!serviceMap[entry.date]) serviceMap[entry.date] = [];
                        userEntries.forEach(ue => {
                            serviceMap[entry.date].push({
                                staff_name: entry.staff_name,
                                work_content: ue.work_content || '',
                                support_content: ue.support_content || '',
                                user_condition: ue.user_condition || '',
                                attendance_info: ue.attendance_info || ''
                            });
                        });
                    }
                } catch (e) { /* JSONパース失敗は無視 */ }
            });

            const workbook = new ExcelJS.Workbook();

            // 目次シート
            const indexWs = workbook.addWorksheet('目次');
            indexWs.columns = [
                { width: 8 },
                { width: 12 },
                { width: 15 },
                { width: 15 },
                { width: 10 },
                { width: 10 },
            ];
            const thinBorder = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            const centerAlign = { horizontal: 'center', vertical: 'middle', wrapText: true };
            const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3F2FD' } };

            indexWs.mergeCells('A1:F1');
            indexWs.getCell('A1').value = `${user.name}　${y}年${m}月 日報・サービス提供記録`;
            indexWs.getCell('A1').font = { size: 14, bold: true };
            indexWs.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };

            const indexHeaders = ['日', '曜日', '出勤', '退勤', '日報', 'サービス記録'];
            indexHeaders.forEach((h, i) => {
                const cell = indexWs.getCell(3, i + 1);
                cell.value = h;
                cell.fill = headerFill;
                cell.font = { size: 9, bold: true };
                cell.alignment = centerAlign;
                cell.border = thinBorder;
            });

            let sheetsCreated = 0;

            for (let day = 1; day <= daysInMonth; day++) {
                const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const date = new Date(y, m - 1, day);
                const dayName = DAY_NAMES[date.getDay()];
                const att = attendanceMap[dateStr];
                const report = reportMap[dateStr];
                const comment = commentMap[dateStr];
                const services = serviceMap[dateStr] || [];

                const hasData = report || services.length > 0;
                const indexRow = day + 3;

                // 目次行
                indexWs.getCell(indexRow, 1).value = day;
                indexWs.getCell(indexRow, 2).value = dayName;
                indexWs.getCell(indexRow, 3).value = att ? att.clock_in || '' : '';
                indexWs.getCell(indexRow, 4).value = att ? att.clock_out || '' : '';
                indexWs.getCell(indexRow, 5).value = report ? '○' : '';
                indexWs.getCell(indexRow, 6).value = services.length > 0 ? '○' : '';

                for (let c = 1; c <= 6; c++) {
                    indexWs.getCell(indexRow, c).border = thinBorder;
                    indexWs.getCell(indexRow, c).alignment = centerAlign;
                    indexWs.getCell(indexRow, c).font = { size: 9 };
                }
                indexWs.getRow(indexRow).height = 45;

                if (date.getDay() === 0) {
                    indexWs.getCell(indexRow, 2).font = { size: 9, color: { argb: 'FFFF0000' } };
                } else if (date.getDay() === 6) {
                    indexWs.getCell(indexRow, 2).font = { size: 9, color: { argb: 'FF0000FF' } };
                }

                if (hasData) {
                    indexWs.getCell(indexRow, 5).font = { size: 9, color: { argb: 'FF008000' } };
                    indexWs.getCell(indexRow, 6).font = { size: 9, color: { argb: 'FF0000FF' } };
                }

                // データがある日のみシート作成
                if (!hasData) continue;

                const sheetName = `${y}${String(m).padStart(2, '0')}${String(day).padStart(2, '0')}`;
                const ws = workbook.addWorksheet(sheetName);
                ws.pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 1 };
                ws.columns = [
                    { width: 16 },
                    { width: 90 },
                ];
                sheetsCreated++;

                let row = 1;
                const labelFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
                const sectionFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } };
                const serviceFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3F2FD' } };

                const colBWidth = 90;
                const calcTextHeight = (text, lineH = 15, padding = 30) => {
                    const str = String(text);
                    const explicitLines = str.split('\n');
                    let totalLines = 0;
                    for (const line of explicitLines) {
                        let charWidth = 0;
                        for (const ch of line) {
                            charWidth += ch.charCodeAt(0) > 255 ? 2 : 1;
                        }
                        totalLines += Math.max(1, Math.ceil(charWidth / colBWidth));
                    }
                    return totalLines * lineH + padding;
                };

                // 日付ヘッダー
                ws.mergeCells(row, 1, row, 2);
                ws.getCell(row, 1).value = `${y}年${m}月${day}日（${dayName}）`;
                ws.getCell(row, 1).font = { size: 13, bold: true };
                ws.getCell(row, 1).alignment = { horizontal: 'center', vertical: 'middle' };
                ws.getCell(row, 1).fill = headerFill;
                ws.getCell(row, 1).border = thinBorder;
                row++;

                // 出退勤情報
                ws.getCell(row, 1).value = '出退勤';
                ws.getCell(row, 1).fill = labelFill;
                ws.getCell(row, 1).font = { size: 9, bold: true };
                ws.getCell(row, 1).border = thinBorder;
                ws.getCell(row, 1).alignment = centerAlign;
                let attInfo = '';
                if (att) {
                    attInfo = `出勤: ${att.clock_in || '-'}　退勤: ${att.clock_out || '-'}`;
                    if (att.break_start) attInfo += `　休憩: ${att.break_start}〜${att.break_end || ''}`;
                } else {
                    attInfo = '出勤記録なし';
                }
                ws.getCell(row, 2).value = attInfo;
                ws.getCell(row, 2).border = thinBorder;
                ws.getCell(row, 2).font = { size: 9 };
                ws.getCell(row, 2).alignment = { vertical: 'middle', wrapText: true };
                row++;

                // 日報セクション
                if (report) {
                    ws.mergeCells(row, 1, row, 2);
                    ws.getCell(row, 1).value = '日報';
                    ws.getCell(row, 1).font = { size: 11, bold: true };
                    ws.getCell(row, 1).fill = sectionFill;
                    ws.getCell(row, 1).border = thinBorder;
                    ws.getCell(row, 1).alignment = { horizontal: 'center', vertical: 'middle' };
                    row++;

                    const reportItems = [
                        ['作業内容', report.work_content || ''],
                        ['作業場所', report.work_location === 'home' ? '在宅' : report.work_location === 'office' ? '通所' : (report.work_location || '')],
                        ['施設外就労先', report.external_work_location || ''],
                        ['PC番号', report.pc_number || ''],
                        ['体温', report.temperature ? `${report.temperature}℃` : ''],
                        ['食欲', report.appetite === 'good' ? 'あり' : report.appetite === 'none' ? 'なし' : ''],
                        ['服薬時間', report.medication_time || ''],
                        ['就寝時間', report.bedtime || ''],
                        ['起床時間', report.wakeup_time || ''],
                        ['睡眠の質', report.sleep_quality === 'good' ? '良い' : report.sleep_quality === 'poor' ? '普通' : report.sleep_quality === 'bad' ? '悪い' : ''],
                        ['振り返り', report.reflection || ''],
                        ['連絡時間1', report.contact_time_1 || ''],
                        ['連絡時間2', report.contact_time_2 || ''],
                    ];

                    if (report.interview_request) {
                        const reqLabel = report.interview_request === 'consultation' ? '相談希望' : '面談希望';
                        reportItems.push(['面談希望', reqLabel]);
                    }

                    const dynamicHeightLabels = ['振り返り'];
                    reportItems.forEach(([label, value]) => {
                        if (!value) return;
                        ws.getCell(row, 1).value = label;
                        ws.getCell(row, 1).fill = labelFill;
                        ws.getCell(row, 1).font = { size: 9, bold: true };
                        ws.getCell(row, 1).border = thinBorder;
                        ws.getCell(row, 1).alignment = centerAlign;
                        ws.getCell(row, 2).value = value;
                        ws.getCell(row, 2).border = thinBorder;
                        ws.getCell(row, 2).font = { size: 9 };
                        ws.getCell(row, 2).alignment = { vertical: 'middle', wrapText: true };
                        if (dynamicHeightLabels.includes(label)) {
                            ws.getRow(row).height = calcTextHeight(value);
                        } else if (label === '作業内容') {
                            ws.getRow(row).height = 45;
                        } else {
                            ws.getRow(row).height = 30;
                        }
                        row++;
                    });
                }

                // スタッフコメント
                if (comment) {
                    ws.getCell(row, 1).value = 'スタッフコメント';
                    ws.getCell(row, 1).fill = labelFill;
                    ws.getCell(row, 1).font = { size: 9, bold: true };
                    ws.getCell(row, 1).border = thinBorder;
                    ws.getCell(row, 1).alignment = centerAlign;
                    const commentText = `${comment.staff_name}: ${comment.comment}`;
                    ws.getCell(row, 2).value = commentText;
                    ws.getCell(row, 2).border = thinBorder;
                    ws.getCell(row, 2).font = { size: 9 };
                    ws.getCell(row, 2).alignment = { vertical: 'middle', wrapText: true };
                    ws.getRow(row).height = calcTextHeight(commentText);
                    row++;
                }

                // サービス提供記録
                if (services.length > 0) {
                    row++;
                    ws.mergeCells(row, 1, row, 2);
                    ws.getCell(row, 1).value = 'サービス提供記録';
                    ws.getCell(row, 1).font = { size: 11, bold: true };
                    ws.getCell(row, 1).fill = serviceFill;
                    ws.getCell(row, 1).border = thinBorder;
                    ws.getCell(row, 1).alignment = { horizontal: 'center', vertical: 'middle' };
                    row++;

                    services.forEach((svc, idx) => {
                        if (services.length > 1) {
                            ws.mergeCells(row, 1, row, 2);
                            ws.getCell(row, 1).value = `記録 ${idx + 1}（${svc.staff_name}）`;
                            ws.getCell(row, 1).font = { size: 9, bold: true, color: { argb: 'FF1565C0' } };
                            ws.getCell(row, 1).border = thinBorder;
                            row++;
                        } else {
                            ws.getCell(row, 1).value = '記録者';
                            ws.getCell(row, 1).fill = labelFill;
                            ws.getCell(row, 1).font = { size: 9, bold: true };
                            ws.getCell(row, 1).border = thinBorder;
                            ws.getCell(row, 1).alignment = centerAlign;
                            ws.getCell(row, 2).value = svc.staff_name;
                            ws.getCell(row, 2).border = thinBorder;
                            ws.getCell(row, 2).font = { size: 9 };
                            row++;
                        }

                        const svcItems = [
                            ['作業内容', svc.work_content],
                            ['支援内容', svc.support_content],
                            ['利用者の様子', svc.user_condition],
                            ['出退勤情報', svc.attendance_info],
                        ];
                        svcItems.forEach(([label, value]) => {
                            if (!value) return;
                            ws.getCell(row, 1).value = label;
                            ws.getCell(row, 1).fill = labelFill;
                            ws.getCell(row, 1).font = { size: 9, bold: true };
                            ws.getCell(row, 1).border = thinBorder;
                            ws.getCell(row, 1).alignment = centerAlign;
                            ws.getCell(row, 2).value = value;
                            ws.getCell(row, 2).border = thinBorder;
                            ws.getCell(row, 2).font = { size: 9 };
                            ws.getCell(row, 2).alignment = { vertical: 'middle', wrapText: true };
                            ws.getRow(row).height = 30;
                            row++;
                        });
                    });
                }
            }

            if (sheetsCreated === 0) {
                const emptyWs = workbook.addWorksheet('データなし');
                emptyWs.getCell('A1').value = `${y}年${m}月のデータはありません`;
            }

            const filename = encodeURIComponent(`日報記録_${user.name}_${y}年${m}月.xlsx`);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);

            await workbook.xlsx.write(res);
            res.end();

        } catch (error) {
            console.error('日報Excel出力エラー:', error);
            res.status(500).json({ success: false, error: '日報Excel出力に失敗しました' });
        }
    });

    return router;
};
