import type { ImageTextBlock } from './types';
import { ActionLink, Heading, Prose, Section } from './ui';

export function ImageText({ block }: { block: ImageTextBlock }) {
  const { heading, body, image, imagePosition, action } = block;

  return (
    <Section className="border-t border-[var(--site-line)]">
      <div className="grid items-center gap-[var(--site-gap)] lg:grid-cols-2">
        <figure
          className={`overflow-hidden rounded-[var(--site-radius-lg)] border border-[var(--site-line)] ${
            imagePosition === 'right' ? 'lg:order-2' : ''
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- plain <img> until next/image lands with the media library */}
          <img src={image.src} alt={image.alt} className="block h-full w-full object-cover" />
          {image.caption ? (
            <figcaption className="border-t border-[var(--site-line)] bg-[var(--site-surface)] px-4 py-3 font-[family-name:var(--site-font-utility)] text-xs tracking-[0.08em] text-[var(--site-muted)]">
              {image.caption}
            </figcaption>
          ) : null}
        </figure>

        <div className="flex flex-col gap-5">
          <Heading>{heading}</Heading>
          <Prose>{body}</Prose>
          {action ? (
            <div className="mt-1">
              <ActionLink action={action} variant="secondary" />
            </div>
          ) : null}
        </div>
      </div>
    </Section>
  );
}
