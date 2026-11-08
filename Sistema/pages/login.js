import { store } from '../store.js';
import { navegar } from '../lib/rotas.js';
import { esc } from '../lib/formato.js';

/* ═══════════════════════════════════════════════════════════════════════════
   LOGIN — só existe quando há banco configurado.

   Em modo local o app nunca chega aqui: sem Supabase não há sessão a
   verificar, e uma tela de login que aceita qualquer coisa é pior que
   nenhuma — dá a impressão de proteção onde não há.
   ═══════════════════════════════════════════════════════════════════════════ */

export const renderLogin = async (container) => {
    container.innerHTML = `
        <div class="lg">
            <div class="lg__brilho"></div>

            <form class="ds-card ds-card--lit lg__caixa" id="lg-form">
                <img class="lg__logo" src="/assets/logo/5k9-lockup-stacked-white.png"
                     alt="5K9 Studio" width="500" height="500">

                <div class="lg__texto">
                    <h1 class="ds-card-title">Chronos</h1>
                    <p class="ds-card-sub">Cronograma e roteiros.</p>
                </div>

                <p class="lg__erro" id="lg-erro" ${store.erroDeLogin() ? '' : 'hidden'}>${esc(store.erroDeLogin() || '')}</p>

                ${/* Cada um da equipe entra com a própria conta Google — é o
                      que deixa o sistema saber quem subiu cada coisa. O email
                      e a senha ficam para o login master do estúdio. */''}
                <button class="ds-btn lg__google" type="button" id="lg-google">
                    <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/></svg>
                    Entrar com Google
                </button>

                <details class="lg__master" id="lg-master">
                    <summary>Entrar com email e senha do estúdio</summary>
                    <div class="lg__master-campos">

                <label class="lg__campo">
                    <span>E-mail</span>
                    <input class="ds-input" type="email" id="lg-email" required
                           autocomplete="username" placeholder="voce@5k9.studio">
                </label>

                <label class="lg__campo">
                    <span>Senha</span>
                    <input class="ds-input" type="password" id="lg-senha" required
                           autocomplete="current-password" placeholder="••••••••">
                </label>

                <button class="ds-btn ds-btn--primary lg__entrar" type="submit" id="lg-btn">Entrar</button>
                    </div>
                </details>
            </form>
        </div>
        ${ESTILOS}
    `;

    const form = document.getElementById('lg-form');
    const erro = document.getElementById('lg-erro');
    const btn  = document.getElementById('lg-btn');

    const google = document.getElementById('lg-google');
    google.addEventListener('click', async () => {
        erro.hidden = true;
        google.disabled = true;
        google.lastChild.textContent = ' Abrindo o Google…';
        const { error } = await store.entrarComGoogle();
        // Sem erro, o navegador já está indo para o Google.
        if (error) {
            console.error('[login] google:', error);
            erro.textContent = 'O login com Google não está disponível agora. Use o email e a senha do estúdio.';
            erro.hidden = false;
            google.disabled = false;
            google.lastChild.textContent = ' Entrar com Google';
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        erro.hidden = true;
        btn.disabled = true;
        btn.textContent = 'Entrando…';

        const { error } = await store.entrar(
            document.getElementById('lg-email').value.trim(),
            document.getElementById('lg-senha').value,
        );

        if (error) {
            // A mensagem crua do Supabase vem em inglês e fala de
            // "credentials"; quem erra a senha não precisa saber disso.
            erro.textContent = /invalid/i.test(error.message)
                ? 'E-mail ou senha incorretos.'
                : 'Não foi possível entrar. Tente de novo em instantes.';
            erro.hidden = false;
            btn.disabled = false;
            btn.textContent = 'Entrar';
            return;
        }
        navegar('/');
    });
};

const ESTILOS = `
<style>
.lg {
    position: relative; flex: 1;
    min-height: 100vh; width: 100%;
    display: flex; align-items: center; justify-content: center;
    padding: var(--space-6);
    background: var(--surface-base); font-family: var(--font-sans);
    overflow: hidden;
}
/* Brilho de fundo: o mesmo gradiente da marca, muito diluído e à deriva.
   É a única superfície do sistema onde a marca aparece em escala. */
.lg__brilho {
    position: absolute; inset: -20%;
    background: var(--gradient-glow);
    background-size: 200% 200%;
    animation: ds-drift 26s var(--ease-inout) infinite;
    pointer-events: none;
}
.lg__caixa {
    position: relative; z-index: 1;
    width: min(400px, 100%);
    display: flex; flex-direction: column; gap: var(--space-5);
    padding: var(--space-8);
}
/* Lockup empilhado: dimensionar pela LARGURA e centralizar; align-self
   evita o stretch da coluna deformar a marca. */
.lg__logo { width: 92px; height: auto; align-self: center; display: block; }
html[data-theme="light"] .lg__logo { content: url("/assets/logo/5k9-lockup-stacked-ink.png"); }

.lg__texto { display: flex; flex-direction: column; gap: var(--space-1); text-align: center; }
.lg__campo { display: flex; flex-direction: column; gap: var(--space-2); }
.lg__campo span { font-size: var(--text-sm); font-weight: 500; color: var(--text-secondary); }
.lg__entrar { width: 100%; margin-top: var(--space-1); }

.lg__google {
    width: 100%; justify-content: center; gap: var(--space-3);
    background: #fff; color: #1f1f1f; border: 1px solid #dadce0; font-weight: 600;
}
.lg__google:hover:not(:disabled) { background: #f6f7f8; }
.lg__google svg { flex: none; }

.lg__master { border-top: 1px solid var(--border-subtle); padding-top: var(--space-4); }
.lg__master summary {
    cursor: pointer; list-style: none; text-align: center;
    font-size: var(--text-sm); color: var(--text-secondary);
}
.lg__master summary::-webkit-details-marker { display: none; }
.lg__master summary:hover { color: var(--text-primary); }
.lg__master-campos { display: flex; flex-direction: column; gap: var(--space-4); margin-top: var(--space-4); }

.lg__erro {
    margin: 0; padding: var(--space-3) var(--space-4);
    background: var(--danger-muted); border-radius: var(--radius-md);
    font-size: var(--text-sm); color: var(--danger);
}
.lg__erro[hidden] { display: none; }

@media (prefers-reduced-motion: reduce) { .lg__brilho { animation: none; } }
</style>
`;
