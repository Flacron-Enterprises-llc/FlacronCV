import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth-store';
import { SupportTicket, TicketMessage, CreateTicketData } from '../types/support.types';
import { PaginatedResponse } from '../types/api.types';

function useAuthReady() {
  const { firebaseUser, isInitialized } = useAuthStore();
  return isInitialized && !!firebaseUser;
}

export function useSupportTickets(page = 1) {
  const ready = useAuthReady();
  return useQuery({
    queryKey: ['support-tickets', page],
    queryFn: () => api.get<PaginatedResponse<SupportTicket>>('/support/tickets', { page }),
    enabled: ready,
    staleTime: 2 * 60 * 1000,
  });
}

export function useSupportTicket(id: string | null) {
  const ready = useAuthReady();
  return useQuery({
    queryKey: ['support-ticket', id],
    queryFn: () => api.get<SupportTicket>(`/support/tickets/${id}`),
    enabled: ready && !!id,
  });
}

export function useTicketMessages(ticketId: string | null) {
  const ready = useAuthReady();
  return useQuery({
    queryKey: ['ticket-messages', ticketId],
    queryFn: () => api.get<TicketMessage[]>(`/support/tickets/${ticketId}/messages`),
    enabled: ready && !!ticketId,
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
      qc.invalidateQueries({ queryKey: ['ticket-messages', ticketId] });
    },
  });
}
