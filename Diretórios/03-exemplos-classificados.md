# Exemplos Classificados

Use esta tabela como few-shot examples ao instruir uma ferramenta/IA — cada linha mostra o padrão de raciocínio esperado.

| Tema/Roteiro | Classificação | Justificativa |
|---|---|---|
| "Depoimento da paciente Ana sobre os 3 meses de acompanhamento" | **Fundo** | Prova social explícita com resultado real |
| "Últimas vagas para o mutirão de check-up de sábado" | **Fundo** | Urgência + CTA de agendamento imediato |
| "Lançamento do novo protocolo de recuperação muscular" | **Fundo** | Campanha institucional com chamada direta |
| "Por que a resistência à insulina acontece? Dra. explica" | **Meio** | Explicação técnica de causa, sem pedido de conversão |
| "Bastidores: como é feito o planejamento nutricional individualizado" | **Meio** | Mostra processo/expertise, gera autoridade |
| "5 sinais de que você pode estar com sobrecarga de treino" | **Meio** | Aprofunda um problema específico, prepara para solução |
| "Mito ou verdade: tomar água gelada atrapalha a digestão?" | **Topo** | Dica genérica, alto potencial de compartilhamento |
| "3 formas simples de se hidratar melhor no fim de semana" | **Topo** | Dica de rotina, sem menção a tratamento específico |
| "Marque aquele amigo que sempre cancela o treino" | **Topo** | Formato relacionável, foco em alcance/engajamento |

## Casos Híbridos (para calibrar a ferramenta)

| Tema | Por que parece ambíguo | Classificação final | Regra aplicada |
|---|---|---|---|
| "Como funciona nosso protocolo X + depoimento de paciente" | Mistura explicação técnica (Meio) com prova social (Fundo) | **Fundo** | Prova social sempre puxa para Fundo |
| "Dica de rotina que citamos ser 'nosso diferencial exclusivo'" | Parece Topo (dica leve) mas menciona a marca como solução | **Meio** | Menção à marca como solução = consideração, não atração pura |
