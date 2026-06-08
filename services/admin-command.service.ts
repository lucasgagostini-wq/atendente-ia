import {
  ADMIN_CONSOLE_COMMAND_IDS,
  ADMIN_QA_PHONE,
  type AdminConsoleCommandId,
  getAdminConsoleCommand,
} from "@/lib/admin-console/commands";
import { leadResetService } from "@/services/lead-reset.service";

type AdminCommandExecutionResult = {
  commandId: AdminConsoleCommandId;
  successMessage: string;
  result: Record<string, unknown>;
};

class AdminCommandService {
  async execute(commandId: string): Promise<AdminCommandExecutionResult> {
    const command = getAdminConsoleCommand(commandId);

    if (!command) {
      throw new Error("Comando administrativo nao encontrado.");
    }

    switch (command.id) {
      case ADMIN_CONSOLE_COMMAND_IDS.RESET_ADMIN_NUMBER: {
        const resetResult = await leadResetService.resetLeadByPhone(ADMIN_QA_PHONE);

        return {
          commandId: command.id,
          successMessage: command.successMessage,
          result: resetResult,
        };
      }
      default: {
        const exhaustiveCheck: never = command.id;
        throw new Error(`Comando nao suportado: ${exhaustiveCheck}`);
      }
    }
  }
}

export const adminCommandService = new AdminCommandService();
export type { AdminCommandExecutionResult };
