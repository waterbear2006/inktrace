/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LibraryBig, 
  FileText, 
  BookType, 
  Sliders, 
  UserCircle,
  Database,
  Brain,
  Link as LinkIcon,
  Search,
  Cloud,
  CheckCircle2,
  SlidersHorizontal,
  FolderOpen,
  Sparkles,
  Palette,
  X,
  History,
  ArrowRight,
  BookOpen,
  Tablet,
  Check,
  ChevronRight,
  ChevronLeft,
  RefreshCw,
  UploadCloud,
  Eraser,
  Lock,
  Wallet,
  CloudUpload,
  AlertCircle,
  Send,
  Loader2,
  FileCheck,
  ExternalLink,
  Pin,
  Plus,
  Edit3,
  Trash2,
  User,
  Globe,
  Lightbulb
} from 'lucide-react';
import { THEMES, DATA_SOURCES, VOLUMES } from './constants';

const API_BASE = (import.meta as any).env?.VITE_API_BASE || "https://Ruizi2006-inktrace.hf.space/api/v1";

type View = 'library' | 'deep-work' | 'assets' | 'settings';

// 使用 sessionStorage 追踪当前页面会话中已加载的笔记ID（防止React StrictMode重复加载）
const getSessionLoadedNoteId = () => sessionStorage.getItem('inktrace_loaded_note_id') || '';
const setSessionLoadedNoteId = (noteId: string) => sessionStorage.setItem('inktrace_loaded_note_id', noteId);

// --- 成语释义缓存 ---
const idiomCache: Record<string, string> = {};

// --- 极简 Markdown 渲染器 ---
const SimpleMarkdown = ({ content }: { content: string }) => {
  // 将内容按段落分割（考虑成语模式）
  const parseContent = (text: string) => {
    const blocks: Array<{
      type: 'heading' | 'idiom' | 'quote' | 'list' | 'paragraph' | 'empty' | 'l3data';
      content: string;
      idiom?: string;
      original?: string;
    }> = [];
    
    const lines = text.split('\n');
    let i = 0;
    
    while (i < lines.length) {
      const line = lines[i];
      
      // 空行
      if (!line.trim()) {
        blocks.push({ type: 'empty', content: '' });
        i++;
        continue;
      }
      
      // 标题
      if (line.startsWith('### ')) {
        blocks.push({ type: 'heading', content: line.replace('### ', '') });
        i++;
        continue;
      }
      if (line.startsWith('## ')) {
        blocks.push({ type: 'heading', content: line.replace('## ', '') });
        i++;
        continue;
      }
      
      // 检查是否是成语模式：**成语**\n> 原文 或 **成语**\n- 原文（支持多种格式）
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('**') && trimmedLine.endsWith('**') && i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        
        // 新版格式：**成语**\n> 原文
        if (nextLine?.startsWith('> ')) {
          const idiom = trimmedLine.slice(2, -2);
          const original = nextLine.slice(2);
          blocks.push({
            type: 'idiom',
            content: idiom,
            idiom: idiom,
            original: original
          });
          i += 2;
          continue;
        }
        
        // 《将进酒》格式：**成语**\n- 原文
        if (nextLine?.startsWith('- ')) {
          const idiom = trimmedLine.slice(2, -2);
          const original = nextLine.slice(2);
          blocks.push({
            type: 'idiom',
            content: idiom,
            idiom: idiom,
            original: original
          });
          i += 2;
          continue;
        }
        
        // 兼容旧版格式：**成语**\n> 原文\n<!-- IDIOM:成语 -->
        if (i + 2 < lines.length) {
          const thirdLine = lines[i + 2];
          const oldIdiomMatch = thirdLine?.match(/<!-- IDIOM:(.*?) -->/);
          
          if (nextLine?.startsWith('> ') && oldIdiomMatch) {
            const idiom = trimmedLine.slice(2, -2);
            const original = nextLine.slice(2);
            blocks.push({
              type: 'idiom',
              content: idiom,
              idiom: idiom,
              original: original
            });
            i += 3;
            continue;
          }
        }
      }
      
      // 引用
      if (line.startsWith('> ')) {
        blocks.push({ type: 'quote', content: line.slice(2) });
        i++;
        continue;
      }
      
      // 列表
      if (line.trim().startsWith('- ')) {
        blocks.push({ type: 'list', content: line.trim().slice(2) });
        i++;
        continue;
      }
      
      // L3 数据注释和 IDIOM 注释（跳过不显示）
      const trimmed = line.trim();
      if (trimmed.startsWith('<!-- L3_DATA_START') || 
          trimmed.startsWith('L3_DATA_END -->') || 
          trimmed.startsWith('<!-- IDIOM:') ||
          trimmed.endsWith('-->') && trimmed.includes('IDIOM:')) {
        blocks.push({ type: 'l3data', content: line });
        i++;
        continue;
      }
      
      // 普通段落
      blocks.push({ type: 'paragraph', content: line });
      i++;
    }
    
    return blocks;
  };
  
  const blocks = parseContent(content);
  
  // 成语释义组件
  const IdiomExplanation = ({ idiom }: { idiom: string }) => {
    const [explanation, setExplanation] = useState<string>('');
    const [loading, setLoading] = useState(false);
    
    useEffect(() => {
      if (idiomCache[idiom]) {
        setExplanation(idiomCache[idiom]);
        return;
      }
      
      // 尝试从 L3_DATA 中解析释义，或调用 API
      // 这里先显示一个占位符，实际项目中可以调用后端 API
      const mockExplanation = `【${idiom}】指...（释义加载中）`;
      idiomCache[idiom] = mockExplanation;
      setExplanation(mockExplanation);
    }, [idiom]);
    
    return (
      <div className="mt-2 text-xs text-stone-600 bg-gradient-to-r from-stone-50 to-amber-50/30 px-3 py-2.5 rounded-lg border border-amber-100/40 leading-relaxed">
        <div className="flex items-center gap-1.5 mb-1">
          <Lightbulb size={12} className="text-amber-500" />
          <span className="font-medium text-amber-700">释义</span>
        </div>
        <div className="text-stone-500 pl-4">
          {loading ? (
            <span className="italic animate-pulse">加载中...</span>
          ) : explanation.includes('（释义加载中）') ? (
            <span className="italic text-stone-400">暂无释义，可点击右侧 ✨ 按钮查看 L3 深度分析</span>
          ) : (
            explanation
          )}
        </div>
      </div>
    );
  };
  
  return (
    <div className="space-y-2">
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'heading':
            return <h3 key={i} className="text-base font-bold text-stone-900 mt-5 mb-3">{block.content}</h3>;
          
          case 'idiom':
            return (
              <div key={i} className="my-4 p-4 rounded-xl bg-gradient-to-r from-amber-50/60 to-orange-50/40 border border-amber-100/60 shadow-sm hover:shadow-md transition-all duration-300">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-amber-100/80 flex items-center justify-center mt-0.5">
                    <span className="text-amber-700 font-serif font-bold text-sm">典</span>
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-stone-900 text-base font-serif">{block.idiom}</span>
                      <span className="text-[10px] font-medium text-amber-600 uppercase tracking-wider bg-amber-100/70 px-2 py-0.5 rounded-full">成语/典故</span>
                    </div>
                    <div className="text-xs text-stone-500 pl-3 border-l-2 border-amber-200/60 italic leading-relaxed">
                      {block.original}
                    </div>
                    {block.idiom && <IdiomExplanation idiom={block.idiom} />}
                  </div>
                </div>
              </div>
            );
          
          case 'quote':
            return (
              <blockquote key={i} className="border-l-4 border-primary/30 pl-4 py-2.5 my-3 text-stone-500 italic bg-gradient-to-r from-stone-50/80 to-primary/5 rounded-r-lg shadow-sm">
                {block.content}
              </blockquote>
            );
          
          case 'list':
            return (
              <div key={i} className="flex gap-2.5 pl-1 py-1 hover:bg-stone-50/50 rounded-lg transition-colors -ml-1">
                <span className="text-primary font-bold mt-0.5">•</span>
                <span className="text-stone-700 leading-relaxed">{block.content}</span>
              </div>
            );
          
          case 'l3data':
            return null; // 不显示 L3 数据和 IDIOM 注释
          
          case 'empty':
            return <div key={i} className="h-2" />;
          
          case 'paragraph':
          default:
            // 处理粗体
            const parts = block.content.split(/(\*\*.*?\*\*)/g);
            const formattedLine = parts.map((part, j) => {
              if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={j} className="font-bold text-stone-900">{part.slice(2, -2)}</strong>;
              }
              return part;
            });
            return <p key={i} className="min-h-[1em] text-stone-700 leading-relaxed py-0.5">{formattedLine}</p>;
        }
      })}
    </div>
  );
};
// ------------------------

export default function App() {
  const [currentView, setCurrentView] = useState<View>('library');
  const [processedMarkdown, setProcessedMarkdown] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  
  // 原著缺失警告相关状态
  const [showSourceBookWarning, setShowSourceBookWarning] = useState(false);
  const [sourceBookWarningData, setSourceBookWarningData] = useState<{
    jobId: string;
    bookId: string;
    warningMessage: string;
  } | null>(null);
  const [currentNoteId, setCurrentNoteId] = useState<string>(() => {
    // 从 localStorage 恢复上次处理的笔记 ID，默认使用 demo_note
    return localStorage.getItem('inktrace_last_note_id') || 'demo_note';
  });
  
  // Global focus states
  const [activeTerm, setActiveTerm] = useState<string | null>(null);
  const [activeBlockId, setActiveBlockId] = useState<number | null>(null);
  const [userThoughts, setUserThoughts] = useState<any[]>([]);

  const [quoteIndex, setQuoteIndex] = useState(0);
  const quotes = [
    { text: "学而不思则罔，思而不学则殆。", author: "孔子" },
    { text: "读书而不思考，犹如吃饭而不消化。", author: "波利" },
    { text: "书到用时方恨少，事非经过不知难。", author: "陆游" },
    { text: "读书是易事，思索是难事，但两者缺一，便全无用处。", author: "富兰克林" },
    { text: "旧书不厌百回读，熟读深思子自知。", author: "苏轼" }
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setQuoteIndex(prev => (prev + 1) % quotes.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const getStatusMessage = (progress: number) => {
    if (progress < 25) return "L1: 剔除冗余噪声，还原文字本色...";
    if (progress < 50) return "L2: 识别上下文，重塑逻辑文脉...";
    if (progress < 75) return "L3: 注入语义洞察，构建跨时空对话...";
    if (progress < 95) return "L4: 知识网络成形，即将开启深度工作...";
    return "解析收尾，准备进入治学境地...";
  };

  // 使用 ref 来防止 React StrictMode 导致的重复加载（提前定义，供startPolling使用）
  const isLoadingRef = useRef(false);
  const lastLoadedNoteIdRef = useRef('');

  const handleProcessBook = async (bookId: string, bookStatus?: string) => {
    // 如果笔记已经清洗完成或已有深度思考内容，直接进入 DeepWork 区并加载已有内容
    // bookId 在这里就是 note_id (如 note_xxxx)
    if (bookStatus === '已完成' || bookStatus === '已深度思考') {
      // 先切换到 DeepWork 视图，避免库页面显示
      setCurrentView('deep-work');
      
      // 先设置当前笔记 ID（这会触发 useEffect）
      setCurrentNoteId(bookId);
      // 记住当前处理的笔记 ID
      localStorage.setItem('inktrace_last_note_id', bookId);
      
      // 延迟加载笔记内容，确保 useEffect 的锁机制先生效
      // 这样可以避免 useEffect 清空我们刚加载的内容
      setTimeout(async () => {
        try {
          const res = await fetch(`${API_BASE}/notes/${bookId}/content`);
          if (res.ok) {
            const data = await res.json();
            console.log('🔥 [API Response] success:', data.success);
            console.log('🔥 [API Response] content length:', data.content?.length);
            console.log('🔥 [API Response] first 200 chars:', data.content?.substring(0, 200));
            
            if (data.success && data.content) {
              console.log('✅ [Before setProcessedMarkdown] Calling setProcessedMarkdown...');
              setProcessedMarkdown(data.content);
              console.log('✅ [After setProcessedMarkdown] State update scheduled');
            }
          }
        } catch (e) {
          console.error('Failed to load note content:', e);
        }
      }, 100);
      
      return;
    }
    
    // 否则触发清洗流程
    setIsProcessing(true);
    setProcessingProgress(0);
    try {
      const res = await fetch(`${API_BASE}/notes/process_book/${bookId}`, { method: 'POST' });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error('❌ [ProcessBook] API错误:', res.status, errorData);
        
        if (res.status === 404) {
          alert(`未找到待处理的笔记数据\n\n可能原因：\n1. 笔记文件不存在\n2. 该笔记已被处理过\n3. 后端数据目录异常\n\n请刷新页面后重试`);
        } else {
          alert(`清洗任务启动失败 (${res.status})\n\n${errorData.detail || '未知错误'}`);
        }
        
        setIsProcessing(false);
        return;
      }
      
      const data = await res.json();
      const jobId = data.job_id;
      
      if (!jobId) {
        console.error('❌ [ProcessBook] 返回数据缺少job_id:', data);
        alert('服务器返回异常：缺少任务ID');
        setIsProcessing(false);
        return;
      }
      
      console.log('✅ [ProcessBook] 任务已创建:', jobId);
      console.log('📚 [ProcessBook] 原著状态:', data.has_source_book ? '✅ 有' : '⚠️ 缺失');
      
      // 检查原著状态
      if (data.has_source_book === false && data.warning_message) {
        // 原著缺失，显示警告对话框
        console.log('⚠️ [ProcessBook] 显示原著缺失警告');
        setSourceBookWarningData({
          jobId,
          bookId,
          warningMessage: data.warning_message
        });
        setShowSourceBookWarning(true);
        // 暂时不开始轮询，等用户确认后再开始
        return;
      }
      
      // 记忆当前任务 ID
      localStorage.setItem('inktrace_active_job', jobId);
      startPolling(jobId);
    } catch (e) {
      console.error('❌ [ProcessBook] 网络错误:', e);
      alert(`网络连接失败\n\n请检查后端服务是否正常运行`);
      setIsProcessing(false);
    }
  };

  // 处理用户选择"继续基础清洗"（无原著）
  const handleContinueWithoutSourceBook = () => {
    if (!sourceBookWarningData) return;
    
    console.log('✅ [ContinueWithoutSource] 用户选择继续基础清洗');
    setShowSourceBookWarning(false);
    
    // 开始轮询任务
    localStorage.setItem('inktrace_active_job', sourceBookWarningData.jobId);
    setIsProcessing(true);
    setProcessingProgress(0);
    startPolling(sourceBookWarningData.jobId);
  };

  // 处理用户选择"取消"
  const handleCancelProcessing = () => {
    console.log('❌ [CancelProcessing] 用户取消清洗');
    setShowSourceBookWarning(false);
    setSourceBookWarningData(null);
    setIsProcessing(false);
  };

  const startPolling = (jobId: string) => {
    console.log('🔄 [startPolling] 开始轮询任务:', jobId);
    const poll = setInterval(async () => {
      try {
        const pollRes = await fetch(`${API_BASE}/notes/status/${jobId}`);
        if (pollRes.status === 404) {
          clearInterval(poll);
          localStorage.removeItem('inktrace_active_job');
          setIsProcessing(false);
          console.warn("⚠️ [Polling] 清洗任务会话已过期（可能由于服务器重启）");
          alert("清洗任务会话已过期\n\n可能原因：服务器重启导致任务丢失\n\n请刷新页面后重新触发清洗");
          return;
        }
        if (!pollRes.ok) {
          console.error('❌ [Polling] API错误:', pollRes.status);
          clearInterval(poll);
          return;
        }
        const pollData = await pollRes.json();
        setProcessingProgress(pollData.progress);
        
        if (pollData.status === 'completed' || pollData.progress === 100) {
          clearInterval(poll);
          localStorage.removeItem('inktrace_active_job');
          const resultNoteId = pollData.result?.note_id || `note_${Date.now()}`;
          const finalMarkdown = pollData.result?.final_markdown || "解析为空";
          
          localStorage.setItem('inktrace_current_note_id', resultNoteId);
          localStorage.setItem('inktrace_last_note_id', resultNoteId);
          
          // 先更新锁，防止 useEffect 清空我们刚加载的内容
          lastLoadedNoteIdRef.current = resultNoteId;
          isLoadingRef.current = true;
          
          setProcessedMarkdown(finalMarkdown);
          setCurrentNoteId(resultNoteId);
          setTimeout(() => {
            setIsProcessing(false);
            setCurrentView('deep-work');
            // 释放锁
            isLoadingRef.current = false;
          }, 800);
        } else if (pollData.status === 'failed') {
          clearInterval(poll);
          localStorage.removeItem('inktrace_active_job');
          setIsProcessing(false);
          const errorMsg = pollData.message || "未知内部错误";
          alert(`清洗任务失败: ${errorMsg}\n\n建议：检查 .env 密钥或网络连接。`);
        }
      } catch (err) {
        console.error(err);
      }
    }, 1000);
  };

  useEffect(() => {
    // 自动恢复未完成的任务
    const savedJobId = localStorage.getItem('inktrace_active_job');
    if (savedJobId) {
      setIsProcessing(true);
      startPolling(savedJobId);
    }
  }, []);

  return (
    <div className="flex h-screen bg-[#F9F9F9] overflow-hidden font-sans text-stone-900 relative">
      {/* 原著缺失警告对话框 */}
      <AnimatePresence>
        {showSourceBookWarning && sourceBookWarningData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) handleCancelProcessing();
            }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", duration: 0.5 }}
              className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-8 space-y-6"
            >
              {/* 标题 */}
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
                  <span className="text-2xl">⚠️</span>
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-stone-800 mb-2">
                    未检测到原著全文
                  </h3>
                  <p className="text-stone-600 text-sm leading-relaxed whitespace-pre-line">
                    {sourceBookWarningData.warningMessage}
                  </p>
                </div>
              </div>

              {/* 影响说明 */}
              <div className="bg-stone-50 rounded-xl p-4 space-y-2">
                <h4 className="font-semibold text-stone-700 text-sm">📚 有原著 vs 无原著</h4>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="space-y-1">
                    <div className="text-emerald-600 font-medium">✅ 完整模式</div>
                    <div className="text-stone-500">• L1 基础清洗</div>
                    <div className="text-stone-500">• L2 文本修复</div>
                    <div className="text-stone-500">• L3 AI深度分析</div>
                    <div className="text-stone-500">• L4 知识网络</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-amber-600 font-medium">⚠️ 基础模式</div>
                    <div className="text-stone-500">• L1 基础清洗</div>
                    <div className="text-stone-400 line-through">• L2 文本修复</div>
                    <div className="text-stone-400 line-through">• L3 AI分析</div>
                    <div className="text-stone-400 line-through">• L4 知识网络</div>
                  </div>
                </div>
              </div>

              {/* 操作按钮 */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleCancelProcessing}
                  className="flex-1 px-6 py-3 rounded-xl border-2 border-stone-200 text-stone-600 font-semibold hover:bg-stone-50 transition-all"
                >
                  取消
                </button>
                <button
                  onClick={handleContinueWithoutSourceBook}
                  className="flex-1 px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold hover:from-amber-600 hover:to-orange-600 transition-all shadow-lg shadow-amber-200"
                >
                  继续基础清洗
                </button>
              </div>

              {/* 提示文字 */}
              <p className="text-xs text-stone-400 text-center">
                💡 您可以稍后将原著文件放到 data/source_books/ 目录，然后重新清洗以启用完整功能
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Global Frosted Overlay (Focus Lock) */}
      <AnimatePresence>
        {activeTerm && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              setActiveTerm(null);
              setActiveBlockId(null);
            }}
            className="fixed inset-0 bg-white/10 backdrop-blur-2xl z-[45] cursor-pointer"
            style={{ WebkitBackdropFilter: 'blur(20px)' }}
          />
        )}
      </AnimatePresence>

      {/* Sidebar Navigation - Hidden in Deep Work */}
      {currentView !== 'deep-work' && (
        <nav className={`w-20 lg:w-64 border-r border-stone-100 flex flex-col bg-white shrink-0 z-30 transition-all duration-700 ${activeTerm ? 'blur-[2px] grayscale opacity-50' : ''}`}>
          <div className="p-8 mb-4">
            <h1 className="text-2xl font-serif font-bold text-primary tracking-tighter">InkTrace</h1>
            <p className="text-[10px] text-stone-400 uppercase tracking-widest mt-1">静心治学</p>
          </div>
          
          <div className="flex-1 px-4 space-y-2">
            <NavItem icon={<LibraryBig size={20} />} label="库" active={currentView === 'library'} onClick={() => setCurrentView('library')} />
            <NavItem icon={<FileText size={20} />} label="深度工作" active={currentView === 'deep-work'} onClick={() => {
              // 切换到深度工作视图，使用上次处理的笔记 ID
              const lastNoteId = localStorage.getItem('inktrace_last_note_id') || 'demo_note';
              setCurrentNoteId(lastNoteId);
              setCurrentView('deep-work');
            }} />
            <NavItem icon={<BookType size={20} />} label="成册" active={currentView === 'assets'} onClick={() => setCurrentView('assets')} />
            <div className="py-4"><div className="h-[1px] bg-stone-100 mx-4" /></div>
            <NavItem icon={<Sliders size={20} />} label="设置" active={currentView === 'settings'} onClick={() => setCurrentView('settings')} />
          </div>

          <div className="p-6 border-t border-stone-50 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center text-stone-400 border border-stone-200">
              <UserCircle size={20} />
            </div>
            <div className="hidden lg:block">
              <p className="text-sm font-bold">逸尘</p>
              <p className="text-[10px] text-stone-400 uppercase">高级研究员</p>
            </div>
          </div>
        </nav>
      )}

      {/* Main Content Area */}
      <main className="flex-1 relative overflow-hidden bg-white">
        <AnimatePresence mode="wait">
          {currentView === 'library' && <LibraryView onBookClick={handleProcessBook} />}
          {currentView === 'deep-work' && (
            <DeepWorkView 
              markdownContent={processedMarkdown}
              setMarkdownContent={setProcessedMarkdown}
              setProcessedMarkdown={setProcessedMarkdown}
              activeTerm={activeTerm} 
              setActiveTerm={setActiveTerm}
              activeBlockId={activeBlockId}
              setActiveBlockId={setActiveBlockId}
              setCurrentView={setCurrentView}
              currentNoteId={currentNoteId}
              setCurrentNoteId={setCurrentNoteId}
              userThoughts={userThoughts}
              setUserThoughts={setUserThoughts}
            />
          )}
          {currentView === 'assets' && <AssetsView key="assets" />}
          {currentView === 'settings' && <SettingsView key="settings" />}
        </AnimatePresence>
      </main>

      {/* Enhanced Processing Overlay */}
      <AnimatePresence>
        {isProcessing && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-white/80 backdrop-blur-2xl flex flex-col items-center justify-center"
          >
            <div className="max-w-md w-full px-10 text-center space-y-12">
              <div className="relative">
                <div className="absolute inset-0 bg-primary/10 blur-3xl rounded-full scale-150 animate-pulse" />
                <div className="relative bg-white w-24 h-24 rounded-[2rem] mx-auto shadow-2xl flex items-center justify-center border border-stone-100">
                  <RefreshCw className="animate-spin text-primary" size={32} strokeWidth={1.5} />
                </div>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <h3 className="font-serif text-2xl font-bold text-stone-800">全链路清洗重塑</h3>
                  <p className="text-primary/70 text-xs font-bold uppercase tracking-[0.2em]">{getStatusMessage(processingProgress)}</p>
                </div>

                {/* Pipeline Steps */}
                <div className="flex justify-between items-center px-4">
                  {[1, 2, 3, 4].map(step => (
                    <div key={step} className="flex flex-col items-center gap-2">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-700 border ${
                        processingProgress >= step * 25 ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20' : 'bg-stone-50 text-stone-300 border-stone-100'
                      }`}>
                        L{step}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="relative h-1.5 w-full bg-stone-100 rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-primary"
                    initial={{ width: 0 }}
                    animate={{ width: `${processingProgress}%` }}
                  />
                </div>
              </div>

              {/* Wisdom Quotes */}
              <AnimatePresence mode="wait">
                <motion.div 
                  key={quoteIndex}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="pt-8 border-t border-stone-100"
                >
                  <p className="font-serif text-stone-600 italic text-[15px] leading-relaxed mb-2">“{quotes[quoteIndex].text}”</p>
                  <p className="text-[10px] text-stone-400 uppercase tracking-widest">—— {quotes[quoteIndex].author}</p>
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NavItem({ active, icon, label, onClick }: { active: boolean, icon: ReactNode, label: string, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center gap-4 px-4 py-3 rounded-lg transition-all duration-300 font-serif antialiased tracking-widest ${
        active 
          ? 'bg-primary/10 text-primary font-bold border-r-4 border-primary' 
          : 'text-stone-400 hover:text-primary hover:bg-primary/5'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

// --- Views ---

function LibraryView({ onBookClick }: { onBookClick: (id: string, status?: string, noteId?: string) => void | Promise<void> }) {
  const [books, setBooks] = useState<any[]>([]);
  const [activeCategory, setActiveCategory] = useState<'all' | 'original' | 'notes'>('all');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadType, setUploadType] = useState<'original' | 'dirty'>('dirty');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchBooks = () => {
    fetch(`${API_BASE}/library/books`)
      .then(res => res.json())
      .then(data => {
        console.log('[LibraryView] Fetched books:', data.books?.length, 'First book hasDeepWorkContent:', data.books?.[0]?.hasDeepWorkContent);
        setBooks(data.books || []);
      })
      .catch(err => console.error("Failed to fetch books", err));
  };

  useEffect(() => {
    fetchBooks();

    // 监听页面可见性变化，当用户返回库页面时重新拉取
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchBooks();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 每 2 秒刷新一次，确保数据最新
    const interval = setInterval(fetchBooks, 2000);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(interval);
    };
  }, []);

  const handleRefresh = async () => {
    try {
      await fetch(`${API_BASE}/library/refresh`, { method: 'POST' });
      fetchBooks();
    } catch (err) {
      console.error("Refresh failed", err);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('type', uploadType);
    formData.append('filename', selectedFile.name);

    try {
      const res = await fetch(`${API_BASE}/upload/file`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (data.success) {
        alert(data.message);
        setShowUploadModal(false);
        setSelectedFile(null);
        fetchBooks();
      } else {
        alert('上传失败: ' + (data.message || '未知错误'));
      }
    } catch (e) {
      console.error('Upload failed:', e);
      alert('上传失败，请检查后端服务');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="h-full overflow-y-auto p-10 max-w-6xl mx-auto"
    >
      <header className="py-12 flex justify-between items-end border-b border-stone-200 mb-8">
        <div>
          <div className="flex items-center gap-4 mb-2">
            <h2 className="text-4xl font-serif font-bold">库</h2>
            <button
              onClick={handleRefresh}
              className="p-2 hover:bg-stone-100 rounded-full transition-all text-stone-400 hover:text-primary active:rotate-180 duration-500"
              title="同步本地数据"
            >
              <RefreshCw size={20} />
            </button>
          </div>
          <p className="text-stone-500">全渠道数据汇聚与初级物理清洗</p>
        </div>
        <div className="flex gap-4">
          <button className="flex items-center gap-2 px-4 py-2 rounded-full border border-stone-200 text-sm hover:bg-stone-50 transition-colors">
            <SlidersHorizontal size={14} />
            <span>类型 / 时间</span>
          </button>
          <button className="flex items-center gap-2 px-4 py-2 rounded-full bg-stone-100 text-sm hover:bg-stone-200 transition-colors">
            <Sliders size={14} />
            <span>熵值排序</span>
          </button>
        </div>
      </header>

      {/* 上传模态框 */}
      <AnimatePresence>
        {showUploadModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[80] flex items-center justify-center"
            onClick={() => !isUploading && setShowUploadModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 m-4"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-serif font-bold">导入文件</h3>
                <button
                  onClick={() => !isUploading && setShowUploadModal(false)}
                  className="p-2 hover:bg-stone-100 rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* 文件类型选择 */}
              <div className="mb-6">
                <label className="text-sm font-medium text-stone-600 mb-3 block">文件类型</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setUploadType('original')}
                    className={`p-4 rounded-2xl border-2 transition-all text-left ${
                      uploadType === 'original'
                        ? 'border-primary bg-primary/5'
                        : 'border-stone-200 hover:border-stone-300'
                    }`}
                  >
                    <BookOpen size={24} className={`mb-2 ${uploadType === 'original' ? 'text-primary' : 'text-stone-400'}`} />
                    <p className={`font-medium ${uploadType === 'original' ? 'text-primary' : 'text-stone-700'}`}>原著全文</p>
                    <p className="text-xs text-stone-500 mt-1">Library</p>
                  </button>
                  <button
                    onClick={() => setUploadType('dirty')}
                    className={`p-4 rounded-2xl border-2 transition-all text-left ${
                      uploadType === 'dirty'
                        ? 'border-primary bg-primary/5'
                        : 'border-stone-200 hover:border-stone-300'
                    }`}
                  >
                    <FileText size={24} className={`mb-2 ${uploadType === 'dirty' ? 'text-primary' : 'text-stone-400'}`} />
                    <p className={`font-medium ${uploadType === 'dirty' ? 'text-primary' : 'text-stone-700'}`}>待处理笔记</p>
                    <p className="text-xs text-stone-500 mt-1">DirtyNotes</p>
                  </button>
                </div>
              </div>

              {/* 文件选择 */}
              <div className="mb-6">
                <label className="text-sm font-medium text-stone-600 mb-3 block">选择文件</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.md"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className={`w-full py-4 rounded-2xl border-2 border-dashed transition-all ${
                    selectedFile
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-stone-300 hover:border-primary hover:bg-primary/5 text-stone-500'
                  }`}
                >
                  {selectedFile ? (
                    <div className="flex items-center justify-center gap-2">
                      <FileCheck size={20} />
                      <span>{selectedFile.name}</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2">
                      <UploadCloud size={20} />
                      <span>点击选择 .txt 或 .md 文件</span>
                    </div>
                  )}
                </button>
                <p className="text-xs text-stone-400 mt-2">支持 .txt、.md 格式，最大 10MB</p>
              </div>

              {/* 上传进度 */}
              {isUploading && (
                <div className="mb-4">
                  <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-primary"
                      initial={{ width: 0 }}
                      animate={{ width: `${uploadProgress}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                  <p className="text-xs text-stone-500 mt-1 text-center">上传中...</p>
                </div>
              )}

              {/* 操作按钮 */}
              <div className="flex gap-3">
                <button
                  onClick={() => setShowUploadModal(false)}
                  disabled={isUploading}
                  className="flex-1 py-3 rounded-xl border border-stone-200 text-stone-600 hover:bg-stone-50 transition-colors disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  onClick={handleUpload}
                  disabled={!selectedFile || isUploading}
                  className="flex-1 py-3 rounded-xl text-white font-medium hover:opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundColor: '#436463' }}
                >
                  {isUploading ? '上传中...' : '确认上传'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-3 space-y-6">
          <div className="glaze-card rounded-2xl p-6 border border-stone-100">
            <h3 className="font-serif text-xl mb-6 border-b border-stone-100 pb-4">数据源</h3>
            <div className="space-y-4">
              {DATA_SOURCES.map(source => (
                <div key={source.id} className="group flex items-center justify-between p-3 rounded-xl hover:bg-stone-50 transition-colors cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                      {source.icon === 'Book' && <BookOpen size={20} />}
                      {source.icon === 'BookOpen' && <LibraryBig size={20} />}
                      {source.icon === 'Tablet' && <Tablet size={20} />}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{source.name}</p>
                      <p className="text-xs text-stone-500">{source.status}</p>
                    </div>
                  </div>
                  {source.status.includes('同步') ? <Cloud size={14} /> : <ChevronRight size={14} />}
                </div>
              ))}
              <div className="pt-4 border-t border-stone-100">
                <button
                  onClick={() => setShowUploadModal(true)}
                  className="w-full py-3 rounded-xl border border-dashed border-stone-300 text-stone-500 hover:bg-stone-50 hover:text-primary hover:border-primary transition-all flex items-center justify-center gap-2 text-sm"
                >
                  <UploadCloud size={16} />
                  <span>+ 导入文件</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-9">
          {/* 分类标签 */}
          <div className="flex gap-2 mb-6">
            {[
              { key: 'all', label: '全部', count: books.length },
              { key: 'original', label: '原著', count: books.filter(b => b.source === 'Library').length },
              { key: 'notes', label: '笔记', count: books.filter(b => b.source === 'Dirty Notes').length },
            ].map(cat => (
              <button
                key={cat.key}
                onClick={() => setActiveCategory(cat.key as any)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  activeCategory === cat.key
                    ? 'bg-primary text-white shadow-lg shadow-primary/20'
                    : 'bg-white text-stone-600 hover:bg-stone-50 border border-stone-200'
                }`}
              >
                {cat.label}
                <span className={`ml-2 text-xs ${activeCategory === cat.key ? 'text-white/70' : 'text-stone-400'}`}>
                  {cat.count}
                </span>
              </button>
            ))}
          </div>

          {/* 书籍网格 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {books
              .filter(book => {
                if (activeCategory === 'original') return book.source === 'Library';
                if (activeCategory === 'notes') return book.source === 'Dirty Notes';
                return true;
              })
              .map(book => (
                <div key={book.id} className="cursor-pointer" onClick={() => onBookClick(book.id, book.status)}>
                  <BookCard
                    title={book.title}
                    author={book.author}
                    source={book.source}
                    progress={book.progress}
                    status={book.status}
                    statusColor={book.statusColor}
                    isError={book.isError}
                    img={book.img}
                    hasDeepWorkContent={book.hasDeepWorkContent}
                  />
                </div>
              ))}
            {books.filter(book => {
              if (activeCategory === 'original') return book.source === 'Library';
              if (activeCategory === 'notes') return book.source === 'Dirty Notes';
              return true;
            }).length === 0 && (
              <div className="col-span-3 text-center py-12 text-stone-400 font-serif">
                <BookOpen className="mx-auto mb-4 opacity-30" size={48} />
                <p>该分类下暂无内容</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function BookCard({ title, author, source, progress, status, statusColor, isError, img, hasDeepWorkContent }: any) {
  return (
    <div className="group glaze-card rounded-2xl overflow-hidden border border-stone-100 hover:shadow-xl transition-all duration-500">
      <div className="h-48 relative overflow-hidden bg-stone-200">
        {img ? (
          <img src={img} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" referrerPolicy="no-referrer" />
        ) : (
          <div className="w-full h-full flex items-center justify-center opacity-20"><BookOpen size={48} /></div>
        )}
        <div className="absolute top-4 right-4 z-20 px-3 py-1 bg-white/80 backdrop-blur-md rounded-full border border-white/20 flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${statusColor}`}></span>
          <span className="text-[10px] font-bold">{status}</span>
        </div>
      </div>
      <div className="p-5 bg-white -mt-8 relative z-10 rounded-t-2xl">
        <div className="flex items-start justify-between mb-1">
          <h4 className="font-serif text-lg truncate flex-1">{title}</h4>
          {hasDeepWorkContent && (
            <div className="ml-2 shrink-0 w-6 h-6 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center" title="已有深度思考">
              <Lightbulb size={12} className="text-amber-500" />
            </div>
          )}
        </div>
        <p className="text-sm text-stone-500 mb-4">{author} · {source}</p>
        <div className="space-y-2">
          <div className="flex justify-between items-end">
            <span className={`text-[10px] uppercase tracking-wider font-bold ${isError ? 'text-red-500' : (hasDeepWorkContent ? 'text-amber-600' : 'text-primary')}`}>
              {isError ? '高熵状态' : (hasDeepWorkContent ? '已深度思考' : (progress === 100 ? '清洗完成' : 'L1 物理清洗中'))}
            </span>
            <span className="text-[10px] text-stone-400">{progress}%</span>
          </div>
          <div className="h-1 w-full bg-stone-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-1000 ${isError ? 'bg-red-500 ' : (hasDeepWorkContent ? 'bg-amber-400' : 'bg-primary')}`} style={{ width: `${progress}%` }}></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DeepWorkView({ 
  markdownContent, 
  setMarkdownContent, 
  setProcessedMarkdown,
  activeTerm, 
  setActiveTerm, 
  activeBlockId, 
  setActiveBlockId, 
  setCurrentView, 
  currentNoteId, 
  setCurrentNoteId,
  userThoughts,
  setUserThoughts
}: any) {
  const [semanticData, setSemanticData] = useState<any>(null);
  const [isLoadingSemantic, setIsLoadingSemantic] = useState(false);
  const [pinnedIndices, setPinnedIndices] = useState<Set<number>>(new Set());
  const dialogueRef = useRef<HTMLDivElement>(null);

  // 使用 ref 来防止 React StrictMode 导致的重复加载
  const isLoadingRef = useRef(false);
  const lastLoadedNoteIdRef = useRef('');

  const [isExporting, setIsExporting] = useState(false);
  const [showExportOptions, setShowExportOptions] = useState(false);
  const [exportConfig, setExportConfig] = useState({
    includeOriginal: true,
    includeSemantic: true,
    includeChat: true,
    includeThoughts: true
  });
  const exportOptionsRef = useRef<HTMLDivElement>(null);

  // 腾讯文档授权状态
  const [tencentAuthStatus, setTencentAuthStatus] = useState<{authorized: boolean; open_id?: string} | null>(null);
  const [isSyncingToTencent, setIsSyncingToTencent] = useState(false);

  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<any[]>([]);
  const [isChatting, setIsChatting] = useState(false);

  // L4 语义搜索状态
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showSearchPanel, setShowSearchPanel] = useState(false);

  const [showRestoreToast, setShowRestoreToast] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const saveTimeoutRef = useRef<number | null>(null);

  // 钉入L4深度思考卡片
  const handlePinThought = (thoughtId: number) => {
    setUserThoughts(prevThoughts => 
      prevThoughts.map(thought => 
        thought.id === thoughtId 
          ? { ...thought, type: thought.type === 'pinned' ? 'user' : 'pinned' }
          : thought
      )
    );
    
    // 自动保存
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = window.setTimeout(() => {
       handleSaveThought();
     }, 1000);
  };

  // 钉入L4语义网络卡片
  const handlePinSemanticCard = async (item: any, idx: number) => {
    const semanticCard = {
      id: Date.now() + idx,
      content: `${item.term}: ${item.note}`,
      question: item.term,
      answer: item.note,
      createdAt: new Date().toLocaleString('zh-CN'),
      type: 'pinned',
      blockId: activeBlockId,        // 关联当前段落
      paragraphIndex: 0              // 段落位置索引
    };

    const updatedThoughts = [semanticCard, ...userThoughts];
    setUserThoughts(updatedThoughts);

    try {
      const sessionData = {
        user_id: "default_user",
        note_id: currentNoteId,
        chat_history: chatHistory.map(msg => ({
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp || new Date().toISOString()
        })),
        right_cards: updatedThoughts.map((card, index) => ({
          id: card.id.toString(),
          type: card.type,
          content: card.content || card.answer || '',
          title: card.question || card.title || '',
          pinned: card.type === 'pinned',
          order: index,
          block_id: card.blockId || null,        // 新增段落关联
          paragraph_index: card.paragraphIndex || 0
        })),
        final_markdown: markdownContent
      };

      await fetch(`${API_BASE}/deepwork/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionData)
      });
    } catch (e) {
      console.error("Failed to save pinned semantic card:", e);
    }
  };

   const [showThoughtModal, setShowThoughtModal] = useState(false);
  const [newThought, setNewThought] = useState('');
  const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 });
  const [modalSize, setModalSize] = useState({ width: 400, height: 320 });
  const modalRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const isResizingRef = useRef(false);

  // 文本划选相关状态
  const [selectedText, setSelectedText] = useState('');
  const [showSelectionMenu, setShowSelectionMenu] = useState(false);
  const [selectionMenuPos, setSelectionMenuPos] = useState({ x: 0, y: 0 });
  const selectionMenuRef = useRef<HTMLDivElement>(null);

  const saveSession = async (saveNoteId: string, thoughtsToSave = userThoughts, chatToSave = chatHistory, markdownToSave = markdownContent) => {
    console.log('[saveSession] Saving for note:', saveNoteId, 'thoughts count:', thoughtsToSave.length);
    try {
      const sessionData = {
        user_id: "default_user",
        note_id: saveNoteId,
        chat_history: chatToSave.map(msg => ({
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp || new Date().toISOString()
        })),
        right_cards: thoughtsToSave.map((card, index) => ({
          id: card.id.toString(),
          type: card.type,
          content: card.content || card.answer || '',
          title: card.question || card.title || '',
          pinned: card.type === 'pinned',
          order: index
        })),
        final_markdown: markdownToSave
      };
      
      console.log('[saveSession] Session data:', sessionData);

      const res = await fetch(`${API_BASE}/deepwork/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionData)
      });
      const data = await res.json();
      console.log('[saveSession] Save response:', data);
      
      // 保存成功后，记住当前处理的笔记 ID
      if (data.success) {
        localStorage.setItem('inktrace_last_note_id', saveNoteId);
      }
    } catch (e) {
      console.error("[saveSession] Failed to save session:", e);
    }
  };

  const restoreSession = async (targetNoteId: string) => {
    console.log('[restoreSession] Starting restore for note:', targetNoteId);
    try {
      setIsRestoring(true);
      const response = await fetch(`${API_BASE}/deepwork/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: "default_user",
          note_id: targetNoteId
        })
      });
      const data = await response.json();
      console.log('[restoreSession] Response:', data);
      
      if (data.success && data.data) {
        const { chat_history, right_cards, final_markdown } = data.data;
        console.log('[restoreSession] right_cards:', right_cards);
        
        // 恢复 markdown 内容 - 只有当当前没有内容时才从 session 恢复
        // 这样可以保留从 API 加载的最新数据（包含 L3 数据）
        if (final_markdown && !markdownContent) {
          setProcessedMarkdown(final_markdown);
        }
        
        if (chat_history && chat_history.length > 0) {
          setChatHistory(chat_history);
        } else {
          setChatHistory([]);
        }
        
        if (right_cards && right_cards.length > 0) {
          const restoredThoughts = right_cards.map((card: any) => ({
            id: parseInt(card.id) || Date.now(),
            content: card.content,
            question: card.title,
            answer: card.content,
            createdAt: new Date().toLocaleString('zh-CN'),
            type: card.pinned ? 'pinned' : card.type || 'user'
          }));
          console.log('[restoreSession] Restored thoughts:', restoredThoughts);
          setUserThoughts(restoredThoughts);
        } else {
          console.log('[restoreSession] No thoughts to restore');
          setUserThoughts([]);
        }
        
        setShowRestoreToast(true);
        setTimeout(() => setShowRestoreToast(false), 2000);
      } else {
        console.log('[restoreSession] No data found, clearing state');
        setChatHistory([]);
        setUserThoughts([]);
        // 不要清空 processedMarkdown，因为笔记内容可能已经通过 get_note_content 加载了
      }
    } catch (e) {
      console.error("[restoreSession] Failed to restore session:", e);
      setChatHistory([]);
      setUserThoughts([]);
      // 不要清空 processedMarkdown
    } finally {
      setIsRestoring(false);
    }
  };

  // 使用 ref 来防止 React StrictMode 导致的重复加载
  // 使用 ref 来防止 React StrictMode 导致的重复加载（已在上方定义）

  useEffect(() => {
    const performSwitchNote = async () => {
      // 如果正在加载中，或者已经加载过这个笔记，跳过
      if (isLoadingRef.current || lastLoadedNoteIdRef.current === currentNoteId) {
        return;
      }

      // 如果有旧笔记且旧笔记不是当前笔记，先保存旧笔记
      if (lastLoadedNoteIdRef.current && lastLoadedNoteIdRef.current !== currentNoteId) {
        if (userThoughts.length > 0 || chatHistory.length > 0) {
          await saveSession(lastLoadedNoteIdRef.current);
        }
      }
      
      // 标记开始加载
      isLoadingRef.current = true;
      
      // 清空状态
      setSemanticData(null);
      setChatHistory([]);
      setUserThoughts([]);
      setPinnedIndices(new Set());
      setActiveTerm(null);
      setActiveBlockId(null);
      setProcessedMarkdown(null);
      
      // 加载新笔记
      await restoreSession(currentNoteId);
      
      // 更新已加载的笔记ID，并释放锁
      lastLoadedNoteIdRef.current = currentNoteId;
      isLoadingRef.current = false;
    };
    
    performSwitchNote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentNoteId]);

  // 当点击不同段落时，只清空对话，不切换思考卡片（按笔记隔离）
  useEffect(() => {
    if (activeBlockId !== null) {
      setChatHistory([]);
      setPinnedIndices(new Set());
    }
  }, [activeBlockId]);

  // 组件卸载时保存当前状态
  useEffect(() => {
    return () => {
      // 只有在有数据时才保存，避免空状态覆盖已有数据
      if (userThoughts.length === 0 && chatHistory.length === 0) return;
      
      // 同步保存当前笔记状态
      const sessionData = {
        user_id: "default_user",
        note_id: currentNoteId,
        chat_history: chatHistory.map(msg => ({
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp || new Date().toISOString()
        })),
        right_cards: userThoughts.map((card, index) => ({
          id: card.id.toString(),
          type: card.type,
          content: card.content || card.answer || '',
          title: card.question || card.title || '',
          pinned: card.type === 'pinned',
          order: index
        }))
      };
      // 使用 sendBeacon 确保在页面关闭时也能发送
      const blob = new Blob([JSON.stringify(sessionData)], { type: 'application/json' });
      navigator.sendBeacon?.(`${API_BASE}/deepwork/save`, blob);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = window.setTimeout(() => {
      // 只有在有数据时才保存，避免空状态覆盖已有数据
      if (userThoughts.length > 0 || chatHistory.length > 0) {
        saveSession(currentNoteId);
      }
    }, 5000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [chatHistory, userThoughts, currentNoteId]);

  // 点击外部关闭导出选项
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportOptionsRef.current && !exportOptionsRef.current.contains(e.target as Node)) {
        setShowExportOptions(false);
      }
    };
    if (showExportOptions) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showExportOptions]);

  // 检查腾讯文档授权状态
  useEffect(() => {
    const checkTencentAuth = async () => {
      try {
        const res = await fetch(`${API_BASE}/export/tencent/status`);
        const data = await res.json();
        setTencentAuthStatus(data);
      } catch (e) {
        console.error('检查腾讯文档授权状态失败:', e);
      }
    };
    checkTencentAuth();
  }, []);

  // 监听文本划选事件
  useEffect(() => {
    const handleMouseUp = (e: MouseEvent) => {
      const selection = window.getSelection();
      const text = selection?.toString().trim();
      
      if (text && text.length > 0) {
        const range = selection?.getRangeAt(0);
        const rect = range?.getBoundingClientRect();
        
        if (rect) {
          setSelectedText(text);
          setSelectionMenuPos({
            x: rect.left + rect.width / 2,
            y: rect.top - 10
          });
          setShowSelectionMenu(true);
        }
      } else {
        setShowSelectionMenu(false);
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (selectionMenuRef.current && !selectionMenuRef.current.contains(e.target as Node)) {
        setShowSelectionMenu(false);
      }
    };

    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSelectionThink = () => {
    setShowSelectionMenu(false);
    setNewThought(`「${selectedText}」\n\n我的思考：\n`);
    setShowThoughtModal(true);
    window.getSelection()?.removeAllRanges();
  };

  const handleOpenThoughtModal = () => {
    setNewThought('');
    setDragPosition({ 
      x: window.innerWidth / 2 - 200, 
      y: window.innerHeight / 2 - 160 
    });
    setModalSize({ width: 400, height: 320 });
    setShowThoughtModal(true);
  };

  const handleCloseThoughtModal = () => {
    setShowThoughtModal(false);
    isDraggingRef.current = false;
    isResizingRef.current = false;
  };

  const handleResizeStart = (e: MouseEvent) => {
    e.stopPropagation();
    isResizingRef.current = true;
    
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = modalSize.width;
    const startHeight = modalSize.height;

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      const newWidth = Math.max(300, Math.min(startWidth + (e.clientX - startX), 600));
      const newHeight = Math.max(220, Math.min(startHeight + (e.clientY - startY), 520));
      setModalSize({ width: newWidth, height: newHeight });
    };

    const handleMouseUp = () => {
      isResizingRef.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleSaveThought = async () => {
    if (!newThought.trim()) return;
    
    const thought = {
      id: Date.now(),
      content: newThought,
      createdAt: new Date().toLocaleString('zh-CN'),
      type: 'user',
      blockId: activeBlockId,        // 新增：关联段落ID
      paragraphIndex: 0              // 新增：段落位置索引
    };
    
    const updatedThoughts = [thought, ...userThoughts];
    setUserThoughts(updatedThoughts);
    setShowThoughtModal(false);
    setNewThought('');

    try {
      const sessionData = {
        user_id: "default_user",
        note_id: currentNoteId,
        chat_history: chatHistory.map(msg => ({
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp || new Date().toISOString()
        })),
        right_cards: updatedThoughts.map((card, index) => ({
          id: card.id.toString(),
          type: card.type,
          content: card.content || card.answer || '',
          title: card.question || card.title || '',
          pinned: card.type === 'pinned',
          order: index
        })),
        final_markdown: markdownContent
      };
      console.log('[handleSaveThought] Saving session:', sessionData);

      const res = await fetch(`${API_BASE}/deepwork/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionData)
      });
      const data = await res.json();
      console.log('[handleSaveThought] Save response:', data);
      alert('保存成功！');
    } catch (e) {
      console.error("[handleSaveThought] Failed to save thought:", e);
      alert('保存失败！');
    }
  };

  const handleDeleteThought = async (id: number) => {
    const updatedThoughts = userThoughts.filter(t => t.id !== id);
    setUserThoughts(updatedThoughts);

    try {
      const sessionData = {
        user_id: "default_user",
        note_id: currentNoteId,
        chat_history: chatHistory.map(msg => ({
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp || new Date().toISOString()
        })),
        right_cards: updatedThoughts.map((card, index) => ({
          id: card.id.toString(),
          type: card.type,
          content: card.content || card.answer || '',
          title: card.question || card.title || '',
          pinned: card.type === 'pinned',
          order: index
        }))
      };

      await fetch(`${API_BASE}/deepwork/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionData)
      });
    } catch (e) {
      console.error("Failed to save after delete:", e);
    }
  };

  const handlePinChat = async (msgIndex: number) => {
    if (pinnedIndices.has(msgIndex)) return;
    
    const msg = chatHistory[msgIndex];
    if (!msg || msg.role !== 'assistant') return;

    const question = chatHistory[msgIndex - 1]?.content || "快速提取";
    const answer = msg.content;

    const pinnedCard = {
      id: Date.now(),
      question,
      answer,
      createdAt: new Date().toLocaleString('zh-CN'),
      type: 'pinned'
    };

    const updatedThoughts = [pinnedCard, ...userThoughts];
    setUserThoughts(updatedThoughts);
    setPinnedIndices(prev => new Set(prev).add(msgIndex));

    try {
      const sessionData = {
        user_id: "default_user",
        note_id: currentNoteId,
        chat_history: chatHistory.map(msg => ({
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp || new Date().toISOString()
        })),
        right_cards: updatedThoughts.map((card, index) => ({
          id: card.id.toString(),
          type: card.type,
          content: card.content || card.answer || '',
          title: card.question || card.title || '',
          pinned: card.type === 'pinned',
          order: index
        }))
      };

      await fetch(`${API_BASE}/deepwork/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionData)
      });
    } catch (e) {
      console.error("Failed to save pinned:", e);
    }
  };

  const handleMouseDown = (e: MouseEvent) => {
    isDraggingRef.current = true;
    const modal = modalRef.current;
    if (!modal) return;
    
    const rect = modal.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    const currentWidth = modalSize.width;
    const currentHeight = modalSize.height;

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const newX = Math.max(0, Math.min(e.clientX - offsetX, window.innerWidth - currentWidth));
      const newY = Math.max(0, Math.min(e.clientY - offsetY, window.innerHeight - currentHeight));
      setDragPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleSemanticSearch = async () => {
    if (!searchQuery.trim() || isSearching) return;
    
    setIsSearching(true);
    setSearchResults([]);
    
    try {
      const res = await fetch(`${API_BASE}/search/semantic?q=${encodeURIComponent(searchQuery)}&top_k=5&enable_ai_rerank=true`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setSearchResults(data.results || []);
        }
      }
    } catch (e) {
      console.error('L4语义搜索失败:', e);
    } finally {
      setIsSearching(false);
    }
  };

  const handleTermClick = async (rawBlock: string, idx: number) => {
    if (activeBlockId === idx && activeTerm) {
      setActiveTerm(null);
      setActiveBlockId(null);
      return;
    }

    setActiveBlockId(idx);
    setChatHistory([]);
    setChatInput("");

    // 尝试从块中解析预生成的 L3 数据
    const l3Match = rawBlock.match(/<!-- L3_DATA_START([\s\S]*?)L3_DATA_END -->/);
    if (l3Match) {
      const l3Raw = l3Match[1].trim();
      const data: any = {};
      l3Raw.split('\n').forEach(line => {
        const firstColonIndex = line.indexOf(': ');
        if (firstColonIndex !== -1) {
          const key = line.substring(0, firstColonIndex).trim();
          const val = line.substring(firstColonIndex + 2).trim();
          if (key) data[key] = val;
        }
      });

      const network = data.network ? data.network.split(' | ').map((item: string) => {
        const splitIdx = item.indexOf(':');
        if (splitIdx !== -1) {
          const term = item.substring(0, splitIdx).trim();
          let note = item.substring(splitIdx + 1).trim();
          if (note.toLowerCase() === 'none' || !note) note = "深度关联逻辑待补充";
          return { term, note };
        }
        return { term: item, note: "深度关联逻辑待补充" };
      }) : [];

      const refs = data.references ? data.references.split(' , ').map((item: string) => {
        const parts = item.split('|');
        return { title: parts[0], url: parts[1] };
      }) : [];

      const savedDialogues = data.pinned_dialogues ? data.pinned_dialogues.split(' || ').map((item: string) => {
        const parts = item.split('|');
        return { q: parts[0], a: parts[1] };
      }) : [];

      setSemanticData({
        term: data.term || "深度溯源",
        explanation: data.explanation || "暂无详细解释",
        contextual_implication: data.context || "暂无上下文暗示",
        cognitive_extension: data.cognitive || "暂无思维推演",
        semantic_network: network,
        tags: data.tags ? data.tags.split(', ') : [],
        reference_urls: refs,
        saved_dialogues: savedDialogues
      });
      setActiveTerm(data.term || "Semantic Analysis");
      setIsLoadingSemantic(false);
      return;
    }

    setActiveTerm("Deep Analysis");
    setIsLoadingSemantic(true);
    try {
      const res = await fetch(`${API_BASE}/notes/demo_note/semantic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ term: "Deep Analysis", text: rawBlock })
      });
      const data = await res.json();
      
      const network = data.semantic_network ? data.semantic_network.map((item: any) => ({
        term: item.term || item,
        note: (item.note && item.note.toLowerCase() !== 'none') ? item.note : "深度关联逻辑待补充"
      })) : [];

      setSemanticData({
        ...data,
        term: data.distilled_title || data.term,
        contextual_implication: data.contextual_implication || data.explanation,
        semantic_network: network,
        cognitive_extension: data.cognitive_extension || data.cognitive,
        saved_dialogues: []
      });
      setActiveTerm(data.distilled_title || data.term || "Analysis");
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingSemantic(false);
    }
  };

  const handleSendChat = async () => {
    if (!chatInput.trim() || isChatting) return;
    
    const newMsg = { role: 'user', content: chatInput };
    setChatHistory(prev => [...prev, newMsg]);
    setChatInput('');
    setIsChatting(true);

    try {
      const bookTitle = 
        markdownContent.match(/book:\s*(.+)/)?.[1]?.trim() || 
        markdownContent.match(/《(.+?)》/)?.[1]?.trim() || 
        "未知书籍";

      const payload = {
        book_title: bookTitle,
        note_id: currentNoteId,
        highlighted_text: activeTerm || "无上下文",
        message: newMsg.content,
        history: chatHistory
      };
      
      const res = await fetch(`${API_BASE}/notes/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      const fullReply = data.reply;
      
      // --- 模拟打字机效果 ---
      let currentText = "";
      setChatHistory(prev => [...prev, { role: 'assistant', content: "" }]); // 先加一个空消息占位
      
      const typingInterval = setInterval(() => {
        if (currentText.length < fullReply.length) {
          currentText += fullReply[currentText.length];
          setChatHistory(prev => {
            const newHistory = [...prev];
            newHistory[newHistory.length - 1] = { role: 'assistant', content: currentText };
            return newHistory;
          });
        } else {
          clearInterval(typingInterval);
          setIsChatting(false);
        }
      }, 30); // 每 30ms 弹出一个字
    } catch (e) {
      console.error(e);
      setChatHistory(prev => [...prev, { role: 'assistant', content: "系统连接异常，请重试。" }]);
      setIsChatting(false);
    }
  };

  const handleSummarize = async (originalContent: string) => {
    if (isChatting) return;
    
    setIsChatting(true);
    const summaryPrompt = `针对你刚才的这段回答，请进行“精萃提取”。
要求：删除冗余修辞，用最凝练的语言（如要点形式或一句话）概括其核心精髓。
回答内容：\n${originalContent}`;

    try {
      const bookTitle = 
        markdownContent.match(/book:\s*(.+)/)?.[1]?.trim() || 
        markdownContent.match(/《(.+?)》/)?.[1]?.trim() || 
        "未知书籍";

      const res = await fetch(`${API_BASE}/notes/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          book_title: bookTitle,
          note_id: currentNoteId,
        highlighted_text: activeTerm || "无上下文",
        message: summaryPrompt,
        history: chatHistory
        })
      });
      const data = await res.json();
      const fullReply = data.reply;
      
      let currentText = "";
      setChatHistory(prev => [...prev, { role: 'assistant', content: "", isDigest: true }]);
      
      const typingInterval = setInterval(() => {
        if (currentText.length < fullReply.length) {
          currentText += fullReply[currentText.length];
          setChatHistory(prev => {
            const newHistory = [...prev];
            newHistory[newHistory.length - 1] = { role: 'assistant', content: currentText, isDigest: true };
            return newHistory;
          });
        } else {
          clearInterval(typingInterval);
          setIsChatting(false);
        }
      }, 20);
    } catch (e) {
      console.error(e);
      setIsChatting(false);
    }
  };

  const handleSaveDialogue = async (q: string, a: string, msgIndex: number) => {
    try {
      // 保存整个会话，而不是单独的对话
      const sessionData = {
        user_id: "default_user",
        note_id: currentNoteId,
        chat_history: chatHistory.map(msg => ({
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp || new Date().toISOString()
        })),
        right_cards: userThoughts.map((card, index) => ({
          id: card.id.toString(),
          type: card.type,
          content: card.content || card.answer || '',
          title: card.question || card.title || '',
          pinned: card.type === 'pinned',
          order: index
        })),
        final_markdown: markdownContent
      };
      
      const res = await fetch(`${API_BASE}/deepwork/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionData)
      });
      if (res.ok) {
        // 1. 更新局部显示
        setSemanticData((prev: any) => ({
          ...prev,
          saved_dialogues: [...(prev.saved_dialogues || []), { q, a }]
        }));
        setPinnedIndices(prev => new Set(prev).add(msgIndex));

        // 2. 滚动到灵感区
        setTimeout(() => {
          dialogueRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
    } catch (e) {
      console.error("Save dialogue error:", e);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const lines: string[] = [];
      const now = new Date();
      const dateStr = now.toLocaleString('zh-CN');

      // 标题
      lines.push(`# 📚 InkTrace 笔记导出`);
      lines.push(`\n> 导出时间：${dateStr}`);
      lines.push(`> 笔记 ID：${currentNoteId}`);
      lines.push(`---\n`);

      // 1. 笔记原文
      if (exportConfig.includeOriginal && markdownContent) {
        lines.push(`# 笔记原文`);
        lines.push(`\n${markdownContent}\n`);
        lines.push(`---\n`);
      }

      // 2. AI 深度解析 (semanticData)
      if (exportConfig.includeSemantic && semanticData) {
        lines.push(`# AI 深度解析`);
        if (semanticData.term) {
          lines.push(`\n## ${semanticData.term}`);
        }
        if (semanticData.contextual_implication) {
          lines.push(`\n** contextual_implication**\n\n${semanticData.contextual_implication}\n`);
        }
        if (semanticData.cognitive_extension) {
          lines.push(`**💡 认知延伸**\n\n${semanticData.cognitive_extension}\n`);
        }
        if (semanticData.semantic_network && semanticData.semantic_network.length > 0) {
          lines.push(`**🔗 语义网络**\n`);
          semanticData.semantic_network.forEach((item: any) => {
            const term = typeof item === 'string' ? item : item.term;
            const note = typeof item === 'string' ? '' : item.note;
            if (note) {
              lines.push(`- **${term}**：${note}`);
            } else {
              lines.push(`- ${term}`);
            }
          });
          lines.push('');
        }
        if (semanticData.reference_urls && semanticData.reference_urls.length > 0) {
          lines.push(`**📚 延伸阅读**\n`);
          semanticData.reference_urls.forEach((ref: any) => {
            const title = typeof ref === 'string' ? ref : ref.title;
            const url = typeof ref === 'string' ? '' : ref.url;
            if (url) {
              lines.push(`- [${title}](${url})`);
            } else {
              lines.push(`- ${title}`);
            }
          });
          lines.push('');
        }
        lines.push(`---\n`);
      }

      // 3. 深度对话记录
      if (exportConfig.includeChat && chatHistory.length > 0) {
        lines.push(`# 深度对话记录`);
        lines.push('');
        chatHistory.forEach((msg, index) => {
          if (msg.role === 'user') {
            lines.push(`**👤 提问 ${Math.floor(index / 2) + 1}**：${msg.content}\n`);
          } else if (msg.role === 'assistant') {
            lines.push(`**🤖 回答**：\n\n${msg.content}\n`);
          }
        });
        lines.push(`---\n`);
      }

      // 4. 我的思考卡片
      if (exportConfig.includeThoughts && userThoughts.length > 0) {
        lines.push(`# 我的思考卡片`);
        lines.push('');
        userThoughts.forEach((thought, index) => {
          lines.push(`## 思考 ${index + 1}`);
          if (thought.question || thought.title) {
            lines.push(`\n**问题**：${thought.question || thought.title}\n`);
          }
          const content = thought.content || thought.answer || '';
          lines.push(`${content}\n`);
          if (thought.createdAt) {
            lines.push(`*创建于：${thought.createdAt}*`);
          }
          lines.push('');
        });
        lines.push(`---\n`);
      }

      // 如果没有选择任何内容
      if (lines.length <= 4) {
        lines.push('*未选择任何导出内容，请在导出选项中勾选要包含的模块。*');
      }

      const mdContent = lines.join('\n');
      const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const today = now.toISOString().slice(0, 10).replace(/-/g, '');
      a.download = `InkTrace_笔记_${currentNoteId}_${today}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setShowExportOptions(false);
    } catch (e) {
      console.error('Export error:', e);
      alert('导出失败，请重试。');
    } finally {
      setIsExporting(false);
    }
  };

  // 腾讯文档授权 - 直接访问后端路由，后端会重定向到腾讯授权页
  const handleTencentAuth = () => {
    window.location.href = `${API_BASE}/export/tencent/auth`;
  };

  // 同步到腾讯文档
  const handleSyncToTencent = async () => {
    if (!tencentAuthStatus?.authorized) {
      alert('请先完成腾讯文档授权');
      return;
    }

    setIsSyncingToTencent(true);
    try {
      // 生成与导出相同的 Markdown 内容
      const lines: string[] = [];
      const now = new Date();
      const dateStr = now.toLocaleString('zh-CN');

      lines.push(`# 📚 InkTrace 笔记导出`);
      lines.push(`\n> 导出时间：${dateStr}`);
      lines.push(`> 笔记 ID：${currentNoteId}`);
      lines.push(`---\n`);

      if (exportConfig.includeOriginal && markdownContent) {
        lines.push(`# 笔记原文`);
        lines.push(`\n${markdownContent}\n`);
        lines.push(`---\n`);
      }

      if (exportConfig.includeSemantic && semanticData) {
        lines.push(`# AI 深度解析`);
        if (semanticData.term) {
          lines.push(`\n## ${semanticData.term}`);
        }
        if (semanticData.contextual_implication) {
          lines.push(`\n**深度解析**\n\n${semanticData.contextual_implication}\n`);
        }
        if (semanticData.cognitive_extension) {
          lines.push(`**认知延伸**\n\n${semanticData.cognitive_extension}\n`);
        }
        if (semanticData.semantic_network && semanticData.semantic_network.length > 0) {
          lines.push(`**语义网络**\n`);
          semanticData.semantic_network.forEach((item: any) => {
            const term = typeof item === 'string' ? item : item.term;
            const note = typeof item === 'string' ? '' : item.note;
            if (note) {
              lines.push(`- **${term}**：${note}`);
            } else {
              lines.push(`- ${term}`);
            }
          });
          lines.push('');
        }
        if (semanticData.reference_urls && semanticData.reference_urls.length > 0) {
          lines.push(`**延伸阅读**\n`);
          semanticData.reference_urls.forEach((ref: any) => {
            const title = typeof ref === 'string' ? ref : ref.title;
            const url = typeof ref === 'string' ? '' : ref.url;
            if (url) {
              lines.push(`- [${title}](${url})`);
            } else {
              lines.push(`- ${title}`);
            }
          });
          lines.push('');
        }
        lines.push(`---\n`);
      }

      if (exportConfig.includeChat && chatHistory.length > 0) {
        lines.push(`# 深度对话记录`);
        lines.push('');
        chatHistory.forEach((msg, index) => {
          if (msg.role === 'user') {
            lines.push(`**提问 ${Math.floor(index / 2) + 1}**：${msg.content}\n`);
          } else if (msg.role === 'assistant') {
            lines.push(`**回答**：\n\n${msg.content}\n`);
          }
        });
        lines.push(`---\n`);
      }

      if (exportConfig.includeThoughts && userThoughts.length > 0) {
        lines.push(`# 我的思考卡片`);
        lines.push('');
        userThoughts.forEach((thought, index) => {
          lines.push(`## 思考 ${index + 1}`);
          if (thought.question || thought.title) {
            lines.push(`\n**问题**：${thought.question || thought.title}\n`);
          }
          const content = thought.content || thought.answer || '';
          lines.push(`${content}\n`);
          if (thought.createdAt) {
            lines.push(`*创建于：${thought.createdAt}*`);
          }
          lines.push('');
        });
        lines.push(`---\n`);
      }

      const mdContent = lines.join('\n');
      const title = `InkTrace笔记_${currentNoteId}_${now.toISOString().slice(0, 10).replace(/-/g, '')}`;

      const res = await fetch(`${API_BASE}/export/tencent/doc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content: mdContent })
      });

      const data = await res.json();
      if (data.success && data.share_link) {
        alert(`同步成功！\n文档链接：${data.share_link}`);
        window.open(data.share_link, '_blank');
      } else {
        alert('同步失败：' + (data.detail || '未知错误'));
      }
    } catch (e) {
      console.error('同步到腾讯文档失败:', e);
      alert('同步失败，请检查后端服务或重新授权。');
    } finally {
      setIsSyncingToTencent(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="h-full flex paper-texture"
    >
      <header className="fixed top-0 right-0 left-0 h-14 bg-white/10 backdrop-blur-sm z-[60] flex justify-between items-center px-8 lg:px-12">
        <button onClick={async () => {
          // 只有在有数据时才保存，避免空状态覆盖已有数据
          if (userThoughts.length > 0 || chatHistory.length > 0) {
            await saveSession(currentNoteId);
          }
          setCurrentView('library');
        }} className="flex items-center gap-2 text-stone-400 hover:text-primary transition-all group">
          <ChevronLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
          <span className="text-xs font-bold uppercase tracking-widest">文库</span>
        </button>
        <div className="relative">
          <button
            onClick={() => setShowExportOptions(!showExportOptions)}
            disabled={isExporting}
            className="flex items-center gap-2 bg-primary/5 text-primary/60 text-[10px] px-5 py-2 rounded-full font-bold hover:bg-primary hover:text-white transition-all uppercase tracking-[0.2em] border border-primary/10 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExporting ? (
              <><span className="animate-spin inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full" />生成中...</>
            ) : '导出笔记'}
          </button>

          {/* 导出配置弹窗 */}
          {showExportOptions && (
            <motion.div
              ref={exportOptionsRef}
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              className="absolute right-0 top-full mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-stone-100 p-5 z-[70]"
            >
              <h4 className="text-xs font-bold text-stone-700 mb-4 uppercase tracking-widest">导出内容</h4>
              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={exportConfig.includeOriginal}
                    onChange={(e) => setExportConfig(prev => ({ ...prev, includeOriginal: e.target.checked }))}
                    className="w-4 h-4 rounded border-stone-200 text-primary focus:ring-primary/20"
                  />
                  <span className="text-sm text-stone-600 group-hover:text-stone-900 transition-colors">笔记原文</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={exportConfig.includeSemantic}
                    onChange={(e) => setExportConfig(prev => ({ ...prev, includeSemantic: e.target.checked }))}
                    className="w-4 h-4 rounded border-stone-200 text-primary focus:ring-primary/20"
                  />
                  <span className="text-sm text-stone-600 group-hover:text-stone-900 transition-colors">AI 深度解析</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={exportConfig.includeChat}
                    onChange={(e) => setExportConfig(prev => ({ ...prev, includeChat: e.target.checked }))}
                    className="w-4 h-4 rounded border-stone-200 text-primary focus:ring-primary/20"
                  />
                  <span className="text-sm text-stone-600 group-hover:text-stone-900 transition-colors">深度对话记录</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={exportConfig.includeThoughts}
                    onChange={(e) => setExportConfig(prev => ({ ...prev, includeThoughts: e.target.checked }))}
                    className="w-4 h-4 rounded border-stone-200 text-primary focus:ring-primary/20"
                  />
                  <span className="text-sm text-stone-600 group-hover:text-stone-900 transition-colors">我的思考卡片</span>
                </label>
              </div>
              <div className="mt-5 pt-4 border-t border-stone-100 flex gap-2">
                <button
                  onClick={() => setShowExportOptions(false)}
                  className="flex-1 py-2 text-xs text-stone-500 hover:text-stone-700 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleExport}
                  disabled={isExporting}
                  className="flex-1 py-2 text-white text-xs rounded-full font-bold hover:opacity-90 transition-colors disabled:opacity-50"
                  style={{ backgroundColor: '#436463' }}
                >
                  确认导出
                </button>
              </div>

              {/* 腾讯文档同步区域 */}
              <div className="mt-4 pt-4 border-t border-stone-100">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">云端同步</span>
                  {tencentAuthStatus?.authorized ? (
                    <span className="text-[10px] text-green-500 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                      已授权
                    </span>
                  ) : (
                    <span className="text-[10px] text-stone-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-stone-300" />
                      未授权
                    </span>
                  )}
                </div>
                {tencentAuthStatus?.authorized ? (
                  <button
                    onClick={handleSyncToTencent}
                    disabled={isSyncingToTencent}
                    className="w-full py-2.5 bg-[#00A4FF]/10 text-[#00A4FF] text-xs rounded-full font-bold hover:bg-[#00A4FF] hover:text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isSyncingToTencent ? (
                      <><span className="animate-spin inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full" />同步中...</>
                    ) : (
                      <>同步至腾讯文档</>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={handleTencentAuth}
                    className="w-full py-2.5 bg-stone-100 text-stone-600 text-xs rounded-full font-bold hover:bg-stone-200 transition-all flex items-center justify-center gap-2"
                  >
                    授权腾讯文档
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative z-[46]">
        <AnimatePresence>
          {activeTerm && (
            <motion.aside 
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: "spring", damping: 35, stiffness: 300 }}
              className="h-full bg-white/30 border-r border-white/20 backdrop-blur-3xl flex flex-col z-[50] shadow-[-10px_0_40_rgba(0,0,0,0.02)] overflow-hidden shrink-0"
              style={{ WebkitBackdropFilter: 'blur(30px)' }}
            >
              <div className="p-6 border-b border-white/10 flex justify-between items-center shrink-0 mt-14">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-primary uppercase tracking-[0.3em]">L4 Dialogue</span>
                  <span className="text-[10px] text-stone-400 uppercase tracking-widest mt-1">思想对话端</span>
                </div>
                <button
                  onClick={() => setShowSearchPanel(!showSearchPanel)}
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${showSearchPanel ? 'bg-primary text-white' : 'bg-white/40 text-stone-500 hover:bg-white/60'}`}
                  title={showSearchPanel ? "关闭搜索" : "语义搜索"}
                >
                  <Search size={14} />
                </button>
              </div>

              {/* L4 语义搜索面板 */}
              {showSearchPanel && (
                <div className="px-6 py-4 bg-white/10 border-b border-white/10 space-y-3">
                  <div className="relative">
                    <input 
                      type="text" 
                      value={searchQuery} 
                      onChange={(e) => setSearchQuery(e.target.value)} 
                      onKeyDown={(e) => e.key === 'Enter' && handleSemanticSearch()}
                      placeholder="跨书语义搜索..." 
                      className="w-full bg-white/50 border border-white/30 rounded-lg pl-4 pr-10 py-2.5 text-[11px] outline-none focus:bg-white focus:border-primary/30 transition-all font-serif placeholder:text-stone-300"
                    />
                    <button 
                      onClick={handleSemanticSearch}
                      disabled={isSearching || !searchQuery.trim()}
                      className={`absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-md flex items-center justify-center transition-all ${isSearching ? 'bg-primary/20' : 'bg-primary text-white hover:scale-105 active:scale-95'} disabled:opacity-30`}
                    >
                      {isSearching ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Send size={12} />
                      )}
                    </button>
                  </div>

                  {searchResults.length > 0 && (
                    <div className="max-h-[200px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                      {searchResults.map((result: any, idx: number) => (
                        <div 
                          key={idx}
                          onClick={() => {
                            if (result.markdown) {
                              const l3Match = result.markdown.match(/<!-- L3_DATA_START([\s\S]*?)L3_DATA_END -->/);
                              if (l3Match) {
                                handleTermClick(result.markdown, -1);
                              }
                            }
                          }}
                          className="p-3 rounded-xl bg-white/40 border border-white/30 cursor-pointer hover:bg-white/70 transition-all group"
                        >
                          <div className="flex items-start gap-2 mb-1.5">
                            <Globe size={12} className="text-primary mt-0.5 shrink-0" />
                            <span className="text-[10px] font-bold text-primary truncate">{result.book_title}</span>
                          </div>
                          <p className="text-[11px] text-stone-600 leading-relaxed line-clamp-2">{result.core_concept}</p>
                          {result.ai_summary && (
                            <p className="text-[10px] text-stone-400 italic mt-1.5 line-clamp-2">{result.ai_summary}</p>
                          )}
                          {result.relevance_score && (
                            <div className="mt-2 flex items-center gap-1">
                              <div className="flex-1 h-1 bg-stone-200 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-primary rounded-full transition-all"
                                  style={{ width: `${result.relevance_score * 100}%` }}
                                />
                              </div>
                              <span className="text-[9px] text-stone-400">{Math.round(result.relevance_score * 100)}%</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {isSearching && searchResults.length === 0 && (
                    <div className="py-4 text-center space-y-2">
                      <Loader2 size={16} className="animate-spin mx-auto text-primary/40" />
                      <p className="text-[10px] text-stone-400 italic">正在检索知识库...</p>
                    </div>
                  )}

                  {!isSearching && searchQuery && searchResults.length === 0 && showSearchPanel && (
                    <div className="py-3 text-center">
                      <p className="text-[10px] text-stone-400 italic">未找到相关内容</p>
                    </div>
                  )}
                </div>
              )}

              {/* 左栏卡片群 - 钉入的L4深度思考内容 */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6 pb-32">
                {/* 钉入的L4深度思考卡片 */}
                {userThoughts.filter(thought => thought.type === 'pinned').length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Pin size={12} className="text-primary" />
                      <span className="text-[10px] font-bold text-primary uppercase tracking-widest">钉入的思考</span>
                      <span className="text-[9px] text-stone-400 bg-stone-100 px-2 py-0.5 rounded-full">
                        {userThoughts.filter(thought => thought.type === 'pinned').length}
                      </span>
                    </div>
                    
                    {userThoughts
                      .filter(thought => thought.type === 'pinned')
                      .map((thought) => (
                        <motion.div
                          key={thought.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="group relative p-4 rounded-2xl bg-gradient-to-r from-primary/5 to-white/50 border border-primary/20 shadow-sm hover:shadow-md transition-all"
                        >
                          <button
                            onClick={() => handleDeleteThought(thought.id)}
                            className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white/80 border border-stone-200 flex items-center justify-center text-stone-400 opacity-0 group-hover:opacity-100 hover:text-red-500 hover:border-red-200 transition-all shadow-sm"
                            title="取消钉入"
                          >
                            <X size={10} />
                          </button>
                          
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
                              <Lightbulb size={10} className="text-primary" />
                            </div>
                            <span className="text-[10px] font-bold text-primary uppercase tracking-widest">L4深度思考</span>
                          </div>
                          
                          <p className="text-[12px] text-stone-700 leading-relaxed font-serif">
                            {thought.content || thought.answer || ''}
                          </p>
                          
                          {thought.tags && thought.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-3">
                              {thought.tags.map((tag: string) => (
                                <span key={tag} className="px-2 py-0.5 bg-primary/10 text-primary text-[9px] font-bold rounded-full border border-primary/20">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                          
                          <div className="mt-2 text-[9px] text-stone-400">
                            {thought.createdAt || '刚刚'}
                          </div>
                        </motion.div>
                      ))
                    }
                  </div>
                )}
                
                {/* 聊天历史记录 */}
                {chatHistory.length === 0 && !isChatting && (
                  <div className="text-center py-20 space-y-4 opacity-30">
                    <Brain className="mx-auto" size={32} />
                    <p className="text-xs font-serif italic">对此段文字有何疑惑？</p>
                  </div>
                )}
                {chatHistory.map((msg, i) => (
                  <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className={`group relative max-w-[90%] p-4 rounded-2xl text-[13px] leading-relaxed shadow-sm ${
                      msg.role === 'user' 
                        ? 'bg-primary text-white' 
                        : msg.isDigest 
                          ? 'bg-amber-50/80 text-stone-700 border border-amber-200/50' 
                          : 'bg-white/60 text-stone-700 border border-white/40'
                    }`}>
                      {msg.isDigest && (
                        <div className="flex items-center gap-1 mb-2 text-[10px] font-bold text-amber-600 uppercase tracking-wider">
                          <Sparkles size={10} />
                          <span>精炼精萃</span>
                        </div>
                      )}
                      {msg.role === 'assistant' ? <SimpleMarkdown content={msg.content} /> : msg.content}
                      {msg.role === 'assistant' && (
                        <div className="absolute right-1 top-1 flex flex-col gap-1">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              if (pinnedIndices.has(i)) return;
                              const question = msg.isDigest ? "精炼总结" : (chatHistory[i-1]?.content || "未知提问");
                              handleSaveDialogue(question, msg.content, i);
                            }}
                            className={`w-7 h-7 rounded-full flex items-center justify-center transition-all scale-75 group-hover:scale-100 shadow-xl z-[100] cursor-pointer pointer-events-auto active:scale-90 ${pinnedIndices.has(i) ? 'bg-green-500 text-white opacity-100' : 'bg-stone-800 text-white opacity-0 group-hover:opacity-100 hover:bg-primary'}`}
                            title={pinnedIndices.has(i) ? "已采撷" : "采撷此灵感"}
                          >
                            {pinnedIndices.has(i) ? <Check size={12} /> : <Pin size={12} />}
                          </button>
                          
                          {!msg.isDigest && (
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSummarize(msg.content);
                              }}
                              className="w-7 h-7 rounded-full bg-amber-500 text-white flex items-center justify-center transition-all scale-75 group-hover:scale-100 shadow-xl z-[100] cursor-pointer pointer-events-auto active:scale-90 opacity-0 group-hover:opacity-100 hover:bg-amber-600"
                              title="提取精萃"
                            >
                              <Sparkles size={12} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {isChatting && (
                  <div className="flex items-start">
                    <div className="bg-white/40 p-3 rounded-xl">
                      <Loader2 className="animate-spin text-primary/40" size={16} />
                    </div>
                  </div>
                )}
              </div>
              <div className="p-6 bg-white/20 backdrop-blur-md border-t border-white/10">
                <div className="relative">
                  <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSendChat()} placeholder="深度对话..." className="w-full bg-white/60 border border-white/40 rounded-full pl-5 pr-12 py-3 text-[12px] outline-none focus:bg-white transition-all font-serif" />
                  <button onClick={handleSendChat} className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center hover:scale-105 transition-all">
                    <Send size={14} />
                  </button>
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
 
        <div className="flex-1 overflow-y-auto mt-14 py-20 scroll-smooth flex justify-center bg-white relative">
          <div className={`w-full px-12 transition-all duration-700 reading-content ${activeTerm ? 'max-w-2xl' : 'max-w-4xl'}`}>
            {console.log('🎨 [Render] markdownContent:', markdownContent?.length, 'chars | value:', markdownContent?.substring(0, 100))}
            {markdownContent ? (
              <div className="space-y-12">
                {markdownContent.split('\n\n').map((block, idx) => {
                  if (block.startsWith('# ')) return (
                    <div key={idx} className="text-center mb-16 space-y-4">
                      <span className="text-[10px] font-bold text-stone-400 uppercase tracking-[0.5em] block">卷轴 · 清洗精萃</span>
                      <h1 className="text-3xl font-serif font-bold text-stone-800 leading-tight inline-block px-10 relative">
                        <div className="absolute left-0 top-1/2 w-8 h-[1px] bg-stone-200" />
                        {block.replace('# ', '')}
                        <div className="absolute right-0 top-1/2 w-8 h-[1px] bg-stone-200" />
                      </h1>
                    </div>
                  );
                  if (block.startsWith('## ')) return <h2 key={idx} className="text-xl font-serif font-bold mt-12 mb-6 text-primary/70">{block.replace('## ', '')}</h2>;
                  const cleanBlock = block
                    .replace(/<!-- L3_DATA_START[\s\S]*?L3_DATA_END -->/g, '')
                    .replace(/<!--[\s\S]*?-->/g, '')
                    .replace(/^---\n[\s\S]*?\n---\n/, '')
                    .trim();
                  if (!cleanBlock) return null;
                  
                  // 详细调试：输出前3个block的完整信息
                  if (idx < 3 && (cleanBlock.includes('**') || cleanBlock.startsWith('-'))) {
                    console.log(`\n========== [DEBUG Block ${idx}] ==========`);
                    console.log(`[RAW block length]:`, block.length);
                    console.log(`[RAW block preview]:`, block.substring(0, 200));
                    console.log(`[cleanBlock length]:`, cleanBlock.length);
                    console.log(`[cleanBlock FULL]:`, JSON.stringify(cleanBlock));
                    console.log(`[cleanBlock lines]:`, cleanBlock.split('\n').map((l, i) => `[${i}] "${l.substring(0, 60)}"`));
                  }
                  
                  const isActive = activeBlockId === idx;
                  
                  // 支持两种成语格式：\n> (引用) 和 \n- (列表)
                  const isIdiomCard = cleanBlock.startsWith('**') && (cleanBlock.includes('\n> ') || cleanBlock.includes('\n- '));
                  const isQuote = cleanBlock.startsWith('> ') && !isIdiomCard;
                  const isListItem = cleanBlock.startsWith('- ') && !isIdiomCard && !isQuote;
                  
                  let displayContent: string;
                  let cardTitle: string | null = null;
                  
                  if (isIdiomCard) {
                    const lines = cleanBlock.split('\n');
                    cardTitle = (lines[0] || '').replace(/^\*\*|\*\*$/g, '');
                    const contentLine = lines.find(line => line.startsWith('> ') || line.startsWith('- '));
                    displayContent = contentLine 
                      ? contentLine.replace(/^[>-]\s*/, '').replaceAll('*', '').replaceAll('**', '')
                      : lines.slice(1).join('\n').replaceAll('*', '').replaceAll('**', '');
                    
                    if (idx < 3) {
                      console.log(`[DEBUG Block ${idx}] isIdiomCard:`, isIdiomCard);
                      console.log(`[DEBUG Block ${idx}] cardTitle:`, cardTitle);
                      console.log(`[DEBUG Block ${idx}] contentLine:`, contentLine?.substring(0, 80));
                      console.log(`[DEBUG Block ${idx}] displayContent:`, displayContent?.substring(0, 80));
                      console.log(`[DEBUG Block ${idx}] cleanBlock length:`, cleanBlock.length);
                    }
                  } else if (isListItem) {
                    displayContent = cleanBlock.replace(/^-\s*/, '').replaceAll('*', '').replaceAll('**', '');
                  } else {
                    displayContent = cleanBlock.replace('> ', '').replaceAll('*', '').replaceAll('**', '');
                  }
                  
                  return (
                    <div key={idx} className={`group relative py-5 transition-all duration-300 ${isActive ? 'bg-primary/3 -mx-8 px-8' : ''}`}>
                      {isIdiomCard && cardTitle && (
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm font-serif font-bold text-amber-800">{cardTitle}</span>
                          <span className="text-[10px] text-amber-600">· 典故</span>
                        </div>
                      )}
                      <div className="absolute -top-8 left-0 opacity-0 group-hover:opacity-100 transition-all bg-stone-800 text-stone-200 text-[10px] py-2 px-4 rounded-lg z-20 pointer-events-none max-w-sm shadow-xl border border-stone-700 leading-relaxed translate-y-2 group-hover:translate-y-0">
                        <span className="text-primary font-bold block mb-1">RAW TRACE:</span>
                        {block.match(/original: ([\s\S]*?)\.\.\./)?.[1] || "对比载入中"}
                      </div>
                      <p className={`text-[15px] leading-loose tracking-tight ${isQuote ? 'text-stone-500 font-serif italic pl-4 border-l-2 border-stone-200' : isIdiomCard ? 'text-stone-700 pl-4 border-l-2 border-amber-200/50 italic' : 'text-stone-800'}`}>{displayContent}</p>
                      <button onClick={() => handleTermClick(block, idx)} className={`absolute -right-6 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white shadow-md border border-stone-200 flex items-center justify-center text-primary transition-all duration-200 hover:bg-primary hover:text-white hover:shadow-lg ${isActive ? 'opacity-100 scale-105' : 'opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100'}`}>
                        <Sparkles size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-6">
                <Loader2 className="animate-spin text-stone-200" size={48} />
                <h2 className="text-2xl font-serif font-bold text-stone-300">载入中...</h2>
              </div>
            )}
          </div>
        </div>

        <AnimatePresence>
          {activeTerm && (
            <motion.aside 
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 400, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: "spring", damping: 35, stiffness: 300 }}
              className="h-full bg-white border-l border-stone-100 flex flex-col z-[50] shadow-[-10px_0_40_rgba(0,0,0,0.02)] overflow-hidden shrink-0"
            >
              <div className="p-6 border-b border-stone-50 flex justify-between items-start shrink-0 mt-14">
                <div className="space-y-1">
                  <h3 className="text-2xl font-serif font-bold text-stone-800">Deep Origin</h3>
                  <p className="text-[10px] text-stone-400 uppercase tracking-[0.2em]">Semantic Analysis (L3)</p>
                </div>
                <button onClick={() => { setActiveTerm(null); setActiveBlockId(null); }} className="p-2 hover:bg-stone-50 rounded-full transition-colors text-stone-400"><X size={18} /></button>
              </div>
              
              <div className="px-6 py-4 border-b border-stone-50 shrink-0">
                <button
                  onClick={handleOpenThoughtModal}
                  className="w-full py-3 border-2 border-dashed border-stone-200 rounded-xl flex items-center justify-center gap-2 text-stone-500 hover:text-primary hover:border-primary/30 transition-all group"
                >
                  <Plus size={16} className="group-hover:rotate-90 transition-transform" />
                  <span className="text-sm font-medium">写下我的思考</span>
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 space-y-8 pb-12">
                {isLoadingSemantic ? (
                  <div className="flex flex-col items-center justify-center h-48 text-stone-200 space-y-4">
                    <Loader2 className="animate-spin" size={24} />
                    <p className="text-[10px] uppercase tracking-widest font-bold">知识加载中</p>
                  </div>
                ) : null}
                
                {userThoughts.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <Edit3 size={14} className="text-amber-500" />
                      <h5 className="text-[11px] font-bold uppercase tracking-[0.2em] text-stone-400">我的思考</h5>
                    </div>
                    <div className="space-y-3">
                      {userThoughts.map((thought) => (
                        <motion.div
                          key={thought.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 20 }}
                          className="group relative p-5 rounded-2xl border-l-4 bg-gradient-to-r from-amber-50/80 to-white border-amber-400 shadow-sm hover:shadow-md transition-all"
                        >
                          <button
                            onClick={() => handleDeleteThought(thought.id)}
                            className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/80 border border-stone-200 flex items-center justify-center text-stone-400 opacity-0 group-hover:opacity-100 hover:text-red-500 hover:border-red-200 transition-all shadow-sm"
                            title="删除"
                          >
                            <Trash2 size={12} />
                          </button>
                          
                          {/* 钉入按钮 */}
                          <button
                            onClick={() => handlePinThought(thought.id)}
                            className={`absolute top-3 right-12 w-7 h-7 rounded-full border flex items-center justify-center transition-all shadow-sm ${
                              thought.type === 'pinned' 
                                ? 'bg-primary/20 border-primary/30 text-primary' 
                                : 'bg-white/80 border-stone-200 text-stone-400 opacity-0 group-hover:opacity-100 hover:text-primary hover:border-primary/30'
                            }`}
                            title={thought.type === 'pinned' ? "取消钉入" : "钉入左栏"}
                          >
                            <Pin size={12} className={thought.type === 'pinned' ? "fill-primary" : ""} />
                          </button>
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center">
                              <User size={12} className="text-amber-600" />
                            </div>
                            <span className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">我的思考</span>
                          </div>
                          <p className="text-[14px] text-stone-700 leading-relaxed font-serif">{thought.content}</p>
                          <p className="text-[10px] text-stone-400 mt-3">{thought.createdAt}</p>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}

                {!semanticData && userThoughts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-center space-y-4">
                    <div className="w-14 h-14 rounded-2xl bg-primary/5 flex items-center justify-center">
                      <Sparkles size={20} className="text-primary/50" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-base font-serif font-bold text-stone-600">AI 将在你阅读时</p>
                      <p className="text-sm text-stone-400">在这里提供语义延伸</p>
                    </div>
                  </div>
                ) : semanticData ? (
                  <>
                    <div className="bg-[#F3F1EF] rounded-[2rem] p-10 space-y-6 shadow-inner">
                      <h4 className="text-4xl font-serif font-bold text-stone-800 leading-tight">{semanticData.term}</h4>
                      <div className="flex flex-wrap gap-2">
                        {semanticData.tags?.map((tag: string) => (
                          <span key={tag} className="px-3 py-1 bg-stone-200/50 text-stone-600 text-[10px] font-bold rounded-full border border-stone-300/30">{tag}</span>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <Search size={14} className="text-stone-300" />
                        <h5 className="text-[11px] font-bold uppercase tracking-[0.2em] text-stone-400">Deep Trace / 概念解析</h5>
                      </div>
                      <p className="text-[15px] text-stone-800 leading-relaxed font-serif px-1 bg-stone-50/50 p-4 rounded-xl border border-stone-100">{semanticData.explanation}</p>
                    </div>

                    <div className="p-8 bg-stone-900 rounded-[2rem] border border-stone-800 space-y-6 shadow-2xl relative overflow-hidden group">
                      <div className="absolute top-0 right-0 p-4 opacity-10">
                        <Brain size={80} className="text-white" />
                      </div>
                      <div className="flex items-center gap-3 relative z-10">
                        <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                        <h5 className="text-[10px] font-bold uppercase tracking-[0.3em] text-primary">观念碰撞 · 认知拓展</h5>
                      </div>
                      <p className="text-[15px] text-stone-200 leading-relaxed font-serif italic relative z-10 drop-shadow-sm">“{semanticData.cognitive_extension}”</p>
                    </div>

                    {semanticData.saved_dialogues?.length > 0 && (
                      <div ref={dialogueRef} className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="flex items-center gap-3">
                          <Pin size={14} className="text-primary rotate-45" />
                          <h5 className="text-[11px] font-bold uppercase tracking-[0.2em] text-stone-400">灵感采撷 · 思想结晶</h5>
                        </div>
                        <div className="space-y-4">
                          {semanticData.saved_dialogues.map((d: any, i: number) => (
                            <div key={i} className="p-5 rounded-2xl bg-primary/5 border-l-4 border-primary space-y-3 shadow-sm">
                              <p className="text-[11px] font-bold text-primary/60 uppercase tracking-widest">Q: {d.q}</p>
                              <p className="text-[13px] text-stone-700 leading-relaxed font-serif italic">“{d.a}”</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <Sparkles size={14} className="text-stone-300" />
                        <h5 className="text-[11px] font-bold uppercase tracking-[0.2em] text-stone-400">Semantic Network</h5>
                      </div>
                      <div className="space-y-3">
                        {semanticData.semantic_network?.map((item: any, idx: number) => (
                          <div key={idx} className="group p-4 rounded-2xl bg-stone-50 border border-stone-100 hover:border-primary/20 hover:bg-primary/[0.02] transition-all">
                            <div className="flex justify-between items-start">
                              <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-2">
                                  <div className="w-1 h-1 bg-primary rounded-full" />
                                  <span className="text-[14px] font-bold text-stone-800 font-serif">{item.term}</span>
                                </div>
                                <p className="text-[12px] text-stone-500 leading-relaxed pl-3 border-l border-stone-200 group-hover:border-primary/30 transition-colors">{item.note}</p>
                              </div>
                              <button 
                                onClick={() => handlePinSemanticCard(item, idx)}
                                className="w-6 h-6 rounded-full bg-stone-100 text-stone-400 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-primary hover:text-white transition-all"
                                title="钉入左栏"
                              >
                                <Pin size={12} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="pt-6 border-t border-stone-50 space-y-4">
                      <h5 className="text-[11px] font-bold uppercase tracking-[0.2em] text-stone-400">References</h5>
                      <div className="flex flex-wrap gap-3">
                        {semanticData.reference_urls?.map((ref: any, idx: number) => (
                          <a 
                            key={idx} 
                            href={ref.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-4 py-2 bg-stone-50 text-stone-600 text-xs rounded-xl hover:bg-primary/5 hover:text-primary transition-all border border-stone-100 group"
                          >
                            <ExternalLink size={12} className="opacity-40 group-hover:opacity-100" />
                            {ref.title}
                          </a>
                        ))}
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showThoughtModal && (
            <motion.div
              ref={modalRef}
              initial={{ opacity: 0, scale: 0.9, x: window.innerWidth / 2 - 200, y: window.innerHeight / 2 - 160 }}
              animate={{ opacity: 1, scale: 1, x: dragPosition.x, y: dragPosition.y }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="fixed z-[101] overflow-hidden flex flex-col"
              style={{ 
                width: modalSize.width, 
                height: modalSize.height,
                transition: isDraggingRef.current || isResizingRef.current ? 'none' : 'all 0.3s ease',
                background: 'rgba(255, 255, 255, 0.85)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                borderRadius: '24px',
                boxShadow: isDraggingRef.current ? '0 25px 50px -12px rgba(0, 0, 0, 0.25)' : '0 10px 40px rgba(0, 0, 0, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.5)'
              }}
            >
              <div 
                className="flex items-center justify-between px-6 py-3 cursor-grab active:cursor-grabbing"
                onMouseDown={handleMouseDown}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(143, 178, 176, 0.1)' }}>
                    <Edit3 size={16} style={{ color: '#8FB2B0' }} />
                  </div>
                  <h3 className="font-serif font-bold text-sm" style={{ color: '#333333' }}>记录我的思考</h3>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleCloseThoughtModal(); }}
                  className="p-2 rounded-full hover:bg-black/5 transition-colors"
                >
                  <X size={16} style={{ color: '#8FB2B0' }} />
                </button>
              </div>
              <div className="px-5 pb-5 pt-2 flex-1 overflow-hidden">
                <textarea
                  value={newThought}
                  onChange={(e) => setNewThought(e.target.value)}
                  placeholder="在这里写下你的思考..."
                  className="w-full h-full resize-none outline-none font-serif text-sm p-4 rounded-xl"
                  style={{ 
                    backgroundColor: 'rgba(255, 255, 255, 0.6)',
                    border: '1px solid rgba(143, 178, 176, 0.15)',
                    color: '#333333',
                    placeholderColor: 'rgba(143, 178, 176, 0.5)'
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.metaKey) {
                      handleSaveThought();
                    }
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                />
              </div>
              <div className="flex gap-3 px-5 pb-5 pt-2" style={{ borderTop: '1px solid rgba(143, 178, 176, 0.1)' }}>
                <button
                  onClick={(e) => { e.stopPropagation(); handleCloseThoughtModal(); }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors"
                  style={{ 
                    border: '1px solid rgba(143, 178, 176, 0.3)',
                    color: '#333333'
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  取消
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleSaveThought(); }}
                  disabled={!newThought.trim()}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ 
                    backgroundColor: '#8FB2B0',
                    color: 'white'
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  保存
                </button>
              </div>
              <div 
                className="absolute bottom-3 right-3 w-7 h-7 rounded-lg cursor-se-resize flex items-center justify-center"
                style={{ backgroundColor: '#8FB2B0' }}
                onMouseDown={(e) => { e.stopPropagation(); handleResizeStart(e); }}
              >
                <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 文本划选浮动菜单 */}
        <AnimatePresence>
          {showSelectionMenu && (
            <motion.div
              ref={selectionMenuRef}
              initial={{ opacity: 0, y: 10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.9 }}
              transition={{ type: "spring", damping: 25, stiffness: 400 }}
              className="fixed z-[80] pointer-events-auto"
              style={{
                left: selectionMenuPos.x,
                top: selectionMenuPos.y,
                transform: 'translate(-50%, -100%)'
              }}
            >
              <button
                onClick={handleSelectionThink}
                className="flex items-center gap-2 px-4 py-2.5 bg-white/90 backdrop-blur-xl rounded-xl shadow-lg border border-stone-200/50 text-stone-700 hover:text-primary hover:border-primary/30 transition-all text-sm font-medium whitespace-nowrap"
                style={{
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)'
                }}
              >
                <Lightbulb size={16} className="text-amber-500" />
                <span>围绕此处思考</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function RelatedEntity({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-xl border border-transparent hover:border-stone-100 hover:bg-stone-50 transition-all cursor-pointer group">
      <span className="text-sm">{label}</span>
      <ArrowRight size={14} className="text-stone-300 group-hover:text-primary transition-colors" />
    </div>
  );
}

function AssetsView() {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className="p-10 max-w-6xl mx-auto"
    >
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-16 gap-6">
        <div>
          <h2 className="text-4xl font-serif font-bold text-primary mb-2">成册</h2>
          <p className="text-stone-500">知识结晶与资产分发</p>
        </div>
        <div className="w-full md:w-96 relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-300 group-focus-within:text-primary transition-colors" size={18} />
          <input 
            type="text" 
            placeholder="全卷轴语义检索 (如: 明代财政危机)..." 
            className="w-full pl-12 pr-4 py-3 bg-transparent border-b border-stone-200 focus:border-primary outline-none transition-colors font-serif placeholder:text-stone-300"
          />
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        <div className="lg:col-span-2 space-y-12">
          <div className="flex justify-between items-center">
            <h3 className="font-serif text-2xl text-primary/80">沉淀成册</h3>
            <div className="flex gap-2">
              <span className="px-3 py-1 bg-stone-200 text-primary text-xs font-bold rounded-lg cursor-pointer">全部</span>
              <span className="px-3 py-1 bg-transparent text-stone-400 text-xs font-bold rounded-lg hover:bg-stone-50 transition-colors cursor-pointer">历史</span>
              <span className="px-3 py-1 bg-transparent text-stone-400 text-xs font-bold rounded-lg hover:bg-stone-50 transition-colors cursor-pointer">哲学</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {VOLUMES.map(vol => (
              <div key={vol.id} className="glaze-card rounded-2xl p-8 relative overflow-hidden group hover:scale-[1.02] transition-transform duration-500">
                <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-30 transition-opacity">
                  {vol.type === 'history' ? <LibraryBig size={48} /> : <Brain size={48} />}
                </div>
                <div className="mb-6">
                  <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-primary/10 text-primary uppercase tracking-widest mb-4">
                    纯度: {vol.purity}%
                  </span>
                  <h4 className="text-2xl font-serif font-bold mb-3">{vol.title}</h4>
                  <p className="text-sm text-stone-500 line-clamp-2 leading-relaxed">{vol.description}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {vol.tags.map(tag => (
                    <span key={tag} className="px-3 py-1 bg-stone-100 text-primary text-[10px] font-bold rounded-lg border border-stone-200">{tag}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-8">
          <div className="glaze-card rounded-2xl p-8 border border-stone-100">
            <h3 className="font-serif text-xl mb-8">洗炼记录</h3>
            <div className="space-y-8">
              <PurityMetric label="逻辑断裂修复" count={87} progress={75} color="bg-primary" />
              <PurityMetric label="信息噪音滤除" count={142} progress={85} color="bg-stone-500" />
            </div>
          </div>

          <div className="glaze-card rounded-2xl p-8 border border-stone-100">
            <h3 className="font-serif text-xl mb-6">成册分发</h3>
            <button className="w-full py-4 bg-[#0052D9] text-white rounded-xl flex items-center justify-center gap-3 shadow-xl shadow-blue-500/20 hover:bg-blue-600 transition-all font-bold tracking-widest text-xs mb-8 uppercase">
              <CloudUpload size={18} />
              同步至腾讯文档
            </button>
            <div className="space-y-6">
              <h4 className="text-[10px] font-bold text-stone-400 border-b border-stone-100 pb-2 uppercase tracking-widest">分发纪要</h4>
              <SyncItem title="《宋代江南士绅阶层研究》" detail="已导出至 Obsidian Vault • 10分钟前" />
              <SyncItem title="《王阳明心学演变史》" detail="已同步至 腾讯文档 • 2小时前" />
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function PurityMetric({ label, count, progress, color }: any) {
  return (
    <div>
      <div className="flex justify-between text-[11px] font-bold text-stone-500 mb-2 uppercase tracking-widest">
        <span>{label}</span>
        <span>{count} 处</span>
      </div>
      <div className="h-1 bg-stone-100 rounded-full overflow-hidden">
        <div className={`h-full transition-all duration-1000 ${color}`} style={{ width: `${progress}%` }}></div>
      </div>
    </div>
  );
}

function SyncItem({ title, detail }: any) {
  return (
    <div className="flex items-start gap-3">
      <CheckCircle2 size={16} className="text-primary shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-[10px] text-stone-400 mt-1 uppercase tracking-widest">{detail}</p>
      </div>
    </div>
  );
}

function SettingsView() {
  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="p-16 max-w-5xl mx-auto"
    >
      <header className="mb-24">
        <h1 className="text-5xl font-serif font-bold text-stone-800 mb-4">设置</h1>
        <p className="text-stone-500 font-serif tracking-widest">调和智核，接引外物，定立规度。此为引擎控制之枢机。</p>
      </header>

      <div className="grid grid-cols-12 gap-8">
        <section className="col-span-12 lg:col-span-7 glaze-card rounded-[2.5rem] p-10 border border-white shadow-2xl relative overflow-hidden group">
          <div className="absolute -right-20 -top-20 w-80 h-80 bg-primary/10 rounded-full blur-[80px] opacity-40 group-hover:opacity-70 transition-opacity duration-1000"></div>
          <header className="flex items-center gap-4 mb-12">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary"><Brain /></div>
            <h2 className="text-2xl font-serif font-bold">智核调校</h2>
          </header>

          <div className="space-y-12 relative z-10">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 block mb-6">主理模型 (Core Engine)</label>
              <div className="grid grid-cols-2 gap-4">
                <ModelOption active name="混元" brand="Tencent Hunyuan" />
                <ModelOption name="深度求索" brand="DeepSeek R1" />
              </div>
            </div>

            <div className="space-y-6">
              <div className="flex justify-between items-end">
                <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400">辨析倾向 (L3 Aggression)</label>
              </div>
              <input type="range" className="w-full appearance-none h-1 bg-stone-200 rounded-full cursor-pointer hover:bg-stone-300 transition-colors" defaultValue={65} />
              <div className="flex justify-between text-[11px]">
                <div className="flex flex-col">
                  <span className="font-bold">考据</span>
                  <span className="text-[10px] text-stone-400 uppercase">Archeology / 保守</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="font-bold">驳议</span>
                  <span className="text-[10px] text-stone-400 uppercase">Refutation / 激进</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="col-span-12 lg:col-span-5 flex flex-col gap-8">
          <div className="glaze-card rounded-[2rem] p-8 border border-white flex-1">
            <header className="flex items-center gap-4 mb-8">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary"><LinkIcon size={20} /></div>
              <h2 className="text-xl font-serif font-bold">外物结契</h2>
            </header>
            <div className="space-y-4">
              <SyncTile name="腾讯文档" connected />
              <div className="border border-dashed border-stone-200 rounded-2xl p-6 text-center space-y-4">
                <div className="w-24 h-24 mx-auto bg-stone-100 rounded-lg flex items-center justify-center border border-stone-200">
                  <span className="text-stone-300"><RefreshCw size={32} strokeWidth={1} /></span>
                </div>
                <div>
                  <p className="text-sm font-medium">微信读书</p>
                  <p className="text-[10px] text-stone-400 uppercase mt-1">扫码结契以同步书架</p>
                </div>
                <button className="w-full py-3 bg-primary text-white text-xs font-bold rounded-full shadow-lg shadow-primary/20 hover:brightness-110 transition-all uppercase tracking-widest">刷新灵符</button>
              </div>
            </div>
          </div>
        </section>

        <section className="col-span-12 lg:col-span-6 glaze-card rounded-[2rem] p-10 border border-white">
          <header className="flex items-center gap-4 mb-8">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary"><Database size={20} /></div>
            <h2 className="text-xl font-serif font-bold">藏骨所</h2>
          </header>
          <p className="text-sm text-stone-500 leading-relaxed mb-10">设定本地 L4 向量数据库路径，守护文脉幽微。</p>
          <div className="space-y-12">
            <div className="group">
              <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest group-focus-within:text-primary transition-colors">存储路径 (Local Path)</label>
              <div className="flex items-center gap-2 border-b border-stone-200 py-3 group-focus-within:border-primary transition-all">
                <FolderOpen size={16} className="text-stone-300 group-focus-within:text-primary" />
                <input className="bg-transparent outline-none flex-1 font-serif text-sm" defaultValue="/Users/inktrace/library/vector_db/v4" />
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-stone-400 uppercase tracking-widest font-bold">当前占用: <span className="text-stone-800">1.2 GB</span></span>
              <button className="flex items-center gap-2 text-primary hover:opacity-70 transition-opacity font-bold text-[10px] uppercase tracking-widest">
                <Eraser size={14} /> 整理
              </button>
            </div>
          </div>
        </section>

        <section className="col-span-12 lg:col-span-6 glaze-card rounded-[2.5rem] p-10 border border-white relative overflow-hidden">
          <header className="flex items-center gap-4 mb-10">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary"><Palette size={24} /></div>
            <h2 className="text-2xl font-serif font-bold">窑变流彩</h2>
          </header>
          <div className="grid grid-cols-3 gap-6">
            {THEMES.map(theme => (
              <button key={theme.id} className={`group text-center focus:outline-none transition-all duration-500 ${theme.active ? 'scale-105' : 'opacity-50 grayscale hover:grayscale-0 hover:opacity-100 hover:scale-105'}`}>
                <div className={`h-28 rounded-2xl mb-4 overflow-hidden relative shadow-lg ${theme.active ? 'ring-4 ring-primary/20 border-2 border-primary' : 'border border-stone-200'}`}>
                  <img src={theme.image} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  {theme.active && (
                    <div className="absolute bottom-2 right-2 w-5 h-5 bg-primary rounded-full flex items-center justify-center text-white"><Check size={12} /></div>
                  )}
                </div>
                <div className="text-sm font-medium">{theme.name}</div>
                <div className="text-[10px] text-stone-400 uppercase tracking-widest mt-1">{theme.origin}</div>
              </button>
            ))}
          </div>
        </section>
      </div>
    </motion.div>
  );
}

function ModelOption({ name, brand, active }: any) {
  return (
    <div className={`cursor-pointer rounded-2xl p-6 border transition-all text-center relative overflow-hidden ${
      active 
        ? 'border-primary bg-primary/5 text-primary' 
        : 'border-stone-200 bg-white/50 text-stone-400 hover:border-primary/50'
    }`}>
      <div className="text-lg font-bold mb-1">{name}</div>
      <div className="text-[10px] uppercase tracking-widest">{brand}</div>
      {active && <CheckCircle2 size={16} className="absolute top-3 right-3 text-primary" />}
    </div>
  );
}

function SyncTile({ name, connected }: any) {
  return (
    <div className="flex items-center justify-between p-4 bg-white/50 rounded-2xl border border-stone-100">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary"><Sparkles size={20} /></div>
        <div>
          <p className="text-sm font-medium">{name}</p>
          <p className="text-[10px] text-primary uppercase font-bold tracking-widest">已连接</p>
        </div>
      </div>
      <button className="text-[10px] font-bold text-stone-400 hover:text-red-500 uppercase tracking-widest transition-colors">断开</button>
    </div>
  );
}

