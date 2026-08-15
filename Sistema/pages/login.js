import { store } from '../store.js';
import { navegar } from '../lib/rotas.js';

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
                    <h1 class="ds-card-title">Visualizador de Conteúdo</h1>
                    <p class="ds-card-sub">Entre com a conta do estúdio.</p>
                </div>

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

                <p class="lg__erro" id="lg-erro" hidden></p>

                <button class="ds-btn ds-btn--primary lg__entrar" type="submit" id="lg-btn">Entrar</button>
            </form>
        </div>
        ${ESTILOS}
    `;

    const form = document.getElementById('lg-form');
    const erro = document.getElementById('lg-erro');
    const btn  = document.getElementById('lg-btn');

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

.lg__erro {
    margin: 0; padding: var(--space-3) var(--space-4);
    background: var(--danger-muted); border-radius: var(--radius-md);
    font-size: var(--text-sm); color: var(--danger);
}
.lg__erro[hidden] { display: none; }

@media (prefers-reduced-motion: reduce) { .lg__brilho { animation: none; } }
</style>
`;
