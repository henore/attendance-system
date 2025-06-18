// modules/user/terms-modal.js
// 利用規約確認モーダルの管理

import { modalManager } from '../shared/modal-manager.js';

export class TermsModal {
  constructor(updateClockInButtonState, showNotification) {
    this.updateClockInButtonState = updateClockInButtonState;
    this.showNotification = showNotification;
    this.modalId = 'termsConfirmModal';
    this.hasAcceptedTerms = false;
  }

  /**
   * モーダルを表示
   * @param {Function} onConfirm 
   */
  show(onConfirm) {
    const content = this.generateModalContent();
    
    // モーダルを作成
    this.createModal(content);
    
    // イベントリスナー設定
    this.setupEventListeners(onConfirm);
    
    // モーダル表示
    const modal = new bootstrap.Modal(document.getElementById(this.modalId));
    modal.show();
    
    // 出勤ボタンを無効化
    this.updateClockInButtonState(true, '利用規約の確認が必要です');
  }

  /**
   * モーダルコンテンツを生成
   */
  generateModalContent() {
    return `
      <div class="alert alert-info mb-3">
        <i class="fas fa-info-circle"></i> <strong>利用規約を確認してください。</strong>
        <br>確認後、本日の出勤が可能になります。
      </div>
      
      <div class="terms-content" style="max-height: 400px; overflow-y: auto; border: 1px solid #dee2e6; padding: 1rem; background-color: #f8f9fa;">
        <h5 class="text-center mb-3">パソコン利用規約</h5>
        
        <p>作業に使用する<strong><u>パソコンは当施設帰属の物品</u></strong>です。<br>
        使用する際は<strong><u>下記ルールに従い細心の注意</u></strong>を払って利用しましょう。</p>
        
        <ol>
          <li class="mb-2">
            パソコン作業中は<strong><u>テーブルの上を極力片付け</u></strong>、タイピングやマウスの動きの障害になるような物は置かないように心がけましょう。
          </li>
          
          <li class="mb-2">
            パソコン作業中の<strong><u>テーブルに置く事が出来る飲み物は、キャップや蓋のついた物</u></strong>だけです。
            <strong><u>キャップや蓋で密閉される事により、逆さまにしても水分が漏れない飲み物以外は絶対禁止</u></strong>です。
          </li>
          
          <li class="mb-2">
            <u>パソコン作業中の<strong>スマートフォン、携帯電話、カメラ、ビデオカメラなどの画像・映像記憶機能を有する機器の使用は、個人情報漏洩の観点から原則使用禁止</strong></u>です。
            USBメモリや外付けハードディスクなどの<strong><u>ストレージデバイスも同様</u></strong>です。
            <strong><u>緊急時や作業に必要な事由がある場合のみ許可</u></strong>をしますので、<strong><u>スタッフに申告</u></strong>してからご使用ください。
          </li>
          
          <li class="mb-2">
            お昼の食事休憩など<strong><u>食事を取る際はパソコンをスタッフに返却</u></strong>してから行いましょう。
            また10分休憩時は<strong><u>パソコンの画面を閉じて、</u></strong>しっかり休憩を取る様にしましょう。
          </li>
          
          <li class="mb-2">
            パソコンを使用する前は<strong><u>必ず手洗い</u></strong>を行ってください。
            <strong><u>出勤時、トイレ使用時、食後、喫煙後など、必ず手洗いとアルコール消毒</u></strong>を行ってから、
            しっかりと<strong><u>手の水分を拭き取り</u></strong>利用を開始しましょう。
          </li>
          
          <li class="mb-2">
            当施設のパソコンは<strong><u>利用者さん同士みんなで共有</u></strong>する物です。
            次に使用する人の気持ちを考え利用しましょう。
          </li>
        </ol>
        
        <hr>
        
        <h5 class="text-center mb-3">Slack利用規約</h5>
        
        <ol>
          <li class="mb-2">
            「Slack」は<strong><u>業務上にて取り扱う情報</u></strong>をやり取りするコミュニケーションツールです。
            <strong><u>利用者さん同士でのプライベートな会話はチャンネル及びDMも含めおやめください。</u></strong>
          </li>
          
          <li class="mb-2">
            <strong><u>ビジネスマナーを念頭に入れた文章</u></strong>を心がけましょう。
            もっとも、Slackはチャット形式のコミュニケーションツールのため、メールのように一方的な文章を送る物ではありません。
            よって、文頭に挨拶文を差し込んだり、文末に〆のお願いをするなどは必要ないです。
            しかし、<strong><u>何事も仕事だという事を心がけ、会話相手に対して失礼な言葉遣いにならないような</u></strong>コミュニケーションを図ってください。
          </li>
          
          <li class="mb-2">
            各チャンネルに届く<strong><u>作業・学習情報は必ず閲覧</u></strong>してください。
            また、こちらのSlackは無料枠を活用しております。
            よって<strong><u>「90日間」</u></strong>しか内容を保存しておく事ができません。
            情報やファイル、画像は<strong><u>いち早くローカルに保存</u></strong>しておく事を推奨します。
          </li>
        </ol>
      </div>
      
      <div class="form-check mt-4 p-3 bg-warning bg-opacity-10 border border-2 border-warning rounded">
        <div class="form-check d-flex align-items-center">
          <input class="form-check-input form-check-input-lg" type="checkbox" 
                 id="confirmTermsCheck" style="width: 1.5rem; height: 1.5rem;">
          <label class="form-check-label ms-3 fs-5" for="confirmTermsCheck">
            <strong>
              <i class="fas fa-check-square text-warning"></i> 
              上記の利用規約を全て確認し、遵守することに同意します
            </strong>
          </label>
        </div>
      </div>
    `;
  }

  /**
   * モーダルを作成
   */
  createModal(content) {
    const modalHTML = `
      <div class="modal fade" id="${this.modalId}" tabindex="-1" data-bs-backdrop="static" data-bs-keyboard="false">
        <div class="modal-dialog modal-lg">
          <div class="modal-content">
            <div class="modal-header bg-warning text-dark">
              <h5 class="modal-title">
                <i class="fas fa-file-contract"></i> 利用規約の確認
              </h5>
            </div>
            <div class="modal-body">
              <div id="termsModalContent">
                ${content}
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-lg btn-primary px-5" id="confirmTermsBtn" disabled>
                <i class="fas fa-check"></i> 同意して閉じる
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    
    // 既存のモーダルがあれば削除
    const existingModal = document.getElementById(this.modalId);
    if (existingModal) {
      existingModal.remove();
    }
    
    // モーダルをDOMに追加
    document.body.insertAdjacentHTML('beforeend', modalHTML);
  }

  /**
   * イベントリスナーを設定
   */
  setupEventListeners(onConfirm) {
    const checkbox = document.getElementById('confirmTermsCheck');
    const confirmBtn = document.getElementById('confirmTermsBtn');
    
    if (checkbox) {
      checkbox.addEventListener('change', (e) => {
        if (confirmBtn) {
          confirmBtn.disabled = !e.target.checked;
          
          // チェック時にボタンを強調
          if (e.target.checked) {
            confirmBtn.classList.add('btn-success');
            confirmBtn.classList.remove('btn-primary');
          } else {
            confirmBtn.classList.add('btn-primary');
            confirmBtn.classList.remove('btn-success');
          }
        }
      });
    }
    
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => {
        this.handleConfirm(onConfirm);
      });
    }
  }

  /**
   * 確認ボタンクリック時の処理
   */
  handleConfirm(onConfirm) {
    this.hasAcceptedTerms = true;
    
    // コールバック実行
    if (onConfirm) {
      onConfirm();
    }
    
    // 出勤ボタンを有効化
    this.updateClockInButtonState(false);
    
    // モーダルを閉じる
    const modal = bootstrap.Modal.getInstance(document.getElementById(this.modalId));
    if (modal) {
      modal.hide();
    }
    
    // モーダル削除
    setTimeout(() => {
      const modalElement = document.getElementById(this.modalId);
      if (modalElement) {
        modalElement.remove();
      }
    }, 300);
    
    this.showNotification('利用規約に同意しました', 'success');
  }
}