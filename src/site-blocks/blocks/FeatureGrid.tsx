import type { FeatureGridBlock } from './types';
import { Eyebrow, Heading, Prose, Section } from './ui';

export function FeatureGrid({ block }: { block: FeatureGridBlock }) {
  const { heading, intro, items, ordered } = block;

  return (
    <Section className="border-t border-[var(--site-line)]">
      {heading || intro ? (
        <div className="mb-12 flex flex-col gap-4">
          {heading ? <Heading>{heading}</Heading> : null}
          {intro ? <Prose>{intro}</Prose> : null}
        </div>
      ) : null}

      <ol className="grid gap-[var(--site-gap)] sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, index) => (
          <li
            key={item.title}
            className="flex flex-col gap-3 rounded-[var(--site-radius-md)] border border-[var(--site-line)] bg-[var(--site-surface)] p-6"
          >
            {ordered ? (
              <span
                aria-hidden="true"
                className="font-[family-name:var(--site-font-utility)] text-sm tabular-nums text-[var(--site-accent)]"
              >
                {String(index + 1).padStart(2, '0')}
              </span>
            ) : item.label ? (
              <Eyebrow>{item.label}</Eyebrow>
            ) : null}
            <h3 className="font-[family-name:var(--site-font-display)] text-xl leading-tight">{item.title}</h3>
            <p className="text-[0.9375rem] leading-[1.6] text-[var(--site-muted)]">{item.body}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
