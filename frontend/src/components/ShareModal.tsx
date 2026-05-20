import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Send, Sparkles } from 'lucide-react';

const API_BASE = (import.meta as any).env?.VITE_API_BASE || 'https://Ruizi2006-inktrace.hf.space/api/v1';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookTitle: string;
  content: string;
  quote?: string;
}

const ShareModal: React.FC<ShareModalProps> = ({ isOpen, onClose, bookTitle, content, quote }) => {
  const [thought, setThought] = useState('');
  const [postType, setPostType] = useState('思考');
  const [isSharing, setIsSharing] = useState(false);
  const [shared, setShared] = useState(false);

  const handleShare = async () => {
    setIsSharing(true);
    try {
      const res = await fetch(`${API_BASE}/community/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          book_title: bookTitle,
          content,
          quote: quote || content.slice(0, 80),
          thought,
          post_type: postType,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShared(true);
        setTimeout(() => {
          onClose();
          setThought('');
          setShared(false);
        }, 1500);
      }
    } catch (e) {
      console.error('Share failed:', e);
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-surface/80 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-xl border border-outline-variant/30 w-full max-w-md mx-4 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-outline-variant/20">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-primary" />
                <h3 className="font-serif font-bold text-sm">分享到社区</h3>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-surface-container/50 transition-colors text-on-surface/40"
              >
                <X size={16} />
              </button>
            </div>

            {/* Content preview */}
            <div className="p-5">
              <div className="p-4 rounded-xl bg-surface-container/30 border border-outline-variant/20 mb-4">
                <p className="text-[10px] text-primary/60 font-bold mb-1">《{bookTitle}》</p>
                <p className="text-sm text-on-surface/70 leading-relaxed font-serif line-clamp-3">
                  {content.replace(/^[-▪*]\s*/, '')}
                </p>
              </div>

              {/* Thought input */}
              <textarea
                value={thought}
                onChange={e => setThought(e.target.value)}
                placeholder="添加你的想法（可选）..."
                className="w-full p-3 text-sm rounded-xl border border-outline-variant/30 bg-surface/50 resize-none focus:outline-none focus:border-primary/40 transition-colors"
                rows={2}
              />

              {/* Type selector */}
              <div className="flex gap-2 mt-3">
                {['思考', '困惑', '荐书'].map(t => (
                  <button
                    key={t}
                    onClick={() => setPostType(t)}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors ${
                      postType === t
                        ? 'bg-primary text-white'
                        : 'bg-surface-container/50 text-on-surface/40 hover:bg-surface-container'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {/* Share button */}
              <button
                onClick={handleShare}
                disabled={isSharing || shared}
                className="w-full mt-4 py-3 rounded-xl bg-primary text-white text-sm font-medium hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {shared ? (
                  <>已分享 ✓</>
                ) : isSharing ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Send size={14} />
                    分享到社区
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ShareModal;
