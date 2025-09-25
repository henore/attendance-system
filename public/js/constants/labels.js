// /public/js/constants/labels.js
// ラベルとメッセージ定義

// ステータスラベル
export const STATUS_LABELS = {
    normal: '正常',
    late: '遅刻',
    early: '早退',
    absence: '欠勤',
    paid_leave: '有給欠勤'
};

// 権限ラベル
export const ROLE_LABELS = {
    user: '利用者',
    staff: 'スタッフ',
    admin: '管理者'
};

// サービス区分ラベル
export const SERVICE_TYPE_LABELS = {
    commute: '通所',
    home: '在宅'
};

// 食欲ラベル
export const APPETITE_LABELS = {
    good: 'あり',
    none: 'なし'
};

// 睡眠状態ラベル
export const SLEEP_QUALITY_LABELS = {
    good: '眠れた',
    poor: 'あまり眠れなかった',
    bad: '眠れなかった'
};

// 面談希望ラベル
export const INTERVIEW_REQUEST_LABELS = {
    consultation: '相談がある',
    interview: '面談希望'
};

// 施設外就労先名
export const EXTERNAL_WORK_LOCATION = '施設外就労先名（佐藤美幸）';

// システムメッセージ
export const MESSAGES = {
    // 認証関連
    AUTH: {
        LOGIN_SUCCESS: 'ログインしました',
        LOGIN_ERROR: 'ログインに失敗しました',
        LOGOUT_SUCCESS: 'ログアウトしました',
        SESSION_EXPIRED: 'セッションが期限切れです。再度ログインしてください',
        UNAUTHORIZED: '権限がありません'
    },
    
    // 出退勤関連
    ATTENDANCE: {
        CLOCK_IN_SUCCESS: (time) => `出勤しました（${time}）`,
        CLOCK_IN_ERROR: '出勤処理でエラーが発生しました',
        CLOCK_OUT_SUCCESS: (time) => `退勤しました（${time}）`,
        CLOCK_OUT_ERROR: '退勤処理でエラーが発生しました',
        NO_CLOCK_IN_RECORD: '出勤記録がありません',
        ALREADY_CLOCKED_IN: '既に出勤しています',
        ALREADY_CLOCKED_OUT: '既に退勤しています',
        BREAK_START_SUCCESS: (time) => `休憩開始（${time}）`,
        BREAK_END_SUCCESS: (time) => `休憩終了（${time}）`,
        BREAK_ALREADY_TAKEN: '本日の休憩は既に取得済みです'
    },
    
    // 日報関連
    REPORT: {
        SUBMIT_SUCCESS: '日報を提出しました',
        SUBMIT_ERROR: '日報の提出に失敗しました',
        UPDATE_SUCCESS: '日報を更新しました',
        UPDATE_ERROR: '日報の更新に失敗しました',
        REQUIRED_CLOCK_OUT: '退勤後に日報を提出してください',
        COMMENT_REQUIRED: 'コメントを入力してください',
        COMMENT_SUCCESS: 'コメントを記入しました',
        COMMENT_ERROR: 'コメントの記入に失敗しました'
    },
    
    // 共通
    COMMON: {
        SAVE_SUCCESS: '保存しました',
        SAVE_ERROR: '保存に失敗しました',
        DELETE_SUCCESS: '削除しました',
        DELETE_ERROR: '削除に失敗しました',
        UPDATE_SUCCESS: '更新しました',
        UPDATE_ERROR: '現在更新できません、時間を置いて再試行して下さい',
        LOADING: '読み込み中...',
        NO_DATA: 'データがありません',
        NETWORK_ERROR: 'ネットワークエラーが発生しました',
        VALIDATION_ERROR: '入力内容を確認してください'
    }
};