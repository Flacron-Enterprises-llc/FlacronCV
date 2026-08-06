'use client';

import React from 'react';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';
import {
  Plus,
  Edit2,
  Trash2,
  Loader2,
  AlertCircle,
  LayoutTemplate,
} from 'lucide-react';

interface Template {
  id: string;
  name: string;
  slug: string;
  category: string;
  tier: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  /** How many documents reference this template; drives the archive warning. */
  usageCount?: number;
}

export default function AdminTemplatesPage(): React.JSX.Element | null {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [form, setForm] = useState({ name: '', category: 'cv', tier: 'free' });

  const { data: templates, isLoading, error } = useQuery<Template[]>({
    queryKey: ['admin', 'templates'],
    queryFn: () => api.get('/templates?includeAll=true'),
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => api.post('/templates', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'templates'] });
      toast.success(t('template_created'));
      closeModal();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: typeof form }) =>
      api.put(`/templates/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'templates'] });
      toast.success(t('template_updated'));
      closeModal();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'templates'] });
      toast.success(t('template_deleted'));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const openCreate = () => {
    setEditingTemplate(null);
    setForm({ name: '', category: 'cv', tier: 'free' });
    setModalOpen(true);
  };

  const openEdit = (tmpl: Template) => {
    setEditingTemplate(tmpl);
    setForm({ name: tmpl.name, category: tmpl.category, tier: tmpl.tier });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingTemplate(null);
    setForm({ name: '', category: 'cv', tier: 'free' });
  };

  const handleSubmit = () => {
    if (editingTemplate) {
      updateMutation.mutate({ id: editingTemplate.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const tierVariant = (tier: string) => {
    switch (tier) {
      case 'pro':
        return 'brand' as const;
      case 'enterprise':
        return 'warning' as const;
      default:
        return 'success' as const;
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-stone-500">
        <AlertCircle className="h-8 w-8" />
        <p>{t('error_loading')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-white">
            {t('templates')}
          </h1>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
            {t('templates_subtitle')}
          </p>
        </div>
        <Button onClick={openCreate} icon={<Plus className="h-4 w-4" />}>
          {t('create_template')}
        </Button>
      </div>

      {templates && templates.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((tmpl) => (
            <Card key={tmpl.id} className="relative">
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-stone-900 dark:text-white">
                    {tmpl.name}
                  </h3>
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    {tmpl.slug}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => openEdit(tmpl)}
                    aria-label={t('edit_template')}
                    title={t('edit_template')}
                    className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      // Name the template and state how many documents already
                      // use it, so an admin can see the blast radius before
                      // archiving. Deletion is a soft archive server-side
                      // (isActive:false), so existing documents keep rendering.
                      const inUse = tmpl.usageCount ?? 0;
                      const message = inUse
                        ? t('delete_template_confirm_in_use', { name: tmpl.name, count: inUse })
                        : t('delete_template_confirm_named', { name: tmpl.name });
                      if (window.confirm(message)) {
                        deleteMutation.mutate(tmpl.id);
                      }
                    }}
                    disabled={deleteMutation.isPending}
                    aria-label={tc('delete')}
                    title={tc('delete')}
                    className="rounded-lg p-1.5 text-red-400 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-900/20"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="default">{tmpl.category.toUpperCase()}</Badge>
                <Badge variant={tierVariant(tmpl.tier)}>{tmpl.tier.toUpperCase()}</Badge>
              </div>
              <p className="mt-3 text-xs text-stone-400">
                {t('updated_at', { date: formatDate(tmpl.updatedAt) })}
              </p>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="py-16 text-center">
          <LayoutTemplate className="mx-auto h-12 w-12 text-stone-300 dark:text-stone-600" />
          <h3 className="mt-4 text-lg font-semibold text-stone-900 dark:text-white">
            {t('no_templates')}
          </h3>
          <Button className="mt-4" onClick={openCreate} icon={<Plus className="h-4 w-4" />}>
            {t('create_first_template')}
          </Button>
        </Card>
      )}

      {/* Create/Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editingTemplate ? t('edit_template') : t('create_template')}
        size="md"
      >
        <div className="space-y-4">
          <Input
            id="template-name"
            label={t('template_name')}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder={t('template_name_placeholder')}
          />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-stone-700 dark:text-stone-300">
              {t('category')}
            </label>
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              className="input-field w-full"
            >
              <option value="cv">{t('category_cv')}</option>
              <option value="cover_letter">{t('category_cover_letter')}</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-stone-700 dark:text-stone-300">
              {t('tier')}
            </label>
            <select
              value={form.tier}
              onChange={(e) => setForm((f) => ({ ...f, tier: e.target.value }))}
              className="input-field w-full"
            >
              <option value="free">{tc('free')}</option>
              <option value="pro">{tc('pro')}</option>
              <option value="enterprise">{tc('enterprise')}</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={closeModal}>
              {tc('cancel')}
            </Button>
            <Button
              onClick={handleSubmit}
              loading={createMutation.isPending || updateMutation.isPending}
            >
              {editingTemplate ? t('update') : t('create')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
