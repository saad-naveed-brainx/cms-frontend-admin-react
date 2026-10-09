import type { TestimonialBlock } from './types';
import { Section } from './ui';

export function Testimonial({ block }: { block: TestimonialBlock }) {
  return (
    <Section className="border-t border-[var(--site-line)]">
      <figure className="mx-auto flex max-w-3xl flex-col items-start gap-8">
        <blockquote className="font-[family-name:var(--site-font-display)] text-[clamp(1.5rem,3vw,2.25rem)] leading-[1.25] text-balance">
          {block.quote}
        </blockquote>
        <figcaption className="font-[family-name:var(--site-font-utility)] text-sm tracking-[0.04em] text-[var(--site-muted)]">
          <span className="text-[var(--site-ink)]">{block.attribution}</span>
          {block.role ? <span> — {block.role}</span> : null}
        </figcaption>
      </figure>
    </Section>
  );
}
