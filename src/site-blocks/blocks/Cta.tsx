import type { CtaBlock } from './types';
import { ActionLink, Heading, Prose, Section } from './ui';

export function Cta({ block }: { block: CtaBlock }) {
  return (
    <Section className="border-t border-[var(--site-line)]">
      <div className="flex flex-col items-start justify-between gap-8 rounded-[var(--site-radius-lg)] border border-[var(--site-line)] bg-[var(--site-surface)] p-8 sm:p-12 lg:flex-row lg:items-end">
        <div className="flex flex-col gap-4">
          <Heading>{block.heading}</Heading>
          {block.body ? <Prose>{block.body}</Prose> : null}
        </div>
        <div className="flex flex-col items-start gap-3">
          <ActionLink action={block.action} variant="primary" />
          {block.note ? (
            <p className="font-[family-name:var(--site-font-utility)] text-xs tracking-[0.08em] text-[var(--site-muted)]">
              {block.note}
            </p>
          ) : null}
        </div>
      </div>
    </Section>
  );
}
