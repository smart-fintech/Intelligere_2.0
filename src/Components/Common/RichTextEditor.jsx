import { useCallback, useEffect, useRef, useState } from 'react'
import { AlignCenter, AlignLeft, AlignRight, Bold, Italic, List, ListOrdered, RemoveFormatting, Underline } from 'lucide-react'

import { FieldError, FieldLabel } from '@/Components/Common/FormFields'
import { Tooltip } from '@/Components/ui/tooltip'
import { cn } from '@/Library/utils'
import { isHtmlEmpty, richTextClass, sanitizeHtml } from '@/Utils/richText'

/**
 * A text box with a small formatting toolbar. Its value is HTML, sanitised on
 * the way in and out (Utils/richText), so only the formatting the toolbar makes
 * is ever stored. Ctrl+B / I / U work as in any editor; pasted content comes in
 * as plain text.
 *
 *   <RichTextEditor id="note" label="Note" value={html} onChange={setHtml} />
 *
 * It is not a controlled input: the box owns what is typed, and `value` is
 * written into it only when it changes from outside (a reset, an edit loading),
 * so the caret never jumps while typing.
 */

const TOOLBAR = [
  [
    { command: 'bold', label: 'Bold', icon: Bold },
    { command: 'italic', label: 'Italic', icon: Italic },
    { command: 'underline', label: 'Underline', icon: Underline },
  ],
  [
    { command: 'insertUnorderedList', label: 'Bulleted list', icon: List },
    { command: 'insertOrderedList', label: 'Numbered list', icon: ListOrdered },
  ],
  [
    { command: 'justifyLeft', label: 'Align left', icon: AlignLeft },
    { command: 'justifyCenter', label: 'Align center', icon: AlignCenter },
    { command: 'justifyRight', label: 'Align right', icon: AlignRight },
  ],
  [{ command: 'removeFormat', label: 'Clear formatting', icon: RemoveFormatting, stateless: true }],
]

const commandStates = () => {
  const state = {}
  TOOLBAR.flat().forEach(({ command, stateless }) => {
    if (stateless) return
    try {
      state[command] = document.queryCommandState(command)
    } catch {
      state[command] = false
    }
  })
  return state
}

export function RichTextEditor({ id, label, required, value = '', onChange, placeholder, error, disabled, minHeight = 96, className }) {
  const editorRef = useRef(null)
  // The HTML this editor sent up last - a `value` equal to it is its own echo, not a change from outside.
  const emittedRef = useRef(null)
  const [active, setActive] = useState({})
  const labelId = `${id}-label`
  const errorId = `${id}-error`

  useEffect(() => {
    const editor = editorRef.current
    if (!editor || value === emittedRef.current) return
    const next = sanitizeHtml(value)
    if (editor.innerHTML !== next) editor.innerHTML = next
  }, [value])

  const refreshActive = useCallback(() => setActive(commandStates()), [])

  const emit = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    const html = sanitizeHtml(editor.innerHTML)
    emittedRef.current = html
    onChange?.(html)
  }, [onChange])

  const run = (command) => {
    const editor = editorRef.current
    if (disabled || !editor) return
    editor.focus()
    try {
      // Tags (<b>, <i>) rather than inline styles, which the sanitiser would drop.
      document.execCommand('styleWithCSS', false, false)
    } catch {
      // Not every browser has it; the command still works.
    }
    document.execCommand(command, false, null)
    emit()
    refreshActive()
  }

  const handlePaste = (event) => {
    event.preventDefault()
    document.execCommand('insertText', false, event.clipboardData?.getData('text/plain') ?? '')
    emit()
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      {label ? (
        <FieldLabel htmlFor={id} required={required} className="w-fit">
          <span id={labelId}>{label}</span>
        </FieldLabel>
      ) : null}

      <div
        className={cn(
          'overflow-hidden rounded-md border border-input bg-card shadow-xs transition-[color,box-shadow] dark:bg-input/30',
          'focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50',
          error && 'border-destructive ring-destructive/20',
          disabled && 'opacity-50',
        )}
      >
        <div role="toolbar" aria-label={`${label ?? 'Text'} formatting`} className="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/40 px-1 py-0.5">
          {TOOLBAR.map((group, index) => (
            <div key={index} className={cn('flex items-center gap-0.5', index > 0 && 'border-l border-border pl-0.5')}>
              {group.map(({ command, label: name, icon: Icon }) => (
                <Tooltip key={command} text={disabled ? null : name}>
                  <button
                    type="button"
                    aria-label={name}
                    aria-pressed={command in active ? Boolean(active[command]) : undefined}
                    disabled={disabled}
                    // Keeps the selection in the box; the command acts on it.
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => run(command)}
                    className={cn(
                      'flex size-7 cursor-pointer items-center justify-center rounded-sm text-muted-foreground outline-none transition-colors',
                      'hover:bg-brand-soft hover:text-brand focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none',
                      active[command] && 'bg-brand-soft text-brand',
                    )}
                  >
                    <Icon className="size-3.5" />
                  </button>
                </Tooltip>
              ))}
            </div>
          ))}
        </div>

        <div className="relative">
          {placeholder && isHtmlEmpty(value) ? (
            <span aria-hidden="true" className="pointer-events-none absolute top-2 left-3 text-sm text-muted-foreground">
              {placeholder}
            </span>
          ) : null}
          <div
            id={id}
            ref={editorRef}
            role="textbox"
            aria-multiline="true"
            aria-labelledby={label ? labelId : undefined}
            aria-placeholder={placeholder}
            aria-required={required || undefined}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            aria-disabled={disabled || undefined}
            contentEditable={!disabled}
            suppressContentEditableWarning
            style={{ minHeight }}
            className={cn('max-h-72 overflow-y-auto px-3 py-2 outline-none', richTextClass, disabled && 'cursor-not-allowed')}
            onInput={emit}
            onBlur={emit}
            onPaste={handlePaste}
            onKeyUp={refreshActive}
            onMouseUp={refreshActive}
            onFocus={refreshActive}
          />
        </div>
      </div>

      <FieldError id={errorId}>{error}</FieldError>
    </div>
  )
}
