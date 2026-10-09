import type { HeroBlock } from './types';
import { ActionLink, Eyebrow, Heading, Prose, Section } from './ui';

export function Hero({ block }: { block: HeroBlock }) {
  const { eyebrow, headline, body, primaryAction, secondaryAction, image, facts } = block;

  return (
    <Section className="border-b border-[var(--site-line)]">
      <div className="grid items-end gap-[var(--site-gap)] lg:grid-cols-[1.1fr_0.9fr]">
        <div className="site-rise flex flex-col gap-6">
          {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
          <Heading level={1}>{headline}</Heading>
          {body ? <Prose className="text-[1.1875rem]">{body}</Prose> : null}
          {primaryAction || secondaryAction ? (
            <div className="mt-2 flex flex-wrap items-center gap-x-8 gap-y-4">
              {primaryAction ? <ActionLink action={primaryAction} variant="primary" /> : null}
              {secondaryAction ? <ActionLink action={secondaryAction} variant="secondary" /> : null}
            </div>
          ) : null}
        </div>

        {image ? (
          <figure className="site-rise site-rise-delay overflow-hidden rounded-[var(--site-radius-lg)] border border-[var(--site-line)]">
            {/* eslint-disable-next-line @next/next/no-img-element -- plain <img> until next/image lands with the media library */}
            <img src={image.src} alt={image.alt} className="block h-full w-full object-cover" />
          </figure>
        ) : null}
      </div>

      {facts?.length ? (
        <dl className="mt-12 grid gap-px overflow-hidden rounded-[var(--site-radius-md)] border border-[var(--site-line)] bg-[var(--site-line)] sm:grid-cols-3">
          {facts.map((fact) => (
            <div key={fact.label} className="bg-[var(--site-surface)] px-5 py-4">
              <dt className="font-[family-name:var(--site-font-utility)] text-[0.6875rem] uppercase tracking-[0.16em] text-[var(--site-muted)]">
                {fact.label}
              </dt>
              <dd className="mt-1 font-[family-name:var(--site-font-display)] text-2xl">{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </Section>
  );
}
