'use client';
import React from 'react';

import { useId, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  CRMCustomer,
  CRMActivity,
  CRMTransaction,
  CRMCustomerStatus,
  CRMCustomerSource,
} from '@flacroncv/shared-types';
import CRMStatusBadge from '@/components/crm/CRMStatusBadge';
import ActivityTimeline from '@/components/crm/ActivityTimeline';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { Link, useRouter } from '@/i18n/routing';
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
  Trash2,
} from 'lucide-react';
import { safeFormat } from '@/lib/format-date';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { useModalA11y } from '@/hooks/useModalA11y';

export default function CustomerProfilePage(): React.JSX.Element | null {
  const t = useTranslations('crm');
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const router = useRouter();

  const [noteText, setNoteText] = useState('');
  const [newTag, setNewTag] = useState('');
  const [editingStatus, setEditingStatus] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<CRMCustomerStatus | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    phone: '',
    company: '',
    source: CRMCustomerSource.MANUAL,
  });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Accessible-dialog wiring for the two hand-rolled modals below.
  const editTitleId = useId();
  const deleteTitleId = useId();
  const fieldId = useId();
  const editDialogRef = useModalA11y<HTMLDivElement>(showEditModal, () => setShowEditModal(false));
  const deleteDialogRef = useModalA11y<HTMLDivElement>(showDeleteConfirm, () =>
    setShowDeleteConfirm(false),
  );

  const { data: customer, isLoading } = useQuery<CRMCustomer>({
    queryKey: ['crm', 'customer', id],
    queryFn: () => api.get(`/crm/customers/${id}`),
  });

  const { data: activities, isLoading: loadingActivities } = useQuery<CRMActivity[]>({
    queryKey: ['crm', 'customer', id, 'activities'],
    queryFn: () => api.get(`/crm/customers/${id}/activities`),
  });

  const { data: transactionsData, isLoading: txLoading, isError: txError } = useQuery<{ items: CRMTransaction[] }>({
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
    onSuccess: () => { setNoteText(''); invalidate(); toast.success(t('customer_detail_note_added')); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteNoteMutation = useMutation({
    mutationFn: (noteId: string) =>
      api.delete(`/crm/customers/${id}/notes/${noteId}`),
    onSuccess: () => { invalidate(); toast.success(t('customer_detail_note_deleted')); },
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
      toast.success(t('customer_detail_status_updated'));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Seed the edit form from the loaded customer, then open the modal.
  const openEdit = () => {
    if (!customer) return;
    setEditForm({
      name: customer.name,
      phone: customer.phone ?? '',
      company: customer.company ?? '',
      source: customer.source,
    });
    setShowEditModal(true);
  };

  const updateMutation = useMutation({
    mutationFn: (dto: typeof editForm) => api.put(`/crm/customers/${id}`, dto),
    onSuccess: () => {
      setShowEditModal(false);
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['crm', 'customers'] });
      toast.success(t('customer_detail_update_success'));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/crm/customers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'customers'] });
      queryClient.invalidateQueries({ queryKey: ['crm', 'analytics'] });
      toast.success(t('customer_detail_delete_success'));
      router.push('/crm/customers');
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
            {t('customer_detail_back_to_customers')}
          </Link>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-white">{customer.name}</h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            {t('customer_detail_customer_since', { date: safeFormat(customer.createdAt, 'MMMM d, yyyy') })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CRMStatusBadge value={customer.status} type="customer" />
          {!editingStatus ? (
            <Button
              variant="secondary"
              size="sm"
              icon={<Edit3 className="h-4 w-4" />}
              onClick={() => { setSelectedStatus(customer.status); setEditingStatus(true); }}
            >
              {t('customer_detail_change_status')}
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
                {t('save')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label={t('cancel')}
                title={t('cancel')}
                onClick={() => setEditingStatus(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
          <Button
            variant="secondary"
            size="sm"
            icon={<Edit3 className="h-4 w-4" />}
            onClick={openEdit}
          >
            {t('customer_detail_edit')}
          </Button>
          <Button
            variant="danger"
            size="sm"
            icon={<Trash2 className="h-4 w-4" />}
            onClick={() => setShowDeleteConfirm(true)}
          >
            {t('customer_detail_delete')}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column */}
        <div className="space-y-6 lg:col-span-1">
          {/* Basic Info */}
          <Card>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
              {t('customer_detail_contact_info')}
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
                  {t('customer_detail_source_label', { source: customer.source })}
                </span>
              </div>
              {customer.lastActivity && (
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 flex-shrink-0 text-stone-400" />
                  <span className="text-sm text-stone-600 dark:text-stone-300">
                    {t('customer_detail_last_activity', { date: safeFormat(customer.lastActivity, 'MMM d, yyyy') })}
                  </span>
                </div>
              )}
            </div>
          </Card>

          {/* Revenue */}
          <Card>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
                <DollarSign className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm text-stone-500 dark:text-stone-400">{t('customer_detail_total_revenue')}</p>
                <p className="text-3xl font-bold text-stone-900 dark:text-white">
                  ${customer.totalRevenue.toLocaleString()}
                </p>
              </div>
            </div>
          </Card>

          {/* Tags */}
          <Card>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
              <Tag className="h-3.5 w-3.5" />
              {t('customer_detail_tags')}
            </h2>
            <div className="flex flex-wrap gap-2">
              {customer.tags.map((tag) => (
                <span
                  key={tag}
                  className="flex items-center gap-1 rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-700 dark:bg-stone-800 dark:text-stone-300"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTagMutation.mutate(tag)}
                    aria-label={t('customer_detail_remove_tag', { tag })}
                    title={t('customer_detail_remove_tag', { tag })}
                    className="ms-1 text-stone-400 hover:text-red-500"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                placeholder={t('customer_detail_add_tag_placeholder')}
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
                aria-label={t('customer_detail_add_tag')}
                title={t('customer_detail_add_tag')}
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
              {t('customer_detail_purchase_history')}
            </h2>
            {txLoading ? (
              <div className="h-16 animate-pulse rounded-lg bg-stone-100 dark:bg-stone-800" />
            ) : txError ? (
              <p className="text-sm text-red-600 dark:text-red-400">{t('data_load_error')}</p>
            ) : transactionsData?.items.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-stone-200 dark:border-stone-700 text-start text-xs font-semibold uppercase tracking-wide text-stone-500">
                      <th className="pb-2 pe-4">{t('date')}</th>
                      <th className="pb-2 pe-4">{t('description')}</th>
                      <th className="pb-2 pe-4">{t('amount')}</th>
                      <th className="pb-2">{t('status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactionsData.items.map((tx) => (
                      <tr key={tx.id} className="border-b border-stone-100 dark:border-stone-800">
                        <td className="py-2 pe-4 text-stone-500 dark:text-stone-400">
                          {safeFormat(tx.date, 'MMM d, yyyy')}
                        </td>
                        <td className="py-2 pe-4 text-stone-700 dark:text-stone-300">
                          {tx.description ?? '—'}
                        </td>
                        <td className="py-2 pe-4 font-medium text-stone-900 dark:text-white">
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
              <p className="text-sm text-stone-500 dark:text-stone-400">{t('customer_detail_no_transactions')}</p>
            )}
          </Card>

          {/* Notes */}
          <Card>
            <h2 className="mb-4 text-base font-semibold text-stone-900 dark:text-white">
              {t('customer_detail_notes')}
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
                      type="button"
                      onClick={() => deleteNoteMutation.mutate(note.id)}
                      aria-label={t('customer_detail_delete_note')}
                      title={t('customer_detail_delete_note')}
                      className="flex-shrink-0 text-stone-300 opacity-0 hover:text-red-500 focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 dark:text-stone-600 transition-opacity"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-stone-400 dark:text-stone-500">
                    {note.authorName} &middot; {safeFormat(note.createdAt, 'MMM d, yyyy HH:mm')}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-4 space-y-2">
              <textarea
                placeholder={t('customer_detail_add_note_placeholder')}
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
                {t('customer_detail_add_note')}
              </Button>
            </div>
          </Card>

          {/* Activity Timeline */}
          <Card>
            <h2 className="mb-4 text-base font-semibold text-stone-900 dark:text-white">
              {t('customer_detail_activity_timeline')}
            </h2>
            <ActivityTimeline
              activities={activities ?? []}
              loading={loadingActivities}
            />
          </Card>
        </div>
      </div>

      {/* Edit Customer Modal */}
      {showEditModal && (
        <div
          ref={editDialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={editTitleId}
          tabIndex={-1}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 outline-none"
        >
          <Card className="max-h-[90vh] w-full max-w-md overflow-y-auto">
            <div className="mb-4 flex items-center justify-between">
              <h2 id={editTitleId} className="text-lg font-semibold text-stone-900 dark:text-white">
                {t('customer_detail_edit_title')}
              </h2>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                aria-label={t('close')}
                className="rounded-lg p-1 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => { e.preventDefault(); updateMutation.mutate(editForm); }}
              className="space-y-4"
            >
              <div>
                <label
                  htmlFor={`${fieldId}-name`}
                  className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300"
                >
                  {t('customers_field_name')}
                </label>
                <input
                  id={`${fieldId}-name`}
                  type="text"
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                  className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-stone-700 dark:bg-stone-800 dark:text-white"
                />
              </div>
              <div>
                <label
                  htmlFor={`${fieldId}-phone`}
                  className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300"
                >
                  {t('phone')}
                </label>
                <input
                  id={`${fieldId}-phone`}
                  type="tel"
                  value={editForm.phone}
                  onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))}
                  className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-stone-700 dark:bg-stone-800 dark:text-white"
                />
              </div>
              <div>
                <label
                  htmlFor={`${fieldId}-company`}
                  className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300"
                >
                  {t('company')}
                </label>
                <input
                  id={`${fieldId}-company`}
                  type="text"
                  value={editForm.company}
                  onChange={(e) => setEditForm((p) => ({ ...p, company: e.target.value }))}
                  className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-stone-700 dark:bg-stone-800 dark:text-white"
                />
              </div>
              <div>
                <label
                  htmlFor={`${fieldId}-source`}
                  className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300"
                >
                  {t('source')}
                </label>
                <select
                  id={`${fieldId}-source`}
                  value={editForm.source}
                  onChange={(e) => setEditForm((p) => ({ ...p, source: e.target.value as CRMCustomerSource }))}
                  className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-white"
                >
                  {Object.values(CRMCustomerSource).map((v) => (
                    <option key={v} value={v} className="capitalize">{v}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="secondary" onClick={() => setShowEditModal(false)}>
                  {t('cancel')}
                </Button>
                <Button type="submit" loading={updateMutation.isPending}>
                  {t('save')}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div
          ref={deleteDialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={deleteTitleId}
          tabIndex={-1}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 outline-none"
        >
          <Card className="w-full max-w-sm">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400">
                <Trash2 className="h-5 w-5" />
              </div>
              <h2 id={deleteTitleId} className="text-lg font-semibold text-stone-900 dark:text-white">
                {t('customer_detail_delete_title')}
              </h2>
            </div>
            <p className="text-sm text-stone-600 dark:text-stone-400">
              {t('customer_detail_delete_confirm', { name: customer.name })}
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleteMutation.isPending}
              >
                {t('cancel')}
              </Button>
              <Button
                variant="danger"
                loading={deleteMutation.isPending}
                icon={<Trash2 className="h-4 w-4" />}
                onClick={() => deleteMutation.mutate()}
              >
                {t('customer_detail_delete')}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
