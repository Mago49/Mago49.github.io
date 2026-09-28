// === VIEW: Perfil (🪪) ===
// Por enquanto só o botão "Sair", centralizado, com confirmação — mesmo
// padrão de showAppConfirm já usado antes de excluir um depósito, pra
// evitar logout acidental (o antigo botão "Sair" no nav global saía sem
// perguntar nada).
import { auth, signOut } from './firebase-init.js';
import { showAppConfirm } from './utils.js';

export function mount(container) {
  container.innerHTML = `
    <div class="page-header">
      <div class="page-header-text">
        <span class="hero-badge">🪪 Perfil</span>
        <h1>Perfil</h1>
      </div>
    </div>

    <section class="card-shell" style="padding:2rem; display:flex; justify-content:center;">
      <button type="button" id="perfilLogoutBtn" class="btn-remove-modal" style="padding:0.85rem 1.4rem; border-radius:999px; font-weight:700; font-size:0.95rem;">
        🪪 Sair da conta
      </button>
    </section>
  `;

  document.getElementById('perfilLogoutBtn').addEventListener('click', async () => {
    const ok = await showAppConfirm('Deseja realmente sair da sua conta? Você vai precisar entrar de novo com sua conta Google.');
    if (!ok) return;
    await signOut(auth);
  });
}

export function unmount() {}
