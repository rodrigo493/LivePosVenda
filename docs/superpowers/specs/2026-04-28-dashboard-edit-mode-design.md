# Spec: Modo de Edição de Layout — Meu Painel

**Data:** 2026-04-28  
**Status:** Aprovado  
**Escopo:** `src/pages/MyDashboardPage.tsx` + migration Supabase

---

## 1. Objetivo

Permitir que qualquer usuário autenticado personalize a posição e o tamanho dos KPI cards no "Meu Painel" arrastando com o mouse. O layout é persistido por usuário no Supabase e carregado em qualquer máquina/sessão.

---

## 2. Experiência do usuário

### Vista normal
- Botão **"✏️ Editar layout"** discreto no canto superior direito do `PageHeader`.
- Os cards se comportam normalmente (clicáveis, drill-down, etc.).

### Modo de edição (após clicar em "Editar layout")
- Os KPI cards ganham **borda tracejada azul**.
- Cada card exibe uma **alça de arrasto** (ícone `⋮⋮`) no topo central — cursor `grab`.
- Cada card exibe um **handle de resize** no canto inferior direito — cursor `se-resize`.
- Um banner azul aparece abaixo do header: *"↔ Arraste para reposicionar · Puxe o canto ↘ para redimensionar"*
- Os botões **Salvar**, **Cancelar** e **Resetar padrão** substituem o botão "Editar layout" no header.
- Clicar em KPIs no modo de edição **não** dispara drill-down.

### Salvar
- UPSERT na tabela `user_dashboard_layouts`.
- Sai do modo de edição.
- Toast de confirmação.

### Cancelar
- Descarta mudanças locais.
- Restaura o layout que estava antes de entrar em edição.
- Sai do modo de edição.

### Resetar padrão
- Remove o registro do banco para o usuário atual.
- Aplica o layout padrão (12 KPIs em 2 linhas de 6 colunas).
- Sai do modo de edição.

---

## 3. Biblioteca

**`react-grid-layout`** — padrão de mercado para dashboards editáveis.

- Drag + resize nativos.
- Grade de 12 colunas.
- `onLayoutChange` callback para rastrear mudanças localmente.
- CSS importado: `react-grid-layout/css/styles.css` + `react-resizable/css/styles.css`.

---

## 4. Banco de dados

### Tabela: `user_dashboard_layouts`

```sql
CREATE TABLE IF NOT EXISTS user_dashboard_layouts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  layout     jsonb NOT NULL DEFAULT '[]',
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE user_dashboard_layouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_layout"
  ON user_dashboard_layouts
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

### Estrutura do JSON (`layout`)

Array de objetos no formato `react-grid-layout`:

```json
[
  { "i": "tickets-ativos",        "x": 0, "y": 0, "w": 2, "h": 1 },
  { "i": "concluidos",            "x": 2, "y": 0, "w": 2, "h": 1 },
  { "i": "atrasados",             "x": 4, "y": 0, "w": 2, "h": 1 },
  { "i": "media-interacao",       "x": 6, "y": 0, "w": 2, "h": 1 },
  { "i": "sem-atendimento",       "x": 8, "y": 0, "w": 2, "h": 1 },
  { "i": "aguardando-peca",       "x": 10,"y": 0, "w": 2, "h": 1 },
  { "i": "orcamentos-pendentes",  "x": 0, "y": 1, "w": 2, "h": 1 },
  { "i": "os-abertas",            "x": 2, "y": 1, "w": 2, "h": 1 },
  { "i": "os-concluidas",         "x": 4, "y": 1, "w": 2, "h": 1 },
  { "i": "garantias-analise",     "x": 6, "y": 1, "w": 2, "h": 1 },
  { "i": "assistencias-abertas",  "x": 8, "y": 1, "w": 2, "h": 1 },
  { "i": "custo-garantia",        "x": 10,"y": 1, "w": 2, "h": 1 }
]
```

Campos: `i` = ID do KPI (estável), `x`/`y` = posição na grade, `w` = largura em colunas (1–12), `h` = altura em linhas (1–3).

---

## 5. Arquitetura de componentes

### Hook: `useDashboardLayout`

Localização: `src/hooks/useDashboardLayout.ts`

Responsabilidades:
- Buscar o layout do usuário no Supabase (`useQuery`).
- Fornecer `saveLayout(layout)` — faz UPSERT.
- Fornecer `resetLayout()` — deleta o registro.
- Retornar `currentLayout` (Supabase ou padrão se não existir).
- Retornar `isLoading`.

### Constante: `DEFAULT_LAYOUT`

Localização: `src/constants/dashboardLayout.ts`

Array com os 12 KPIs no layout padrão (2 linhas × 6 colunas, cada card w=2 h=1).

### Componente: `KpiGridItem`

Wrapper leve ao redor de `KpiCard` que em modo de edição:
- Adiciona `className="edit-mode"` para estilos de borda/handle.
- Bloqueia o `onClick` do card (evita drill-down durante drag).

### Modificação em `MyDashboardPage`

- Substituir os dois `<div className="grid ...">` das rows 1 e 2 por um único `<ResponsiveGridLayout>` do react-grid-layout.
- Estado local `isEditing: boolean`.
- Estado local `draftLayout` — cópia que muda durante arrasto sem salvar no banco.
- Ao entrar em edição: `draftLayout = currentLayout`.
- `onLayoutChange` atualiza `draftLayout`.
- Salvar: `saveLayout(draftLayout)` → sai de edição.
- Cancelar: descarta `draftLayout` → sai de edição.
- Resetar: `resetLayout()` → sai de edição.

---

## 6. Estilos do modo de edição

CSS adicionado em `src/index.css` (ou módulo):

```css
/* Borda tracejada nos cards em modo de edição */
.react-grid-item.edit-mode {
  border: 2px dashed hsl(var(--primary));
  border-radius: var(--radius);
  cursor: grab;
}

/* Handle de arrasto (topo do card) */
.react-grid-item .drag-handle {
  position: absolute;
  top: 4px;
  left: 50%;
  transform: translateX(-50%);
  color: hsl(var(--muted-foreground));
  letter-spacing: 3px;
  font-size: 10px;
  cursor: grab;
}

/* Handle de resize (canto inferior direito — provido pelo react-resizable) */
.react-resizable-handle {
  border-right: 2px solid hsl(var(--primary));
  border-bottom: 2px solid hsl(var(--primary));
}
```

---

## 7. Migration

Arquivo: `supabase/migrations/YYYYMMDDHHMMSS_user_dashboard_layouts.sql`

Contém: `CREATE TABLE`, `ENABLE ROW LEVEL SECURITY`, `CREATE POLICY`.

---

## 8. Restrições de tamanho

| Dimensão | Mínimo | Máximo |
|----------|--------|--------|
| Largura (`w`) | 2 colunas | 12 colunas |
| Altura (`h`) | 1 linha | 3 linhas |

Configurados via `minW`, `maxW`, `minH`, `maxH` em cada item do layout.

---

## 9. Fora do escopo

- Edição de cards de seção (Pipeline, Tarefas, Orçamentos, etc.)
- Adicionar ou remover KPIs do painel
- Layout diferente por breakpoint (mobile vs desktop)
- Compartilhamento de layout entre usuários
