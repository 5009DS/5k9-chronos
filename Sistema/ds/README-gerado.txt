ds/ — Design System 5K9 Studio
==============================

Os seis .css desta pasta são os arquivos ORIGINAIS entregues pelo estúdio.
Não edite: se o DS for atualizado, substitua-os e regenere o arquivo scoped.

ds-tokens.scoped.css é GERADO. Regerar com (PowerShell, a partir da raiz do
projeto):

    $dst = "Sistema\ds"
    $out = ""
    foreach ($f in @("colors.css","typography.css","spacing.css","effects.css")) {
        $t = [IO.File]::ReadAllText("$dst\$f")
        $t = $t -replace '(?m)^\[data-theme="light"\]', 'html[data-ds-brand][data-theme="light"]'
        $t = $t -replace '(?m)^:root', 'html[data-ds-brand]'
        $out += "`r`n/* ---- ds/$f ---- */`r`n" + $t + "`r`n"
    }
    [IO.File]::WriteAllText("$dst\ds-tokens.scoped.css", $out, (New-Object Text.UTF8Encoding $false))

(reponha o cabeçalho de aviso no topo do arquivo depois de regerar)

FORA da geração, de propósito:

  base.css   — estiliza elementos globais (a, hr, p, h1..h6, img/svg/video).
               Aplicado como está, quebra a UI: todo <a> ganha borda inferior
               roxa (nossos cards são links), todo <hr> ganha 32px de margem
               (nossos divisores), e h2 vira 44px. Precisa ser adotado em
               partes, com escopo.
  fonts.css  — aponta para ../assets/fonts/InstrumentSans-Variable.ttf, que
               não veio no pacote. Hoje a fonte vem do Google Fonts, que NÃO
               serve o eixo de largura (wdth) — sem o arquivo variável local
               a voz Condensed do display não funciona.
