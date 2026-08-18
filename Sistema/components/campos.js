import { openDrawer, closeDrawer } from './drawer.js';
import { esc } from '../lib/formato.js';
import { ETIQUETAS, chipEtiqueta, injectEstilosEtiqueta } from '../lib/etiquetas.js';

/* ═══════════════════════════════════════════════════════════════════════════
   FORMULÁRIO EM PAINEL LATERAL

   Quatro telas deste sistema lançam registros, e todas fazem a mesma coisa:
   abrem um painel, mostram campos, validam o obrigatório, devolvem um objeto.
   Escrever isso quatro vezes garante que as quatro divirjam — uma valida,
   outra não; uma limpa o campo vazio, outra grava string em branco.

   Aqui o formulário é DECLARADO, não montado:

     abrirFormulario({
         titulo: 'Novo conteúdo',
         campos: [
             { nome: 'titulo', rotulo: 'Título', obrigatorio: true },
             { nome: 'data', rotulo: 'Publicação', tipo: 'data' },
             { nome: 'fase', rotulo: 'Fase', tipo: 'select', opcoes: [...] },
         ],
         valores: conteudoExistente,
         aoSalvar: async (dados) => { … },
     });

   `aoSalvar` recebe os valores já convertidos: caixas de seleção em booleano,
   vazios como null (nunca string vazia — no banco, '' e NULL são coisas
   diferentes na hora de filtrar).

   Herdado do 5K9 Gestor sem o campo de moeda: aqui não circula dinheiro, e um
   tipo de campo que ninguém usa é código que ninguém mantém.
   ═══════════════════════════════════════════════════════════════════════════ */

const campoHTML = (c, valores) => {
    const v = valores?.[c.nome];
    const id = `cp-${c.nome}`;
    const req = c.obrigatorio ? '<span class="cp-req">*</span>' : '';
    const dica = c.dica ? `<span class="cp-dica">${esc(c.dica)}</span>` : '';

    let controle;
    switch (c.tipo) {
        case 'data':
            controle = `<input class="ds-input" id="${id}" name="${c.nome}" type="date" value="${esc(v || '')}">`;
            break;
        case 'select':
            controle = `
                <select class="ds-input" id="${id}" name="${c.nome}">
                    ${(c.opcoes || []).map(o => `
                        <option value="${esc(o.valor)}" ${String(v ?? '') === String(o.valor) ? 'selected' : ''}>
                            ${esc(o.rotulo)}
                        </option>`).join('')}
                </select>`;
            break;
        case 'textarea':
            controle = `<textarea class="ds-input cp-area" id="${id}" name="${c.nome}" rows="3"
                                  placeholder="${esc(c.placeholder || '')}">${esc(v || '')}</textarea>`;
            break;
        /* A caixa de seleção não usa o invólucro .cp-campo — rótulo e
           controle são a mesma coisa aqui. Mas carrega o data-campo do mesmo
           jeito: é por ele que a página mostra e esconde campos, e sem o
           atributo a busca devolvia null e derrubava quem estivesse
           percorrendo os campos. */
        case 'checkbox':
            return `
                <div class="cp-check-bloco" data-campo="${c.nome}">
                    <label class="cp-check" for="${id}">
                        <input type="checkbox" id="${id}" name="${c.nome}" ${v ? 'checked' : ''}>
                        <span>${esc(c.rotulo)}</span>
                    </label>
                    ${dica}
                </div>`;
        case 'cor':
            controle = `<input class="cp-cor" id="${id}" name="${c.nome}" type="color" value="${esc(v || '#A855FF')}">`;
            break;
        /* ── Etiquetas ────────────────────────────────────────────────────
           Um campo de texto com as etiquetas já em uso oferecidas na lista.
           Não é um seletor de opções fixas de propósito: o vocabulário é da
           equipe e muda sozinho — a lista existe para evitar "a gravar" e
           "A Gravar" convivendo, não para limitar o que dá para escrever.

           Separadas por vírgula porque é como se escreve uma lista à mão. */
        case 'etiquetas': {
            const lista = Array.isArray(v) ? v : (v ? [v] : []);
            const marcada = (nome) => lista.some(x =>
                x.toLowerCase().trim() === nome.toLowerCase().trim());

            /* As etiquetas do fluxo aparecem como BOTÕES, na ordem em que as
               coisas acontecem — escrever, aprovar, gravar, editar, publicar.
               Uma lista de sugestões escondida atrás do cursor não explica o
               processo; oito chips lado a lado explicam.

               O campo de texto continua embaixo e continua mandando: é ele que
               é lido na hora de salvar, e é por ele que entra qualquer etiqueta
               que este estúdio invente amanhã. */
            const extras = (c.sugestoes || []).filter(x =>
                !ETIQUETAS.some(e => e.nome.toLowerCase() === String(x).toLowerCase()));

            controle = `
                <div class="cp-etiquetas">
                    <div class="cp-etiquetas__chips" data-chips-de="${c.nome}">
                        ${[...ETIQUETAS.map(e => e.nome), ...extras].map(nome => `
                            <button type="button" class="vz-etiqueta--botao ${marcada(nome) ? 'is-marcada' : ''}"
                                    data-chip="${esc(nome)}">${chipEtiqueta(nome)}</button>`).join('')}
                    </div>
                    <input class="ds-input" id="${id}" name="${c.nome}" type="text"
                           placeholder="${esc(c.placeholder || '')}"
                           value="${esc(lista.join(', '))}" autocomplete="off">
                </div>`;
            break;
        }
        /* type="email" pelo teclado: no celular ele traz o @ e o ponto na
           primeira camada. A validação do navegador não entra aqui porque o
           formulário não é submetido — quem valida é a tela que usa o valor. */
        case 'email':
            controle = `<input class="ds-input" id="${id}" name="${c.nome}" type="email"
                               placeholder="${esc(c.placeholder || '')}" value="${esc(v ?? '')}"
                               autocomplete="email" inputmode="email">`;
            break;
        /* Nota: não é campo, é resultado. Existe para o formulário poder
           MOSTRAR uma conta enquanto a pessoa digita — "6x de R$ 700,00" —
           sem transformar o valor derivado num campo editável. Três campos
           que precisam concordar entre si é onde o dado começa a divergir. */
        case 'nota-viva':
            return `<p class="cp-viva" id="${id}" data-campo="${c.nome}">${esc(c.texto || '')}</p>`;
        default:
            controle = `<input class="ds-input" id="${id}" name="${c.nome}" type="text"
                               placeholder="${esc(c.placeholder || '')}" value="${esc(v ?? '')}"
                               autocomplete="off">`;
    }

    // data-campo em todo invólucro: é o que permite a página mostrar e
    // esconder campos conforme a escolha de outro campo (ver investimentos).
    return `
        <div class="cp-campo ${c.largura === 'metade' ? 'cp-campo--metade' : ''}" data-campo="${c.nome}">
            <label class="cp-campo__rotulo" for="${id}">${esc(c.rotulo)} ${req}</label>
            ${controle}
            ${dica}
        </div>`;
};

/* Os chips e o campo de texto são a MESMA lista, vista de dois jeitos. Clicar
   num chip escreve ou apaga a palavra no campo; o campo continua sendo a fonte,
   porque é dele que `colher` lê. Duas fontes divergiriam no primeiro caso em
   que alguém digitasse à mão o que já tinha clicado. */
const ligarChips = (painel) => {
    painel.querySelectorAll('[data-chips-de]').forEach(caixa => {
        const campo = painel.querySelector(`[name="${caixa.dataset.chipsDe}"]`);
        if (!campo) return;

        const ler = () => campo.value.split(',').map(x => x.trim()).filter(Boolean);
        const igual = (a, b) => a.toLowerCase() === b.toLowerCase();

        const repintar = () => {
            const atuais = ler();
            caixa.querySelectorAll('[data-chip]').forEach(b =>
                b.classList.toggle('is-marcada', atuais.some(x => igual(x, b.dataset.chip))));
        };

        caixa.addEventListener('click', (e) => {
            const b = e.target.closest('[data-chip]');
            if (!b) return;
            const nome = b.dataset.chip;
            const atuais = ler();
            const novas = atuais.some(x => igual(x, nome))
                ? atuais.filter(x => !igual(x, nome))
                : [...atuais, nome];
            campo.value = novas.join(', ');
            repintar();
        });

        campo.addEventListener('input', repintar);
    });
};

/** Lê o painel e devolve os valores já no tipo certo. */
const colher = (painel, campos) => {
    const dados = {};
    campos.forEach(c => {
        const el = painel.querySelector(`[name="${c.nome}"]`);
        if (!el) return;
        if (c.tipo === 'checkbox') dados[c.nome] = el.checked;
        /* Vira lista, sem vazio e sem repetido. Array vazio e não null: a
           coluna é text[] e `[]` é "sem etiqueta nenhuma", que é o que
           apagar o campo quer dizer. */
        else if (c.tipo === 'etiquetas') {
            dados[c.nome] = [...new Set(el.value.split(',').map(x => x.trim()).filter(Boolean))];
        }
        else {
            const bruto = el.value.trim();
            // '' vira null: no Postgres string vazia não é ausência, e um
            // filtro "sem cliente" (is null) deixaria de encontrar a linha.
            dados[c.nome] = bruto === '' ? null : bruto;
        }
    });
    return dados;
};

export const abrirFormulario = ({
    titulo, subtitulo = '', campos, valores = null,
    rotuloSalvar = 'Salvar', aoSalvar, aoExcluir = null,
    // Gancho para comportamento vivo: recebe o painel e uma função que lê os
    // valores atuais já convertidos. Quem usa liga os próprios listeners —
    // o formulário genérico não precisa saber que existe parcelamento.
    aoMontar = null,
}) => {
    const corpo = `
        <form class="cp-form" id="cp-form" novalidate>
            ${campos.map(c => campoHTML(c, valores)).join('')}
            <p class="cp-erro" id="cp-erro" hidden></p>
        </form>`;

    const rodape = `
        ${aoExcluir ? `<button type="button" class="ds-btn ds-btn--ghost cp-excluir" id="cp-excluir">Excluir</button>` : ''}
        <span class="cp-espaco"></span>
        <button type="button" class="ds-btn ds-btn--ghost" id="cp-cancelar">Cancelar</button>
        <button type="button" class="ds-btn ds-btn--primary" id="cp-salvar">${esc(rotuloSalvar)}</button>`;

    return openDrawer({
        title: titulo, subtitle: subtitulo, body: corpo, footer: rodape,
        onMount: (painel) => {
            injectStyles();
            injectEstilosEtiqueta();
            ligarChips(painel);
            const erro = painel.querySelector('#cp-erro');
            const botao = painel.querySelector('#cp-salvar');

            const mostrarErro = (msg) => {
                erro.textContent = msg;
                erro.hidden = false;
            };

            const enviar = async () => {
                const dados = colher(painel, campos);

                const faltando = campos.find(c => c.obrigatorio &&
                    (dados[c.nome] == null || dados[c.nome] === ''));
                if (faltando) {
                    mostrarErro(`Preencha "${faltando.rotulo}".`);
                    painel.querySelector(`[name="${faltando.nome}"]`)?.focus();
                    return;
                }
                erro.hidden = true;

                // Trava o botão: o painel salva no banco, e um duplo clique
                // impaciente criava dois lançamentos idênticos — o tipo de
                // erro que só aparece no fechamento do mês.
                botao.disabled = true;
                botao.textContent = 'Salvando…';
                try {
                    await aoSalvar({ ...(valores || {}), ...dados });
                    closeDrawer();
                } catch (e) {
                    console.error('[campos] falha ao salvar:', e);
                    mostrarErro(e.message || 'Não foi possível salvar. Tente de novo.');
                    botao.disabled = false;
                    botao.textContent = rotuloSalvar;
                }
            };

            botao.addEventListener('click', enviar);
            painel.querySelector('#cp-cancelar').addEventListener('click', closeDrawer);

            // Enter salva, menos dentro do textarea, onde quebra linha.
            painel.querySelector('#cp-form').addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
                    e.preventDefault();
                    enviar();
                }
            });

            if (aoMontar) aoMontar(painel, () => colher(painel, campos));

            const excluir = painel.querySelector('#cp-excluir');
            if (excluir) excluir.addEventListener('click', async () => {
                // Confirmação em dois toques no próprio botão, sem abrir
                // outro diálogo por cima do painel: empilhar modal sobre
                // modal confunde o foco e o ESC passa a fechar o errado.
                if (excluir.dataset.confirmando !== 'sim') {
                    excluir.dataset.confirmando = 'sim';
                    excluir.classList.add('cp-excluir--confirma');
                    excluir.textContent = 'Confirmar exclusão';
                    setTimeout(() => {
                        if (!excluir.isConnected) return;
                        excluir.dataset.confirmando = '';
                        excluir.classList.remove('cp-excluir--confirma');
                        excluir.textContent = 'Excluir';
                    }, 4000);
                    return;
                }
                excluir.disabled = true;
                try {
                    await aoExcluir(valores);
                    closeDrawer();
                } catch (e) {
                    mostrarErro(e.message || 'Não foi possível excluir.');
                    excluir.disabled = false;
                }
            });
        },
    });
};

// ─────────────────────────────────────────────────────────────────────────
function injectStyles() {
    if (document.getElementById('campos-styles')) return;
    const style = document.createElement('style');
    style.id = 'campos-styles';
    style.textContent = `
        .cp-form { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); }
        /* Campo ocupa a linha inteira por padrão; --metade divide a linha.
           Grade de duas colunas com o padrão em span 2 evita o campo órfão
           quando o número de meias é ímpar. */
        .cp-campo { grid-column: span 2; display: flex; flex-direction: column; gap: var(--space-2); }
        .cp-campo--metade { grid-column: span 1; }

        .cp-campo__rotulo { font-size: var(--text-sm); font-weight: 500; color: var(--text-secondary); }
        .cp-req { color: var(--accent); }
        .cp-dica { font-size: var(--text-xs); color: var(--text-tertiary); line-height: var(--leading-body); }

        .cp-area { height: auto; padding: var(--space-3) var(--space-4); resize: vertical; line-height: var(--leading-body); font-family: var(--font-sans); }

        /* O campo de etiquetas: os chips do fluxo em cima, o texto livre embaixo.
   Os dois são a mesma lista — clicar escreve, escrever acende. */
.cp-etiquetas { display: flex; flex-direction: column; gap: var(--space-2); }
.cp-etiquetas__chips { display: flex; flex-wrap: wrap; gap: 6px; }
.cp-etiquetas__chips button { padding: 0; border: none; background: none; line-height: 0; }
.cp-check-bloco { grid-column: span 2; display: flex; flex-direction: column; gap: var(--space-2); }
        .cp-check-bloco[hidden] { display: none; }
        .cp-check {
            display: flex; align-items: center; gap: var(--space-3);
            font-size: var(--text-sm); color: var(--text-primary); cursor: pointer;
        }
        .cp-check input { width: 17px; height: 17px; accent-color: var(--accent); cursor: pointer; }

        .cp-cor {
            width: 56px; height: 44px; padding: 4px;
            background: var(--surface-3); border: 1px solid var(--border-default);
            border-radius: var(--radius-md); cursor: pointer;
        }

        /* Nota viva: o resultado de uma conta que o formulário faz enquanto
           você digita. Tem peso de informação, não de aviso — por isso o
           tom de acento e não o de erro. */
        .cp-viva {
            grid-column: span 2; margin: 0;
            padding: var(--space-3) var(--space-4);
            background: var(--accent-muted); border-radius: var(--radius-md);
            font-size: var(--text-sm); color: var(--text-primary);
            line-height: var(--leading-body);
        }
        .cp-viva b { font-variant-numeric: tabular-nums; }
        .cp-viva[hidden] { display: none; }
        /* Quando a conta viva denuncia um valor impossível, ela troca de
           papel: deixa de informar e passa a avisar. */
        .cp-viva--erro { background: var(--danger-muted); color: var(--danger); }

        .cp-campo[hidden] { display: none; }

        .cp-erro {
            grid-column: span 2; margin: 0;
            padding: var(--space-3) var(--space-4);
            background: var(--danger-muted); border-radius: var(--radius-md);
            font-size: var(--text-sm); color: var(--danger);
        }
        .cp-erro[hidden] { display: none; }

        .cp-espaco { flex: 1; }
        .cp-excluir { color: var(--text-tertiary); }
        .cp-excluir:hover { background: var(--danger-muted); border-color: var(--danger); color: var(--danger); }
        .cp-excluir--confirma { background: var(--danger-muted); border-color: var(--danger); color: var(--danger); }

        /* O rodapé do drawer alinha à direita; aqui o Excluir precisa ficar
           na ponta oposta, então o rodapé passa a distribuir. */
        .dw__footer { justify-content: flex-start; }

        @media (max-width: 520px) {
            .cp-campo--metade { grid-column: span 2; }
        }
    `;
    document.head.appendChild(style);
}
