/**
 * Bridges contenteditable formatting until the editor is migrated to a modern
 * model (e.g. TipTap / Lexical / Slate). `document.execCommand` is deprecated
 * but remains the most compatible path for legacy contenteditable surfaces.
 */
export function applyContentEditableCommand(command: string, value?: string): boolean {
  try {
    return document.execCommand(command, false, value);
  } catch {
    return false;
  }
}

/** Clears inline formatting and links in the current selection. */
export function clearContentEditableFormatting(): void {
  try {
    document.execCommand('removeFormat', false);
    document.execCommand('unlink', false);
  } catch {
    // no-op
  }
}
