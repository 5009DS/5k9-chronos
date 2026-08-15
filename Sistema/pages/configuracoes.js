import { store } from '../store.js';
import { renderShell } from '../components/pageshell.js';
import { toast } from '../components/toast.js';
import { theme } from '../theme.js';
import { esc, hoje, dataBR } from '../lib/formato.js';
import { diretorio, listarFases, listarObjetivos } from '../lib/diretorio.js';
import { semearExemplo, limparExemplo, limparTudo, contarExemplo } from '../seed/exemplo.js';

/* ═══════════════════════════════════════════════════════════════════════════
   CONFIGURAÇÕES — conexão, diretório, cópia de segurança e aparência.

   A seção de conexão é a primeira porque é a que tem consequência, e aqui a
   consequência é maior que nos outros sistemas: em modo local o link do
   cliente só abre no MESMO navegador que o criou. Mandar esse endereço por
   WhatsApp e o cliente ver "link não disponível" é o erro que esta tela
   precisa impedir antes de acontecer.

   A seção do diretório é a segunda, e é a que faz esta ferramenta ser
   ajustável sem deploy: subir um JSON novo troca a estratégia que o sistema
   aplica — as explicações, os avisos de par em conflito, as palavras que o
   classificador procura.
   ═══════════════════════════════════════════════════════════════════════════ */

export const renderConfiguracoes = async (container) => {
    const dados = await store.tudo();
    const contagem = {
        clientes: dados.clientes.length,
        conteudos: dados.conteudos.length,
        blocos: dados.blocos.length,
        retornos: dados.retornos.length,
    };
    const exemplos = await contarExemplo();
    const enviado = await store.diretorioEnviado().catch(() => null);

    const { content } = renderShell(container, {
        path: '/configuracoes',
        title: 'Configurações',
        subtitle: 'Conexão, diretório estratégico, cópia de segurança e aparência.',
    });

    container.insertAdjacentHTML('beforeend', ESTILOS);

    const local = store.modo === 'local';

    content.innerHTML = `
        <!-- ══ Conexão ═══════════════════════════════════════════════════ -->
        <article class="ds-card ${local ? '' : 'ds-card--lit'} vz-secao">
            <div class="vz-secao__cabeca">
                <div>
                    <h2 class="ds-card-title">Onde os dados estão</h2>
                    <span class="ds-card-sub">${local ? 'Apenas neste navegador' : 'Supabase — compartilhado com a equipe'}</span>
                </div>
                <span class="ds-chip ${local ? 'ds-chip--warning' : 'ds-chip--success'}">
                    ${local ? 'modo local' : 'conectado'}
                </span>
            </div>

            ${local ? `
                <p class="cf-texto">
                    Tudo que você criar fica salvo <strong>neste navegador</strong>. Serve para montar
                    e conferir a ferramenta — inclusive a visão do cliente, que você abre normalmente
                    em <code>/c/&lt;token&gt;</code> aqui mesmo.
                </p>
                <p class="ds-hint ds-hint--aviso">
                    <i data-lucide="triangle-alert"></i>
                    <strong>Não mande o link do cliente ainda.</strong> Em modo local o endereço só
                    abre neste navegador; para qualquer outra pessoa ele aparece como
                    "link não disponível".
                </p>
                <ol class="cf-passos">
                    <li>Abra o projeto Supabase que já hospeda o <b>5K9 Forms</b> — este sistema
                        mora dentro dele, não em um projeto novo.</li>
                    <li>No <b>SQL Editor</b>, cole e rode o conteúdo de <code>Sistema/db/schema.sql</code>.
                        Ele só cria tabelas com prefixo <code>vz_</code> e não encosta em nada do Forms.</li>
                    <li>Em <b>Settings → API</b>, copie a <i>Project URL</i> e a chave <code>anon</code>.</li>
                    <li>Cole as duas em <code>Sistema/lib/supabase-config.js</code> e recarregue.</li>
                </ol>
                <p class="ds-hint">
                    <i data-lucide="info"></i>
                    Não é preciso criar usuário: a equipe entra com o mesmo login do 5K9 Forms.
                    O plano gratuito do Supabase limita projetos por organização, e dividir o do
                    Forms sai de graça — o porquê de ser o Forms, e não o Gestor, está no
                    cabeçalho de <code>schema.sql</code>.
                </p>
                <p class="ds-hint">
                    <i data-lucide="info"></i>
                    Antes de conectar, exporte o que já criou aqui — a troca de modo não leva os
                    dados junto. Depois, use "Importar".
                </p>
            ` : `
                <p class="cf-texto">
                    Os dados vivem no <strong>mesmo projeto Supabase do 5K9 Forms</strong>, em
                    tabelas próprias com prefixo <code>vz_</code> — por isso o login é o mesmo.
                    O painel exige sessão; o link do cliente não, e é atendido por duas funções do
                    banco que só devolvem o cronograma daquele token. Nenhuma tabela fica exposta
                    a quem não tem login.
                </p>
            `}
        </article>

        <!-- ══ Diretório ═════════════════════════════════════════════════ -->
        <article class="ds-card vz-secao">
            <div class="vz-secao__cabeca">
                <div>
                    <h2 class="ds-card-title">Diretório estratégico</h2>
                    <span class="ds-card-sub">
                        ${listarFases().length} fases · ${listarObjetivos().length} objetivos
                        ${enviado ? ` · versão enviada em ${esc(dataBR(String(enviado.criado_em).slice(0, 10)))}` : ' · versão do sistema'}
                    </span>
                </div>
                ${enviado ? '<span class="ds-chip ds-chip--accent">personalizado</span>' : ''}
            </div>

            <p class="cf-texto">
                É daqui que saem <strong>todas</strong> as explicações que o sistema mostra: o que
                cada objetivo pede do roteiro, por que um par de fase e objetivo funciona ou está em
                conflito, e as palavras que o classificador procura. Nada é gerado por modelo de
                linguagem — mudar este arquivo muda o que a ferramenta ensina.
            </p>

            <div class="cf-acoes">
                <button class="ds-btn ds-btn--ghost" id="cf-dir-baixar">
                    <i data-lucide="download"></i> Baixar o diretório atual
                </button>
                <button class="ds-btn ds-btn--ghost" id="cf-dir-subir">
                    <i data-lucide="upload"></i> Enviar diretório
                </button>
                <input type="file" id="cf-dir-arquivo" accept="application/json,.json" hidden>
                ${enviado ? `
                    <button class="ds-btn ds-btn--ghost" id="cf-dir-restaurar">
                        <i data-lucide="rotate-ccw"></i> Voltar ao diretório do sistema
                    </button>` : ''}
                <a class="ds-btn ds-btn--ghost" href="/diretorio">
                    <i data-lucide="book-open"></i> Ver o diretório
                </a>
            </div>

            <p class="ds-hint">
                <i data-lucide="info"></i>
                O arquivo aceito é o JSON baixado acima, ou um dos dois de <code>Diretórios/</code>
                isolado: <code>02-taxonomia-classificacao.json</code> ou
                <code>04-objetivos-conteudo.json</code>. Enviar um não apaga o outro.
            </p>
        </article>

        <!-- ══ Conteúdo ══════════════════════════════════════════════════ -->
        <article class="ds-card vz-secao">
            <div class="vz-secao__cabeca">
                <div>
                    <h2 class="ds-card-title">O que está registrado</h2>
                    <span class="ds-card-sub">Contagem de tudo que existe no sistema agora</span>
                </div>
            </div>
            <div class="cf-numeros">
                ${Object.entries(contagem).map(([nome, n]) => `
                    <div class="cf-numero">
                        <span class="cf-numero__valor">${n}</span>
                        <span class="cf-numero__rotulo">${nome}</span>
                    </div>`).join('')}
            </div>
        </article>

        <!-- ══ Cópia de segurança ════════════════════════════════════════ -->
        <article class="ds-card vz-secao">
            <div class="vz-secao__cabeca">
                <div>
                    <h2 class="ds-card-title">Cópia de segurança</h2>
                    <span class="ds-card-sub">Um arquivo JSON com tudo</span>
                </div>
            </div>
            <div class="cf-acoes">
                <button class="ds-btn ds-btn--ghost" id="cf-exportar">
                    <i data-lucide="download"></i> Exportar tudo
                </button>
                <button class="ds-btn ds-btn--ghost" id="cf-importar">
                    <i data-lucide="upload"></i> Importar arquivo
                </button>
                <input type="file" id="cf-arquivo" accept="application/json" hidden>
            </div>
            <p class="ds-hint">
                <i data-lucide="info"></i>
                A importação <strong>substitui</strong> as coleções presentes no arquivo — inclusive
                os tokens dos clientes, o que faz links antigos voltarem a funcionar. Exporte antes.
            </p>
        </article>

        <!-- ══ Aparência ═════════════════════════════════════════════════ -->
        <article class="ds-card vz-secao">
            <div class="vz-secao__cabeca">
                <div>
                    <h2 class="ds-card-title">Aparência</h2>
                    <span class="ds-card-sub">A escolha vale também para o Forms e o Gestor</span>
                </div>
            </div>
            <div class="cf-acoes">
                <button class="ds-btn ds-btn--ghost" id="cf-tema">
                    <i data-lucide="${theme.get() === 'dark' ? 'sun' : 'moon'}"></i>
                    ${theme.get() === 'dark' ? 'Mudar para o modo claro' : 'Mudar para o modo escuro'}
                </button>
            </div>
        </article>

        <!-- ══ Dados de exemplo ══════════════════════════════════════════ -->
        <article class="ds-card vz-secao">
            <div class="vz-secao__cabeca">
                <div>
                    <h2 class="ds-card-title">Zona de testes</h2>
                    <span class="ds-card-sub">
                        ${exemplos
                            ? `${exemplos} registros de exemplo no sistema agora`
                            : 'Um cliente com um mês de cronograma, para conhecer a ferramenta'}
                    </span>
                </div>
                ${exemplos ? '<span class="ds-chip ds-chip--accent">exemplos ativos</span>' : ''}
            </div>
            <div class="cf-acoes">
                <button class="ds-btn ds-btn--ghost" id="cf-exemplo">
                    <i data-lucide="sparkles"></i>
                    ${exemplos ? 'Restaurar dados de exemplo' : 'Preencher com dados de exemplo'}
                </button>
                ${exemplos ? `
                    <button class="ds-btn ds-btn--ghost" id="cf-limpar-exemplo">
                        <i data-lucide="eraser"></i> Remover só os exemplos
                    </button>` : ''}
                <button class="ds-btn ds-btn--ghost cf-perigo" id="cf-limpar">
                    <i data-lucide="trash-2"></i> Apagar todos os dados
                </button>
            </div>
            <p class="ds-hint">
                <i data-lucide="info"></i>
                Os exemplos têm identificadores fixos e datas recalculadas a partir da semana atual,
                então podem ir e voltar quantas vezes você quiser. <strong>Remover só os exemplos</strong>
                não toca no que você criou de verdade — <strong>apagar todos os dados</strong> toca,
                e não tem volta.
            </p>
        </article>
    `;

    // ── Diretório ───────────────────────────────────────────────────────
    document.getElementById('cf-dir-baixar').addEventListener('click', () => {
        const { taxonomia, objetivos } = diretorio();
        baixarJSON({ taxonomia, objetivos }, `5k9-diretorio-${hoje()}.json`);
        toast('Diretório exportado.');
    });

    const arqDir = document.getElementById('cf-dir-arquivo');
    document.getElementById('cf-dir-subir').addEventListener('click', () => arqDir.click());
    arqDir.addEventListener('change', async () => {
        const f = arqDir.files?.[0];
        if (!f) return;
        try {
            const bruto = JSON.parse(await f.text());
            const pacote = normalizarDiretorio(bruto, diretorio());
            await store.salvarDiretorio(pacote);
            toast('Diretório atualizado. As explicações já mudaram.');
            renderConfiguracoes(container);
        } catch (e) {
            console.error('[configuracoes] diretório inválido:', e);
            toast(e.message || 'Não foi possível ler o arquivo.');
        } finally {
            arqDir.value = '';
        }
    });

    document.getElementById('cf-dir-restaurar')?.addEventListener('click', async () => {
        await store.limparDiretorio();
        toast('Diretório do sistema restaurado.');
        renderConfiguracoes(container);
    });

    // ── Exportar / importar ─────────────────────────────────────────────
    document.getElementById('cf-exportar').addEventListener('click', async () => {
        baixarJSON(await store.exportar(), `5k9-visualizador-${hoje()}.json`);
        toast('Arquivo exportado.');
    });

    const arquivo = document.getElementById('cf-arquivo');
    document.getElementById('cf-importar').addEventListener('click', () => arquivo.click());
    arquivo.addEventListener('change', async () => {
        const f = arquivo.files?.[0];
        if (!f) return;
        try {
            const pacote = JSON.parse(await f.text());
            if (!pacote || typeof pacote !== 'object' || !('conteudos' in pacote)) {
                throw new Error('Este arquivo não parece uma exportação do 5K9 Visualizador.');
            }
            await store.importar(pacote);
            toast('Dados importados.');
            renderConfiguracoes(container);
        } catch (e) {
            console.error('[configuracoes] importação falhou:', e);
            toast(e.message || 'Não foi possível ler o arquivo.');
        } finally {
            // Zera o input: escolher o MESMO arquivo de novo não dispara
            // 'change' se o valor não mudar, e a segunda tentativa parecia
            // travada.
            arquivo.value = '';
        }
    });

    // ── Tema ────────────────────────────────────────────────────────────
    document.getElementById('cf-tema').addEventListener('click', () => {
        theme.alternar();
        renderConfiguracoes(container);
    });

    // ── Exemplo / limpeza ───────────────────────────────────────────────
    document.getElementById('cf-exemplo').addEventListener('click', async (e) => {
        // closest: o clique costuma cair no <i> do ícone, e desabilitar o
        // ícone não impede o segundo clique de disparar tudo de novo.
        const b = e.target.closest('button');
        b.disabled = true;
        b.textContent = 'Criando…';
        await semearExemplo();
        toast(exemplos ? 'Dados de exemplo restaurados.' : 'Dados de exemplo criados.');
        renderConfiguracoes(container);
    });

    document.getElementById('cf-limpar-exemplo')?.addEventListener('click', async (e) => {
        const b = e.target.closest('button');
        b.disabled = true;
        b.textContent = 'Removendo…';
        await limparExemplo();
        toast('Exemplos removidos. O que você criou continua aí.');
        renderConfiguracoes(container);
    });

    const btnLimpar = document.getElementById('cf-limpar');
    btnLimpar.addEventListener('click', async () => {
        // Dois toques no próprio botão: um confirm() nativo é fácil demais de
        // dispensar no automático.
        if (btnLimpar.dataset.confirmando !== 'sim') {
            btnLimpar.dataset.confirmando = 'sim';
            btnLimpar.classList.add('cf-perigo--confirma');
            btnLimpar.innerHTML = 'Confirmar: apagar tudo';
            setTimeout(() => {
                if (!btnLimpar.isConnected) return;
                btnLimpar.dataset.confirmando = '';
                btnLimpar.classList.remove('cf-perigo--confirma');
                btnLimpar.innerHTML = '<i data-lucide="trash-2"></i> Apagar todos os dados';
                if (window.lucide) lucide.createIcons();
            }, 5000);
            return;
        }
        await limparTudo();
        toast('Todos os dados foram apagados.');
        renderConfiguracoes(container);
    });

    if (window.lucide) lucide.createIcons();
};

// ─────────────────────────────────────────────────────────────────────────

/**
 * Aceita as três formas de arquivo e devolve sempre { taxonomia, objetivos }.
 *
 * A equipe já mantém os dois JSON separados em Diretórios/, e pedir que ela
 * junte os dois num terceiro formato antes de subir seria inventar um passo
 * manual só para o código ficar mais simples. Reconhecer o arquivo pela
 * FORMA (tem `fases`? é taxonomia. tem `objetivos`? é a outra) resolve isso
 * sem pedir nada a ninguém.
 */
function normalizarDiretorio(bruto, atual) {
    if (!bruto || typeof bruto !== 'object') throw new Error('Arquivo vazio ou ilegível.');

    // Pacote completo, como o botão "Baixar" produz.
    if (bruto.taxonomia?.fases && bruto.objetivos?.objetivos) {
        return { taxonomia: bruto.taxonomia, objetivos: bruto.objetivos };
    }
    // Só a taxonomia.
    if (Array.isArray(bruto.fases)) {
        return { taxonomia: bruto, objetivos: atual.objetivos };
    }
    // Só os objetivos.
    if (Array.isArray(bruto.objetivos)) {
        return { taxonomia: atual.taxonomia, objetivos: bruto };
    }
    throw new Error('Não reconheci o arquivo. Ele precisa ter "fases" (taxonomia) ou "objetivos".');
}

function baixarJSON(dados, nome) {
    const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    a.click();
    // Sem o revoke o blob fica preso na memória da aba até recarregar.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const ESTILOS = `
<style>
.cf-texto { margin: 0; font-size: var(--text-body); color: var(--text-secondary); line-height: var(--leading-body); max-width: 68ch; }
.cf-texto strong { color: var(--text-primary); }
.cf-texto code, .cf-passos code, .ds-hint code {
    font-family: var(--font-mono); font-size: 12px;
    padding: 2px 6px; border-radius: var(--radius-xs);
    background: var(--surface-3); color: var(--text-primary);
}

.cf-passos { margin: 0; padding-left: var(--space-5); display: flex; flex-direction: column; gap: var(--space-2); max-width: 74ch; }
.cf-passos li { font-size: var(--text-sm); color: var(--text-secondary); line-height: var(--leading-body); }
.cf-passos b { color: var(--text-primary); }

.cf-numeros { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: var(--space-4); }
.cf-numero { display: flex; flex-direction: column; gap: var(--space-1); }
.cf-numero__valor { font-size: 26px; font-weight: 600; letter-spacing: var(--tracking-tight); font-variant-numeric: tabular-nums; color: var(--text-primary); }
.cf-numero__rotulo { font-size: var(--text-xs); color: var(--text-tertiary); text-transform: capitalize; }

.cf-acoes { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
.cf-perigo:hover { background: var(--danger-muted); border-color: var(--danger); color: var(--danger); }
.cf-perigo--confirma { background: var(--danger-muted); border-color: var(--danger); color: var(--danger); }
</style>
`;
