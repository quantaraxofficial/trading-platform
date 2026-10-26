// The Pine Editor's code in a collab, edited live by everyone allowed to: a Yjs document kept in
// step with the room (which holds the master copy), and a binding to the Monaco editor that
// turns local typing into document changes and others' changes into edits, shows everyone's
// cursor and selection in their colour, and undoes only this person's own edits.

import * as Y from "yjs";
import type * as Monaco from "monaco-editor";
import { useSyncExternalStore } from "react";
import { collab } from "./session";

const toB64 = (u: Uint8Array) => { let s = ""; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s); };
const fromB64 = (b: string) => { const s = atob(b); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };

const REMOTE = "remote";
const CURSOR_TTL = 120_000;

export interface RemoteCursor { id: string; uid: string; name: string; color: string; anchor: any; head: any; at: number }
export interface PineDocInfo { ready: boolean; canEdit: boolean; cursors: RemoteCursor[]; error: string | null }

class PineDocSync {
  private doc = new Y.Doc();
  private text = this.doc.getText("code");
  private ready = false;
  private cursors = new Map<string, RemoteCursor>();
  private subs = new Set<() => void>();
  private info: PineDocInfo = { ready: false, canEdit: false, cursors: [], error: null };
  private error: string | null = null;
  private redraw: (() => void) | null = null;

  constructor() {
    collab.onPineDoc(e => {
      if (e.type === "state" || e.type === "denied") {
        // A fresh copy of the room's document (on joining, or after getting out of step)
        this.doc.destroy();
        this.doc = new Y.Doc();
        this.text = this.doc.getText("code");
        Y.applyUpdate(this.doc, fromB64(e.state), REMOTE);
        this.ready = true;
        this.error = e.type === "denied" ? e.error : null;
        this.watchLocal();
        this.emit(true);
      } else if (e.type === "update") {
        try { Y.applyUpdate(this.doc, fromB64(e.u), REMOTE); } catch { /* malformed */ }
        this.redraw?.();
      } else if (e.type === "cursor") {
        const peer = collab.peerById(e.id);
        if (!e.anchor || !e.head) this.cursors.delete(e.id);
        else this.cursors.set(e.id, { id: e.id, uid: e.uid, name: peer?.name || "Someone", color: peer?.color || "#2962ff", anchor: e.anchor, head: e.head, at: Date.now() });
        this.redraw?.();
        this.emit();
      } else if (e.type === "left") {
        if (this.cursors.delete(e.id)) { this.redraw?.(); this.emit(); }
      }
    });
    // Leaving the collab: the document goes with it
    collab.subscribe(() => {
      if (!collab.active && this.ready) {
        this.ready = false;
        this.cursors.clear();
        this.emit(true);
      }
      const canEdit = collab.canPine;
      if (canEdit !== this.info.canEdit) this.emit();
    });
  }

  // This browser's own edits go to the room
  private watchLocal() {
    this.doc.on("update", (u: Uint8Array, origin: unknown) => {
      if (origin === REMOTE) return;
      collab.sendPineDocUpdate(toB64(u));
    });
  }

  private reset: (() => void) | null = null;
  private emit(docChanged = false) {
    const now = Date.now();
    this.info = { ready: this.ready, canEdit: collab.canPine, error: this.error, cursors: Array.from(this.cursors.values()).filter(c => now - c.at < CURSOR_TTL) };
    if (docChanged) this.reset?.();
    this.subs.forEach(f => f());
  }
  subscribe = (f: () => void) => { this.subs.add(f); return () => { this.subs.delete(f); }; };
  get = () => this.info;

  // Ties a Monaco editor to the shared document; returns the unbinding. `restore` puts back the
  // code the editor had before (when the collab ended, not when the editor closed)
  bind(editor: Monaco.editor.IStandaloneCodeEditor, monaco: typeof Monaco): (restore: boolean) => void {
    const model = editor.getModel();
    if (!model) return () => {};
    const before = model.getValue();
    let mute = false;
    let text = this.text;
    let undo: Y.UndoManager | null = null;
    let unobserve = () => {};
    const origin = {};   // this binding's own changes (and what its undo tracks)

    const setModel = (value: string) => {
      if (model.getValue() === value) return;
      mute = true;
      model.pushEditOperations([], [{ range: model.getFullModelRange(), text: value }], () => null);
      mute = false;
    };

    // (Re)attach to the current document: on binding, and when a fresh copy arrives
    const attach = () => {
      unobserve();
      undo?.destroy();
      text = this.text;
      if (!this.ready) return;
      if (text.length === 0) {
        // An empty room document: the first editor fills it with its code (the room accepts one)
        if (model.getValue() && collab.canPine) collab.seedPineDoc(model.getValue());
      } else {
        setModel(text.toString());
      }
      undo = new Y.UndoManager(text, { trackedOrigins: new Set([origin]) });
      const observer = (event: Y.YTextEvent, tr: Y.Transaction) => {
        if (tr.origin === origin) return;
        // Someone else's edit, applied one step at a time (positions shift as it goes)
        mute = true;
        let index = 0;
        for (const op of event.delta) {
          if (op.retain !== undefined) index += op.retain;
          else if (typeof op.insert === "string") {
            const p = model.getPositionAt(index);
            model.applyEdits([{ range: new monaco.Range(p.lineNumber, p.column, p.lineNumber, p.column), text: op.insert }]);
            index += op.insert.length;
          } else if (op.delete !== undefined) {
            const a = model.getPositionAt(index), b = model.getPositionAt(index + op.delete);
            model.applyEdits([{ range: new monaco.Range(a.lineNumber, a.column, b.lineNumber, b.column), text: "" }]);
          }
        }
        mute = false;
        // A safety net: if the two ever differ, the document wins
        if (model.getValue() !== text.toString()) setModel(text.toString());
        drawCursors();
      };
      text.observe(observer);
      unobserve = () => text.unobserve(observer);
    };

    // This editor → the document (a person without edit permission gets the room's copy back)
    const onChange = model.onDidChangeContent(e => {
      if (mute || !this.ready) return;
      if (!collab.canPine) { setTimeout(() => setModel(text.toString())); return; }
      this.doc.transact(() => {
        [...e.changes].sort((x, y) => y.rangeOffset - x.rangeOffset).forEach(c => {
          if (c.rangeLength) text.delete(c.rangeOffset, c.rangeLength);
          if (c.text) text.insert(c.rangeOffset, c.text);
        });
      }, origin);
    });

    // Undo / redo take back only this person's edits
    const onKey = editor.onKeyDown(e => {
      if (!this.ready || !undo) return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.keyCode === monaco.KeyCode.KeyZ && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); undo.undo(); }
      else if (e.keyCode === monaco.KeyCode.KeyY || (e.keyCode === monaco.KeyCode.KeyZ && e.shiftKey)) { e.preventDefault(); e.stopPropagation(); undo.redo(); }
    });

    // This person's cursor → the others, as positions in the document that survive edits
    let cursorTimer: ReturnType<typeof setTimeout> | null = null;
    const sendCursor = () => {
      cursorTimer = null;
      if (!this.ready) return;
      const sel = editor.getSelection();
      if (!sel || !editor.hasTextFocus()) { collab.sendPineCursor(null, null); return; }
      const rel = (pos: Monaco.IPosition) => Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(text, model.getOffsetAt(pos)));
      // anchor: where the selection was started; head: where the caret is
      collab.sendPineCursor(rel({ lineNumber: sel.selectionStartLineNumber, column: sel.selectionStartColumn }), rel(sel.getPosition()));
    };
    const queueCursor = () => { if (!cursorTimer) cursorTimer = setTimeout(sendCursor, 60); };
    const onSel = editor.onDidChangeCursorSelection(queueCursor);
    const onBlur = editor.onDidBlurEditorText(queueCursor);
    const onFocus = editor.onDidFocusEditorText(queueCursor);

    // Everyone else's cursor and selection, in their colour with their name
    const decorations = editor.createDecorationsCollection([]);
    const style = document.createElement("style");
    document.head.appendChild(style);
    const keyOf = (id: string) => id.replace(/[^a-zA-Z0-9]/g, "").slice(-12);
    const drawCursors = () => {
      const now = Date.now();
      const rules: string[] = [];
      const decos: Monaco.editor.IModelDeltaDecoration[] = [];
      this.cursors.forEach(c => {
        if (now - c.at > CURSOR_TTL) return;
        const abs = (json: any) => {
          try { return Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(json), this.doc)?.index ?? null; } catch { return null; }
        };
        const a = abs(c.anchor), h = abs(c.head);
        if (a == null || h == null) return;
        const k = keyOf(c.id);
        const name = c.name.replace(/["\\]/g, "");
        rules.push(`.tvpc-sel-${k}{background:${c.color}33}`,
          `.tvpc-caret-${k}{border-left:2px solid ${c.color};margin-left:-1px;position:relative}`,
          `.tvpc-caret-${k}::after{content:"${name}";position:absolute;left:-2px;top:-15px;height:14px;line-height:14px;padding:0 4px;border-radius:3px 3px 3px 0;background:${c.color};color:#fff;font:11px -apple-system,BlinkMacSystemFont,'Trebuchet MS',Roboto,sans-serif;white-space:nowrap;pointer-events:none;z-index:5}`);
        const pa = model.getPositionAt(Math.min(a, h)), pb = model.getPositionAt(Math.max(a, h)), ph = model.getPositionAt(h);
        if (a !== h) decos.push({ range: new monaco.Range(pa.lineNumber, pa.column, pb.lineNumber, pb.column), options: { className: `tvpc-sel-${k}`, stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges } });
        decos.push({ range: new monaco.Range(ph.lineNumber, ph.column, ph.lineNumber, ph.column), options: { beforeContentClassName: `tvpc-caret-${k}`, stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges } });
      });
      style.textContent = rules.join("\n");
      decorations.set(decos);
    };

    const applyReadOnly = () => editor.updateOptions({ readOnly: this.ready && !collab.canPine });
    attach();
    applyReadOnly();
    drawCursors();
    this.redraw = drawCursors;
    this.reset = () => { attach(); applyReadOnly(); drawCursors(); };
    const unsubPerms = this.subscribe(applyReadOnly);
    const sweep = setInterval(drawCursors, 30_000);

    return (restore: boolean) => {
      unobserve();
      undo?.destroy();
      onChange.dispose(); onKey.dispose(); onSel.dispose(); onBlur.dispose(); onFocus.dispose();
      if (cursorTimer) clearTimeout(cursorTimer);
      clearInterval(sweep);
      unsubPerms();
      decorations.clear();
      style.remove();
      this.redraw = null;
      this.reset = null;
      editor.updateOptions({ readOnly: false });
      if (restore) setModel(before);
    };
  }
}

export const pineDoc = new PineDocSync();
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") (window as any).__pineDoc = pineDoc;

export function usePineDoc(): PineDocInfo {
  return useSyncExternalStore(pineDoc.subscribe, pineDoc.get, () => ({ ready: false, canEdit: false, cursors: [], error: null }));
}
