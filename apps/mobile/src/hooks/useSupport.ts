import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth-store';
import { SupportTicket, TicketMessage, CreateTicketData } from '../types/support.types';

function useAuthReady() {
  const { firebaseUser, isInitialized } = useAuthStore();
  return isInitialized && !!firebaseUser;
}

export function useSupportTickets(page = 1) {
  const ready = useAuthReady();
  return useQuery({
    queryKey: ['support-tickets', page],
    queryFn: () => api.get<SupportTicket[]>('/support/tickets', { page }),
    enabled: ready,
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * GET /support/tickets/:id returns `{ ticket, messages }` — there is no
 * separate `/messages` collection route for customers. Envelope unwrap lives
 * in `api.ts`; this only flattens that payload onto the ticket.
 */
export function useSupportTicket(id: string | null) {
  const ready = useAuthReady();
  return useQuery({
    queryKey: ['support-ticket', id],
    queryFn: async () => {
      const body = await api.get<{ ticket: SupportTicket; messages: TicketMessage[] }>(
        `/support/tickets/${id}`,
      );
      return {
        ...body.ticket,
        messages: body.messages ?? body.ticket?.messages ?? [],
      } as SupportTicket;
    },
    enabled: ready && !!id,
    refetchInterval: 15000,
  });
}

export function useCreateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTicketData) =>
      api.post<SupportTicket>('/support/tickets', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['support-tickets'] });
    },
  });
}

export function useAddTicketMessage(ticketId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) =>
      api.post<TicketMessage>(`/support/tickets/${ticketId}/messages`, { content }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['support-ticket', ticketId] });
    },
  });
}
