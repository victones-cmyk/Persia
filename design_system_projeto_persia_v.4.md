# Design System — Projeto Pérsia v4
## Plataforma de Orçamento e Integração Comercial
### Rainha das Cortinas · Stratos Lab · v4 · 2026

> **Contexto:** Aplicação web interna B2B. Ferramenta de trabalho para ~8 vendedores com 10–15 orçamentos/dia.
> **Estética de referência:** GestãoClick (AdminLTE 3 + Bootstrap 4.5.3) — decisão do Victor Nogueira Pavoni.
> **Stack:** React 18 + Vite + Tailwind CSS · Node.js 20 + Express 5 · PostgreSQL 16
> **Executor:** Claude Code (Anthropic CLI)

**Changelog v2.0:**
- Estética visual migrada para paridade com GestãoClick (decisão Victor, reunião junho 2026)
- Tokens visuais: Source Sans Pro, paleta AdminLTE, radius 3px, sidebar clara
- Mantida toda a estrutura operacional do DS v1.1: calculadoras, regras invioláveis, riscos Tailwind, mapeamento SRD
- Botão primário: preto com mapeamento explícito de contexto por variante
- Split button documentado (extraído da referência GestãoClick)
- badge-draft fechado como cinza neutro (evidência visual das telas de referência)

---

## Sumário

1. Princípios e Contexto
2. Tokens de Cor
3. Tipografia
4. Espaçamento
5. Border Radius
6. Sombras e Elevação
7. Layout da Aplicação
8. Componentes — Botões
9. Componentes — Inputs e Formulários
10. Componentes — Calculadoras
11. Componentes — Feedback e Alertas
12. Componentes — Badges e Status
13. Componentes — Tabelas e Histórico
14. Componentes — Modais
15. CSS Custom Properties — globals.css
16. Tailwind Config
17. Padrões e Regras Invioláveis
18. Acessibilidade
19. Riscos de Implementação Tailwind

---

## 1. Princípios e Contexto

### Por que este DS existe

O site rainhadascortinas.com.br tem contexto de venda ao consumidor final. Esta aplicação tem contexto oposto: ferramenta interna B2B. A vendedora abre isso 15x por dia com foco em velocidade e precisão, não em apelo visual.

A estética segue o GestãoClick (AdminLTE 3) por decisão do cliente — familiaridade reduz curva de aprendizado para vendedoras que já usam o ERP diariamente.

### O que foi descartado

| Descartado | Motivo |
|---|---|
| Border-radius pill (40px) nos botões | Projeta leveza de vitrine, não precisão técnica |
| Open Sans + Montserrat | Fontes editoriais; Source Sans Pro é a fonte do GestãoClick |
| Amarelo como cor de ação | Ratio 2.7:1 com branco falha WCAG AA para texto |
| Hero sections, trust bar, carrossel | Sem aplicação nas telas mapeadas no SRD |
| Grid de produto com imagem | Componente de e-commerce, não de calculadora |

### O que foi adicionado (além do GestãoClick base)

- Sidebar de navegação persistente (8 rotas do SRD)
- Indicador de saúde da API GestãoClick (verde pulsante / vermelho)
- 3 estados de badge de orçamento: enviado, rascunho, erro
- Toast de integração com GestãoClick
- Banner de serviço indisponível (GC offline)
- Modal de senha do gerente com shake animation
- Skeleton loader para tabelas
- Breakdown de cálculo readonly (JetBrains Mono)
- Field-alert com chips de tecidos alternativos
- Step indicator (3 passos)
- 17 regras invioláveis mapeadas do SRD

### Decisões justificadas

**Source Sans Pro:** paridade com GestãoClick. Vendedoras que alternam entre o ERP e o Pérsia não percebem mudança de contexto visual.

**JetBrains Mono para valores monetários:** o SRD define DECIMAL(10,2) para todos os valores. Mono facilita leitura em coluna e reforça a regra RN-10 (vendedor não edita valor) sem precisar de tooltip.

**Border-radius 3px:** paridade com AdminLTE. Projeta precisão técnica.

**Sidebar clara (#f4f4f4):** paridade com GestãoClick. Sidebar escura teria custo de adaptação para as vendedoras.

**Botão primário preto:** mantido do GestãoClick. CTAs de criação usam verde — mapeamento explícito na seção 8.

---

## 2. Tokens de Cor

### Cor de Ação (AdminLTE)

| Token | Valor | Borda | Uso |
|---|---|---|---|
| --brand | #000000 | #000000 | Navbar, botão primário, ações de marca |
| --action-add | #00a65a | #008d4c | Criar, salvar, adicionar |
| --action-view | #00c0ef | #00acd6 | Visualizar, abrir detalhe |
| --action-edit | #f39c12 | #e08e0b | Editar registro |
| --action-delete | #f56954 | #f4543c | Excluir, cancelar permanente |
| --accent-blue | #0073b7 | — | Gráficos, links institucionais |

### Cores de Feedback

| Token | Valor | Uso |
|---|---|---|
| --color-success | #28a745 | Confirmações, GC online |
| --color-success-subtle | #d4edda | Background de alerta de sucesso |
| --color-success-border | #c3e6cb | Borda de alerta de sucesso |
| --color-warning | #ffc107 | Avisos |
| --color-warning-subtle | #fff3cd | Background de alerta de aviso |
| --color-warning-border | #ffeeba | Borda de alerta de aviso |
| --color-error | #dc3545 | Falha GC, campo inválido |
| --color-error-subtle | #f8d7da | Background de alerta de erro |
| --color-error-border | #f5c6cb | Borda de alerta de erro |
| --color-info | #17a2b8 | Informações neutras |
| --color-info-subtle | #d1ecf1 | Background de alerta informativo |
| --color-info-border | #bee5eb | Borda de alerta informativo |

### Status de Orçamento (3 estados do SRD §15)

| Token | Valor | Estado |
|---|---|---|
| --status-sent | #28a745 | Enviado ao GestãoClick com sucesso |
| --status-sent-bg | #d4edda | Background do badge "enviado" |
| --status-sent-border | #c3e6cb | Borda do badge "enviado" |
| --status-draft | #6c757d | Calculado localmente, não enviado |
| --status-draft-bg | #e9ecef | Background do badge "rascunho" |
| --status-draft-border | #dee2e6 | Borda do badge "rascunho" |
| --status-error | #dc3545 | Tentativa de envio falhou |
| --status-error-bg | #f8d7da | Background do badge "erro" |
| --status-error-border | #f5c6cb | Borda do badge "erro" |

> badge-draft usa cinza neutro. Evidência visual do GestãoClick confirma que status inativo deve ser silencioso. Apenas erro é urgente. Decisão fechada (junho 2026).

### Indicador GestãoClick

| Token | Valor | Estado |
|---|---|---|
| --gc-online | #28a745 | GC acessível (dot pulsante) |
| --gc-offline | #dc3545 | GC inacessível (dot estático) |
| --gc-checking | #ffc107 | Verificando conexão |

### Escala Neutra

| Token | Valor | Uso principal |
|---|---|---|
| --neutral-0 | #ffffff | Superfície de cards, modais |
| --neutral-50 | #f9f9f9 | Fundo da aplicação |
| --neutral-100 | #f4f4f4 | Sidebar, campos disabled |
| --neutral-200 | #e9ecef | Background disabled |
| --neutral-300 | #dee2e6 | Bordas de tabela, divisores |
| --neutral-400 | #ced4da | Bordas de input padrão |
| --neutral-500 | #6c757d | Texto auxiliar, placeholders |
| --neutral-600 | #495057 | Texto de input, corpo secundário |
| --neutral-700 | #343a40 | Texto de parágrafo |
| --neutral-800 | #212529 | Texto principal |
| --neutral-900 | #000000 | Navbar, destaque máximo |

### Superfícies

| Token | Valor | Uso |
|---|---|---|
| --surface-app | #f9f9f9 | Fundo cinza da área principal |
| --surface-card | #ffffff | Cards, painéis, formulários |
| --surface-sidebar | #f4f4f4 | Navegação lateral |
| --surface-header | #000000 | Header/navbar |
| --surface-overlay | rgba(0,0,0,0.5) | Background de modais |

---

## 3. Tipografia

### Famílias

| Token | Valor | Uso |
|---|---|---|
| --font-ui | 'Source Sans Pro', sans-serif | Toda a interface |
| --font-mono | 'JetBrains Mono', 'Fira Code', monospace | Valores calculados, totais monetários |

Google Fonts import:
```html
<link href="https://fonts.googleapis.com/css2?family=Source+Sans+Pro:wght@400;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
```

### Escala de Tamanhos

| Token | Valor | Peso padrão | Uso |
|---|---|---|---|
| --text-2xl | 24px | 500 | Títulos de página (h1) |
| --text-xl | 20px | 500 | Títulos de seção (h4) |
| --text-lg | 16px | 500 | Botões, inputs, selects |
| --text-md | 14px | 400 | Corpo padrão, labels, tabela |
| --text-sm | 13px | 400 | Helper text |
| --text-xs | 12px | 400 | Botões xs, timestamps |
| --text-2xs | 11px | 700 | Badges compactos |

### Pesos

| Token | Valor | Uso |
|---|---|---|
| --weight-regular | 400 | Corpo, labels, texto de tabela |
| --weight-medium | 500 | Títulos, botões |
| --weight-bold | 700 | th, badges, valores totais |

### Regras de Aplicação

- Valores monetários calculados: sempre font-family mono, font-weight 700, font-size 16–20px, campo readonly
- Labels de formulário: font-size 14px, font-weight 400, color --neutral-800
- Placeholder: color --neutral-500, nunca substituir o label
- Cabeçalhos de tabela: font-size 14px, font-weight 700 (padrão AdminLTE, sem uppercase)
- Valores em small-box: font-size 35px, font-weight 700, font-family ui

---

## 4. Espaçamento

Base: 4px (herança Bootstrap). Mapeamento direto com Tailwind.

| Token | Valor | Tailwind | Uso |
|---|---|---|---|
| --sp-1 | 4px | p-1 | Gap de ícone, separador inline |
| --sp-2 | 8px | p-2 | Padding de badge, gap de row |
| --sp-3 | 12px | p-3 | Padding de botão, cell padding de tabela |
| --sp-4 | 16px | p-4 | Padding de card, gap entre campos |
| --sp-5 | 20px | p-5 | Padding de nav, header |
| --sp-6 | 24px | p-6 | Padding principal de card/painel |
| --sp-8 | 32px | p-8 | Padding de página, gap entre seções |
| --sp-10 | 40px | p-10 | Área de conteúdo principal |
| --sp-12 | 48px | p-12 | Separação entre blocos distintos |

### Mapeamento em Formulário

| Contexto | Tailwind |
|---|---|
| Gap entre campos | mb-4 |
| Label para input | mb-2 |
| Padding interno do input | px-3 |
| Grupos de campos | space-y-6 |
| Padding de card | p-4 |
| Padding da content area | p-4 |

---

## 5. Border Radius

| Token | Valor | Tailwind | Uso |
|---|---|---|---|
| --radius-xs | 2px | rounded-xs | Small-box, badges inline |
| --radius-sm | 3px | rounded-sm | Padrão: botões, cards |
| --radius-md | 4px | rounded | Inputs, selects, dropdowns |
| --radius-full | 9999px | rounded-full | Badges circulares, indicador GC |

---

## 6. Sombras e Elevação

| Token | Valor CSS | Uso |
|---|---|---|
| --shadow-btn | inset 0 -1px 0 rgba(0,0,0,0.09) | Botões |
| --shadow-sidebar | inset -3px 0 8px -4px rgba(0,0,0,0.07) | Borda direita da sidebar |
| --shadow-dropdown | 0 3px 6px 0 rgba(0,0,0,0.1) | Dropdowns, menus |
| --shadow-modal | 0 4px 6px -1px rgba(0,0,0,0.10), 0 2px 4px -2px rgba(0,0,0,0.10) | Modais |
| --shadow-toast | 0 10px 15px -3px rgba(0,0,0,0.10), 0 4px 6px -4px rgba(0,0,0,0.10) | Toasts |
| --shadow-card | none | Cards padrão (sem sombra) |
| --focus-ring | 0 0 0 .2rem rgba(0,123,255,.25) | Foco de input/botão |

### Transições

| Token | Valor |
|---|---|
| --transition-fast | 100ms ease |
| --transition-normal | 150ms ease |
| --transition-slow | 200ms ease |

### Z-Index Stack

| Token | Valor | Uso |
|---|---|---|
| --z-base | 0 | Conteúdo padrão |
| --z-raised | 10 | Dropdowns, popovers |
| --z-overlay | 100 | Fundo de modal |
| --z-modal | 200 | Modal |
| --z-toast | 300 | Toasts — acima de tudo |

---

## 7. Layout da Aplicação

### Variáveis de Layout

| Token | Valor | Uso |
|---|---|---|
| --sidebar-width | 220px | Nav lateral persistente |
| --header-height | 50px | Navbar (padrão AdminLTE) |
| --content-max | 1200px | Largura máxima da área de conteúdo |
| --form-max | 640px | Largura máxima de formulário |

### Estrutura de Telas

```
┌─────────────────────────────────────────────────┐
│  NAVBAR (100% · 50px · fundo #000)              │
├──────────────────┬──────────────────────────────┤
│  SIDEBAR (220px) │  CONTENT AREA                │
│  fundo #f4f4f4   │  fundo #f9f9f9               │
│  texto #212529   │  max-width: 1200px            │
│  nav accordion   │  forms: max-width: 640px      │
└──────────────────┴──────────────────────────────┘
```

### Indicador de Saúde GestãoClick (navbar)

Sempre visível no canto direito do header.

```
Online:      dot pulsante verde (#28a745)
Offline:     dot estático vermelho (#dc3545)
Verificando: dot estático amarelo (#ffc107)
```

### Responsividade

- Desktop (>=1024px): sidebar expandida + content area
- Tablet (768–1023px): sidebar colapsa para ícones
- Mobile (<768px): sidebar oculta via hamburger (fora do escopo principal — app é desktop-first)

---

## 8. Componentes — Botões

### Anatomia

```
border-radius:  3px (--radius-sm)
padding:        5px 12px 6px  (padrão) / 3px 8px 4px (sm) / 1px 5px (xs)
font-size:      16px (padrão) / 14px (sm) / 12px (xs)
font-weight:    500
line-height:    24px
box-shadow:     inset 0 -1px 0 rgba(0,0,0,0.09)
transition:     100ms ease

hover:    bg escurece ~8%
focus:    box-shadow: 0 0 0 .2rem rgba(38,143,255,.5)
disabled: opacity: 0.65, cursor: not-allowed
```

### Variantes

| Variante | Background | Texto | Borda | Uso |
|---|---|---|---|---|
| btn-primary | #000000 | #ffffff | #000000 | Ações de marca, navegação principal |
| btn-success | #00a65a | #ffffff | #008d4c | Criar, salvar, adicionar, enviar ao GC |
| btn-info | #00c0ef | #ffffff | #00acd6 | Visualizar, abrir detalhe |
| btn-warning | #f39c12 | #ffffff | #e08e0b | Editar, reenviar |
| btn-danger | #f56954 | #ffffff | #f4543c | Excluir, remover |
| btn-default | #fafafa | #444444 | #cccccc | Cancelar, fechar modal, ações sem semântica |

### Mapeamento de Ação para Variante (SRD)

| Contexto | Variante | Tamanho |
|---|---|---|
| Criar / adicionar registro | btn-success | padrão |
| Salvar edição de formulário | btn-success | padrão |
| Enviar ao GestãoClick (CTA principal) | btn-success | padrão |
| Calcular valor | btn-success | padrão |
| Visualizar / abrir detalhe (tabela) | btn-info | xs |
| Editar registro (tabela) | btn-warning | xs |
| Reenviar ao GestãoClick (status erro) | btn-warning | padrão |
| Excluir / remover (tabela) | btn-danger | xs |
| Cancelar / Fechar modal | btn-default | padrão |
| Confirmar senha (modal gerente) | btn-success | padrão |
| Entrar / Navegação estrutural | btn-primary | padrão |

**Regra crítica:** btn-primary (preto) não é CTA de criação. É reservado para ações de marca e navegação estrutural. Todo fluxo de criação de registro usa btn-success.

### Split Button (ações secundárias em tabela)

Padrão para linhas de tabela com 5 ou mais ações. Combina botão de ação direta com trigger de dropdown acoplado.

```html
<div class="btn-group btn-group-xs">
  <button type="button" class="btn btn-success btn-xs">
    <i class="fas fa-plus"></i>
  </button>
  <button type="button" class="btn btn-success btn-xs dropdown-toggle dropdown-toggle-split"
          data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
    <span class="sr-only">Mais ações</span>
  </button>
  <div class="dropdown-menu dropdown-menu-right">
    <a class="dropdown-item" href="#">Ver proposta</a>
    <a class="dropdown-item" href="#">Imprimir</a>
    <a class="dropdown-item" href="#">Compartilhar</a>
    <a class="dropdown-item" href="#">Alterar situação</a>
    <a class="dropdown-item text-danger" href="#">Excluir</a>
  </div>
</div>
```

```css
.dropdown-toggle-split {
  padding-right: 6px;
  padding-left: 6px;
  border-left: 1px solid rgba(0,0,0,0.15);
}
```

Com 4 ações ou menos: botões xs individuais lado a lado. Dropdown sempre dropdown-menu-right para evitar corte nas últimas colunas.

### Grupo de Botões (filtros de tabela)

```
Botões lado a lado sem gap, borda-direita removida nos intermediários.
Primeiro: border-radius esquerdo = 3px
Último:   border-radius direito = 3px
```

---

## 9. Componentes — Inputs e Formulários

### Input Padrão

```
height:        38px
padding:       6px 12px
font-size:     16px
font-family:   var(--font-ui)
border:        1px solid #ced4da
border-radius: 4px
background:    #ffffff
color:         #495057
placeholder:   color: #6c757d

:hover    — border-color: #adb5bd
:focus    — border-color: #80bdff, box-shadow: var(--focus-ring)
:disabled — background: #e9ecef, color: #6c757d, cursor: not-allowed
[readonly] — background: #e9ecef
error     — border-color: #dc3545, box-shadow: 0 0 0 .2rem rgba(220,53,69,.25)
```

### Input Monetário (Calculado — Somente Leitura)

```
height:        38px
padding:       6px 12px
font-family:   var(--font-mono)
font-size:     16px
font-weight:   700
background:    #e9ecef
border:        1px solid #dee2e6
border-radius: 4px
cursor:        default
color:         #212529

Comportamentos obrigatórios:
  readOnly:  true
  tabIndex:  -1
  onClick:   e.target.select()
```

> Reforça RN-10. tabIndex={-1} retira o campo do fluxo de tab. select() no clique permite copiar o valor sem arrastar o mouse.

### Select / Dropdown

```
height:        38px
padding:       6px 30px 6px 12px
border:        1px solid #ced4da
border-radius: 4px
appearance:    none
background-image: chevron SVG #6c757d right 10px center
```

Não adicionar ícone HTML extra — duplicaria o chevron.

### Textarea

```
min-height:    80px
padding:       8px 12px
border:        1px solid #ced4da
border-radius: 4px
resize:        vertical
line-height:   1.5
```

### Label

```
font-size:     14px
font-weight:   400
color:         #212529
margin-bottom: 8px

label-required: * em color: #dc3545, font-size: 12px
label-optional: "(opcional)" em color: #6c757d, font-weight: 400
```

### Helper Text

```
font-size:  12px
color:      #6c757d (padrão) / #dc3545 (erro)
margin-top: 4px
```

### Field Alert — Erro de Largura Máxima

```
padding:       10px 12px
background:    #f8d7da
border:        1px solid #f5c6cb
border-radius: 4px
font-size:     12px
color:         #721c24
```

Chips de tecidos alternativos:

```
padding:       4px 10px
border:        1px solid #00a65a
border-radius: 3px
font-size:     12px
color:         #00a65a
:hover         bg: #00a65a, color: #fff
```

### Checkbox / Radio

```
accent-color:    #00a65a
label font-size: 14px
gap:             8px
```

---

## 10. Componentes — Calculadoras

### Layout das Telas de Calculadora

Grid em duas colunas no desktop:

```
Desktop (lg: >=1024px):
  Coluna esquerda — lg:col-span-2 (2/3): formulário de entrada
  Coluna direita  — lg:col-span-1 (1/3): painel de resultado sticky
    position: sticky
    top: calc(50px + 16px)
    background: #f9f9f9
    border: 1px solid #cccccc
    border-radius: 3px
    padding: 16px

Tablet/Mobile (< 1024px):
  Colunas colapsam — formulário acima, resultado abaixo.

JSX de referência:
  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
    <div className="lg:col-span-2 flex flex-col gap-4">
      {/* formulário */}
    </div>
    <div className="lg:col-span-1">
      <div className="card sticky" style={{ top: 'calc(50px + 16px)' }}>
        {/* breakdown + botão de ação */}
      </div>
    </div>
  </div>
```

### Step Indicator

```
padrão    — circle: bg #dee2e6, color #6c757d
ativo     — circle: bg #000000, color #fff; label: font-weight 700
concluído — circle: bg #00a65a, color #fff (ícone check)
```

Linha de conexão: height 1px, background #dee2e6.

### Seleção de Tipo de Produto

Cards clicáveis em grid 3 colunas:

```
padding:       16px
border:        1px solid #dee2e6
border-radius: 3px
text-align:    center

:hover / .selected — border-color: #00a65a, background: #f4fff9

ícone:     24px, margin-bottom: 8px
nome:      14px, font-weight: 600
descrição: 12px, color: #6c757d
```

### Breakdown de Componentes (Somente Leitura)

```
background:    #f9f9f9
border:        1px solid #dee2e6
border-radius: 3px
padding:       12px 16px

Linha de componente:
  display: flex, justify-content: space-between
  font-size: 13px
  padding: 4px 0
  border-bottom: 1px solid #dee2e6
  label: color #6c757d
  valor: font-family mono, font-weight 600, color #212529

Linha de total:
  padding-top: 10px
  border-top:  2px solid #ced4da
  label: font-size 14px, font-weight 700
  valor: font-family mono, font-size 20px, font-weight 700
```

### Bloco de Desconto

```
Estado padrão:
  padding:       12px
  background:    #f9f9f9
  border:        1px solid #dee2e6
  border-radius: 3px

Estado restrito (desconto acima do limite):
  border:     2px dashed #f39c12
  background: #fff3cd
  (aplica antes do modal — sinal visual de aprovação pendente)

Resultado: font-family mono, font-size 18px, font-weight 700
```

---

> **DECISAO PENDENTE — confirmar com Victor antes de implementar:**
> O DS do parceiro inclui coluna de quantidade no breakdown: label | quantidade (ex: 3,00 m2) | valor. O DS atual tem apenas label | valor. Se a OS precisar exibir quantidade por componente (para producao), incluir a coluna. Se for so referencia de valor para o vendedor, manter como esta. Perguntar ao Victor: o breakdown na tela deve espelhar a OS?

---

## 11. Componentes — Feedback e Alertas

### Alertas Inline

Estrutura: ícone | título + descrição | (botão opcional).

```
padding:       12px 14px
border-radius: 4px
border:        1px solid (cor da variante)
font-size:     13px

success: bg #d4edda, border #c3e6cb, color #155724
warning: bg #fff3cd, border #ffeeba, color #856404
error:   bg #f8d7da, border #f5c6cb, color #721c24
info:    bg #d1ecf1, border #bee5eb, color #0c5460

título:     font-weight 600, font-size 13px
descrição:  font-size 12px, opacity 0.85
```

### Toasts (Canto Inferior Direito)

```
position:   fixed, bottom: 20px, right: 20px
z-index:    var(--z-toast) = 300
max-width:  360px
padding:    12px 14px
background: #212529
border-radius: 3px
box-shadow: var(--shadow-toast)
color:      #ffffff
font-size:  13px

Borda lateral esquerda (3px solid):
  success: #00a65a
  error:   #f56954
  warning: #f39c12
  info:    #00c0ef

texto principal: font-weight 500
sub-texto:       font-size 12px, color rgba(255,255,255,0.6)
```

### Banners de Sistema (Faixa no Topo)

```
width:       100%
padding:     10px 16px
font-size:   13px
font-weight: 500
display:     flex, align-items: center, gap: 8px
border-bottom: 1px solid (cor da variante)

warning: bg #fff3cd, border #ffeeba, color #856404
error:   bg #f8d7da, border #f5c6cb, color #721c24
```

### Mapeamento SRD §16 para Componente

| Gatilho | Componente | Comportamento |
|---|---|---|
| Largura > largura_rolo | field-alert (error) + chips | Inline abaixo do input |
| Campo obrigatório vazio | input-error + helper-error | Borda vermelha + texto abaixo |
| Desconto acima do limite | alert-warning + modal senha | Aviso inline + modal |
| Senha do admin inválida | input-shake + helper-error | Animação shake + erro inline |
| gc_usuario_id nulo | alert-error | Bloqueia botão de envio |
| GC retorna 400 | toast-error + badge-error | Toast + status atualizado |
| GC retorna 401 | banner-error (global) | Bloqueia todos os envios |
| GC retorna 429 | spinner silencioso | Sem mensagem visível (fila p-queue) |
| GC retorna 5xx | alert-error + btn Reenviar | Status "erro" + botão Reenviar |
| Sessão expirada | Redirect /login | "Sua sessão expirou. Faça login novamente." |

---

## 12. Componentes — Badges e Status

### Estrutura

```
display:       inline-flex
align-items:   center
gap:           4px
font-size:     11px
font-weight:   700
padding:       .25em .4em
border-radius: 3px (inline) ou 9999px (circular)
white-space:   nowrap
```

### Status de Orçamento (3 estados obrigatórios)

| Badge | Bg | Texto | Borda | Label |
|---|---|---|---|---|
| badge-sent | #d4edda | #155724 | #c3e6cb | Enviado |
| badge-draft | #e9ecef | #495057 | #dee2e6 | Rascunho |
| badge-error | #f8d7da | #721c24 | #f5c6cb | Erro |

### Tipo de Produto

Todos: bg #e9ecef, texto #343a40. Não carregam semântica de status — cinza neutro evita conflito com os 3 estados operacionais.

### Outros Badges

| Nome | Bg | Texto | Uso |
|---|---|---|---|
| badge-success | #d4edda | #155724 | GC Online, confirmações |
| badge-warning | #fff3cd | #856404 | Avisos |
| badge-danger | #f8d7da | #721c24 | GC Offline, erros |
| badge-info | #d1ecf1 | #0c5460 | Em separação, informativo |
| badge-secondary | #e9ecef | #495057 | Perfil (Admin/Vendedor), inativo |
| badge-primary | #cce5ff | #004085 | Loja (SP/São Bernardo) |

---

## 13. Componentes — Tabelas e Histórico

### Estrutura da Tabela

```
font-size:        14px
border-collapse:  collapse

thead th:
  font-weight:  700
  padding:      12px
  text-align:   left
  border-bottom: 2px solid #dee2e6

tbody td:
  padding:      12px
  vertical-align: top
  border-top:   1px solid #dee2e6
  color:        #212529

tbody tr:hover td:
  background: rgba(0,0,0,0.05)
```

### Classes de Célula

```
.td-strong  — font-weight 700, color #212529
.td-mono    — font-family mono, font-size 13px, color #212529, tabular-nums
.td-muted   — color #6c757d, font-size 13px
.td-actions — display flex, gap 4px, align-items center
```

> font-mono tabular-nums obrigatório em toda célula .td-mono com valor monetário. Sem isso os dígitos têm largura variável e as colunas de preço desalinham.

### Skeleton Loader

```css
background: linear-gradient(90deg, #f9f9f9 25%, #dee2e6 50%, #f9f9f9 75%);
background-size: 200% 100%;
animation: shimmer 1.5s infinite;
border-radius: 3px;
```

### Filtros de Status (chips horizontais)

```
height:        28px
padding:       0 12px
border:        1px solid #dee2e6
border-radius: 3px
font-size:     12px

:hover   — border-color: #00a65a, color: #00a65a
.active  — background: #00a65a, border-color: #008d4c, color: #fff
```

### Paginação

```
20 itens por página (SRD §8)

botão padrão: padding .5rem .75rem, background #fff,
              border 1px solid #dee2e6, border-radius 3px,
              font-size 14px, color #6c757d

botão ativo:  background #000, border-color #000, color #fff
```

### Breadcrumb

```
font-size:     14px
color:         #6c757d
margin-bottom: 16px
separador:     ">" color #dee2e6
link:          color #000, hover: underline
item atual:    color #212529, font-weight 600
```

> **DECISAO PENDENTE — onde usar breadcrumb:**
> Com sidebar presente, o breadcrumb é redundante em telas de nível 1. Opção A: apenas em telas de detalhe (/orcamentos/:id, /admin/tecidos/:id). Opção B: em todas as telas. Sem impacto funcional — definir com Victor antes do Claude Code montar os layouts.

---

## 14. Componentes — Modais

### Modal de Senha do Gerente

```
overlay:
  background: rgba(0,0,0,0.5)
  z-index:    100 (--z-overlay)

modal:
  background:    #fff
  border-radius: 3px
  padding:       20px
  max-width:     400px
  box-shadow:    var(--shadow-modal)
  z-index:       200 (--z-modal)

header: título 16px 700 + descrição 13px color #6c757d
body:   form-group com input type=password
footer: btn-default (Cancelar) + btn-success (Confirmar), justify-content flex-end
```

### Shake Animation (Senha Incorreta)

```css
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20%       { transform: translateX(-6px); }
  40%       { transform: translateX(6px); }
  60%       { transform: translateX(-4px); }
  80%       { transform: translateX(4px); }
}
.input-shake { animation: shake 0.4s ease; }
```

Aplicar .input-shake + borda vermelha após senha inválida. Remover a classe após animationend.

---

## 15. CSS Custom Properties — globals.css

```css
/* ============================================
   PÉRSIA — DESIGN TOKENS v4
   Aplicação interna B2B · React + Tailwind CSS
   Estética: GestãoClick (AdminLTE 3 + Bootstrap 4.5.3)
   Stratos Lab · 2026
============================================ */

:root {
  /* MARCA / AÇÕES */
  --brand:                #000000;
  --action-add:           #00a65a;  --action-add-border:    #008d4c;
  --action-view:          #00c0ef;  --action-view-border:   #00acd6;
  --action-edit:          #f39c12;  --action-edit-border:   #e08e0b;
  --action-delete:        #f56954;  --action-delete-border: #f4543c;
  --accent-blue:          #0073b7;

  /* FEEDBACK */
  --color-success:        #28a745;
  --color-success-subtle: #d4edda;
  --color-success-border: #c3e6cb;
  --color-warning:        #ffc107;
  --color-warning-subtle: #fff3cd;
  --color-warning-border: #ffeeba;
  --color-error:          #dc3545;
  --color-error-subtle:   #f8d7da;
  --color-error-border:   #f5c6cb;
  --color-info:           #17a2b8;
  --color-info-subtle:    #d1ecf1;
  --color-info-border:    #bee5eb;

  /* STATUS DE ORÇAMENTO */
  --status-sent:          #28a745;
  --status-sent-bg:       #d4edda;
  --status-sent-border:   #c3e6cb;
  --status-draft:         #6c757d;
  --status-draft-bg:      #e9ecef;
  --status-draft-border:  #dee2e6;
  --status-error:         #dc3545;
  --status-error-bg:      #f8d7da;
  --status-error-border:  #f5c6cb;

  /* INDICADOR GESTÃOCLICK */
  --gc-online:   #28a745;
  --gc-offline:  #dc3545;
  --gc-checking: #ffc107;

  /* ESCALA NEUTRA */
  --neutral-0:   #ffffff;
  --neutral-50:  #f9f9f9;
  --neutral-100: #f4f4f4;
  --neutral-200: #e9ecef;
  --neutral-300: #dee2e6;
  --neutral-400: #ced4da;
  --neutral-500: #6c757d;
  --neutral-600: #495057;
  --neutral-700: #343a40;
  --neutral-800: #212529;
  --neutral-900: #000000;

  /* SUPERFÍCIES */
  --surface-app:     #f9f9f9;
  --surface-card:    #ffffff;
  --surface-sidebar: #f4f4f4;
  --surface-header:  #000000;
  --surface-overlay: rgba(0, 0, 0, 0.5);

  /* TIPOGRAFIA */
  --font-ui:   'Source Sans Pro', sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;

  --text-2xl:  24px;
  --text-xl:   20px;
  --text-lg:   16px;
  --text-md:   14px;
  --text-sm:   13px;
  --text-xs:   12px;
  --text-2xs:  11px;

  --weight-regular: 400;
  --weight-medium:  500;
  --weight-bold:    700;

  --lh-tight:  1.2;
  --lh-normal: 1.5;

  /* ESPAÇAMENTO */
  --sp-1:  4px;
  --sp-2:  8px;
  --sp-3:  12px;
  --sp-4:  16px;
  --sp-5:  20px;
  --sp-6:  24px;
  --sp-8:  32px;
  --sp-10: 40px;
  --sp-12: 48px;

  /* BORDER RADIUS */
  --radius-xs:   2px;
  --radius-sm:   3px;
  --radius-md:   4px;
  --radius-full: 9999px;

  /* SOMBRAS */
  --shadow-btn:      inset 0 -1px 0 rgba(0,0,0,0.09);
  --shadow-sidebar:  inset -3px 0 8px -4px rgba(0,0,0,0.07);
  --shadow-dropdown: 0 3px 6px 0 rgba(0,0,0,0.1);
  --shadow-modal:    0 4px 6px -1px rgba(0,0,0,0.10), 0 2px 4px -2px rgba(0,0,0,0.10);
  --shadow-toast:    0 10px 15px -3px rgba(0,0,0,0.10), 0 4px 6px -4px rgba(0,0,0,0.10);
  --shadow-card:     none;
  --focus-ring:      0 0 0 .2rem rgba(0,123,255,.25);

  /* TRANSIÇÕES */
  --transition-fast:   100ms ease;
  --transition-normal: 150ms ease;
  --transition-slow:   200ms ease;

  /* Z-INDEX */
  --z-base:    0;
  --z-raised:  10;
  --z-overlay: 100;
  --z-modal:   200;
  --z-toast:   300;

  /* LAYOUT */
  --sidebar-width: 220px;
  --header-height: 50px;
  --content-max:   1200px;
  --form-max:      640px;
}

/* RESET — SPINNER NATIVO DE input[type=number] */
input[type='number']::-webkit-inner-spin-button,
input[type='number']::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
input[type='number'] {
  -moz-appearance: textfield;
}

/* ANIMAÇÃO SHAKE — SENHA INCORRETA */
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20%       { transform: translateX(-6px); }
  40%       { transform: translateX(6px); }
  60%       { transform: translateX(-4px); }
  80%       { transform: translateX(4px); }
}
.input-shake { animation: shake 0.4s ease; }

/* SKELETON LOADER */
@keyframes shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
.skeleton {
  background: linear-gradient(90deg, #f9f9f9 25%, #dee2e6 50%, #f9f9f9 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 3px;
}

/* INDICADOR GC — DOT PULSANTE */
@keyframes pulse-green {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.4; }
}
.gc-dot-online { animation: pulse-green 2s infinite; }
```

---

## 16. Tailwind Config

```js
// tailwind.config.js
module.exports = {
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
    './src/index.css',  // OBRIGATÓRIO — inclui classes @layer components no purge
  ],
  theme: {
    extend: {
      colors: {
        brand: '#000000',
        action: {
          add:          '#00a65a',
          'add-border': '#008d4c',
          view:         '#00c0ef',
          edit:         '#f39c12',
          delete:       '#f56954',
        },
        success: {
          DEFAULT: '#28a745',
          subtle:  '#d4edda',
          border:  '#c3e6cb',
        },
        warning: {
          DEFAULT: '#ffc107',
          subtle:  '#fff3cd',
          border:  '#ffeeba',
        },
        error: {
          DEFAULT: '#dc3545',
          subtle:  '#f8d7da',
          border:  '#f5c6cb',
        },
        info: {
          DEFAULT: '#17a2b8',
          subtle:  '#d1ecf1',
          border:  '#bee5eb',
        },
        neutral: {
          0:   '#ffffff',
          50:  '#f9f9f9',
          100: '#f4f4f4',
          200: '#e9ecef',
          300: '#dee2e6',
          400: '#ced4da',
          500: '#6c757d',
          600: '#495057',
          700: '#343a40',
          800: '#212529',
          900: '#000000',
        },
        surface: {
          app:     '#f9f9f9',
          card:    '#ffffff',
          sidebar: '#f4f4f4',
          header:  '#000000',
        },
        status: {
          'sent-bg':    '#d4edda',
          'sent-text':  '#155724',
          'draft-bg':   '#e9ecef',
          'draft-text': '#495057',
          'error-bg':   '#f8d7da',
          'error-text': '#721c24',
        },
      },
      fontFamily: {
        ui:   ['Source Sans Pro', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        '2xl-ui': ['24px', { lineHeight: '1.2' }],
        'xl-ui':  ['20px', { lineHeight: '1.3' }],
        'lg-ui':  ['16px', { lineHeight: '1.5' }],
        'md-ui':  ['14px', { lineHeight: '1.5' }],
        'sm-ui':  ['13px', { lineHeight: '1.5' }],
        'xs-ui':  ['12px', { lineHeight: '1.5' }],
        '2xs-ui': ['11px', { lineHeight: '1.4' }],
      },
      borderRadius: {
        xs:      '2px',
        sm:      '3px',
        DEFAULT: '4px',
        full:    '9999px',
      },
      boxShadow: {
        btn:      'inset 0 -1px 0 rgba(0,0,0,0.09)',
        sidebar:  'inset -3px 0 8px -4px rgba(0,0,0,0.07)',
        dropdown: '0 3px 6px 0 rgba(0,0,0,0.1)',
        modal:    '0 4px 6px -1px rgba(0,0,0,0.10), 0 2px 4px -2px rgba(0,0,0,0.10)',
        toast:    '0 10px 15px -3px rgba(0,0,0,0.10), 0 4px 6px -4px rgba(0,0,0,0.10)',
      },
      width:    { sidebar: '220px' },
      height:   { header: '50px' },
      maxWidth: { form: '640px', content: '1200px' },
    },
  },
  plugins: [],
}
```

---

## 17. Padrões e Regras Invioláveis

Regras que o Claude Code deve seguir sem questionar, derivadas do SRD e das regras de negócio.

| # | Regra | Origem |
|---|---|---|
| 1 | Nenhum campo de valor calculado é editável. Sempre readOnly={true} + font-mono + bg neutral-200. Exceção: campo TC (Tamanho do Comando) é pré-calculado como 70% da altura, mas permanece editável pelo vendedor — deve usar input padrão, não readonly. | RN-10 |
| 2 | Valores monetários: sempre 2 casas decimais, formatação pt-BR (R$ 1.249,00), fonte JetBrains Mono. | SRD §3 |
| 3 | Botão "Calcular" começa disabled até todos os campos obrigatórios estarem preenchidos. | SRD §8 |
| 4 | Alerta de largura máxima exibe chips de tecidos alternativos — nunca só mensagem de erro. | SRD §16 + RF-01 |
| 5 | Exatamente 3 estados de badge de orçamento: enviado (verde), rascunho (cinza), erro (vermelho). | SRD §15 |
| 6 | Credenciais do GestãoClick: nunca renderizar no frontend. Sempre via variáveis de ambiente do backend. | SRD §17 |
| 7 | GC retorna 429: spinner silencioso, sem mensagem de erro visível ao usuário (fila com p-queue). | SRD §16 |
| 8 | GC retorna 5xx: orçamento salvo com status erro + botão "Reenviar" visível. | SRD §16 |
| 9 | GC retorna 401: banner global de erro no topo, bloqueia todos os envios até resolução pelo admin. | SRD §16 |
| 10 | Sessão expira em 8h sem renovação. Redirect para /login com mensagem "Sua sessão expirou." | SRD §3 + §17 |
| 11 | Desconto acima do limite do vendedor: modal de senha do gerente com .input-shake em erro. | RN-11 + SRD §16 |
| 12 | Paginação da listagem de orçamentos: 20 itens por página. | SRD §8 |
| 13 | Busca de cliente: debounced (300ms), consulta API GestãoClick por nome/CPF/CNPJ. | SRD §13 |
| 14 | Indicador de saúde do GC: sempre visível no header. Verde pulsante = online. Vermelho estático = offline. | SRD §8 |
| 15 | Campos calculados: sempre readOnly={true} + tabIndex={-1} + onClick={e => e.target.select()}. | RN-10 |
| 16 | Nunca construir nomes de classe Tailwind via template string (bg-${cor}). Purge remove classes dinâmicas. | Tailwind §19 |
| 17 | font-mono tabular-nums obrigatório em toda célula de valor monetário em tabela. | DS §13 |

---

## 18. Acessibilidade

### Contraste de Cores (WCAG 2.1 AA)

| Combinação | Ratio | Status |
|---|---|---|
| Texto #212529 sobre #ffffff | 16:1 | Passa |
| Botão success: #ffffff sobre #00a65a | 4.6:1 | Passa |
| Texto muted #6c757d sobre #ffffff | 4.6:1 | Passa (mínimo) |
| Navbar: #ffffff sobre #000000 | 21:1 | Passa |
| Amarelo #ffc107 sobre #ffffff | 2.7:1 | Falha — não usar como texto |
| Badge warning: #856404 sobre #fff3cd | 4.5:1 | Passa (mínimo) |

> Nunca usar texto branco sobre fundo amarelo (#ffc107). Sempre usar #856404 (texto escuro) sobre fundos warning.

### Checklist de Implementação

- [ ] box-shadow: var(--focus-ring) em todos os elementos com :focus-visible
- [ ] Labels explícitos em todos os inputs — nunca usar placeholder como substituto
- [ ] Altura mínima 36px em todos os botões padrão
- [ ] aria-label em botões de ícone: ex. aria-label="Visualizar orçamento #9782"
- [ ] Erro nunca comunicado só por cor — sempre ícone + texto (helper-error)
- [ ] role="status" ou aria-live="polite" nos toasts de integração
- [ ] aria-disabled="true" em botões desabilitados
- [ ] Foco retorna ao elemento disparador ao fechar modal

---

## 19. Riscos de Implementação Tailwind

| Risco | Instrução |
|---|---|
| Classes dinâmicas purgadas | Nunca construir via template string (bg-${cor}, text-${status}). Sempre classes completas literais: bg-success, text-error, bg-warning. |
| font-mono tabular-nums ausente em colunas de preço | Aplicar explicitamente em toda td com valor monetário. Sem isso os dígitos desalinham. Regressão visual crítica. |
| Campo calculado editável por falta de readOnly | Todo campo calculado precisa de readOnly={true} + tabIndex={-1} + bg neutro. Só CSS não impede input de teclado. |
| Select sem chevron visível | Chevron é injetado via background-image no CSS. Não adicionar ícone HTML extra — duplicaria. |
| text-white sobre bg-warning | #ffffff sobre #ffc107 tem ratio 2.7:1, falha WCAG AA. Usar sempre text neutro escuro sobre fundos amarelos. |
| text-white sobre bg-success (tamanhos pequenos) | #ffffff sobre #00a65a tem ratio 4.6:1, passa AA. Usar com cautela abaixo de 14px. |
| sticky sem top definido | Painel de resultado da calculadora usa position sticky. Sem top explícito não funciona. Usar style={{ top: 'calc(50px + 16px)' }}. |
| Classes @layer components fora do purge | Confirmar que './src/index.css' está no array content do tailwind.config.js. Sem isso as classes customizadas somem no build. |

---

*Design System v4 — Rainha das Cortinas / Projeto Pérsia*
*Estética: GestãoClick (AdminLTE 3 + Bootstrap 4.5.3) — decisão Victor Nogueira Pavoni, junho 2026*
*Stratos Lab (PH Figueiredo + Antonio Figueiredo)*
