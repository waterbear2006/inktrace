import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Zap, ChevronDown, ChevronUp } from 'lucide-react';

interface CollisionCardData {
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
}

interface CollisionCardProps {
  data: CollisionCardData;
  compact?: boolean;
}

const TENSION_COLORS: Record<string, string> = {
  '支持': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  '反驳': 'bg-rose-50 text-rose-700 border-rose-200',
  '互补': 'bg-blue-50 text-blue-700 border-blue-200',
  '案例化': 'bg-amber-50 text-amber-700 border-amber-200',
};

const TENSION_DEFAULT = 'bg-surface-container text-on-surface/60 border-outline-variant/40';

const CollisionCard: React.FC<CollisionCardProps> = ({ data, compact = false }) => {
  const [expanded, setExpanded] = useState(false);
  const tensionClass = TENSION_COLORS[data.tension_type] || TENSION_DEFAULT;

  if (compact) {
    return (
      <div className="glaze-card p-4 rounded-xl border-l-2 border-amber-300/60">
        <div className="flex items-center gap-2 mb-2">
          <Zap size={14} className="text-amber-500" />
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${tensionClass}`}>
            {data.tension_type}
          </span>
          <span className="text-[10px] text-on-surface/30">
            {Math.round(data.similarity * 100)}% 相似
          </span>
        </div>
        <p className="text-xs text-on-surface/70 leading-relaxed line-clamp-2 font-serif">
          《{data.source_book}》↔《{data.target_book}》
        </p>
        <p className="text-[11px] text-on-surface/50 mt-1 line-clamp-1">
          {data.provocation_question}
        </p>
      </div>
    );
  }

  return (
    <div className="glaze-card p-5 rounded-xl border-l-2 border-amber-300/60">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Zap size={16} className="text-amber-500" />
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${tensionClass}`}>
          {data.tension_type}
        </span>
        <span className="text-[10px] text-on-surface/30">
          来自不同书籍 · {Math.round(data.similarity * 100)}%
        </span>
      </div>

      {/* Side by side */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="p-3 rounded-lg bg-surface-container/50">
          <p className="text-[10px] font-bold text-primary/60 mb-1">《{data.source_book}》</p>
          <p className="text-xs text-on-surface/70 leading-relaxed font-serif">
            {data.source_text.replace(/^[-▪*]\s*/, '').slice(0, 80)}
            {data.source_text.length > 80 ? '...' : ''}
          </p>
        </div>
        <div className="p-3 rounded-lg bg-surface-container/50">
          <p className="text-[10px] font-bold text-primary/60 mb-1">《{data.target_book}》</p>
          <p className="text-xs text-on-surface/70 leading-relaxed font-serif">
            {data.target_text.replace(/^[-▪*]\s*/, '').slice(0, 80)}
            {data.target_text.length > 80 ? '...' : ''}
          </p>
        </div>
      </div>

      {/* Expandable reason */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-[10px] text-on-surface/40 hover:text-primary transition-colors"
      >
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {expanded ? '收起' : '展开看看'}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 pt-3 border-t border-outline-variant/20">
              <p className="text-xs text-on-surface/60 leading-relaxed">
                {data.tension_reason}
              </p>
              <p className="text-sm text-primary/80 font-serif mt-2 italic">
                {data.provocation_question}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CollisionCard;
