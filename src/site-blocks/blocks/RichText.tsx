import type { RichTextBlock } from './types';
import { Heading, Section } from './ui';

export function RichText({ block }: { block: RichTextBlock }) {
  return (
    <Section>
      <div className="grid gap-[var(--site-gap)] lg:grid-cols-[0.35fr_0.65fr]">
        {block.heading ? <Heading>{block.heading}</Heading> : <div />}
        {/* Sanitised on write — see the TipTap decision in the scope doc. */}
        <div
          className="site-richtext max-w-[var(--site-measure)] text-[1.0625rem] leading-[1.7] text-[var(--site-muted)]"
          dangerouslySetInnerHTML={{ __html: block.html }}
        />
      </div>
    </Section>
  );
}
