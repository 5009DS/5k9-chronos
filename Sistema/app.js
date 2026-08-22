import { store } from './store.js';
import { theme } from './theme.js';
import { navegar, caminhoAtual, interceptarLinks } from './lib/rotas.js';
import { guardarRolagem } from './components/pageshell.js';

import { renderPainel } from './pages/painel.js';
import { renderCronograma } from './pages/cronograma.js';
import { renderRoteiro } from './pages/roteiro.js';
import { renderDiretorio } from './pages/diretorio.js';
import { renderConfiguracoes } from './pages/configuracoes.js';
import { renderLogin } from './pages/login.js';
import { renderCliente } from './pages/cliente.js';
import { renderImportar } from './pages/importar.js';
import { renderQuadro } from './pages/quadro.js';
import { renderProducao } from './pages/producao.js';
import { renderConsistencia } from './pages/consistencia.js';

/* ═══════════════════════════════════════════════════════════════════════════
   5K9 CHRONOS — roteador.

   Mesma estrutura do Forms e do Gestor: SPA sobre a History API, sem build,
   módulos ES servidos direto. Duas diferenças que valem nota:

     · EXISTE ROTA PÚBLICA. Tudo sob /c/ é aberto por gente de fora, sem
       sessão, quase sempre no celular. O portão de login não pode alcançá-la
       — se alcançasse, o link que a equipe manda por WhatsApp cairia numa
       tela de senha que o cliente não tem.
     · As rotas têm PARÂMETRO (/cliente/:id, /c/:token/:conteudo), então o
       resolvedor casa padrão em vez de consultar um mapa de caminhos fixos.

   A classe .ds entra no <html> e nunca sai: o sistema inteiro nasceu sobre o
   design system, não há overlay legado a desligar.
   ═══════════════════════════════════════════════════════════════════════════ */

const app = document.getElementById('app');

theme.init();

/* Padrões na ordem em que são testados. `:algo` casa um segmento e vira
   argumento do render, na ordem em que aparece. */
const ROTAS = [
    ['/',                  () => renderPainel(app)],
    ['/cliente/:id',       (id) => renderCronograma(app, id)],
    ['/conteudo/:id',      (id) => renderRoteiro(app, id)],
    ['/quadro/:id',        (id) => renderQuadro(app, id)],
    ['/producao/:id',      (id) => renderProducao(app, id)],
    ['/conferencia',       () => renderConsistencia(app)],
    ['/importar/:id',      (id) => renderImportar(app, id)],
    ['/importar/:id/:modo', (id, modo) => renderImportar(app, id, modo)],
    ['/diretorio',         () => renderDiretorio(app)],
    ['/configuracoes',     () => renderConfiguracoes(app)],
    ['/login',             () => renderLogin(app)],
    ['/c/:token',          (token) => renderCliente(app, token, null)],
    ['/c/:token/:conteudo', (token, conteudo) => renderCliente(app, token, conteudo)],
];

const casar = (caminho, padrao) => {
    const a = caminho.split('/').filter(Boolean);
    const b = padrao.split('/').filter(Boolean);
    if (a.length !== b.length) return null;
    const args = [];
    for (let i = 0; i < b.length; i++) {
        if (b[i].startsWith(':')) args.push(decodeURIComponent(a[i]));
        else if (b[i] !== a[i]) return null;
    }
    return args;
};

const resolver = (caminho) => {
    for (const [padrao, render] of ROTAS) {
        const args = casar(caminho, padrao);
        if (args) return () => render(...args);
    }
    return null;
};

/** A rota é a do cliente? Usada pelo portão de sessão e pela topnav. */
export const ehPublica = (caminho) => caminho.startsWith('/c/');

let caminhoCorrente = null;

const roteador = async () => {
    const caminho = caminhoAtual();

    /* O portão de login pula a rota pública inteira. Em modo local não há
       sessão a exigir e a tela de login nem é oferecida. Em modo remoto, sem
       usuário só existe /login — e a troca usa `substituir` para o login não
       virar parada no histórico, senão o botão "voltar" joga a pessoa de
       volta nele depois de entrar. */
    if (!ehPublica(caminho)) {
        if (store.exigeLogin) {
            if (!store.usuario() && caminho !== '/login') return navegar('/login', { substituir: true });
            if (store.usuario() && caminho === '/login')  return navegar('/', { substituir: true });
        } else if (caminho === '/login') {
            return navegar('/', { substituir: true });
        }
    }

    if (caminho === caminhoCorrente) return;

    /* Guarda a rolagem da tela que está SAINDO, antes de o DOM sumir. É o
       único instante em que dá para lê-la, e é o que permite voltar de um
       roteiro para o mesmo ponto do cronograma em vez de para o topo. */
    guardarRolagem(caminhoCorrente);

    app.innerHTML = '';
    const render = resolver(caminho);
    if (render) {
        try {
            await render();
        } catch (e) {
            console.error('[app] falha ao desenhar a página:', e);
            app.innerHTML = erroHTML(e);
        }
    } else {
        app.innerHTML = naoEncontrado();
    }
    requestAnimationFrame(() => { if (window.lucide) lucide.createIcons(); });
    caminhoCorrente = caminho;
};

// Uma falha ao carregar não pode deixar a tela em branco sem explicação.
const erroHTML = (e) => `
    <div class="app-aviso">
        <h2>Algo quebrou ao montar esta tela</h2>
        <p>${String(e?.message || e)}</p>
        <a href="/" class="ds-btn ds-btn--ghost ds-btn--sm">Voltar ao início</a>
    </div>`;

const naoEncontrado = () => `
    <div class="app-aviso">
        <h2>Página não encontrada</h2>
        <p>O endereço não corresponde a nenhuma tela do Chronos.</p>
        <a href="/" class="ds-btn ds-btn--ghost ds-btn--sm">Ir para o início</a>
    </div>`;

window.addEventListener('popstate', roteador);
interceptarLinks();

/* Duas coisas precisam estar resolvidas ANTES do primeiro desenho:

     · a sessão, porque a topnav lê store.usuario() de forma síncrona;
     · o diretório, porque a explicação de fase e objetivo é conteúdo da
       página, não enfeite que pode chegar depois. Carregar em seguida faria
       o texto trocar debaixo dos olhos de quem já começou a ler.

   As duas em paralelo: são consultas independentes e somar as esperas
   atrasaria o primeiro desenho sem motivo.

   Na rota pública o diretório NÃO é buscado aqui. Quem não tem sessão não
   enxerga a tabela — e não precisa: a função `visualizacao()` devolve o
   diretório vigente junto com o cronograma, numa ida só (ver pages/cliente.js).
   Tentar mesmo assim renderia um aviso no console em toda visita de cliente. */
const abrindoPublica = ehPublica(caminhoAtual());

/* Na rota do cliente NADA disto é esperado, e a diferença é sentida: pedir a
   sessão obriga a carregar a biblioteca do Supabase de um CDN antes do
   primeiro desenho, e o cliente não tem sessão nenhuma para verificar. A tela
   dele agora vai direto ao ar e faz uma única chamada, por fetch puro. */
Promise.all([
    abrindoPublica ? Promise.resolve(null)  : store.iniciarSessao(),
    abrindoPublica ? Promise.resolve(false) : store.aplicarDiretorio(),
]).then(() => {
    roteador();
    // Login/logout em outra aba, ou token expirado: reavalia a rota atual em
    // vez de deixar a tela desatualizada.
    store.aoMudarSessao(() => { caminhoCorrente = null; roteador(); });
});

export { roteador };
