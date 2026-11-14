'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { JobApplication, JobStatus } from '@flacroncv/shared-types';
import { cn } from '@/lib/utils';
import JobCard, { type JobCardActions } from './JobCard';
import { STATUS_ORDER, boardStatus, groupByStatus } from './job-workspace';

const DRAG_TYPE = 'application/x-flacroncv-job';

interface JobBoardProps extends JobCardActions {
  jobs: JobApplication[];
  cvTitles: Map<string, string>;
  letterTitles: Map<string, string>;
  busyId: string | null;
}

/**
 * Status board: one column per stage. Cards move by drag and drop (pointer)
 * or with the "Move to" select on every card (keyboard, screen readers and
 * touch, where HTML drag and drop is unavailable). On a phone the columns
 * scroll sideways one at a time.
 */
export default function JobBoard({ jobs, cvTitles, letterTitles, busyId, ...actions }: JobBoardProps) {
  const t = useTranslations('jobs');
  const groups = groupByStatus(jobs);
  const [over, setOver] = useState<JobStatus | null>(null);

  const onDrop = (e: React.DragEvent, status: JobStatus) => {
    e.preventDefault();
    setOver(null);
    const id = e.dataTransfer.getData(DRAG_TYPE);
    const job = jobs.find((j) => j.id === id);
    if (job && boardStatus(job.status) !== status) actions.onStatus(job, status);
  };

  return (
    <div
      className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0"
      aria-label={t('board_label')}
      role="region"
    >
      {STATUS_ORDER.map((status) => (
        <section
          key={status}
          aria-labelledby={`board-col-${status}`}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (over !== status) setOver(status);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null);
          }}
          onDrop={(e) => onDrop(e, status)}
          className={cn(
            'flex w-[85vw] max-w-[18rem] shrink-0 snap-start flex-col rounded-xl bg-stone-100 p-2 dark:bg-stone-800/60 sm:w-72',
            over === status && 'ring-2 ring-brand-500',
          )}
        >
          <h2
            id={`board-col-${status}`}
            className="flex items-center justify-between px-1 pb-2 text-sm font-semibold text-stone-700 dark:text-stone-200"
          >
            {t(`status.${status}`)}
            <span className="rounded-full bg-stone-200 px-2 text-xs tabular-nums dark:bg-stone-700">
              {groups[status].length}
            </span>
          </h2>
          <div className="flex min-h-[4rem] flex-col gap-2">
            {groups[status].length === 0 ? (
              <p className="px-1 py-4 text-center text-xs text-stone-400">{t('board_empty_column')}</p>
            ) : (
              groups[status].map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  compact
                  draggable
                  onDragStart={(e, dragged) => {
                    e.dataTransfer.setData(DRAG_TYPE, dragged.id);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  cvTitles={cvTitles}
                  letterTitles={letterTitles}
                  busy={busyId === job.id}
                  {...actions}
                />
              ))
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
