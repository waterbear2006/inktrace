import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft,
  ChevronDown,
  Download,
  Cloud,
  Copy,
  ExternalLink,
  BookOpen,
  FileText,
  Loader2,
  Sparkles,
  ChevronRight,
  Send,
  Check,
  GripVertical,
  CheckSquare,
  Square,
  X,
  Search,
  Percent,
  RefreshCw
} from 'lucide-react';

const API_BASE = (import.meta as any).env?.VITE_API_BASE || "https://Ruizi2006-inktrace.hf.space/api/v1";

// ---------- types ----------
interface BookInfo {
  id: string;
  title: string;
  author: string;
  status: string;
  source: string;
  hasDeepWorkContent: boolean;
}

interface Block {
  id: string;
  type: 'note' | 'l3' | 'dialogue' | 'thought';
  text: string;
  source: string;
  selected: boolean;
  l3?: L3Data;
  l3SelectedSections?: Set<string>;
  role?: string;
  timestamp?: string;
  paragraphIndex?: number;
}

interface Chapter {
  id: string;
  heading: string;
  blocks: Block[];
}

interface L3Data {
  term: string;
  explanation: string;
  context: string;
  cognitive: string;
  tags: string[];
  network: { term: string; note: string; relation: string; question: string }[];
  references: { title: string; url: string }[];
  preset_questions: string[];
  hasUserThought: boolean;
  userNotes?: Record<string, string>;
}

interface VolumeState {
  markdown: string;
  title: string;
  author: string;
  chapters: Chapter[];
  stats: { noteCount: number; chapterCount: number; l3Count: number };
  l3SectionSelections: Record<string, Set<string>>;
}

let _blockIdCounter = 0;
function genBlockId() { return `b_${++_blockIdCounter}`; }
function genChapterId() { return `ch_${++_blockIdCounter}`; }

// ---------- helpers ----------

function parseMarkdownToVolume(markdown: string): VolumeState {
  _blockIdCounter = 0;
  const lines = markdown.split('\n');
  const chapters: Chapter[] = [];
  let currentChapter: Chapter | null = null;
  let currentBlock: Partial<Block> | null = null;
  let inL3 = false;
  let l3Lines: string[] = [];
  let title = '';
  let author = '';
  let noteCount = 0;
  let l3Count = 0;
  let globalNoteIdx = 0;

  const fmMatch = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const fm = fmMatch[1];
    const bookMatch = fm.match(/^book:\s*(.+)/m);
    if (bookMatch) title = bookMatch[1].trim();
    const authorMatch = fm.match(/^author:\s*(.+)/m);
    if (authorMatch) author = authorMatch[1].trim();
  }
  if (!title) {
    const h1Match = markdown.match(/#\s+(.+?)(?:\n|$)/);
    if (h1Match) title = h1Match[1].replace(/^《|》$/g, '').trim();
  }

  const flushBlock = () => {
    if (!currentBlock?.text || !currentChapter) return;
    const type = (currentBlock.type || 'note') as Block['type'];
    const block: Block = {
      id: genBlockId(), type, text: (currentBlock.text || '').trim(),
      source: currentBlock.source || '', selected: true,
      paragraphIndex: globalNoteIdx++,
    };
    if (type === 'dialogue') block.role = currentBlock.role || 'ai';
    currentChapter.blocks.push(block);
    noteCount++;
    currentBlock = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // skip frontmatter
    if (line.startsWith('---') && i < 5) {
      while (i + 1 < lines.length && !lines[i + 1].startsWith('---')) i++;
      i++;
      continue;
    }

    // ### subheading (skip — block types are self-identifying)
    if (line.startsWith('### ')) {
      flushBlock();
      continue;
    }

    // ## chapter heading
    if (line.startsWith('## ')) {
      flushBlock();
      currentChapter = { id: genChapterId(), heading: line.replace('## ', '').trim(), blocks: [] };
      chapters.push(currentChapter);
      continue;
    }

    // L3 block start
    if (line.trim().startsWith('<!-- L3_DATA_START')) {
      flushBlock();
      inL3 = true; l3Lines = [];
      continue;
    }
    if (line.trim().startsWith('L3_DATA_END -->') || line.trim() === 'L3_DATA_END -->') {
      inL3 = false;
      const l3 = parseL3Block(l3Lines.join('\n'));
      if (l3 && currentChapter) {
        l3Count++;
        currentChapter.blocks.push({ id: genBlockId(), type: 'l3', text: '', source: '', selected: true, l3 });
      }
      continue;
    }
    if (inL3) { l3Lines.push(line); continue; }

    // dialogue/thought start: `> **Role**：text` (new format)
    const boldRoleMatch = line.match(/^>\s*\*\*(.+?)\*\*[：:]\s*(.*)/);
    if (boldRoleMatch) {
      flushBlock();
      const label = boldRoleMatch[1].trim();
      const text = boldRoleMatch[2].trim();
      if (label === '💬 我' || label === '我') {
        currentBlock = { text, type: 'dialogue', role: 'user' };
      } else if (label === 'InkTrace With U' || label === '🤖 AI' || label === 'AI') {
        currentBlock = { text, type: 'dialogue', role: 'ai' };
      } else if (label === '💭 我的思考' || label === '我的思考') {
        currentBlock = { text, type: 'thought' };
      } else {
        currentBlock = { text, type: 'note' };
      }
      continue;
    }

    // dialogue/thought start: `> 💬 我: text` (old format, backward compat)
    const oldRoleMatch = line.match(/^>\s*(💬\s*我|🤖\s*AI|💭\s*我的思考)[：:]\s*(.*)/);
    if (oldRoleMatch) {
      flushBlock();
      const label = oldRoleMatch[1].replace(/\s/g, '');
      const text = oldRoleMatch[2].trim();
      if (label === '💬我') {
        currentBlock = { text, type: 'dialogue', role: 'user' };
      } else if (label === '🤖AI') {
        currentBlock = { text, type: 'dialogue', role: 'ai' };
      } else if (label === '💭我的思考') {
        currentBlock = { text, type: 'thought' };
      }
      continue;
    }

    // note bullet: `- text` or `▪ text`
    const noteMatch = line.match(/^[▪\-]\s+(.+)/);
    if (noteMatch) {
      flushBlock();
      currentBlock = { text: noteMatch[1], type: 'note' };
      continue;
    }

    // source line: `> *位置 #42*` (new) or `> 位置 #42` (old)
    const sourceMatch = line.match(/^>\s*\*?(位置\s*#?\d+[^*]*)\*?/);
    if (sourceMatch && currentBlock) {
      currentBlock.source = sourceMatch[1].trim();
      continue;
    }

    // dialogue/thought continuation: `> text`
    if (line.startsWith('> ') && currentBlock && (currentBlock.type === 'dialogue' || currentBlock.type === 'thought')) {
      currentBlock.text = (currentBlock.text || '') + '\n' + line.replace(/^>\s*/, '');
      continue;
    }

    // horizontal rule
    if (line.trim() === '---') continue;

    // note / general continuation
    if (currentBlock && line.trim() && !line.startsWith('#') && !line.startsWith('>') && !line.startsWith('<!--')) {
      currentBlock.text = (currentBlock.text || '') + '\n' + line.trim();
    }
  }

  flushBlock();

  return {
    markdown,
    title,
    author,
    chapters: chapters.filter(ch => ch.heading && ch.blocks.length > 0),
    stats: { noteCount, chapterCount: chapters.length, l3Count },
    l3SectionSelections: {}
  };
}


function parseL3Block(raw: string): L3Data | null {
  const data: Record<string, string> = {};
  raw.split('\n').forEach(line => {
    const idx = line.indexOf(': ');
    if (idx !== -1) {
      const key = line.substring(0, idx).trim();
      const val = line.substring(idx + 2).trim();
      if (key) data[key] = val;
    }
  });
  if (!data.term) return null;

  const network = data.network
    ? data.network.split('|').reduce<L3Data['network']>((acc, item, i) => {
        if (i % 5 === 0) { acc.push({ term: item, note: '', relation: '', question: '' }); }
        else if (acc.length > 0) {
          const f = ['', 'relation', 'note', 'question', ''][i % 5] as keyof typeof acc[0];
          if (f) (acc[acc.length - 1] as any)[f] = (acc[acc.length - 1] as any)[f] ? (acc[acc.length - 1] as any)[f] + ' | ' + item : item;
        }
        return acc;
      }, [])
    : [];
  const references = data.references ? data.references.split(' , ').map(item => {
    const parts = item.split('|');
    return { title: parts[0]?.trim() || '', url: parts[1]?.trim() || '' };
  }) : [];
  const tags = data.tags ? data.tags.split(',').map(t => t.trim()) : [];
  const preset_questions: string[] = [];
  if (data.cognitive && data.cognitive.length > 5) {
    preset_questions.push(data.cognitive.length > 40 ? data.cognitive.substring(0, 40) + '...?' : data.cognitive + '?');
  }
  if (network.length > 0) {
    const q = network[0].question || `深入探讨一下"${network[0].term}"这个概念`;
    preset_questions.push(q.length > 40 ? q.substring(0, 40) + '...' : q);
  }
  if (network.length > 1) {
    const q = network[1].question || `对比一下"${network[0].term}"和"${network[1].term}"`;
    preset_questions.push(q.length > 40 ? q.substring(0, 40) + '...' : q);
  }
  const hasUserThought = !!(data.dialogues && data.dialogues.trim() && data.dialogues.trim() !== '无');

  // 提取 user_note:sectionLabel 字段
  const userNotes: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) {
    if (k.startsWith('user_note:')) {
      const sectionLabel = k.substring('user_note:'.length);
      if (sectionLabel && v.trim()) userNotes[sectionLabel] = v.trim();
    }
  }

  return { term: data.term || '', explanation: data.explanation || '', context: data.context || '', cognitive: data.cognitive || '', tags, network, references, preset_questions, hasUserThought, userNotes };
}

// ---------- Build markdown from current state ----------
function buildCurrentMarkdown(state: VolumeState, l3Selections?: Record<string, Set<string>>, l3Edits?: Record<string, Record<string, string>>, l3Notes?: Record<string, Record<string, string>>): string {
  const lines: string[] = [];
  lines.push('---');
  lines.push(`book: ${state.title}`);
  lines.push(`author: ${state.author}`);
  lines.push('---');
  lines.push('');
  for (const ch of state.chapters) {
    lines.push(`## ${ch.heading}`);
    lines.push('');

    for (const block of ch.blocks) {
      if (!block.selected) continue;

      if (block.type === 'note') {
        const textLines = block.text.split('\n');
        lines.push(`- ${textLines[0]}`);
        for (let i = 1; i < textLines.length; i++) {
          lines.push(`  ${textLines[i]}`);
        }
        if (block.source) lines.push(`> *${block.source}*`);
        lines.push('');
      }

      if (block.type === 'dialogue') {
        const roleLabel = block.role === 'user' ? '💬 我' : 'InkTrace With U';
        const textLines = block.text.split('\n');
        lines.push(`> **${roleLabel}**：${textLines[0]}`);
        for (let i = 1; i < textLines.length; i++) {
          lines.push(`> ${textLines[i]}`);
        }
        lines.push('');
      }

      if (block.type === 'thought') {
        const textLines = block.text.split('\n');
        lines.push(`> **💭 我的思考**：${textLines[0]}`);
        for (let i = 1; i < textLines.length; i++) {
          lines.push(`> ${textLines[i]}`);
        }
        lines.push('');
      }

      if (block.type === 'l3' && block.l3) {
        const sel = l3Selections?.[block.id];
        const hasSelection = sel && sel.size > 0;
        const include = (label: string) => !hasSelection || sel.has(label);
        const anyIncluded = include('深度溯源') || include('原文回响') || include('认知延伸');
        if (!anyIncluded) continue;

        const blockEdits = l3Edits?.[block.id] || {};
        const blockNotes = l3Notes?.[block.id] || {};

        const resolved = (label: string, original: string) => blockEdits[label] || original;

        lines.push(`### 🔍 深度解析：${block.l3.term}`);
        lines.push('');
        lines.push('<!-- L3_DATA_START');
        lines.push(`term: ${block.l3.term}`);
        if (block.l3.explanation && include('深度溯源')) lines.push(`explanation: ${resolved('深度溯源', block.l3.explanation).replace(/\n/g, ' ')}`);
        if (block.l3.context && include('原文回响')) lines.push(`context: ${resolved('原文回响', block.l3.context).replace(/\n/g, ' ')}`);
        if (block.l3.cognitive && include('认知延伸')) lines.push(`cognitive: ${resolved('认知延伸', block.l3.cognitive).replace(/\n/g, ' ')}`);
        if (block.l3.tags.length > 0) lines.push(`tags: ${block.l3.tags.join(', ')}`);
        if (block.l3.network.length > 0) lines.push(`network: ${block.l3.network.map(n => `${n.term}|${n.relation}|${n.note}|${n.question}`).join(' | ')}`);
        if (block.l3.references.length > 0) lines.push(`references: ${block.l3.references.map(r => `${r.title}|${r.url}`).join(' , ')}`);
        // 用户备注
        for (const [sectionLabel, note] of Object.entries(blockNotes)) {
          if (note.trim()) lines.push(`user_note:${sectionLabel}: ${note.replace(/\n/g, ' ')}`);
        }
        lines.push('L3_DATA_END -->');
        lines.push('');
      }
    }

    lines.push('---');
    lines.push('');
  }
  return lines.join('\n');
}

// ---------- Book Cover ----------
function BookCover({ title, author }: { title: string; author: string }) {
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 8000);
        const res = await fetch(`${API_BASE}/notes/cover?title=${encodeURIComponent(title)}&author=${encodeURIComponent(author || '')}`, { signal: ctrl.signal });
        clearTimeout(t);
        if (res.ok) {
          const d = await res.json();
          if (!cancelled && d.url) { setCoverUrl(d.url); setLoading(false); return; }
        }
        if (!cancelled) setFailed(true);
      } catch { if (!cancelled) setFailed(true); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [title, author]);

  if (loading) return <div className="relative w-full aspect-[3/4] max-w-[320px] mx-auto rounded-2xl bg-surface-container/50 flex items-center justify-center"><Loader2 size={24} className="text-primary/30 animate-spin" /></div>;
  if (failed || !coverUrl) return <CSSBookCover title={title} author={author} />;
  return <div className="relative w-full aspect-[3/4] max-w-[320px] mx-auto rounded-2xl overflow-hidden shadow-2xl shadow-primary/10 bg-surface-container/50"><img src={coverUrl} alt={title} className="w-full h-full object-cover" onError={() => setFailed(true)} /></div>;
}

function CSSBookCover({ title, author }: { title: string; author: string }) {
  const hue = 175 + ((title.charCodeAt(0) || 0) * 37) % 30;
  return (
    <div className="relative w-full aspect-[3/4] max-w-[320px] mx-auto rounded-2xl overflow-hidden shadow-2xl shadow-primary/10"
      style={{ background: `linear-gradient(160deg, hsl(${hue}, 25%, 22%) 0%, hsl(${hue + 8}, 18%, 14%) 100%)` }}>
      <div className="absolute inset-0 opacity-15" style={{ backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,255,255,0.04) 3px, rgba(255,255,255,0.04) 6px)` }} />
      <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center">
        <div className="w-12 h-[1px] bg-primary-container/40 mb-5" />
        <h2 className="text-lg font-serif font-bold text-white/85 leading-relaxed mb-2 tracking-wide">{title}</h2>
        {author && author !== 'Unknown Author' && <p className="text-xs text-primary-container/50 tracking-[0.2em]">{author}</p>}
        <div className="w-12 h-[1px] bg-primary-container/40 mt-5" />
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary-container/30 to-transparent" />
    </div>
  );
}

// ---------- L3 Card ----------
// ---------- L3 Block Wrapper (selectable, draggable AI card) ----------
function L3BlockWrapper({
  block, chapterIdx, blockIdx, onToggle, onDragStart, onDragOver, onDrop, onDragEnd, dragState,
  selectedSections, onSectionToggle, children, edits, notes, onEdit, onNoteChange
}: {
  block: Block; chapterIdx: number; blockIdx: number;
  onToggle: (chIdx: number, bIdx: number) => void;
  onDragStart: (chIdx: number, bIdx: number) => void;
  onDragOver: (e: React.DragEvent, chIdx: number, bIdx: number) => void;
  onDrop: (e: React.DragEvent, chIdx: number, bIdx: number) => void;
  onDragEnd: () => void;
  dragState: { fromCh: number; fromBl: number; overCh: number; overBl: number; position: 'above' | 'below' } | null;
  selectedSections?: Set<string>;
  onSectionToggle?: (blockId: string, sectionLabel: string) => void;
  children: React.ReactNode;
  edits?: Record<string, string>;
  notes?: Record<string, string>;
  onEdit?: (blockId: string, sectionLabel: string, newText: string) => void;
  onNoteChange?: (blockId: string, sectionLabel: string, note: string) => void;
}) {
  const isDragging = dragState && dragState.fromCh === chapterIdx && dragState.fromBl === blockIdx;
  const showDropIndicator = dragState
    && dragState.overCh === chapterIdx
    && dragState.overBl === blockIdx
    && !(dragState.fromCh === chapterIdx && dragState.fromBl === blockIdx);
  const indicatorAbove = showDropIndicator && dragState!.position === 'above';

  return (
    <div className="relative">
      {showDropIndicator && indicatorAbove && <DropIndicator />}
      <div
        className={`group relative flex items-start gap-1 py-2 -mx-4 px-4 rounded-xl transition-all duration-200 hover:bg-white/30 ${isDragging ? 'opacity-30' : ''}`}
        onDragOver={(e) => { e.preventDefault(); onDragOver(e, chapterIdx, blockIdx); }}
        onDrop={(e) => { e.preventDefault(); onDrop(e, chapterIdx, blockIdx); }}
      >
        {/* drag handle */}
        <div
          draggable
          onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart(chapterIdx, blockIdx); }}
          onDragEnd={onDragEnd}
          className="shrink-0 mt-3 w-7 h-7 flex items-center justify-center cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity text-outline-variant/40 hover:text-outline-variant"
        >
          <GripVertical size={14} />
        </div>
        {/* checkbox */}
        <button onClick={() => onToggle(chapterIdx, blockIdx)} className="shrink-0 mt-3 text-outline-variant/50 hover:text-primary transition-colors">
          {block.selected ? <CheckSquare size={16} className="text-primary" /> : <Square size={16} />}
        </button>
        {/* L3 card content */}
        <div className="flex-1 min-w-0">
          {React.cloneElement(children as React.ReactElement<any>, {
            selectedSections: selectedSections || new Set(),
            onSectionToggle: onSectionToggle || (() => {}),
            blockId: block.id,
            edits: edits || {},
            notes: notes || {},
            onEdit: onEdit || undefined,
            onNoteChange: onNoteChange || undefined,
          })}
        </div>
      </div>
      {showDropIndicator && !indicatorAbove && <DropIndicator />}
    </div>
  );
}

// ---------- L3 Card ----------
function L3Card({ l3, onQuestion, selectedSections, onSectionToggle, blockId, edits, notes, onEdit, onNoteChange }: {
  l3: L3Data; onQuestion: (q: string) => void;
  selectedSections?: Set<string>;
  onSectionToggle?: (blockId: string, sectionLabel: string) => void;
  blockId?: string;
  edits?: Record<string, string>;
  notes?: Record<string, string>;
  onEdit?: (blockId: string, sectionLabel: string, newText: string) => void;
  onNoteChange?: (blockId: string, sectionLabel: string, note: string) => void;
}) {
  const [expanded, setExpanded] = useState(l3.hasUserThought);
  const secs = selectedSections || new Set();
  const blockEdits = edits || {};
  const blockNotes = notes || {};
  const bid = blockId || '';

  const resolvedText = (label: string, original: string) => blockEdits[label] || original;

  const isSectionSelected = (label: string) => {
    if (!secs || secs.size === 0) return true;
    return secs.has(label);
  };

  return (
    <div className="glaze-card rounded-2xl border border-primary-container/15 overflow-hidden">
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center justify-between p-4 text-left hover:bg-primary-container/5 transition-colors">
        <div className="flex items-center gap-3">
          <Sparkles size={15} className="text-primary shrink-0" />
          <span className="text-sm font-bold text-on-surface/80">{l3.term}</span>
          {!expanded && <span className="text-[10px] text-outline-variant">点击展开 AI 深度解析</span>}
        </div>
        <ChevronRight size={16} className={`text-outline-variant transition-transform duration-300 ${expanded ? 'rotate-90' : ''}`} />
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3 }} className="overflow-hidden">
            <div className="px-5 pb-5 space-y-4 border-t border-primary-container/10 pt-4">
              {l3.explanation && (
                <SelectableSection label="深度溯源" text={resolvedText('深度溯源', l3.explanation)}
                  checked={isSectionSelected('深度溯源')}
                  onToggle={() => onSectionToggle?.(bid, '深度溯源')}
                  onEdit={onEdit ? (t) => onEdit(bid, '深度溯源', t) : undefined}
                  userNote={blockNotes['深度溯源']}
                  onNoteChange={onNoteChange ? (n) => onNoteChange(bid, '深度溯源', n) : undefined} />
              )}
              {l3.context && (
                <SelectableSection label="原文回响" text={resolvedText('原文回响', l3.context)}
                  checked={isSectionSelected('原文回响')}
                  onToggle={() => onSectionToggle?.(bid, '原文回响')}
                  onEdit={onEdit ? (t) => onEdit(bid, '原文回响', t) : undefined}
                  userNote={blockNotes['原文回响']}
                  onNoteChange={onNoteChange ? (n) => onNoteChange(bid, '原文回响', n) : undefined} />
              )}
              {l3.cognitive && (
                <SelectableSection label="认知延伸" text={resolvedText('认知延伸', l3.cognitive)}
                  checked={isSectionSelected('认知延伸')}
                  onToggle={() => onSectionToggle?.(bid, '认知延伸')}
                  onEdit={onEdit ? (t) => onEdit(bid, '认知延伸', t) : undefined}
                  userNote={blockNotes['认知延伸']}
                  onNoteChange={onNoteChange ? (n) => onNoteChange(bid, '认知延伸', n) : undefined} />
              )}
              {l3.network.length > 0 && (
                <div>
                  <h5 className="text-[10px] font-bold text-primary uppercase tracking-widest mb-2">语义网络</h5>
                  <div className="flex flex-wrap gap-2">
                    {l3.network.map((n, i) => <span key={i} className="px-2.5 py-1 bg-primary-container/10 text-primary text-xs rounded-lg border border-primary-container/20">{n.term}</span>)}
                  </div>
                </div>
              )}
              {l3.preset_questions.length > 0 && (
                <div className="space-y-2 pt-1">
                  <h5 className="text-[10px] font-bold text-outline-variant uppercase tracking-widest mb-2">追问</h5>
                  {l3.preset_questions.map((q, i) => (
                    <button key={i} onClick={() => onQuestion(q)} className="w-full text-left px-3 py-2.5 rounded-xl border border-outline-variant/30 text-sm text-on-surface/60 hover:border-primary-container/60 hover:bg-primary-container/5 hover:text-primary transition-all flex items-center gap-2.5 group">
                      <Send size={12} className="text-outline-variant group-hover:text-primary shrink-0 transition-colors" /><span>{q}</span>
                    </button>
                  ))}
                </div>
              )}
              {l3.references.length > 0 && (
                <div className="pt-2 border-t border-primary-container/10">
                  <h5 className="text-[10px] font-bold text-outline-variant uppercase tracking-widest mb-2">外部参考</h5>
                  <div className="space-y-1">
                    {l3.references.map((ref, i) => <a key={i} href={ref.url || '#'} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-on-surface/50 hover:text-primary transition-colors"><ExternalLink size={10} />{ref.title}</a>)}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function L3Section({ label, text }: { label: string; text: string }) {
  return <div><h5 className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1.5">{label}</h5><p className="text-[13px] text-on-surface/55 leading-relaxed tracking-[0.01em]">{text}</p></div>;
}

function SelectableSection({ label, text, checked, onToggle, onEdit, userNote, onNoteChange }: {
  label: string; text: string; checked: boolean; onToggle: () => void;
  onEdit?: (newText: string) => void;
  userNote?: string;
  onNoteChange?: (note: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(text);
  const [addingNote, setAddingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const enterEdit = () => {
    if (!onEdit) return;
    setEditDraft(text);
    setEditing(true);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };
  const saveEdit = () => {
    const trimmed = editDraft.trim();
    if (trimmed && trimmed !== text) onEdit?.(trimmed);
    setEditing(false);
  };
  const cancelEdit = () => { setEditDraft(text); setEditing(false); };

  const saveNote = () => {
    onNoteChange?.(noteDraft);
    setAddingNote(false);
  };

  useEffect(() => {
    if (editing) {
      const h = (e: KeyboardEvent) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveEdit(); }
        if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
      };
      document.addEventListener('keydown', h);
      return () => document.removeEventListener('keydown', h);
    }
  }, [editing, editDraft]);

  return (
    <div className="group/section">
      <div className="flex items-start gap-2">
        <button onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className="shrink-0 mt-0.5 text-outline-variant/40 hover:text-primary transition-colors">
          {checked ? <CheckSquare size={14} className="text-primary" /> : <Square size={14} />}
        </button>
        <div className="flex-1 min-w-0">
          <h5 className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1.5">{label}</h5>
          {editing ? (
            <textarea ref={textareaRef} value={editDraft} onChange={e => setEditDraft(e.target.value)}
              onBlur={saveEdit}
              className="w-full text-[13px] text-on-surface/70 leading-relaxed bg-white/50 border border-primary/30 rounded-lg p-2 resize-none focus:outline-none focus:border-primary"
              rows={Math.max(3, editDraft.split('\n').length)} />
          ) : (
            <p className={`text-[13px] text-on-surface/55 leading-relaxed tracking-[0.01em] ${onEdit ? 'cursor-text hover:bg-primary/3 rounded px-0.5 -mx-0.5' : ''}`}
              onDoubleClick={enterEdit}>
              {text}
            </p>
          )}

          {/* user note */}
          {userNote ? (
            <div className="mt-2 p-2.5 bg-amber-50/60 rounded-lg border border-amber-200/40 text-[12px] text-amber-800 leading-relaxed cursor-text"
              onDoubleClick={onNoteChange ? () => { setAddingNote(true); setNoteDraft(userNote); } : undefined}>
              💡 {userNote}
            </div>
          ) : addingNote ? (
            <div className="mt-2 space-y-1.5">
              <textarea value={noteDraft} onChange={e => setNoteDraft(e.target.value)}
                placeholder="添加你的备注..."
                className="w-full text-[12px] text-on-surface/70 leading-relaxed bg-amber-50/30 border border-amber-200 rounded-lg p-2 resize-none focus:outline-none focus:border-primary"
                rows={2} autoFocus />
              <div className="flex gap-2">
                <button onClick={saveNote} className="text-[10px] px-2.5 py-1 bg-primary text-white rounded-lg">保存</button>
                <button onClick={() => setAddingNote(false)} className="text-[10px] px-2.5 py-1 text-outline-variant/60 hover:text-outline-variant">取消</button>
              </div>
            </div>
          ) : onNoteChange ? (
            <button onClick={() => { setAddingNote(true); setNoteDraft(''); }}
              className="mt-1.5 text-[10px] text-outline-variant/30 hover:text-primary transition-colors opacity-0 group-hover/section:opacity-100">
              + 添加备注
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ---------- Export Menu ----------
function ExportMenu({ volumeState, l3SectionSelections, l3Edits, l3Notes }: { volumeState: VolumeState; l3SectionSelections?: Record<string, Set<string>>; l3Edits?: Record<string, Record<string, string>>; l3Notes?: Record<string, Record<string, string>> }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tencentAuthStatus, setTencentAuthStatus] = useState<{authorized: boolean} | null>(null);
  const [isSyncingToTencent, setIsSyncingToTencent] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // 检查腾讯文档授权状态
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`${API_BASE}/export/tencent/status`);
        const data = await res.json();
        setTencentAuthStatus(data);
      } catch {}
    };
    check();
  }, []);

  const markdown = buildCurrentMarkdown(volumeState, l3SectionSelections, l3Edits, l3Notes);
  const handleCopy = async () => { await navigator.clipboard.writeText(markdown); setCopied(true); setTimeout(() => setCopied(false), 2000); setOpen(false); };
  const handleDownload = () => {
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${volumeState.title}_InkTrace.md`; a.click();
    URL.revokeObjectURL(url); setOpen(false);
  };

  const handleTencentAuth = () => {
    window.location.href = `${API_BASE}/export/tencent/auth`;
  };

  const handleSyncToTencent = async () => {
    if (!tencentAuthStatus?.authorized) {
      handleTencentAuth();
      return;
    }
    setIsSyncingToTencent(true);
    try {
      const title = `${volumeState.title}_InkTrace笔记`;
      const res = await fetch(`${API_BASE}/export/tencent/doc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content: markdown })
      });
      const data = await res.json();
      if (data.success && data.share_link) {
        window.open(data.share_link, '_blank');
      } else {
        alert('同步失败：' + (data.detail || '未知错误'));
      }
    } catch (e) {
      console.error('同步到腾讯文档失败:', e);
      alert('同步失败，请检查后端服务或重新授权。');
    } finally {
      setIsSyncingToTencent(false);
      setOpen(false);
    }
  };

  return (
    <div ref={menuRef} className="relative">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-white/40 backdrop-blur-xl border border-white/30 text-stone-500 text-[11px] font-bold hover:text-stone-700 hover:bg-white/60 hover:border-white/40 transition-all shadow-sm">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor"><circle cx="4" cy="9" r="1.5" /><circle cx="9" cy="9" r="1.5" /><circle cx="14" cy="9" r="1.5" /></svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border border-outline-variant/20 py-1 z-50">
            <button onClick={handleDownload} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-on-surface/70 hover:bg-surface-container/50 transition-colors"><Download size={16} />导出 Obsidian (.md)</button>
            <button onClick={handleSyncToTencent} disabled={isSyncingToTencent} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-on-surface/70 hover:bg-surface-container/50 transition-colors disabled:opacity-50">
              {isSyncingToTencent ? <Loader2 size={16} className="animate-spin" /> : <Cloud size={16} />}
              {isSyncingToTencent ? '同步中...' : (tencentAuthStatus?.authorized ? '同步到腾讯文档' : '授权并同步到腾讯文档')}
            </button>
            <div className="h-[1px] bg-outline-variant/10 mx-3 my-1" />
            <button onClick={handleCopy} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-on-surface/70 hover:bg-surface-container/50 transition-colors">{copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}{copied ? '已复制' : '复制 Markdown'}</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------- Mini TOC ----------
function MiniTOC({ chapters, activeChapter }: { chapters: Chapter[]; activeChapter: number }) {
  return (
    <div className="fixed right-6 top-1/2 -translate-y-1/2 z-40 flex flex-col items-center gap-1.5">
      {chapters.map((ch, i) => (
        <button key={ch.id} onClick={() => document.getElementById(`volume-ch-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          className="group relative flex items-center">
          <div className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${i === activeChapter ? 'bg-primary scale-125 shadow-lg shadow-primary/25' : 'bg-outline-variant/40 hover:bg-outline-variant'}`} />
          <span className="absolute right-full mr-3 px-2.5 py-1 bg-white rounded-lg shadow text-xs text-on-surface/70 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity border border-outline-variant/15">{ch.heading}</span>
        </button>
      ))}
    </div>
  );
}

// ---------- Dialogue Block (selectable, draggable, NOT editable) ----------
function DialogueBlock({
  block, chapterIdx, blockIdx, onToggle, onDragStart, onDragOver, onDrop, onDragEnd, dragState
}: {
  block: Block; chapterIdx: number; blockIdx: number;
  onToggle: (chIdx: number, bIdx: number) => void;
  onDragStart: (chIdx: number, bIdx: number) => void;
  onDragOver: (e: React.DragEvent, chIdx: number, bIdx: number) => void;
  onDrop: (e: React.DragEvent, chIdx: number, bIdx: number) => void;
  onDragEnd: () => void;
  dragState: { fromCh: number; fromBl: number; overCh: number; overBl: number; position: 'above' | 'below' } | null;
}) {
  const isDragging = dragState && dragState.fromCh === chapterIdx && dragState.fromBl === blockIdx;
  const showDropIndicator = dragState
    && dragState.overCh === chapterIdx
    && dragState.overBl === blockIdx
    && !(dragState.fromCh === chapterIdx && dragState.fromBl === blockIdx);
  const indicatorAbove = showDropIndicator && dragState!.position === 'above';
  const isUser = block.role === 'user';

  return (
    <div className="relative">
      {showDropIndicator && indicatorAbove && <DropIndicator />}
      <div
        className={`group relative flex items-start gap-1 py-2 -mx-4 px-4 rounded-xl transition-all duration-200 hover:bg-white/30 ${isDragging ? 'opacity-30' : ''}`}
        onDragOver={(e) => { e.preventDefault(); onDragOver(e, chapterIdx, blockIdx); }}
        onDrop={(e) => { e.preventDefault(); onDrop(e, chapterIdx, blockIdx); }}
      >
        <div
          draggable
          onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart(chapterIdx, blockIdx); }}
          onDragEnd={onDragEnd}
          className="shrink-0 mt-1 w-7 h-7 flex items-center justify-center cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity text-outline-variant/40 hover:text-outline-variant"
        >
          <GripVertical size={14} />
        </div>
        <button onClick={() => onToggle(chapterIdx, blockIdx)} className="shrink-0 mt-1 text-outline-variant/50 hover:text-primary transition-colors">
          {block.selected ? <CheckSquare size={16} className="text-primary" /> : <Square size={16} />}
        </button>
        <div className={`flex-1 min-w-0 ${isUser ? 'flex justify-end' : ''}`}>
          <div className={`inline-block max-w-[85%] px-4 py-2.5 rounded-2xl text-[13px] leading-relaxed ${
            isUser
              ? 'bg-slate-100 text-on-surface/70 rounded-br-md'
              : 'bg-primary-container/8 text-on-surface/60 rounded-bl-md border border-primary-container/10'
          }`}>
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[9px] font-bold uppercase tracking-wider ${isUser ? 'text-outline-variant' : 'text-primary'}`}>
                {isUser ? '我' : 'AI'}
              </span>
              {block.timestamp && <span className="text-[9px] text-outline-variant/40">{new Date(block.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>}
            </div>
            <p>{block.text}</p>
          </div>
        </div>
      </div>
      {showDropIndicator && !indicatorAbove && <DropIndicator />}
    </div>
  );
}

// ---------- Thought Block (selectable, draggable, editable) ----------
function ThoughtBlock({
  block, chapterIdx, blockIdx, onToggle, onEdit, onDragStart, onDragOver, onDrop, onDragEnd, dragState
}: {
  block: Block; chapterIdx: number; blockIdx: number;
  onToggle: (chIdx: number, bIdx: number) => void;
  onEdit: (chIdx: number, bIdx: number, newText: string) => void;
  onDragStart: (chIdx: number, bIdx: number) => void;
  onDragOver: (e: React.DragEvent, chIdx: number, bIdx: number) => void;
  onDrop: (e: React.DragEvent, chIdx: number, bIdx: number) => void;
  onDragEnd: () => void;
  dragState: { fromCh: number; fromBl: number; overCh: number; overBl: number; position: 'above' | 'below' } | null;
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(block.text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isDragging = dragState && dragState.fromCh === chapterIdx && dragState.fromBl === blockIdx;
  const showDropIndicator = dragState
    && dragState.overCh === chapterIdx
    && dragState.overBl === blockIdx
    && !(dragState.fromCh === chapterIdx && dragState.fromBl === blockIdx);
  const indicatorAbove = showDropIndicator && dragState!.position === 'above';

  const enterEdit = () => { setEditing(true); requestAnimationFrame(() => { textareaRef.current?.focus(); }); };
  const saveEdit = () => { const t = editText.trim(); if (t && t !== block.text) onEdit(chapterIdx, blockIdx, t); else setEditing(false); };
  const cancelEdit = () => { setEditText(block.text); setEditing(false); };

  useEffect(() => {
    if (editing) {
      const handler = (e: KeyboardEvent) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveEdit(); }
        if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
      };
      document.addEventListener('keydown', handler);
      return () => document.removeEventListener('keydown', handler);
    }
  }, [editing, editText]);

  return (
    <div className="relative">
      {showDropIndicator && indicatorAbove && <DropIndicator />}
      <div
        className={`group relative flex items-start gap-1 py-2 -mx-4 px-4 rounded-xl transition-all duration-200 hover:bg-amber-50/30 ${isDragging ? 'opacity-30' : ''}`}
        onDragOver={(e) => { e.preventDefault(); onDragOver(e, chapterIdx, blockIdx); }}
        onDrop={(e) => { e.preventDefault(); onDrop(e, chapterIdx, blockIdx); }}
      >
        <div
          draggable
          onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart(chapterIdx, blockIdx); }}
          onDragEnd={onDragEnd}
          className="shrink-0 mt-1 w-7 h-7 flex items-center justify-center cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity text-outline-variant/40 hover:text-outline-variant"
        >
          <GripVertical size={14} />
        </div>
        <button onClick={() => onToggle(chapterIdx, blockIdx)} className="shrink-0 mt-1 text-outline-variant/50 hover:text-primary transition-colors">
          {block.selected ? <CheckSquare size={16} className="text-primary" /> : <Square size={16} />}
        </button>
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="space-y-2">
              <textarea ref={textareaRef} value={editText} onChange={(e) => setEditText(e.target.value)} onBlur={saveEdit}
                rows={Math.max(3, editText.split('\n').length + 1)}
                className="w-full bg-amber-50/50 border border-amber-200 rounded-lg p-3 text-[14px] text-on-surface leading-relaxed resize-none focus:outline-none focus:border-primary" />
              <div className="flex items-center gap-2 text-[10px] text-outline-variant">
                <span>Ctrl+Enter 保存</span><span>·</span><span>Esc 取消</span>
                <button onClick={saveEdit} className="px-2 py-0.5 bg-primary text-white rounded text-[10px] font-bold">保存</button>
                <button onClick={cancelEdit} className="px-2 py-0.5 border border-outline-variant/30 rounded text-[10px]">取消</button>
              </div>
            </div>
          ) : (
            <div className="cursor-text flex items-start gap-2" onClick={enterEdit}>
              <span className="text-amber-500 shrink-0 mt-0.5">💭</span>
              <div>
                <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">我的思考</span>
                <p className={`text-[14px] leading-relaxed mt-0.5 ${block.selected ? 'text-on-surface/70' : 'text-outline-variant/50 line-through'}`}>{block.text || '点击添加思考...'}</p>
              </div>
            </div>
          )}
        </div>
      </div>
      {showDropIndicator && !indicatorAbove && <DropIndicator />}
    </div>
  );
}

// ---------- Drop Indicator Line ----------
function DropIndicator() {
  return (
    <div className="relative h-0 z-10">
      <div className="absolute left-0 right-0 -top-[2px] h-[3px] rounded-full bg-primary/60">
        <div className="absolute -left-1 -top-[3px] w-2.5 h-2.5 rounded-full bg-primary shadow-md shadow-primary/30" />
      </div>
    </div>
  );
}

// ---------- Note Block (inline editable, draggable, selectable) ----------
function NoteBlock({
  block, chapterIdx, blockIdx, onToggle, onEdit, onDragStart, onDragOver, onDrop, onDragEnd, dragState
}: {
  block: Block; chapterIdx: number; blockIdx: number;
  onToggle: (chIdx: number, bIdx: number) => void;
  onEdit: (chIdx: number, bIdx: number, newText: string) => void;
  onDragStart: (chIdx: number, bIdx: number) => void;
  onDragOver: (e: React.DragEvent, chIdx: number, bIdx: number) => void;
  onDrop: (e: React.DragEvent, chIdx: number, bIdx: number) => void;
  onDragEnd: () => void;
  dragState: { fromCh: number; fromBl: number; overCh: number; overBl: number; position: 'above' | 'below' } | null;
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(block.text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isDragging = dragState && dragState.fromCh === chapterIdx && dragState.fromBl === blockIdx;
  const showDropIndicator = dragState
    && dragState.overCh === chapterIdx
    && dragState.overBl === blockIdx
    && !(dragState.fromCh === chapterIdx && dragState.fromBl === blockIdx);
  const indicatorAbove = showDropIndicator && dragState!.position === 'above';

  // === inline editing logic ===
  const enterEdit = () => {
    setEditText(block.text);
    setEditing(true);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(0, 0);
    });
  };
  const saveEdit = () => {
    const trimmed = editText.trim();
    if (trimmed && trimmed !== block.text) onEdit(chapterIdx, blockIdx, trimmed);
    else setEditing(false);
  };
  const cancelEdit = () => { setEditText(block.text); setEditing(false); };

  useEffect(() => {
    if (editing) {
      const handler = (e: KeyboardEvent) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveEdit(); }
        if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
      };
      document.addEventListener('keydown', handler);
      return () => document.removeEventListener('keydown', handler);
    }
  }, [editing, editText]);

  return (
    <div className="relative">
      {/* drop indicator ABOVE this block */}
      {showDropIndicator && indicatorAbove && <DropIndicator />}

      <div
        className={`group relative py-3 px-4 -mx-4 rounded-xl transition-all duration-200 hover:bg-white/50 ${isDragging ? 'opacity-30' : ''}`}
        onDragOver={(e) => { e.preventDefault(); onDragOver(e, chapterIdx, blockIdx); }}
        onDrop={(e) => { e.preventDefault(); onDrop(e, chapterIdx, blockIdx); }}
      >
        {/* drag handle */}
        <div
          draggable
          onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart(chapterIdx, blockIdx); }}
          onDragEnd={onDragEnd}
          className="absolute left-0 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity text-outline-variant/40 hover:text-outline-variant"
        >
          <GripVertical size={14} />
        </div>

      {/* checkbox */}
      <button onClick={() => onToggle(chapterIdx, blockIdx)} className="absolute left-7 top-3.5 text-outline-variant/50 hover:text-primary transition-colors">
        {block.selected ? <CheckSquare size={16} className="text-primary" /> : <Square size={16} />}
      </button>

      <div className="pl-10">
        {/* inline editing area */}
        {editing ? (
          <div className="space-y-2">
            <textarea
              ref={textareaRef}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onBlur={saveEdit}
              rows={Math.max(3, editText.split('\n').length + 1)}
              className="w-full bg-white border border-primary-container/40 rounded-lg p-3 text-sm text-on-surface leading-relaxed resize-none focus:outline-none focus:border-primary font-serif"
            />
            <div className="flex items-center gap-2 text-[10px] text-outline-variant">
              <span>Ctrl+Enter 保存</span>
              <span>·</span>
              <span>Esc 取消</span>
              <span>·</span>
              <button onClick={saveEdit} className="px-2 py-0.5 bg-primary text-white rounded text-[10px] font-bold">保存</button>
              <button onClick={cancelEdit} className="px-2 py-0.5 border border-outline-variant/30 rounded text-[10px]">取消</button>
            </div>
          </div>
        ) : (
          <div className="cursor-text" onClick={enterEdit}>
            <p className={`text-[15px] leading-relaxed ${block.selected ? 'text-on-surface/80' : 'text-outline-variant/50 line-through'}`}>
              {block.text}
            </p>
          </div>
        )}
        {block.source && !editing && (
          <p className="text-[11px] text-outline-variant mt-1.5 tracking-wide">{block.source}</p>
        )}
        </div>
      </div>

      {/* drop indicator BELOW this block */}
      {showDropIndicator && !indicatorAbove && <DropIndicator />}
    </div>
  );
}

// ---------- Volume Detail View ----------
function VolumeDetail({ volume, onBack, noteId, highlightText }: { volume: VolumeState; onBack: () => void; noteId?: string; highlightText?: string }) {
  const [state, setState] = useState<VolumeState>(volume);
  const [headerVisible, setHeaderVisible] = useState(true);
  const [activeChapter, setActiveChapter] = useState(0);
  const [dragState, setDragState] = useState<{ fromCh: number; fromBl: number; overCh: number; overBl: number; position: 'above' | 'below' } | null>(null);
  const [l3SectionSelections, setL3SectionSelections] = useState<Record<string, Set<string>>>(volume.l3SectionSelections || {});
  const [l3Edits, setL3Edits] = useState<Record<string, Record<string, string>>>({});
  const [l3Notes, setL3Notes] = useState<Record<string, Record<string, string>>>(() => {
    // 从已解析的 L3 数据中恢复 userNotes
    const notes: Record<string, Record<string, string>> = {};
    for (const ch of volume.chapters) {
      for (const block of ch.blocks) {
        if (block.type === 'l3' && block.l3?.userNotes && Object.keys(block.l3.userNotes).length > 0) {
          notes[block.id] = block.l3.userNotes;
        }
      }
    }
    return notes;
  });

  const handleL3SectionToggle = useCallback((blockId: string, sectionLabel: string) => {
    setL3SectionSelections(prev => {
      const next = { ...prev };
      const current = new Set(prev[blockId]);
      // 首次点击时先把三个 section 都初始化进来，再正常 toggle
      if (current.size === 0) {
        current.add('深度溯源');
        current.add('原文回响');
        current.add('认知延伸');
      }
      if (current.has(sectionLabel)) current.delete(sectionLabel);
      else current.add(sectionLabel);
      next[blockId] = current;
      return next;
    });
  }, []);

  const handleL3Edit = useCallback((blockId: string, sectionLabel: string, newText: string) => {
    setL3Edits(prev => {
      const next = { ...prev };
      const blockEdits = { ...(prev[blockId] || {}) };
      blockEdits[sectionLabel] = newText;
      next[blockId] = blockEdits;
      return next;
    });
  }, []);

  const handleL3NoteChange = useCallback((blockId: string, sectionLabel: string, note: string) => {
    setL3Notes(prev => {
      const next = { ...prev };
      const blockNotes = { ...(prev[blockId] || {}) };
      if (note.trim()) {
        blockNotes[sectionLabel] = note.trim();
      } else {
        delete blockNotes[sectionLabel];
      }
      if (Object.keys(blockNotes).length > 0) {
        next[blockId] = blockNotes;
      } else {
        delete next[blockId];
      }
      return next;
    });
  }, []);

  const lastScrollY = useRef(0);
  const headerRef = useRef(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // === derived stats ===
  const totalBlocks = state.chapters.reduce((sum, ch) => sum + ch.blocks.length, 0);
  const selectedBlocks = state.chapters.reduce((sum, ch) => sum + ch.blocks.filter(b => b.selected).length, 0);

  // === scroll to highlighted block from semantic search ===
  const highlightScrolledRef = useRef(false);
  useEffect(() => {
    if (!highlightText || state.chapters.length === 0) return;
    if (highlightScrolledRef.current) return;
    highlightScrolledRef.current = true;

    // 遍历所有 block，寻找匹配项
    // 去掉 core_concept 中可能带有的 "..." 截断符
    const searchText = highlightText.replace(/\.{3,}$/, '').toLowerCase().trim();
    if (searchText.length < 2) return;

    let targetBlockId: string | null = null;
    for (const ch of state.chapters) {
      for (const block of ch.blocks) {
        if (block.type === 'note') {
          const t = block.text.toLowerCase();
          if (t.includes(searchText) || searchText.includes(t.substring(0, Math.min(t.length, 30)))) {
            targetBlockId = block.id; break;
          }
        }
        if (block.type === 'l3' && block.l3) {
          const l3Text = (block.l3.term + ' ' + block.l3.explanation).toLowerCase();
          if (l3Text.includes(searchText) || block.l3.term.toLowerCase().includes(searchText)) {
            targetBlockId = block.id; break;
          }
        }
        if ((block.type === 'thought' || block.type === 'dialogue')) {
          const t = block.text.toLowerCase();
          if (t.includes(searchText)) {
            targetBlockId = block.id; break;
          }
        }
      }
      if (targetBlockId) break;
    }

    if (targetBlockId) {
      // requestAnimationFrame + setTimeout 确保 React 已提交 DOM
      requestAnimationFrame(() => {
        setTimeout(() => {
          const el = document.getElementById(targetBlockId!);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('ring-2', 'ring-primary/30', 'rounded-xl');
            setTimeout(() => {
              el.classList.remove('ring-2', 'ring-primary/30', 'rounded-xl');
            }, 2000);
          } else {
            console.warn('highlight target not found in DOM:', targetBlockId);
          }
        }, 150);
      });
    }
  }, [highlightText, state.chapters]);

  // 重置 highlightScrolledRef，当换书时允许再次滚动定位
  useEffect(() => {
    highlightScrolledRef.current = false;
  }, [volume]);

  // === scroll: header + TOC ===
  useEffect(() => {
    const container = scrollRef.current; if (!container) return;
    const h = () => {
      const y = container.scrollTop;
      if (y > container.clientHeight * 0.55 && y > lastScrollY.current) { if (headerRef.current) { setHeaderVisible(false); headerRef.current = false; } }
      else if (y < lastScrollY.current || y < container.clientHeight * 0.55) { if (!headerRef.current) { setHeaderVisible(true); headerRef.current = true; } }
      for (let i = state.chapters.length - 1; i >= 0; i--) {
        const el = document.getElementById(`volume-ch-${i}`); if (el) {
          const r = el.getBoundingClientRect(); const cr = container.getBoundingClientRect();
          if (r.top - cr.top < container.clientHeight * 0.3) { setActiveChapter(i); break; }
        }
      }
      lastScrollY.current = y;
    };
    container.addEventListener('scroll', h, { passive: true });
    return () => container.removeEventListener('scroll', h);
  }, [state.chapters]);
  useEffect(() => {
    // 从语义搜索跳转时不滚到顶部，留给 highlight useEffect 定位
    if (!highlightText) {
      scrollRef.current?.scrollTo(0, 0);
    }
  }, []);

  // === auto-save volume_state (debounced 5s) ===
  useEffect(() => {
    if (!noteId) return;
    const timer = setTimeout(async () => {
      const thoughtBlocks = state.chapters.flatMap(ch =>
        ch.blocks.filter(b => b.type === 'thought').map(b => ({
          id: b.id,
          text: b.text,
          selected: b.selected,
        }))
      );
      try {
        await fetch(`${API_BASE}/deepwork/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: 'default_user',
            note_id: noteId,
            chat_history: [],
            right_cards: [],
            final_markdown: null,
            volume_blocks: thoughtBlocks
          })
        });
      } catch (e) { /* silent */ }
    }, 5000);
    return () => clearTimeout(timer);
  }, [state, noteId]);

  // === A: toggle select ===
  const handleToggle = useCallback((chIdx: number, bIdx: number) => {
    setState(prev => {
      const next = structuredClone(prev);
      const block = next.chapters[chIdx].blocks[bIdx];
      block.selected = !block.selected;
      return next;
    });
  }, []);

  // === A: select all / deselect all ===
  const selectAll = () => setState(prev => { const n = structuredClone(prev); n.chapters.forEach(ch => ch.blocks.forEach(b => { b.selected = true; })); return n; });
  const deselectAll = () => setState(prev => { const n = structuredClone(prev); n.chapters.forEach(ch => ch.blocks.forEach(b => { b.selected = false; })); return n; });

  // === C: inline edit ===
  const handleEdit = useCallback((chIdx: number, bIdx: number, newText: string) => {
    setState(prev => {
      const next = structuredClone(prev);
      next.chapters[chIdx].blocks[bIdx].text = newText;
      return next;
    });
  }, []);

  // === add thought block ===
  const handleAddThought = useCallback((chIdx: number) => {
    setState(prev => {
      const next = structuredClone(prev);
      const newBlock: Block = {
        id: `thought_${Date.now()}`,
        type: 'thought',
        text: '',
        source: '',
        selected: true,
      };
      next.chapters[chIdx].blocks.push(newBlock);
      return next;
    });
  }, []);

  // === B: drag & drop ===
  const handleDragStart = useCallback((chIdx: number, bIdx: number) => {
    setDragState({ fromCh: chIdx, fromBl: bIdx, overCh: chIdx, overBl: bIdx, position: 'below' });
  }, []);
  const handleDragOver = useCallback((e: React.DragEvent, chIdx: number, bIdx: number) => {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const position: 'above' | 'below' = e.clientY < midY ? 'above' : 'below';
    setDragState(prev => prev ? { ...prev, overCh: chIdx, overBl: bIdx, position } : null);
  }, []);
  const handleDragEnd = useCallback(() => { setDragState(null); }, []);
  const handleDrop = useCallback((e: React.DragEvent, toCh: number, toBl: number) => {
    e.preventDefault();
    if (!dragState) return;
    const { fromCh, fromBl, position } = dragState;
    setDragState(null);
    if (fromCh === toCh && fromBl === toBl) return;

    setState(prev => {
      const next = structuredClone(prev);
      const fromBlock = next.chapters[fromCh].blocks[fromBl];
      if (!fromBlock) return prev;
      // Remove from source
      next.chapters[fromCh].blocks.splice(fromBl, 1);
      // Calculate insertion index: 'below' means insert after the target block
      let insertIdx = position === 'below' ? toBl + 1 : toBl;
      // Adjust if source was before target in the same chapter
      if (fromCh === toCh && fromBl < insertIdx) insertIdx--;
      next.chapters[toCh].blocks.splice(Math.min(insertIdx, next.chapters[toCh].blocks.length), 0, fromBlock);
      return next;
    });
  }, [dragState]);

  // === question handler ===
  const handleQuestion = (question: string) => {
    const lastNoteId = localStorage.getItem('inktrace_last_note_id') || 'demo_note';
    localStorage.setItem('inktrace_preset_question', question);
    window.location.hash = `#/deep-work/${lastNoteId}`;
  };

  return (
    <div ref={scrollRef} className="h-full overflow-auto bg-surface">
      {/* smart header */}
      <div className={`fixed top-0 left-0 right-0 z-50 transition-transform duration-400 ${headerVisible ? 'translate-y-0' : '-translate-y-full'}`}>
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/40 backdrop-blur-xl border border-white/30 text-stone-500 hover:text-primary hover:bg-white/60 hover:border-white/40 transition-all group shadow-sm">
              <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
              <span className="text-[11px] font-bold uppercase tracking-widest">书库</span>
            </button>
            <button
              onClick={() => {
                localStorage.setItem('inktrace_last_note_id', noteId || '');
                window.location.hash = `#/deep-work/${noteId || 'demo_note'}`;
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-white/40 backdrop-blur-xl border border-white/30 text-stone-500 text-[11px] font-bold hover:text-primary hover:bg-white/60 hover:border-white/40 transition-all shadow-sm"
            >
              <ExternalLink size={12} /><span>回到深读区</span>
            </button>
          </div>

          {/* selection summary */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-xs text-on-surface/60 bg-white/40 backdrop-blur-xl rounded-2xl px-4 py-2 border border-white/30">
              <span>已选 <b className="text-primary">{selectedBlocks}</b>/{totalBlocks} 条</span>
              <button onClick={selectAll} className="text-[10px] text-outline-variant hover:text-primary transition-colors">全选</button>
              <span className="text-outline-variant/30">|</span>
              <button onClick={deselectAll} className="text-[10px] text-outline-variant hover:text-primary transition-colors">取消全选</button>
            </div>
            <ExportMenu volumeState={state} l3SectionSelections={l3SectionSelections} l3Edits={l3Edits} l3Notes={l3Notes} />
          </div>
        </div>
      </div>

      {/* cover */}
      <section className="min-h-[55vh] flex flex-col items-center justify-center pt-24 pb-12 px-6 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-white via-surface to-transparent -z-10" />
        <BookCover title={state.title} author={state.author} />
        <h1 className="text-3xl font-serif font-bold text-on-surface mt-8 text-center tracking-wide">{state.title}</h1>
        {state.author && state.author !== 'Unknown Author' && <p className="text-outline-variant mt-2 tracking-[0.2em] text-sm">{state.author}</p>}
        <p className="text-outline-variant/70 mt-1 text-xs">你在这段阅读中留下了 {totalBlocks} 条思考痕迹</p>
        <div className="flex gap-6 mt-6">
          <StatBadge icon={<FileText size={14} />} label="笔记" value={String(totalBlocks)} />
          <StatBadge icon={<BookOpen size={14} />} label="章节" value={String(state.stats.chapterCount)} />
          <StatBadge icon={<Sparkles size={14} />} label="深度解析" value={String(state.stats.l3Count)} />
        </div>
        <div className="mt-12 flex flex-col items-center gap-2 text-outline-variant/40 animate-bounce">
          <ChevronDown size={20} /><span className="text-[10px] tracking-widest uppercase">向下滚动</span>
        </div>
      </section>

      {/* chapters */}
      <section className="max-w-3xl mx-auto px-6 pb-32">
        {state.chapters.map((chapter, ci) => (
          <div key={chapter.id} id={`volume-ch-${ci}`} className="mb-16 scroll-mt-20">
            <h2 className="text-xl font-serif font-bold text-on-surface mb-8 pb-3 border-b border-outline-variant/15">
              {chapter.heading}
            </h2>
            <div className="space-y-1">
              {chapter.blocks.map((block, bi) => {
                if (block.type === 'l3' && block.l3) {
                  return (
                    <div key={block.id} id={block.id}>
                      <L3BlockWrapper
                        block={block} chapterIdx={ci} blockIdx={bi}
                        onToggle={handleToggle}
                        onDragStart={handleDragStart} onDragOver={handleDragOver}
                        onDrop={handleDrop} onDragEnd={handleDragEnd} dragState={dragState}
                        selectedSections={l3SectionSelections[block.id]}
                        onSectionToggle={handleL3SectionToggle}
                        edits={l3Edits[block.id]}
                        notes={l3Notes[block.id]}
                        onEdit={handleL3Edit}
                        onNoteChange={handleL3NoteChange}
                      >
                        <L3Card l3={block.l3} onQuestion={handleQuestion} />
                      </L3BlockWrapper>
                    </div>
                  );
                }
                if (block.type === 'note') {
                  return (
                    <div key={block.id} id={block.id}>
                      <NoteBlock
                        block={block} chapterIdx={ci} blockIdx={bi}
                        onToggle={handleToggle} onEdit={handleEdit}
                        onDragStart={handleDragStart} onDragOver={handleDragOver}
                        onDrop={handleDrop}
                        onDragEnd={handleDragEnd} dragState={dragState}
                      />
                    </div>
                  );
                }
                if (block.type === 'dialogue') {
                  return (
                    <div key={block.id} id={block.id}>
                      <DialogueBlock
                        block={block} chapterIdx={ci} blockIdx={bi}
                        onToggle={handleToggle}
                        onDragStart={handleDragStart} onDragOver={handleDragOver}
                        onDrop={handleDrop} onDragEnd={handleDragEnd} dragState={dragState}
                      />
                    </div>
                  );
                }
                if (block.type === 'thought') {
                  return (
                    <div key={block.id} id={block.id}>
                      <ThoughtBlock
                        block={block} chapterIdx={ci} blockIdx={bi}
                        onToggle={handleToggle} onEdit={handleEdit}
                        onDragStart={handleDragStart} onDragOver={handleDragOver}
                        onDrop={handleDrop} onDragEnd={handleDragEnd} dragState={dragState}
                      />
                    </div>
                  );
                }
                return null;
              })}
              {chapter.blocks.length === 0 && (
                <p className="text-sm text-outline-variant/40 italic py-8 text-center">此章节暂无笔记</p>
              )}
              {/* 添加我的思考 */}
              <button
                onClick={() => handleAddThought(ci)}
                className="mt-3 flex items-center gap-1.5 text-xs text-outline-variant/40 hover:text-primary transition-colors group"
              >
                <span className="w-5 h-5 rounded-full border border-outline-variant/20 flex items-center justify-center group-hover:border-primary/40 transition-colors">+</span>
                <span className="opacity-0 group-hover:opacity-100 transition-opacity">添加我的思考</span>
              </button>
            </div>
          </div>
        ))}
      </section>

      {/* appendix */}
      <section className="max-w-3xl mx-auto px-6 pb-32 border-t border-outline-variant/10 pt-16">
        <div className="text-center space-y-4">
          <p className="text-outline-variant text-sm font-serif">InkTrace · 静心治学</p>
          <p className="text-[11px] text-outline-variant/50">这个世界不能没有文字</p>
        </div>
      </section>

      {state.chapters.length > 1 && <MiniTOC chapters={state.chapters} activeChapter={activeChapter} />}
    </div>
  );
}

function StatBadge({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-full border border-outline-variant/15 shadow-sm">
      <span className="text-primary">{icon}</span>
      <span className="text-[10px] text-outline-variant uppercase tracking-widest">{label}</span>
      <span className="text-sm font-bold text-on-surface">{value}</span>
    </div>
  );
}

// ---------- Semantic Search Result ----------
interface SearchResultItem {
  book_title: string;
  core_concept: string;
  markdown: string;
  distance: number;
  relevance_score: number | null;
  ai_summary: string | null;
}

// ---------- Book List ----------
function VolumeList({ onSelect }: { onSelect: (book: BookInfo, highlightText?: string) => void }) {
  const [books, setBooks] = useState<BookInfo[]>([]);
  const [loading, setLoading] = useState(true);

  // 语义搜索状态
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [isRebuilding, setIsRebuilding] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/library/books`);
        const data = await res.json();
        setBooks((data.books || []).filter((b: BookInfo) =>
          b.source !== 'Library' && (b.status === '已完成' || b.status === '已深度思考' || b.hasDeepWorkContent)
        ));

        // 从深读区跳转来的自动打开
        const autoOpenNoteId = localStorage.getItem('inktrace_volume_auto_open');
        if (autoOpenNoteId) {
          localStorage.removeItem('inktrace_volume_auto_open');
          const targetBook = (data.books || []).find((b: BookInfo) => b.id === autoOpenNoteId);
          if (targetBook) {
            setTimeout(() => onSelect(targetBook), 300);
          }
        }
      } catch (e) { console.error('Failed:', e); }
      finally { setLoading(false); }
    })();
  }, []);

  const handleSearch = async (q: string) => {
    setSearchQuery(q);
    if (!q.trim()) {
      setSearchResults([]);
      setHasSearched(false);
      return;
    }
    setIsSearching(true);
    setHasSearched(true);
    try {
      const res = await fetch(`${API_BASE}/search/semantic?q=${encodeURIComponent(q)}&top_k=5&enable_ai_rerank=true`);
      const data = await res.json();
      if (data.success) {
        setSearchResults(data.results || []);
      }
    } catch (e) { console.error('搜索失败:', e); }
    finally { setIsSearching(false); }
  };

  const handleResultClick = (result: SearchResultItem) => {
    const match = books.find(b =>
      b.title === result.book_title ||
      b.title.includes(result.book_title) ||
      result.book_title.includes(b.title)
    );
    if (match) {
      // 用 core_concept 作为定位文本
      onSelect(match, result.core_concept);
    }
  };

  const handleRebuildIndex = async () => {
    setIsRebuilding(true);
    try {
      const res = await fetch(`${API_BASE}/search/rebuild`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        console.log(`索引已重建: ${data.total_indexed} 条记录, ${data.books_count} 本书`);
      }
    } catch (e) { console.error('索引重建失败:', e); }
    finally { setIsRebuilding(false); }
  };

  if (loading) return <div className="p-10 max-w-6xl mx-auto flex items-center justify-center min-h-[60vh]"><Loader2 className="animate-spin text-outline-variant" size={32} /></div>;

  const showResults = hasSearched;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="p-6 lg:p-10 max-w-6xl mx-auto">
      <header className="mb-8">
        <h2 className="text-3xl font-serif font-bold text-on-surface mb-2">成册</h2>
        <p className="text-sm text-outline-variant mb-6">{books.length > 0 ? `${books.length} 本书已沉淀为可翻阅的知识札记` : '完成笔记处理后，它们会出现在这里'}</p>

        {/* 语义搜索框 */}
        <div className="relative max-w-2xl">
          <div className="flex items-center gap-0 bg-white rounded-2xl border border-outline-variant/20 shadow-sm focus-within:border-primary/40 focus-within:shadow-md focus-within:shadow-primary/5 transition-all duration-300 overflow-hidden">
            <div className="pl-4 text-outline-variant/40">
              <Search size={18} />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(searchQuery); }}
              placeholder="跨书语义搜索（如：明代财政危机的成因）"
              className="flex-1 bg-transparent px-3 py-3 text-sm text-on-surface placeholder:text-outline-variant/40 outline-none"
            />
            {searchQuery && (
              <button onClick={() => handleSearch('')} className="pr-3 text-outline-variant/30 hover:text-outline-variant transition-colors">
                <X size={16} />
              </button>
            )}
          </div>

          {/* 搜索提示 */}
          <div className="flex items-center gap-2 mt-2 px-1">
            <Sparkles size={10} className="text-primary/50" />
            <span className="text-[10px] text-outline-variant/50">AI 语义搜索，支持模糊概念查询</span>
            <button
              onClick={handleRebuildIndex}
              disabled={isRebuilding}
              className="ml-auto flex items-center gap-1 text-[10px] text-outline-variant/30 hover:text-primary/60 transition-colors disabled:opacity-50"
              title="从文件系统重建索引（删书后使用）"
            >
              {isRebuilding ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
              <span>{isRebuilding ? '重建中...' : '刷新索引'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* 搜索结果区 */}
      {showResults && (
        <div className="mb-10">
          {isSearching ? (
            <div className="flex items-center gap-3 py-12 justify-center text-outline-variant">
              <Loader2 size={20} className="animate-spin" />
              <span className="text-sm">正在检索知识库...</span>
            </div>
          ) : searchResults.length > 0 ? (
            <>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs text-outline-variant">找到 <b className="text-primary">{searchResults.length}</b> 条相关结果</span>
              </div>
              <div className="space-y-3">
                {searchResults.map((result, i) => {
                  const matchBook = books.find(b =>
                    b.title === result.book_title ||
                    b.title.includes(result.book_title) ||
                    result.book_title.includes(b.title)
                  );
                  return (
                    <button
                      key={i}
                      onClick={() => handleResultClick(result)}
                      disabled={!matchBook}
                      className={`w-full text-left glaze-card rounded-2xl p-5 transition-all duration-200 ${matchBook ? 'hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5 cursor-pointer' : 'opacity-50 cursor-default'}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-[10px] font-bold text-primary bg-primary-container/10 px-2 py-0.5 rounded-full">{result.book_title}</span>
                            {result.relevance_score != null && (
                              <span className="flex items-center gap-0.5 text-[10px] text-outline-variant">
                                <Percent size={10} />
                                相关度 {Math.round(result.relevance_score * 100)}%
                              </span>
                            )}
                          </div>
                          <h4 className="text-sm font-bold text-on-surface/80 mb-1.5">{result.core_concept}</h4>
                          {result.ai_summary && (
                            <p className="text-xs text-on-surface/50 leading-relaxed line-clamp-2">{result.ai_summary}</p>
                          )}
                        </div>
                        {matchBook && (
                          <div className="shrink-0 w-10 h-14 rounded-lg overflow-hidden bg-surface-container/50">
                            <BookCoverMini title={result.book_title} />
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="text-center py-12">
              <Search size={32} className="text-outline-variant/20 mx-auto mb-3" />
              <p className="text-sm text-outline-variant">未找到与「{searchQuery}」相关的内容</p>
              <p className="text-xs text-outline-variant/50 mt-1">试试换个关键词，或确保已在「库」中完成笔记处理</p>
            </div>
          )}
        </div>
      )}

      {/* 书网格（非搜索状态时显示） */}
      {!showResults && (
        <>
          {books.length === 0 ? (
            <div className="text-center py-24"><BookOpen size={48} className="text-outline-variant/30 mx-auto mb-4" /><p className="text-outline-variant">暂无可用成册</p><p className="text-xs text-outline-variant/50 mt-1">去「库」中处理一本书的笔记吧</p></div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {books.map(book => (
                <button key={book.id} onClick={() => onSelect(book)} className="glaze-card rounded-2xl p-6 text-left hover:scale-[1.02] transition-transform duration-300 group">
                  <div className="w-full aspect-[3/4] mb-4 rounded-xl overflow-hidden bg-surface-container/50 flex items-center justify-center">
                    <BookCoverMini title={book.title} />
                  </div>
                  <h3 className="font-serif font-bold text-lg text-on-surface group-hover:text-primary transition-colors">{book.title}</h3>
                  <p className="text-xs text-outline-variant mt-1">{book.author || '未知作者'}</p>
                  <div className="flex items-center gap-2 mt-3"><span className="px-2 py-0.5 bg-primary-container/15 text-primary text-[10px] font-bold rounded-full border border-primary-container/25">已深度思考</span></div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}

function BookCoverMini({ title }: { title: string }) {
  const hue = 175 + ((title.charCodeAt(0) || 0) * 37) % 30;
  return <div className="w-full h-full flex items-center justify-center p-4 text-center" style={{ background: `linear-gradient(160deg, hsl(${hue}, 25%, 22%), hsl(${hue + 8}, 18%, 14%))` }}><span className="text-white/65 text-sm font-serif leading-snug">{title}</span></div>;
}

// ---------- Main ----------
export default function VolumeView({ onDetailChange }: { onDetailChange?: (inDetail: boolean) => void }) {
  const [mode, setMode] = useState<'list' | 'detail'>('list');
  const [selectedVolume, setSelectedVolume] = useState<VolumeState | null>(null);
  const [currentNoteId, setCurrentNoteId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [highlightText, setHighlightText] = useState<string>('');

  const handleSelect = async (book: BookInfo, highlight?: string) => {
    setLoading(true);
    setHighlightText(highlight || '');
    try {
      const res = await fetch(`${API_BASE}/notes/${book.id}/content`);
      const data = await res.json();
      if (data.success && data.content) {
        const parsed = parseMarkdownToVolume(data.content);
        parsed.title = book.title || parsed.title;
        parsed.author = book.author || parsed.author;

        // 加载 session 数据（对话精华 + 用户思考）
        try {
          const sessionRes = await fetch(`${API_BASE}/deepwork/restore`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: 'default_user', note_id: book.id })
          });
          const sessionData = await sessionRes.json();
          if (sessionData.success && sessionData.data) {
            const { chat_history, volume_selections, volume_blocks, right_cards } = sessionData.data;

            // 注入对话精华块（从深读区勾选的对话消息）
            if (volume_selections?.selected_message_indices?.length > 0 && chat_history) {
              const dialogueBlocks: Block[] = [];
              volume_selections.selected_message_indices.forEach((idx: number) => {
                if (idx < chat_history.length) {
                  const msg = chat_history[idx];
                  dialogueBlocks.push({
                    id: genBlockId(),
                    type: 'dialogue',
                    text: msg.content,
                    source: '',
                    selected: true,
                    role: msg.role,
                    timestamp: msg.timestamp
                  });
                }
              });
              if (dialogueBlocks.length > 0) {
                parsed.chapters.push({
                  id: genChapterId(),
                  heading: '💬 深读对话精选',
                  blocks: dialogueBlocks
                });
              }
            }

            // 构建 note 块索引：paragraphIndex → {chapterIdx, blockIdx}
            const noteIndexMap = new Map<number, { ci: number; bi: number }>();
            parsed.chapters.forEach((ch, ci) => {
              ch.blocks.forEach((block, bi) => {
                if (block.type === 'note' && block.paragraphIndex !== undefined) {
                  noteIndexMap.set(block.paragraphIndex, { ci, bi });
                }
              });
            });

            const unmatchedThoughts: Block[] = [];

            // 从深读区思考卡片（right_cards）转换，匹配到对应段落
            if (right_cards && right_cards.length > 0) {
              right_cards.forEach((card: any) => {
                if (card.type !== 'think-seed') {
                  const thoughtBlock: Block = {
                    id: genBlockId(),
                    type: 'thought',
                    text: card.content || card.title || '',
                    source: '',
                    selected: true,
                  };
                  // 尝试匹配 block_id 到对应 note 段落
                  const targetIdx = card.block_id ?? card.paragraph_index;
                  const match = targetIdx !== undefined && targetIdx !== null ? noteIndexMap.get(targetIdx) : undefined;
                  if (match) {
                    const { ci, bi } = match;
                    parsed.chapters[ci].blocks.splice(bi + 1, 0, thoughtBlock);
                    // 刷新索引偏移
                    noteIndexMap.forEach((v, k) => {
                      if (v.ci === ci && v.bi > bi) noteIndexMap.set(k, { ci, bi: v.bi + 1 });
                    });
                  } else {
                    unmatchedThoughts.push(thoughtBlock);
                  }
                }
              });
            }

            // 从上一次成册区保存的 volume_blocks 恢复
            if (volume_blocks && volume_blocks.length > 0) {
              volume_blocks.forEach((vb: any) => {
                unmatchedThoughts.push({
                  id: genBlockId(),
                  type: 'thought' as const,
                  text: vb.text || '',
                  source: '',
                  selected: vb.selected !== false,
                });
              });
            }

            // 未匹配的 thought 块放入独立章节
            if (unmatchedThoughts.length > 0) {
              parsed.chapters.push({
                id: genChapterId(),
                heading: '🧠 我的思考',
                blocks: unmatchedThoughts
              });
            }
          }
        } catch (e) { console.warn('加载 session 失败，仅显示笔记内容:', e); }

        setSelectedVolume(parsed);
        setCurrentNoteId(book.id);
        setMode('detail');
        onDetailChange?.(true);
      }
    } catch (e) { console.error('Failed:', e); }
    finally { setLoading(false); }
  };

  if (loading) return <div className="p-10 max-w-6xl mx-auto flex items-center justify-center min-h-[60vh]"><div className="text-center space-y-4"><Loader2 className="animate-spin text-primary mx-auto" size={32} /><p className="text-sm text-outline-variant">正在翻阅...</p></div></div>;
  if (mode === 'detail' && selectedVolume) return <VolumeDetail volume={selectedVolume} noteId={currentNoteId} highlightText={highlightText} onBack={() => { setMode('list'); setSelectedVolume(null); setCurrentNoteId(''); setHighlightText(''); onDetailChange?.(false); }} />;
  return <VolumeList onSelect={handleSelect} />;
}
