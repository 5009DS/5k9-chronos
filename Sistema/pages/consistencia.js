import { store } from '../store.js';
import { renderShell } from '../components/pageshell.js';
import { toast } from '../components/toast.js';
import { navegar } from '../lib/rotas.js';
import { esc, dataBR } from '../lib/formato.js';
import { vazioHTML } from '../lib/pecas.js';
import { auditar, resumoAuditoria } from '../lib/consistencia.js';
import { comEtapa, etapaAtual, etiquetasParaStatus, injectEstilosEtiqueta } from '../lib/etiquetas.js';

/* ═══════════════════════════════════════════════════════════════════════════
   CONFERÊNCIA — o sistema procurando os próprios erros.

   Esta tela existe porque um bug chegou pelo caminho mais caro: o cliente
   abriu o link, viu uma coisa, a equipe viu outra, e alguém precisou reparar.
   Contradição entre telas é um tipo de defeito que não aparece em teste de
   clique — só aparece quando os dados envelhecem de um jeito específico.

   Então a varredura roda sobre os dados REAIS, de todos os clientes, e mostra
   o que não fecha. As regras vivem em lib/consistencia.js, e são as mesmas que
   as telas usam para decidir o que mostrar: se a regra mudar, a conferência
   muda junto — não existe versão "de teste" que possa divergir da de produção.

   ── CONSERTAR AQUI, E NÃO SÓ APONTAR ──────────────────────────────────────
   Cada problema com conserto óbvio traz o botão que o aplica. Uma tela que só
   acusa transfere para a pessoa o trabalho de abrir sete abas e corrigir uma a
   uma — e é assim que a lista vira algo que ninguém abre.
   ═══════════════════════════════════════════════════════════════════════════ */

export const renderConsistencia = async (container) => {
    const [conteudos, clientes, blocos, retornos] = await Promise.all([
        store.conteudos.listar(), store.clientes.listar(),
        store.blocos.listar(), store.retornos.listar(),
    ]);

    const achados = auditar(conteudos, blocos, retornos);
    const { graves, avisos } = resumoAuditoria(achados);
    const nomeCliente = (id) => clientes.find(c => c.id === id)?.nome || 'Cliente removido';

    const { content } = renderShell(container, {
        path: '/',
        crumbs: [{ href: '/', label: 'Clientes' }],
        title: 'Conferência',
        subtitle: graves
            ? `${graves} ${graves > 1 ? 'contradições' : 'contradição'} e ${avisos} aviso${avisos === 1 ? '' : 's'} em ${conteudos.length} conteúdos`
            : `Nenhuma contradição em ${conteudos.length} conteúdos · ${avisos} aviso${avisos === 1 ? '' : 's'}`,
        actions: `<a href="/" class="ds-btn ds-btn--ghost"><i data-lucide="arrow-left"></i> Clientes</a>`,
    });

    container.insertAdjacentHTML('beforeend', ESTILOS);
    injectEstilosEtiqueta();

    const recarregar = () => renderConsistencia(container);

    const consertar = async (achado) => {
        const c = conteudos.find(x => x.id === achado.conteudo.id);
        if (!c) return;

        const antes = { ...c };
        const campo = achado.conserto.campo;
        /* Etiquetas é o único conserto que não é "escreva este valor": pôr uma
           etapa é uma operação — a nova entra, as outras saem —, e ela já
           existe em comEtapa(). Reimplementá-la aqui criaria a segunda versão
           da regra que esta tela existe para impedir.

           Sem destino (`valor: null`), o conserto é "mantenha só a etapa que
           já vale", que é o caso de duas etapas marcadas ao mesmo tempo. */
        const valor = campo === 'etiquetas'
            ? comEtapa(c.etiquetas, achado.conserto.valor ?? etapaAtual(c.etiquetas)?.nome ?? null)
            : achado.conserto.valor;

        /* Um conserto de status arrasta a etapa pela MESMA regra das telas de
           trabalho. Sem isto, "voltar para rascunho" deixava a etiqueta de
           aprovação no lugar e a varredura seguinte acusava o par que este
           clique acabou de criar. */
        const etiquetasNovas = campo === 'status' ? etiquetasParaStatus(valor, c.etiquetas) : null;

        await store.conteudos.salvar({
            ...c, [campo]: valor,
            ...(etiquetasNovas ? { etiquetas: etiquetasNovas } : {}),
        });
        toast('Corrigido.', {
            label: 'Desfazer',
            onClick: async () => { await store.conteudos.salvar(antes); recarregar(); },
        });
        recarregar();
    };

    content.innerHTML = achados.length ? `
        ${graves ? `
            <article class="ds-card vz-secao">
                <div class="vz-secao__cabeca">
                    <div>
                        <h2 class="ds-card-title">Contradições</h2>
                        <span class="ds-card-sub">
                            Duas partes do sistema dizendo coisas diferentes sobre a mesma peça.
                            É o que faz a tela do cliente e a nossa discordarem.
                        </span>
                    </div>
                </div>
                <div class="co-lista">
                    ${achados.filter(a => a.nivel === 'grave').map(item).join('')}
                </div>
            </article>` : `
            <article class="ds-card vz-secao">
                ${vazioHTML('shield-check', 'Nenhuma contradição',
                    'As três fontes — status, histórico de retornos e etapa de produção — estão de acordo '
                  + 'em todos os conteúdos.')}
            </article>`}

        ${avisos ? `
            <article class="ds-card vz-secao">
                <div class="vz-secao__cabeca">
                    <div>
                        <h2 class="ds-card-title">Faltando preencher</h2>
                        <span class="ds-card-sub">
                            Não quebram nada. São campos que deixam a tela do cliente pela metade.
                        </span>
                    </div>
                </div>
                <div class="co-lista">
                    ${achados.filter(a => a.nivel === 'aviso').map(item).join('')}
                </div>
            </article>` : ''}
    ` : `
        <article class="ds-card vz-secao">
            ${vazioHTML('shield-check', 'Está tudo coerente',
                'Nenhuma contradição e nenhum campo faltando. Vale voltar aqui depois de um mês de '
              + 'importação ou de uma rodada de aprovações.')}
        </article>`;

    function item(a) {
        return `
            <div class="co-item co-item--${esc(a.nivel)}">
                <div class="co-item__corpo">
                    <div class="co-item__cabeca">
                        <i data-lucide="${a.nivel === 'grave' ? 'octagon-alert' : 'info'}"></i>
                        ${esc(a.titulo)}
                    </div>
                    <p class="co-item__texto">${esc(a.texto)}</p>
                    <button class="co-item__alvo" data-ir="${esc(a.conteudo.id)}">
                        <span>${esc(a.conteudo.titulo)}</span>
                        <span class="co-item__meta">
                            ${esc(nomeCliente(a.conteudo.cliente_id))} · ${esc(dataBR(a.conteudo.data))}
                        </span>
                    </button>
                </div>
                ${a.conserto ? `
                    <button class="ds-btn ds-btn--ghost ds-btn--sm" data-consertar="${esc(a.id)}|${esc(a.conteudo.id)}">
                        ${esc(a.conserto.rotulo)}
                    </button>` : ''}
            </div>`;
    }

    content.querySelectorAll('[data-ir]').forEach(b =>
        b.addEventListener('click', () => navegar(`/conteudo/${b.dataset.ir}`)));

    content.querySelectorAll('[data-consertar]').forEach(b =>
        b.addEventListener('click', () => {
            const [idRegra, idConteudo] = b.dataset.consertar.split('|');
            const achado = achados.find(a => a.id === idRegra && a.conteudo.id === idConteudo);
            if (achado) { b.disabled = true; consertar(achado); }
        }));

    if (window.lucide) lucide.createIcons();
};

const ESTILOS = `
<style>
.co-lista { display: flex; flex-direction: column; gap: var(--space-2); }
.co-item {
    display: flex; align-items: flex-start; gap: var(--space-3);
    padding: var(--space-4); border-radius: var(--radius-md);
    background: var(--surface-2); border-left: 3px solid var(--border-default);
}
.co-item--grave { border-left-color: var(--danger); }
.co-item--aviso { border-left-color: var(--warning); }
.co-item__corpo { flex: 1; display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; }
.co-item__cabeca {
    display: flex; align-items: center; gap: var(--space-2);
    font-size: var(--text-sm); font-weight: 600; color: var(--text-primary);
}
.co-item__cabeca i, .co-item__cabeca svg { width: 15px; height: 15px; flex-shrink: 0; }
.co-item--grave .co-item__cabeca i, .co-item--grave .co-item__cabeca svg { color: var(--danger); }
.co-item--aviso .co-item__cabeca i, .co-item--aviso .co-item__cabeca svg { color: var(--warning); }
.co-item__texto { margin: 0; font-size: var(--text-sm); color: var(--text-secondary); line-height: var(--leading-body); }

/* O alvo é um botão e leva ao conteúdo: ler o problema e ter de procurar a
   peça é o trabalho que esta tela existe para eliminar. */
.co-item__alvo {
    display: flex; flex-direction: column; gap: 2px; align-self: flex-start;
    padding: var(--space-2) var(--space-3); text-align: left;
    border: 1px solid var(--border-subtle); border-radius: var(--radius-sm);
    background: var(--surface-1); color: var(--text-primary);
    font-family: var(--font-sans); font-size: var(--text-sm); cursor: pointer;
}
.co-item__alvo:hover { border-color: var(--accent-border); }
.co-item__meta { font-size: var(--text-xs); color: var(--text-tertiary); }

@media (max-width: 720px) {
    .co-item { flex-direction: column; }
}
</style>
`;
