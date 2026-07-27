// === UTILITÁRIOS GENÉRICOS ===
// Funções sem dependência de estado ou de outros módulos do app.
// Qualquer página nova pode importar isso sem trazer nada além do necessário.

export function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number(value) || 0);
}

// Escapa caracteres especiais de HTML antes de inserir um texto em innerHTML.
// Usado sempre que um dado editável pelo usuário (ex: nome de plataforma)
// entra num template de innerHTML, pra evitar que HTML digitado no campo
// seja interpretado como código pelo navegador.
export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Modal genérico de alerta/confirmação (substitui alert()/confirm() nativos do navegador).
// Depende dos elementos #appModal / #appModalMessage / #appModalConfirmBtn / #appModalCancelBtn
// existirem no HTML da página atual.
export function showAppModal(message, showCancel) {
  return new Promise((resolve) => {
    const modal = document.getElementById('appModal');
    const messageEl = document.getElementById('appModalMessage');
    const confirmBtn = document.getElementById('appModalConfirmBtn');
    const cancelBtn = document.getElementById('appModalCancelBtn');

    messageEl.textContent = message;
    cancelBtn.style.display = showCancel ? 'inline-block' : 'none';
    modal.style.display = 'flex';

    function cleanup(result) {
      modal.style.display = 'none';
      confirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click', onCancel);
      resolve(result);
    }
    function onConfirm() { cleanup(true); }
    function onCancel() { cleanup(false); }

    confirmBtn.addEventListener('click', onConfirm);
    cancelBtn.addEventListener('click', onCancel);
  });
}

export function showAppAlert(message) {
  return showAppModal(message, false);
}

export function showAppConfirm(message) {
  return showAppModal(message, true);
}
