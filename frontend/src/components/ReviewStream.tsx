import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ChevronRight, Share2, Sparkles, BookOpen, ChevronLeft } from 'lucide-react';
import CollisionCard from './CollisionCard';

const API_BASE = (import.meta as any).env?.VITE_API_BASE || 'https://Ruizi2006-inktrace.hf.space/api/v1';

interface NoteCard {
  type: 'note';
  data: {
    book_title: string;
    core_concept: string;
    markdown: string;
    md5_hash: string;
  };
}

interface CollisionCardData {
  type: 'collision';
  data: {
    source_book: string;
    source_concept: string;
    source_text: string;
    target_book: string;
    target_concept: string;
    target_text: string;
    tension_type: string;
    tension_reason: string;
    provocation_question: string;
    similarity: number;
  };
}

type Card = NoteCard | CollisionCardData;

interface ReviewStreamProps {
  onShareNote?: (note: NoteCard) => void;
  onOpenBook?: (bookId: string) => void;
}

// 清洗并截取纯文本
function cleanExcerpt(text: string, maxLen = 55): string {
  const cleaned = text
    .replace(/^[-▪*#>]\s*/gm, '')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen) + '...' : cleaned;
}

const ReviewStream: React.FC<ReviewStreamProps> = ({ onShareNote, onOpenBook }) => {
  const [cards, setCards] = useState<Card[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [detailCard, setDetailCard] = useState<Card | null>(null);

  useEffect(() => {
    fetchDailyReview();
  }, []);

  const fetchDailyReview = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/review/daily`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: 12, collision_interval: 5 }),
      });
      const data = await res.json();
      setCards(data.cards || []);
    } catch (e) {
      console.error('Failed to fetch daily review:', e);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <Sparkles size={16} className="text-primary/40" />
          <h3 className="text-xs font-bold text-on-surface/30 uppercase tracking-widest">今日回顾</h3>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[1, 2].map(i => (
            <div key={i} className="h-48 rounded-2xl bg-surface-container/40 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!cards.length) return null;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-primary/10 flex items-center justify-center">
            <Sparkles size={9} className="text-primary/60" />
          </div>
          <h3 className="text-[11px] font-bold text-on-surface/30 uppercase tracking-widest">今日回顾</h3>
        </div>
        <button
          onClick={fetchDailyReview}
          className="text-[10px] text-on-surface/25 hover:text-primary transition-colors"
        >
          换一批
        </button>
      </div>

      {/* Swipeable 2-card display */}
      <SwipeableCardPair
        cards={cards}
        onShareNote={onShareNote}
        onDetailCard={setDetailCard}
      />

      {/* Detail modal */}
      <AnimatePresence>
        {detailCard && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 backdrop-blur-sm px-4"
            onClick={() => setDetailCard(null)}
          >
            {detailCard.type === 'collision' ? (
              <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                onClick={e => e.stopPropagation()}
                className="bg-white rounded-[28px] shadow-2xl border border-outline-variant/10 w-full max-w-md max-h-[80vh] overflow-y-auto"
              >
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Sparkles size={14} className="text-amber-500" />
                      <span className="text-[10px] font-bold text-on-surface/30 uppercase tracking-widest">跨书碰撞</span>
                    </div>
                    <button onClick={() => setDetailCard(null)} className="p-2 rounded-full hover:bg-surface-container/30 text-on-surface/25 transition-colors">
                      <X size={16} />
                    </button>
                  </div>
                  <CollisionCard data={detailCard.data} />
                </div>
              </motion.div>
            ) : (
              <NoteDetailCard
                card={detailCard as NoteCard}
                onClose={() => setDetailCard(null)}
                onShare={onShareNote}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ---- 双卡滑动组件 ---- //
const SwipeableCardPair: React.FC<{
  cards: Card[];
  onShareNote?: (note: NoteCard) => void;
  onDetailCard: (card: Card) => void;
}> = ({ cards, onShareNote, onDetailCard }) => {
  const [pairIndex, setPairIndex] = useState(0);
  const totalPairs = Math.ceil(cards.length / 2);
  const canGoPrev = pairIndex > 0;
  const canGoNext = pairIndex < totalPairs - 1;

  const handleDragEnd = (_: any, info: { offset: { x: number }; velocity: { x: number } }) => {
    if (info.offset.x < -60 || info.velocity.x < -300) {
      if (canGoNext) setPairIndex(i => i + 1);
    } else if (info.offset.x > 60 || info.velocity.x > 300) {
      if (canGoPrev) setPairIndex(i => i - 1);
    }
  };

  const cardA = cards[pairIndex * 2];
  const cardB = cards[pairIndex * 2 + 1];

  return (
    <div className="relative">
      <motion.div
        drag="x"
        dragElastic={0.2}
        dragSnapToOrigin
        onDragEnd={handleDragEnd}
        style={{ touchAction: 'pan-y' }}
        className="cursor-grab active:cursor-grabbing"
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={pairIndex}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-2 gap-3"
          >
            <div>
              {cardA && cardA.type === 'collision' ? (
                <div onClick={() => onDetailCard(cardA)}>
                  <CollisionCard data={cardA.data} compact />
                </div>
              ) : cardA ? (
                <NoteHighlightCard
                  card={cardA as NoteCard}
                  onShare={onShareNote}
                  onClick={() => onDetailCard(cardA)}
                />
              ) : null}
            </div>

            <div>
              {cardB && cardB.type === 'collision' ? (
                <div onClick={() => onDetailCard(cardB)}>
                  <CollisionCard data={cardB.data} compact />
                </div>
              ) : cardB ? (
                <NoteHighlightCard
                  card={cardB as NoteCard}
                  onShare={onShareNote}
                  onClick={() => onDetailCard(cardB)}
                />
              ) : null}
            </div>
          </motion.div>
        </AnimatePresence>
      </motion.div>

      {/* Navigation */}
      {totalPairs > 1 && (
        <div className="flex items-center justify-center gap-3 mt-3">
          <button
            onClick={() => canGoPrev && setPairIndex(i => i - 1)}
            disabled={!canGoPrev}
            className="p-1 rounded-full hover:bg-surface-container/30 disabled:opacity-20 transition-colors"
          >
            <ChevronLeft size={14} className="text-on-surface/30" />
          </button>
          <span className="text-[9px] text-on-surface/20 tabular-nums">
            {pairIndex + 1}/{totalPairs}
          </span>
          <button
            onClick={() => canGoNext && setPairIndex(i => i + 1)}
            disabled={!canGoNext}
            className="p-1 rounded-full hover:bg-surface-container/30 disabled:opacity-20 transition-colors"
          >
            <ChevronRight size={14} className="text-on-surface/30" />
          </button>
        </div>
      )}
    </div>
  );
};

// ---- 横向浏览卡片：迷你划线 ---- //
const NoteHighlightCard: React.FC<{
  card: NoteCard;
  onShare?: (note: NoteCard) => void;
  onClick?: () => void;
}> = ({ card, onShare, onClick }) => {
  const title = card.data.book_title || '';
  const displayText = cleanExcerpt(card.data.core_concept || card.data.markdown, 160);

  return (
    <motion.div
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="glaze-card p-5 rounded-2xl cursor-pointer h-full flex flex-col transition-shadow border border-outline-variant/10 hover:border-primary/15 group"
    >
      <p className="text-[11px] text-primary/50 font-medium mb-3 truncate tracking-wide">
        《{title.length > 20 ? title.slice(0, 20) + '...' : title}》
      </p>

      <div className="flex-1 relative">
        <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-full bg-primary/15" />
        <p className="text-[14px] text-on-surface/75 leading-[2] font-serif pl-3.5 line-clamp-6">
          {displayText}
        </p>
      </div>

      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-outline-variant/8">
        <button
          onClick={(e) => { e.stopPropagation(); onShare?.(card); }}
          className="flex items-center gap-1 text-[10px] text-on-surface/20 hover:text-primary transition-colors"
        >
          <Share2 size={10} />
        </button>
        <div className="flex-1" />
        <span className="flex items-center gap-0.5 text-[10px] text-on-surface/15 opacity-0 group-hover:opacity-100 transition-opacity">
          展开 <ChevronRight size={10} />
        </span>
      </div>
    </motion.div>
  );
};

// ---- 详情卡 ---- //
const NoteDetailCard: React.FC<{
  card: NoteCard;
  onClose: () => void;
  onShare?: (note: NoteCard) => void;
}> = ({ card, onClose, onShare }) => {
  const bookTitle = card.data.book_title || '';
  const fullText = (card.data.markdown || card.data.core_concept || '').replace(/^[-▪*#]\s*/gm, '').trim();

  return (
    <motion.div
      initial={{ scale: 0.95, opacity: 0, y: 20 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      exit={{ scale: 0.95, opacity: 0, y: 20 }}
      onClick={e => e.stopPropagation()}
      className="flex flex-col items-center gap-3"
    >
      <div
        className="overflow-hidden"
        style={{
          width: 390,
          aspectRatio: '3 / 4',
          fontFamily: '"Noto Serif SC", "Source Han Serif SC", serif',
          padding: 44,
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box',
          borderRadius: 36,
          position: 'relative',
          background: 'linear-gradient(160deg, #F8F6F2 0%, #F2F0EB 30%, #F5F3EF 60%, #FAF8F5 100%)',
          boxShadow: '0 30px 60px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
        }}
      >
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: `
            radial-gradient(ellipse 600px 400px at 50% -15%, rgba(255,255,255,0.45) 0%, transparent 50%),
            radial-gradient(ellipse 300px 200px at 80% 90%, rgba(200,200,210,0.06) 0%, transparent 60%),
            linear-gradient(160deg, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0) 35%, rgba(0,0,0,0.015) 100%)
          `
        }} />

        <div style={{
          textAlign: 'center', position: 'relative', zIndex: 1,
          marginBottom: 32, marginTop: 4
        }}>
          <div style={{ fontSize: 11, color: '#A0A0A0', letterSpacing: '0.4em', fontWeight: 400 }}>
            INKTRACE
          </div>
        </div>

        <div style={{
          flex: 1,
          background: 'rgba(255,255,255,0.5)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderRadius: 20,
          padding: '28px 26px',
          width: '100%',
          boxSizing: 'border-box',
          position: 'relative', zIndex: 1,
          marginBottom: 24,
          border: '1px solid rgba(255,255,255,0.7)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.03), inset 0 0 0 1px rgba(255,255,255,0.5)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}>
          <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            <p style={{
              fontSize: 15, lineHeight: 2.1, color: '#4A4A4A', margin: 0,
              letterSpacing: '0.03em', fontFamily: '"Noto Serif SC", serif',
            }}>
              {fullText}
            </p>
          </div>
          {bookTitle && (
            <p style={{ fontSize: 10, color: '#A0A0A0', margin: '16px 0 0 0', textAlign: 'right', letterSpacing: '0.06em' }}>
              —— 《{bookTitle}》
            </p>
          )}
        </div>

        <div style={{ width: 40, height: 1, background: '#D0D0D0', opacity: 0.5, alignSelf: 'center', marginBottom: 20 }} />

        <div style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <p style={{ fontSize: 13, lineHeight: 1.8, color: '#7A7A7A', margin: 0, letterSpacing: '0.04em', fontFamily: '"Noto Serif SC", serif', fontStyle: 'italic' }}>
            阅读留下的墨迹，值得被重新看见
          </p>
        </div>

        <div style={{ width: '100%', position: 'relative', zIndex: 1, marginTop: 'auto', textAlign: 'center', paddingTop: 16 }}>
          <span style={{ fontSize: 9, color: '#B8B8B8', letterSpacing: '0.1em', fontWeight: 400 }}>
            InkTrace · 墨迹溯源
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-full bg-white/60 backdrop-blur border border-white/30 text-xs text-on-surface/40 hover:text-on-surface/60 transition-colors"
        >
          关闭
        </button>
        <button
          onClick={() => { onShare?.(card); onClose(); }}
          className="flex items-center gap-1.5 px-5 py-2 rounded-full bg-primary/90 text-white text-xs font-medium hover:bg-primary transition-colors shadow-lg shadow-primary/20"
        >
          <Share2 size={12} />
          分享到社区
        </button>
      </div>
    </motion.div>
  );
};

export default ReviewStream;
