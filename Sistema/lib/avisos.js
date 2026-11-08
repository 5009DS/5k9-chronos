import { store } from '../store.js';
import { toast } from '../components/toast.js';
import { openDrawer, closeDrawer } from '../components/drawer.js';
import { esc, mesExtenso, diaCurto, nomeDiaCurto } from './formato.js';
import { aguardaData, porData } from './cronograma.js';
import { ativos } from './pedidos.js';

/* ═══════════════════════════════════════════════════════════════════════════
   AVISOS DA EQUIPE — os dois emails que não são de pedido.

     · TEMA NOVO: alguém criou conteúdo → todos menos ele ficam sabendo.
     · MÊS ORGANIZADO: o admin terminou de pôr cada tema no seu dia.

   Quem envia é o servidor (api/avisar-temas.js e api/mes-organizado.js).
   Daqui só sai o "pode avisar": o que entra no email é lido do banco.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── TEMA NOVO: ESPERAR A PESSOA PARAR ────────────────────────────────────
   Quem sobe tema sobe vários: a importação cria oitenta de uma vez, e o
   formulário costuma ser usado cinco vezes seguidas. Um email por tema seria
   spam dentro de casa. Então o aviso espera um minuto e meio SEM conteúdo
   novo, e sai um só, com a leva inteira.

   Se a aba fechar antes, o aviso sai na hora, com `keepalive` (o navegador
   termina o envio mesmo com a página indo embora). E se nem isso der, o
   resumo da manhã pega o que ficou sem aviso. */
const CALMA = 90_000;
let espera = null;

const dispararTemas = async ({ saindo = false } = {}) => {
    clearTimeout(espera);
    espera = null;
    const token = await store.token().catch(() => null);
    if (!token) return;   // modo local: não há servidor de email
    try {
        const r = await fetch('/api/avisar-temas', {
            method: 'POST', keepalive: saindo,
            headers: { Authorization: `Bearer ${token}` },
        });
        if (saindo) return;
        const corpo = await r.json().catch(() => ({}));
        if (r.ok && corpo.enviados) toast(`A equipe foi avisada por email ${corpo.temas > 1 ? `dos ${corpo.temas} temas novos` : 'do tema novo'}.`);
    } catch (e) {
        console.warn('[avisos] temas novos:', e);   // o resumo da manhã cobre
    }
};

let ligado = false;
export const ligarAvisos = () => {
    if (ligado) return;
    ligado = true;
    store.aoCriarConteudo(() => {
        clearTimeout(espera);
        espera = setTimeout(dispararTemas, CALMA);
    });
    const sair = () => { if (espera) dispararTemas({ saindo: true }); };
    window.addEventListener('pagehide', sair);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') sair(); });
};

/* ── MÊS ORGANIZADO ───────────────────────────────────────────────────────
   Antes de mandar, a tela mostra exatamente o que vai sair — a lista do mês
   dia a dia — e avisa do que ainda está solto: tema sem data e tema no banco.
   Não impede o envio: às vezes o banco é justamente o que fica para o mês
   seguinte. Só não deixa a pessoa mandar sem ter visto. */
export const abrirMesOrganizado = ({ cliente, mes, conteudos, equipe }) => {
    const doMes = porData(conteudos.filter(c => !c.banco_em && !aguardaData(c) && String(c.data || '').startsWith(mes)));
    const soltos = conteudos.filter(c => !c.banco_em && aguardaData(c)).length;
    const noBanco = conteudos.filter(c => c.banco_em).length;
    const eu = (store.usuario()?.email || '').toLowerCase();
    const para = ativos(equipe).filter(p => p.email && p.email.toLowerCase() !== eu);
    const nomeMes = mesExtenso(mes);

    const avisos = [
        soltos && `<b>${soltos}</b> conteúdo${soltos > 1 ? 's' : ''} sem data`,
        noBanco && `<b>${noBanco}</b> no banco de temas`,
    ].filter(Boolean);

    openDrawer({
        title: 'Mês organizado',
        subtitle: `${esc(cliente.nome)} · ${esc(nomeMes)}`,
        body: `
            <div class="mo">
                ${!doMes.length ? `
                    <p class="mo__alerta"><i data-lucide="calendar-x"></i>
                        Nenhum conteúdo com dia marcado em ${esc(nomeMes)}. Não há o que avisar.</p>` : `
                    <p class="mo__texto">${para.length
                        ? `${para.map(p => esc(p.nome.split(' ')[0])).join(', ').replace(/, ([^,]*)$/, ' e $1')} ${para.length > 1 ? 'recebem' : 'recebe'} por email a lista abaixo, dia a dia, com o link do quadro.`
                        : 'Ninguém da equipe tem email cadastrado além de você. Cadastre em Pedidos → Equipe.'}</p>
                    ${avisos.length ? `
                        <p class="mo__alerta"><i data-lucide="triangle-alert"></i>
                            <span>Ainda há ${avisos.join(' e ')} deste cliente. Eles não entram no aviso.</span></p>` : ''}
                    <label class="mo__recado">
                        <span>Recado para a equipe <em>(opcional)</em></span>
                        <textarea class="ds-input" id="mo-recado" rows="3" maxlength="1000"
                                  placeholder="Ex.: os reels da semana 2 precisam ser gravados até quinta."></textarea>
                    </label>
                    <ol class="mo__lista">
                        ${doMes.map(c => `
                            <li><span class="mo__dia">${esc(nomeDiaCurto(c.data))} <b>${esc(diaCurto(c.data))}</b></span>
                                <span class="mo__titulo">${esc(c.titulo)}${c.formato ? ` <small>${esc(c.formato)}</small>` : ''}</span></li>`).join('')}
                    </ol>`}
                <p class="mo__erro" id="mo-erro" hidden></p>
            </div>
            <style>
                .mo { display: flex; flex-direction: column; gap: var(--space-4); }
                .mo__texto { margin: 0; color: var(--text-secondary); font-size: var(--text-sm); line-height: 1.5; }
                .mo__alerta { margin: 0; display: flex; gap: var(--space-2); align-items: flex-start;
                    padding: var(--space-3); border-radius: var(--radius-md);
                    background: var(--warning-muted, var(--surface-2)); font-size: var(--text-sm); }
                .mo__alerta i { flex: none; width: 16px; height: 16px; margin-top: 2px; }
                .mo__recado { display: flex; flex-direction: column; gap: var(--space-2); }
                .mo__recado span { font-size: var(--text-sm); font-weight: 500; color: var(--text-secondary); }
                .mo__recado em { font-style: normal; color: var(--text-tertiary, var(--text-secondary)); font-weight: 400; }
                .mo__lista { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column;
                    border: 1px solid var(--border-subtle); border-radius: var(--radius-md); }
                .mo__lista li { display: flex; gap: var(--space-3); padding: var(--space-2) var(--space-3); font-size: var(--text-sm); }
                .mo__lista li + li { border-top: 1px solid var(--border-subtle); }
                .mo__dia { flex: none; width: 92px; white-space: nowrap; color: var(--text-secondary); }
                .mo__dia b { color: var(--text-primary); }
                .mo__titulo small { color: var(--text-secondary); margin-left: 4px; }
                .mo__erro { margin: 0; font-size: var(--text-sm); color: var(--danger); }
            </style>`,
        footer: `
            <span style="flex:1"></span>
            <button type="button" class="ds-btn ds-btn--ghost" data-dw-close>Cancelar</button>
            <button type="button" class="ds-btn ds-btn--primary" id="mo-enviar" ${doMes.length && para.length ? '' : 'disabled'}>
                <i data-lucide="send"></i> Avisar a equipe
            </button>`,
        onMount: (painel) => {
            if (window.lucide) lucide.createIcons();
            const botao = painel.querySelector('#mo-enviar');
            const erro = painel.querySelector('#mo-erro');
            botao.addEventListener('click', async () => {
                const token = await store.token().catch(() => null);
                if (!token) {
                    closeDrawer();
                    toast('Em modo local não há envio de email. No Chronos de verdade, a equipe receberia este aviso.');
                    return;
                }
                botao.disabled = true;
                botao.textContent = 'Enviando…';
                try {
                    const r = await fetch('/api/mes-organizado', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ cliente_id: cliente.id, mes,
                                               recado: painel.querySelector('#mo-recado')?.value || '' }),
                    });
                    const corpo = await r.json().catch(() => ({}));
                    if (!r.ok) throw new Error(corpo.erro || `falhou (${r.status})`);
                    closeDrawer();
                    const foram = para.filter(p => corpo.enviados?.includes(p.id)).map(p => p.nome.split(' ')[0]);
                    toast(`${foram.join(' e ') || 'A equipe'} ${foram.length > 1 ? 'foram avisados' : 'foi avisado'}: ${nomeMes} está organizado.`);
                } catch (e) {
                    console.error('[avisos] mês organizado:', e);
                    erro.textContent = `O aviso não saiu: ${e.message}`;
                    erro.hidden = false;
                    botao.disabled = false;
                    botao.innerHTML = '<i data-lucide="send"></i> Tentar de novo';
                    if (window.lucide) lucide.createIcons();
                }
            });
        },
    });
};
