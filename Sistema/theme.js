/* ═══════════════════════════════════════════════════════════════════════════
   TEMA — claro/escuro.

   Bem mais curto que o do 5K9 Forms, e de propósito: lá existe um overlay
   gigante de CSS que persegue cores fixas (#F0F0F2, #010101) espalhadas por
   páginas antigas. O Gestor nasceu inteiro sobre os tokens, então trocar de
   tema é trocar UM atributo no <html> — o resto é consequência.

   A chave do localStorage é a MESMA do Forms ('5k9_theme'): quem usa os
   dois sistemas no mesmo navegador espera que a escolha valha para a casa
   toda, não para cada porta.
   ═══════════════════════════════════════════════════════════════════════════ */

export const theme = {
    get: () => localStorage.getItem('5k9_theme') || 'dark',
    set: (valor) => {
        localStorage.setItem('5k9_theme', valor);
        theme.aplicar();
    },
    alternar: () => theme.set(theme.get() === 'dark' ? 'light' : 'dark'),
    aplicar: () => document.documentElement.setAttribute('data-theme', theme.get()),
    init: () => theme.aplicar(),
};
