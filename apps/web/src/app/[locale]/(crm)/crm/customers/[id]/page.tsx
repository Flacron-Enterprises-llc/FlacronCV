'use client';
import React from 'react';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  CRMCustomer,
  CRMActivity,
  CRMTransaction,
  CRMCustomerStatus,
} from '@flacroncv/shared-types';
import CRMStatusBadge from '@/components/crm/CRMStatusBadge';
import ActivityTimeline from '@/components/crm/ActivityTimeline';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { Link } from '@/i18n/routing';
import {
  ArrowLeft,
  Mail,
  Phone,
  Building2,
  Tag,
  X,
  Plus,
  DollarSign,
  Calendar,
  Globe,
  Edit3,
  Save,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

export default function CustomerProfilePage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [noteText, setNoteText] = useState('');
  const [newTag, setNewTag] = useState('');
  const [editingStatus, setEditingStatus] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<CRMCustomerStatus | null>(null);

  const { data: customer, isLoading } = useQuery<CRMCustomer>({
    queryKey: ['crm', 'customer', id],
    queryFn: () => api.get(`/crm/customers/${id}`),
  });

  const { data: activities, isLoading: loadingActivities } = useQuery<CRMActivity[]>({
    queryKey: ['crm', 'customer', id, 'activities'],
    queryFn: () => api.get(`/crm/customers/${id}/activities`),
  });

  const { data: transactionsData } = useQuery<{ items: CRMTransaction[] }>({
    queryKey: ['crm', 'transactions', { customerId: id }],
    queryFn: () => api.get(`/crm/transactions?customerId=${id}&limit=10`),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['crm', 'customer', id] });
    queryClient.invalidateQueries({ queryKey: ['crm', 'customer', id, 'activities'] });
  };

  const addNoteMutation = useMutation({
    mutationFn: (content: string) =>
      api.post(`/crm/customers/${id}/notes`, { content }),
    onSuccess: () => { setNoteText(''); invalidate(); toast.success('Note added'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteNoteMutation = useMutation({
    mutationFn: (noteId: string) =>
      api.delete(`/crm/customers/${id}/notes/${noteId}`),
    onSuccess: () => { invalidate(); toast.success('Note deleted'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const addTagMutation = useMutation({
    mutationFn: (tag: string) =>
      api.post(`/crm/customers/${id}/tags`, { tag }),
    onSuccess: () => { setNewTag(''); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeTagMutation = useMutation({
    mutationFn: (tag: string) =>
      api.delete(`/crm/customers/${id}/tags/${encodeURIComponent(tag)}`),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const updateStatusMutation = useMutation({
    mutationFn: (status: CRMCustomerStatus) =>
      api.put(`/crm/customers/${id}`, { status }),
    onSuccess: () => {
      setEditingStatus(false);
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['crm', 'customers'] });
      toast.success('Status updated');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-stone-200 dark:bg-stone-700" />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="h-64 animate-pulse rounded-xl bg-stone-200 dark:bg-stone-700 lg:col-span-1" />
          <div className="h-64 animate-pulse rounded-xl bg-stone-200 dark:bg-stone-700 lg:col-span-2" />
        </div>
      </div>
    );
  }

  if (!customer) return null;

  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/crm/customers"
            className="mb-2 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-900 dark:hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Customers
          </Link>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-white">{customer.name}</h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            Customer since {format(new Date(customer.createdAt), 'MMMM d, yyyy')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <CRMStatusBadge value={customer.status} type="customer" />
          {!editingStatus ? (
            <Button
              variant="secondary"
              size="sm"
              icon={<Edit3 className="h-4 w-4" />}
              onClick={() => { setSelectedStatus(customer.status); setEditingStatus(true); }}
            >
              Change Status
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <select
                value={selectedStatus ?? customer.status}
                onChange={(e) => setSelectedStatus(e.target.value as CRMCustomerStatus)}
                className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-800 dark:text-white"
              >
                {Object.values(CRMCustomerStatus).map((v) => (
                  <option key={v} value={v} className="capitalize">{v}</option>
                ))}
              </select>
              <Button
                size="sm"
                loading={updateStatusMutation.isPending}
                icon={<Save className="h-4 w-4" />}
                onClick={() => selectedStatus && updateStatusMutation.mutate(selectedStatus)}
              >
                Save
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditingStatus(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column */}
        <div className="space-y-6 lg:col-span-1">
          {/* Basic Info */}
          <Card>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
              Contact Info
            </h2>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <Mail className="mt-0.5 h-4 w-4 flex-shrink-0 text-stone-400" />
                <span className="text-sm text-stone-900 dark:text-white break-all">{customer.email}</span>
              </div>
              {customer.phone && (
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 flex-shrink-0 text-stone-400" />
                  <span className="text-sm text-stone-900 dark:text-white">{customer.phone}</span>
                </div>
              )}
              {customer.company && (
                <div className="flex items-center gap-3">
                  <Building2 className="h-4 w-4 flex-shrink-0 text-stone-400" />
                  <span className="text-sm text-stone-900 dark:text-white">{customer.company}</span>
                </div>
              )}
              <div className="flex items-center gap-3">
                <Globe className="h-4 w-4 flex-shrink-0 text-stone-400" />
                <span className="text-sm capitalize text-stone-600 dark:text-stone-300">
                  Source: {customer.source}
                </span>
              </div>
              {customer.lastActivity && (
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 flex-shrink-0 text-stone-400" />
                  <span className="text-sm text-stone-600 dark:text-stone-300">
                    Last activity: {format(new Date(customer.lastActivity), 'MMM d, yyyy')}
                  </span>
                </div>
              )}
            </div>
          </Card>

          {/* Revenue */}
          <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200 dark:from-emerald-950 dark:to-emerald-900 dark:border-emerald-800">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900">
                <DollarSign className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-sm text-emerald-700 dark:text-emerald-400">Total Revenue</p>
                <p className="text-3xl font-bold text-emerald-800 dark:text-emerald-200">
                  ${customer.totalRevenue.toLocaleString()}
                </p>
              </div>
            </div>
          </Card>

          {/* Tags */}
          <Card>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
              <Tag className="h-3.5 w-3.5" />
              Tags
            </h2>
            <div className="flex flex-wrap gap-2">
              {customer.tags.map((tag) => (
                <span
                  key={tag}
                  className="flex items-center gap-1 rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-700 dark:bg-stone-800 dark:text-stone-300"
                >
                  {tag}
                  <button
                    onClick={() => removeTagMutation.mutate(tag)}
                    className="ml-1 text-stone-400 hover:text-red-500"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                placeholder="Add tag..."
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newTag.trim()) {
                    addTagMutation.mutate(newTag.trim());
                  }
                }}
                className="flex-1 rounded-lg border border-stone-200 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-white"
              />
              <Button
                size="sm"
                variant="secondary"
                icon={<Plus className="h-4 w-4" />}
                disabled={!newTag.trim()}
                onClick={() => addTagMutation.mutate(newTag.trim())}
              />
            </div>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-6 lg:col-span-2">
          {/* Purchase History */}
          <Card>
            <h2 className="mb-4 text-base font-semibold text-stone-900 dark:text-white">
              Purchase History
            </h2>
            {transactionsData?.items.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-stone-200 dark:border-stone-700 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
                      <th className="pb-2 pr-4">Date</th>
                      <th className="pb-2 pr-4">Description</th>
                      <th className="pb-2 pr-4">Amount</th>
                      <th className="pb-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactionsData.items.map((tx) => (
                      <tr key={tx.id} className="border-b border-stone-100 dark:border-stone-800">
                        <td className="py-2 pr-4 text-stone-500 dark:text-stone-400">
                          {format(new Date(tx.date), 'MMM d, yyyy')}
                        </td>
                        <td className="py-2 pr-4 text-stone-700 dark:text-stone-300">
                          {tx.description ?? '—'}
                        </td>
                        <td className="py-2 pr-4 font-medium text-stone-900 dark:text-white">
                          ${tx.amount.toLocaleString()} {tx.currency}
                        </td>
                        <td className="py-2">
                          <CRMStatusBadge value={tx.status} type="transaction" size="sm" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-stone-500 dark:text-stone-400">No transactions yet.</p>
            )}
          </Card>

          {/* Notes */}
          <Card>
            <h2 className="mb-4 text-base font-semibold text-stone-900 dark:text-white">
              Notes
            </h2>
            <div className="space-y-3">
              {(customer.notes ?? []).map((note) => (
                <div
                  key={note.id}
                  className="group rounded-lg border border-stone-200 p-3 dark:border-stone-700"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-stone-700 dark:text-stone-300">{note.content}</p>
                    <button
                      onClick={() => deleteNoteMutation.mutate(note.id)}
                      className="flex-shrink-0 text-stone-300 opacity-0 hover:text-red-500 group-hover:opacity-100 dark:text-stone-600 transition-opacity"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-stone-400 dark:text-stone-500">
                    {note.authorName} &middot; {format(new Date(note.createdAt), 'MMM d, yyyy HH:mm')}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-4 space-y-2">
              <textarea
                placeholder="Add a note..."
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                rows={3}
                className="w-full resize-none rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-900 placeholder-stone-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-stone-700 dark:bg-stone-800 dark:text-white dark:placeholder-stone-500"
              />
              <Button
                size="sm"
                disabled={!noteText.trim()}
                loading={addNoteMutation.isPending}
                onClick={() => addNoteMutation.mutate(noteText.trim())}
              >
                Add Note
              </Button>
            </div>
          </Card>

          {/* Activity Timeline */}
          <Card>
            <h2 className="mb-4 text-base font-semibold text-stone-900 dark:text-white">
              Activity Timeline
            </h2>
            <ActivityTimeline
              activities={activities ?? []}
              loading={loadingActivities}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
