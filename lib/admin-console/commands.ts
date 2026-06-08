export const ADMIN_CONSOLE_COMMAND_IDS = {
  RESET_ADMIN_NUMBER: "reset-admin-number",
} as const;

export type AdminConsoleCommandId =
  (typeof ADMIN_CONSOLE_COMMAND_IDS)[keyof typeof ADMIN_CONSOLE_COMMAND_IDS];

export type AdminConsoleCommandDefinition = {
  id: AdminConsoleCommandId;
  title: string;
  description: string;
  keywords: string[];
  confirmationTitle: string;
  confirmationBody: string;
  successMessage: string;
  variant?: "default" | "destructive";
};

export const ADMIN_QA_PHONE = "5519998266669";

export const adminConsoleCommands: AdminConsoleCommandDefinition[] = [
  {
    id: ADMIN_CONSOLE_COMMAND_IDS.RESET_ADMIN_NUMBER,
    title: "Resetar número admin",
    description: "Limpa o histórico do número de QA e reabre o fluxo para novos testes.",
    keywords: [
      "reset",
      "admin",
      "numero",
      "lead",
      "qa",
      "historico",
      ADMIN_QA_PHONE,
    ],
    confirmationTitle: "Tem certeza que deseja resetar o número admin?",
    confirmationBody:
      "Essa ação vai apagar conversas, mensagens e estados de atendimento desse número, preservando apenas as tags.",
    successMessage: "Histórico do número admin resetado com sucesso.",
    variant: "destructive",
  },
];

export function getAdminConsoleCommand(commandId: string) {
  return adminConsoleCommands.find((command) => command.id === commandId);
}
