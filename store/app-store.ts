import { create } from "zustand";

type AppStore = {
  selectedConversationId: string | null;
  setSelectedConversationId: (value: string | null) => void;
  aiPausedLeads: string[];
  toggleAiPause: (leadId: string) => void;
};

export const useAppStore = create<AppStore>((set) => ({
  selectedConversationId: null,
  setSelectedConversationId: (value) => set({ selectedConversationId: value }),
  aiPausedLeads: [],
  toggleAiPause: (leadId) =>
    set((state) => ({
      aiPausedLeads: state.aiPausedLeads.includes(leadId)
        ? state.aiPausedLeads.filter((id) => id !== leadId)
        : [...state.aiPausedLeads, leadId],
    })),
}));

