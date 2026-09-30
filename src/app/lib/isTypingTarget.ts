// Whether a key event's target is somewhere the user types text: form fields, contenteditable
// areas, and code editors (Monaco takes input through an EditContext element that is neither
// an input nor contenteditable), so page-wide shortcuts leave those keys alone.
export function isTypingTarget(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null;
  if (!t || typeof t.closest !== "function") return false;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable || !!t.closest(".monaco-editor, .cm-editor");
}
