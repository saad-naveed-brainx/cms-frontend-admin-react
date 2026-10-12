import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Bold, Heading2, Heading3, Italic, Link, List, ListOrdered, Quote } from 'lucide-react'
import { SAFE_LINK } from './block-schemas.ts'

type Props = {
  id: string
  labelId: string
  value: string
  invalid: boolean
  describedBy?: string
  onChange: (html: string) => void
}

/** Only what the API keeps (D-041): paragraphs, bold, italic, underline, strike, two heading sizes, lists, quotes, links. */
const extensions = [
  StarterKit.configure({
    heading: { levels: [2, 3] },
    code: false,
    codeBlock: false,
    horizontalRule: false,
    // No empty paragraph kept at the end: it would be saved as one.
    trailingNode: false,
    link: {
      openOnClick: false,
      autolink: true,
      defaultProtocol: 'https',
      // Stored and drawn as a plain link: the API keeps only `href`.
      HTMLAttributes: { target: null, rel: null },
    },
  }),
]

/** An empty editor is no text at all, not `<p></p>`. */
const htmlOf = (editor: Editor) => (editor.isEmpty ? '' : editor.getHTML())

function ToolButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className="tool"
      aria-label={label}
      title={label}
      aria-pressed={active}
      // Keep the selection in the text while the button is pressed.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

/**
 * A text block's words, with a small toolbar (TipTap, the scope document's choice). What it makes is
 * HTML; the API cleans it again when the page is saved, and the website draws what is stored.
 */
export default function RichTextField({
  id,
  labelId,
  value,
  invalid,
  describedBy,
  onChange,
}: Props) {
  // The last HTML this field sent or was given, so a new value from outside (a reload after a
  // save) replaces the text, and the field's own typing does not.
  const last = useRef(value)
  const [linkProblem, setLinkProblem] = useState<string | null>(null)

  const editor = useEditor({
    extensions,
    content: value,
    immediatelyRender: true,
    // TipTap applies these again on every render, so its name and any problem shown under it stay current.
    editorProps: {
      attributes: {
        id,
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-labelledby': labelId,
        'aria-invalid': String(invalid),
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
        class: 'rich-text-area',
      },
    },
    onUpdate: ({ editor: changed }) => {
      const html = htmlOf(changed)
      last.current = html
      onChange(html)
    },
  })

  useEffect(() => {
    if (value === last.current) return
    last.current = value
    editor.commands.setContent(value, { emitUpdate: false })
  }, [editor, value])

  const active = useEditorState({
    editor,
    selector: ({ editor: now }) => ({
      bold: now.isActive('bold'),
      italic: now.isActive('italic'),
      h2: now.isActive('heading', { level: 2 }),
      h3: now.isActive('heading', { level: 3 }),
      bullets: now.isActive('bulletList'),
      numbers: now.isActive('orderedList'),
      quote: now.isActive('blockquote'),
      link: now.isActive('link'),
    }),
  })

  function link() {
    setLinkProblem(null)
    if (editor.isActive('link')) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    const typed = window.prompt('Link address: https://…, /page-on-this-site, mailto: or tel:')
    const href = typed?.trim()
    if (!href) return
    if (!SAFE_LINK.test(href)) {
      setLinkProblem('A link must start with https://, / for a page on this site, mailto: or tel:.')
      return
    }
    if (editor.state.selection.empty) {
      editor
        .chain()
        .focus()
        .insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] })
        .run()
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
    }
  }

  const chain = () => editor.chain().focus()
  return (
    <div className="rich-text" data-invalid={invalid}>
      <div
        className="rich-text-tools"
        role="toolbar"
        aria-label="Text formatting"
        aria-controls={id}
      >
        <ToolButton label="Bold" active={active.bold} onClick={() => chain().toggleBold().run()}>
          <Bold aria-hidden="true" size={16} />
        </ToolButton>
        <ToolButton
          label="Italic"
          active={active.italic}
          onClick={() => chain().toggleItalic().run()}
        >
          <Italic aria-hidden="true" size={16} />
        </ToolButton>
        <ToolButton
          label="Heading"
          active={active.h2}
          onClick={() => chain().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 aria-hidden="true" size={16} />
        </ToolButton>
        <ToolButton
          label="Subheading"
          active={active.h3}
          onClick={() => chain().toggleHeading({ level: 3 }).run()}
        >
          <Heading3 aria-hidden="true" size={16} />
        </ToolButton>
        <ToolButton
          label="Bulleted list"
          active={active.bullets}
          onClick={() => chain().toggleBulletList().run()}
        >
          <List aria-hidden="true" size={16} />
        </ToolButton>
        <ToolButton
          label="Numbered list"
          active={active.numbers}
          onClick={() => chain().toggleOrderedList().run()}
        >
          <ListOrdered aria-hidden="true" size={16} />
        </ToolButton>
        <ToolButton
          label="Quote"
          active={active.quote}
          onClick={() => chain().toggleBlockquote().run()}
        >
          <Quote aria-hidden="true" size={16} />
        </ToolButton>
        <ToolButton
          label={active.link ? 'Remove link' : 'Link'}
          active={active.link}
          onClick={link}
        >
          <Link aria-hidden="true" size={16} />
        </ToolButton>
      </div>
      <EditorContent editor={editor} />
      {linkProblem && (
        <p className="field-error" role="alert">
          {linkProblem}
        </p>
      )}
    </div>
  )
}
