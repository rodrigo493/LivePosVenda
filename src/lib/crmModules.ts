// src/lib/crmModules.ts

// REGRA: sempre que adicionar um item ao sidebar em AppSidebar.tsx com moduleKey != null,
// adicione também aqui com a mesma key. Sem isso o item não aparece em Permissões CRM.
export const CRM_MODULES = [
  { key: "crm_pipeline",       label: "CRM Pipeline",          section: "Principal"  },
  { key: "motivos_perda",      label: "Motivos de Perda",      section: "Principal"  },
  { key: "chat_whatsapp",      label: "Chat WhatsApp",         section: "Principal"  },
  { key: "clientes",           label: "Clientes",              section: "Principal"  },
  { key: "equipamentos",       label: "Equipamentos",          section: "Principal"  },
  { key: "tarefas",            label: "Tarefas",               section: "Operações"  },
  { key: "chamados",           label: "Chamados",              section: "Operações"  },
  { key: "pedidos_acessorios", label: "Pedidos de Acessórios", section: "Operações"  },
  { key: "pedidos_garantia",   label: "Pedidos de Garantia",   section: "Operações"  },
  { key: "pedidos_venda",      label: "Pedidos de Venda",      section: "Operações"  },
  { key: "orcamentos",         label: "Orçamentos",            section: "Operações"  },
  { key: "ordens_servico",     label: "Ordens de Serviço",     section: "Operações"  },
  { key: "manutencao",         label: "Manutenção Prev.",      section: "Operações"  },
  { key: "relatorios",         label: "Relatórios",            section: "Gestão"     },
  { key: "produtos_pecas",     label: "Produtos e Peças",      section: "Gestão"     },
  { key: "servicos",           label: "Serviços",              section: "Gestão"     },
  { key: "tecnicos",           label: "Técnicos",              section: "Gestão"     },
  { key: "engenharia",         label: "Engenharia",            section: "Gestão"     },
  { key: "importar_historico", label: "Importar Histórico",    section: "Gestão"     },
  { key: "manual_usuario",     label: "Manual do Usuário",     section: "Gestão"     },
  { key: "portal_cliente",     label: "Portal do Cliente",     section: "Outros"     },
] as const;

export type CrmModuleKey = typeof CRM_MODULES[number]["key"];

export const CRM_SECTIONS = ["Principal", "Operações", "Gestão", "Outros"] as const;
export type CrmSection = typeof CRM_SECTIONS[number];

export function getModulesBySection(section: CrmSection) {
  return CRM_MODULES.filter((m) => m.section === section);
}
