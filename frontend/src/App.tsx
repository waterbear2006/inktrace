/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo, useCallback, type ReactNode } from 'react';
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

  FolderOpen,
  Sparkles,

  X,
  History,
  ArrowRight,
  BookOpen,

  Check,

  ChevronLeft,
  ChevronRight,
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
  Lightbulb,
  Share2,
  Download,
  Copy,
  MessageCircle,
  Bookmark,
  Minimize2,
  Puzzle,
  HelpCircle,
  MessageCircleQuestion,
  Heart,
  Flame,
  Zap,
  TrendingUp,
  Eye,
} from 'lucide-react';
import html2canvas from 'html2canvas';
import { VOLUMES } from './constants';
import VolumeView from './VolumeView';
import ReviewStream from './components/ReviewStream';
import CollisionCard from './components/CollisionCard';
import ShareModal from './components/ShareModal';
import SwipeCard from './components/SwipeCard';

const API_BASE = (import.meta as any).env?.VITE_API_BASE || "https://Ruizi2006-inktrace.hf.space/api/v1";

type View = 'library' | 'deep-work' | 'assets' | 'volume' | 'settings' | 'reader' | 'community';

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
      <div className="mt-2 text-xs text-on-surface/60 bg-gradient-to-r from-surface-container/50 to-primary/[0.03] px-3 py-2.5 rounded-lg border border-primary/15 leading-relaxed">
        <div className="flex items-center gap-1.5 mb-1">
          <Lightbulb size={12} className="text-primary" />
          <span className="font-medium text-primary">释义</span>
        </div>
        <div className="text-on-surface/50 pl-4">
          {loading ? (
            <span className="italic animate-pulse">加载中...</span>
          ) : explanation.includes('（释义加载中）') ? (
            <span className="italic text-on-surface/40">暂无释义，可点击右侧 ✨ 按钮查看 L3 深度分析</span>
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
            return <h3 key={i} className="text-base font-bold text-on-surface mt-5 mb-3">{block.content}</h3>;
          
          case 'idiom':
            return (
              <div key={i} className="my-4 p-4 rounded-xl bg-gradient-to-r from-primary/[0.05] to-primary/[0.03] border border-primary/15 shadow-sm hover:shadow-md transition-all duration-300">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center mt-0.5">
                    <span className="text-primary font-serif font-bold text-sm">典</span>
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-on-surface text-base font-serif">{block.idiom}</span>
                      <span className="text-[10px] font-medium text-primary uppercase tracking-wider bg-primary/10 px-2 py-0.5 rounded-full">成语/典故</span>
                    </div>
                    <div className="text-xs text-on-surface/50 pl-3 border-l-2 border-primary/20 italic leading-relaxed">
                      {block.original}
                    </div>
                    {block.idiom && <IdiomExplanation idiom={block.idiom} />}
                  </div>
                </div>
              </div>
            );
          
          case 'quote':
            return (
              <blockquote key={i} className="border-l-4 border-primary/30 pl-4 py-2.5 my-3 text-on-surface/50 italic bg-gradient-to-r from-surface-container/50 to-primary/5 rounded-r-lg shadow-sm">
                {block.content}
              </blockquote>
            );
          
          case 'list':
            return (
              <div key={i} className="flex gap-2.5 pl-1 py-1 hover:bg-surface-container/30 rounded-lg transition-colors -ml-1">
                <span className="text-primary font-bold mt-0.5">•</span>
                <span className="text-on-surface/70 leading-relaxed">{block.content}</span>
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
                return <strong key={j} className="font-bold text-on-surface">{part.slice(2, -2)}</strong>;
              }
              return part;
            });
            return <p key={i} className="min-h-[1em] text-on-surface/70 leading-relaxed py-0.5">{formattedLine}</p>;
        }
      })}
    </div>
  );
};
// ------------------------

export default function App() {
  const [currentView, setCurrentView] = useState<View>('library');
  const [volumeInDetail, setVolumeInDetail] = useState(false);
  const [readerContent, setReaderContent] = useState('');
  const [readerTitle, setReaderTitle] = useState('');
  const [processedMarkdown, setProcessedMarkdown] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingMinimized, setProcessingMinimized] = useState(false);
  const [processingDone, setProcessingDone] = useState(false);
  const [floatOffset, setFloatOffset] = useState<{x: number, y: number} | null>(null);
  const isDraggingRef = useRef(false);

  // 安全网：当进度到达 100 时自动标记完成，防止状态不同步卡在进度条
  useEffect(() => {
    if (processingProgress >= 100 && isProcessing && !processingDone) {
      setProcessingDone(true);
    }
  }, [processingProgress, isProcessing, processingDone]);
  
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
  const [showMeditation, setShowMeditation] = useState(false);
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

  // 主题初始化
  useEffect(() => {
    const saved = localStorage.getItem('inktrace_theme') || 'warm';
    document.documentElement.dataset.theme = saved;
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

  const handleProcessBook = async (bookId: string, bookStatus?: string, bookSource?: string) => {
    // 原著：进入全文阅读视图
    if (bookSource === 'Library') {
      try {
        const res = await fetch(`${API_BASE}/library/books/${bookId}/source`);
        if (res.ok) {
          const data = await res.json();
          setReaderTitle(data.title);
          setReaderContent(data.content);
          setCurrentView('reader');
        } else {
          alert('无法读取原文文件');
        }
      } catch (e) {
        console.error('读取原著失败:', e);
        alert('读取原著失败，请检查后端服务');
      }
      return;
    }

    // 已完成/已深度思考：轻量进入研读（不跳冥想），深度加工由 "深度看这本" 按钮触发
    if (bookStatus === '已完成' || bookStatus === '已深度思考') {
      setCurrentView('deep-work');
      setCurrentNoteId(bookId);
      localStorage.setItem('inktrace_last_note_id', bookId);

      setTimeout(async () => {
        try {
          const res = await fetch(`${API_BASE}/notes/${bookId}/content`);
          if (res.ok) {
            const data = await res.json();
            if (data.success && data.content) {
              setProcessedMarkdown(data.content);
            }
          }
        } catch (e) {
          console.error('Failed to load note content:', e);
        }
      }, 100);

      return;
    }

    // WeRead 导入的书籍：后台已自动触发清洗，直接进入 DeepWork 等待结果
    if (bookSource === 'WeRead') {
      setCurrentView('deep-work');
      setCurrentNoteId(bookId);
      setShowMeditation(true);
      localStorage.setItem('inktrace_last_note_id', bookId);

      // 定时轮询检查清洗是否完成，完成后加载内容
      const pollInterval = setInterval(async () => {
        try {
          const res = await fetch(`${API_BASE}/notes/${bookId}/content`);
          if (res.ok) {
            const data = await res.json();
            if (data.success && data.content) {
              setProcessedMarkdown(data.content);
              clearInterval(pollInterval);
            }
          }
        } catch (e) {
          // 还没就绪，继续等待
        }
      }, 3000);

      // 最多等 5 分钟
      setTimeout(() => clearInterval(pollInterval), 300000);
      return;
    }
    
    // 否则触发清洗流程
    setIsProcessing(true); setProcessingMinimized(false); setProcessingDone(false);
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

  // WeRead 清洗进度：复用浮动进度条组件
  const handleStartWeReadProcessing = (noteIds: string[]) => {
    setIsProcessing(true);
    setProcessingMinimized(false);
    setProcessingDone(false);
    setProcessingProgress(5);

    const pollInterval = setInterval(async () => {
      let totalProgress = 0;
      let allDone = true;
      for (const id of noteIds) {
        try {
          const res = await fetch(`${API_BASE}/weread/status/${id}`);
          if (res.ok) {
            const data = await res.json();
            totalProgress += data.progress || 0;
            if (data.status !== '已完成') allDone = false;
          } else {
            allDone = false;
          }
        } catch (e) {
          allDone = false;
        }
      }
      const avgProgress = Math.round(totalProgress / noteIds.length);
      setProcessingProgress(Math.min(99, avgProgress));

      if (allDone) {
        clearInterval(pollInterval);
        setProcessingProgress(100);
        setProcessingDone(true);
        // WeRead 导入完成：留在库页面，提醒用户在书库/今日回顾中查看
        setTimeout(() => {
          setIsProcessing(false);
        }, 2000);
      }
    }, 2000);
  };

  // 处理用户选择"继续基础清洗"（无原著）
  const handleContinueWithoutSourceBook = () => {
    if (!sourceBookWarningData) return;
    
    console.log('✅ [ContinueWithoutSource] 用户选择继续基础清洗');
    setShowSourceBookWarning(false);
    
    // 开始轮询任务
    localStorage.setItem('inktrace_active_job', sourceBookWarningData.jobId);
    setIsProcessing(true); setProcessingMinimized(false); setProcessingDone(false);
    setProcessingProgress(0);
    startPolling(sourceBookWarningData.jobId);
  };

  // 深度看这本：触发冥想 + DeepWork（含 L3 加工）
  const handleDeepWorkBookClick = async (bookId: string) => {
    setCurrentView('deep-work');
    setCurrentNoteId(bookId);
    setShowMeditation(true);
    localStorage.setItem('inktrace_last_note_id', bookId);

    setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}/notes/${bookId}/content`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.content) {
            setProcessedMarkdown(data.content);
          }
        }
      } catch (e) {
        console.error('Failed to load note content:', e);
      }
    }, 100);
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
        
        if (pollData.status === 'completed' || Number(pollData.progress) >= 100) {
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
          setProcessingProgress(100);
          setProcessingDone(true);
          isLoadingRef.current = false;
        } else if (pollData.status === 'failed') {
          clearInterval(poll);
          localStorage.removeItem('inktrace_active_job');
          setIsProcessing(false);
          setProcessingMinimized(false);
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
      setIsProcessing(true); setProcessingMinimized(false); setProcessingDone(false);
      startPolling(savedJobId);
    }
  }, []);

  return (
    <div className="flex h-screen bg-surface overflow-hidden font-sans text-on-surface relative">
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
              className="bg-surface rounded-3xl shadow-2xl max-w-lg w-full p-8 space-y-6"
            >
              {/* 标题 */}
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
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
              <div className="bg-surface-container/30 rounded-xl p-4 space-y-2">
                <h4 className="font-semibold text-stone-700 text-sm">📚 有原著 vs 无原著</h4>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="space-y-1">
                    <div className="text-primary font-medium">✅ 完整模式</div>
                    <div className="text-stone-500">• L1 基础清洗</div>
                    <div className="text-stone-500">• L2 文本修复</div>
                    <div className="text-stone-500">• L3 AI深度分析</div>
                    <div className="text-stone-500">• L4 知识网络</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-primary font-medium">⚠️ 基础模式</div>
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
                  className="flex-1 px-6 py-3 rounded-xl border-2 border-outline-variant/50 text-on-surface/60 font-semibold hover:bg-surface-container/30 transition-all"
                >
                  取消
                </button>
                <button
                  onClick={handleContinueWithoutSourceBook}
                  className="flex-1 px-6 py-3 rounded-xl bg-gradient-to-r from-primary to-primary/80 text-white font-semibold hover:from-primary/90 hover:to-primary/70 transition-all shadow-lg shadow-primary/20"
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
            className="fixed inset-0 bg-surface/20 backdrop-blur-2xl z-[45] cursor-pointer"
            style={{ WebkitBackdropFilter: 'blur(20px)' }}
          />
        )}
      </AnimatePresence>

      {/* Sidebar Navigation - Hidden in Deep Work */}
      {currentView !== 'deep-work' && !volumeInDetail && (
        <nav className={`w-20 lg:w-64 flex flex-col bg-surface shrink-0 z-30 transition-all duration-700 ${activeTerm ? 'blur-[2px] grayscale opacity-50' : ''}`}>
          <div className="p-8 mb-4">
            <h1 className="text-2xl font-serif font-bold text-primary tracking-tighter">InkTrace</h1>
            <p className="text-[10px] text-stone-400 uppercase tracking-widest mt-1">静心治学</p>
          </div>
          
          <div className="flex-1 px-4 space-y-2">
            <NavItem icon={<LibraryBig size={20} />} label="库" active={currentView === 'library'} onClick={() => { setActiveTerm(null); setActiveBlockId(null); setCurrentView('library'); }} />
            <NavItem icon={<FileText size={20} />} label="深度工作" active={currentView === 'deep-work'} onClick={() => {
              // 切换到深度工作视图，使用上次处理的笔记 ID
              const lastNoteId = localStorage.getItem('inktrace_last_note_id') || 'demo_note';
              setCurrentNoteId(lastNoteId);
              setCurrentView('deep-work');
            }} />
            <NavItem icon={<BookType size={20} />} label="成册" active={currentView === 'volume'} onClick={() => setCurrentView('volume')} />
            <NavItem icon={<MessageCircleQuestion size={20} />} label="社区" active={currentView === 'community'} onClick={() => setCurrentView('community')} />
            <div className="py-4" />
            <NavItem icon={<Sliders size={20} />} label="设置" active={currentView === 'settings'} onClick={() => setCurrentView('settings')} />
          </div>

          <div className="p-6 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-on-surface/40 border border-outline-variant/40">
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
      <main className={`flex-1 relative bg-surface ${currentView === 'volume' ? 'overflow-auto' : 'overflow-hidden'}`}>
        <AnimatePresence mode="wait">
          {currentView === 'library' && <LibraryView onBookClick={handleProcessBook} onStartWeReadProcessing={handleStartWeReadProcessing} onDeepWorkBookClick={handleDeepWorkBookClick} />}
          {currentView === 'community' && <CommunityView setCurrentView={setCurrentView} />}
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
              showMeditation={showMeditation}
              setShowMeditation={setShowMeditation}
            />
          )}
          {currentView === 'assets' && <AssetsView key="assets" />}
          {currentView === 'volume' && <VolumeView key="volume" onDetailChange={setVolumeInDetail} />}
          {currentView === 'reader' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full overflow-y-auto bg-[#fbf9f8]"
            >
              <div className="max-w-2xl mx-auto px-8 py-12">
                {/* 返回 */}
                <button
                  onClick={() => { setActiveTerm(null); setActiveBlockId(null); setCurrentView('library'); }}
                  className="flex items-center gap-2 text-stone-400 hover:text-primary transition-colors mb-10 group"
                >
                  <ChevronLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
                  <span className="text-xs font-bold uppercase tracking-widest">文库</span>
                </button>
                {/* 标题 */}
                <h1 className="text-3xl font-serif font-bold text-stone-800 mb-10 leading-relaxed">
                  《{readerTitle.replace('《', '').replace('》', '')}》
                </h1>
                {/* 正文 */}
                <div className="font-serif text-base leading-loose text-stone-700 whitespace-pre-line">
                  {readerContent}
                </div>
              </div>
            </motion.div>
          )}
          {currentView === 'settings' && <SettingsView key="settings" />}
        </AnimatePresence>
      </main>

      {/* Enhanced Processing Overlay */}
      <AnimatePresence>
        {isProcessing && (
          processingMinimized ? (
            /* 最小化浮动窗 —— 可拖放 */
            <motion.div
              key="mini"
              drag
              dragMomentum={false}
              dragElastic={0.05}
              onDragStart={() => { isDraggingRef.current = true; }}
              onDragEnd={(_, info) => {
                setFloatOffset(prev => ({
                  x: (prev?.x ?? 0) + info.offset.x,
                  y: (prev?.y ?? 0) + info.offset.y,
                }));
                // 延迟重置，让 onClick 能读到 drag 状态
                setTimeout(() => { isDraggingRef.current = false; }, 50);
              }}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={floatOffset
                ? { opacity: 1, scale: 1, x: floatOffset.x, y: floatOffset.y }
                : { opacity: 1, scale: 1, x: 0, y: 0 }
              }
              exit={processingDone ? { opacity: 0, scale: 0.8, transition: { delay: 3 } } : { opacity: 0, scale: 0.8 }}
              onClick={() => {
                if (isDraggingRef.current) return;
                if (processingDone) {
                  setIsProcessing(false);
                  setProcessingMinimized(false);
                  setProcessingDone(false);
                  setFloatOffset(null);
                  setCurrentView('deep-work');
                  setShowMeditation(true);
                } else {
                  setProcessingMinimized(false);
                }
              }}
              className={`fixed bottom-6 right-6 z-[100] bg-surface/95 backdrop-blur-md rounded-xl shadow-2xl border px-3.5 py-2.5 cursor-grab active:cursor-grabbing hover:shadow-primary/10 transition-shadow duration-300 min-w-[180px] select-none ${processingDone ? 'border-primary/20 shadow-primary/10' : 'border-outline-variant/30'}`}
            >
              {/* 拖放手柄 */}
              <div className="flex items-center justify-center mb-1.5">
                <div className="w-6 h-0.5 rounded-full bg-stone-200/80" />
              </div>
              {processingDone ? (
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="text-primary" size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold text-primary">清洗完成</p>
                    <p className="text-[9px] text-outline-variant/50 mt-0.5">点击进入深读区</p>
                  </div>
                  <ArrowRight size={12} className="text-primary/60 shrink-0" />
                </div>
              ) : (
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-primary/5 flex items-center justify-center shrink-0">
                    <RefreshCw className="animate-spin text-primary" size={14} strokeWidth={1.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold text-on-surface/80 truncate">{getStatusMessage(processingProgress)}</p>
                    <div className="relative h-1 w-full bg-outline-variant/30 rounded-full overflow-hidden mt-1">
                      <motion.div
                        className="h-full bg-primary"
                        initial={{ width: 0 }}
                        animate={{ width: `${processingProgress}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-[9px] text-outline-variant/50 shrink-0">{processingProgress}%</span>
                </div>
              )}
            </motion.div>
          ) : (
            /* 全屏进度面板 */
            <motion.div
              key="full"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-surface/90 backdrop-blur-2xl flex flex-col items-center justify-center"
            >
            <div className="max-w-md w-full px-10 text-center space-y-12">
              {processingDone ? (
                <>
                  {/* 完成状态 */}
                  <div className="relative">
                    <div className="absolute inset-0 bg-primary/10 blur-3xl rounded-full scale-150" />
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                      className="relative bg-surface w-24 h-24 rounded-[2rem] mx-auto shadow-2xl flex items-center justify-center border border-primary/20"
                    >
                      <CheckCircle2 className="text-primary" size={40} strokeWidth={1.5} />
                    </motion.div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <h3 className="font-serif text-2xl font-bold text-primary">清洗完成</h3>
                      <p className="text-stone-400 text-xs mt-1">笔记已梳理妥当，可以开始深度思考了</p>
                    </div>
                    <button
                      onClick={() => {
                        setIsProcessing(false);
                        setProcessingMinimized(false);
                        setProcessingDone(false);
                        setCurrentView('deep-work');
                        setShowMeditation(true);
                      }}
                      className="inline-flex items-center gap-2 px-8 py-3 bg-primary text-white rounded-2xl shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5 transition-all duration-300 text-sm font-bold"
                    >
                      <span>进入深读区</span>
                      <ArrowRight size={16} />
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="relative">
                    <div className="absolute inset-0 bg-primary/10 blur-3xl rounded-full scale-150 animate-pulse" />
                    <div className="relative bg-surface w-24 h-24 rounded-[2rem] mx-auto shadow-2xl flex items-center justify-center border border-outline-variant/30">
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
                            processingProgress >= step * 25 ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20' : 'bg-surface-container/50 text-on-surface/20 border-outline-variant/20'
                          }`}>
                            L{step}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="relative h-1.5 w-full bg-outline-variant/30 rounded-full overflow-hidden">
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
                      className="pt-8"
                    >
                      <p className="font-serif text-on-surface/60 italic text-[15px] leading-relaxed mb-2">"{quotes[quoteIndex].text}"</p>
                      <p className="text-[10px] text-stone-400 uppercase tracking-widest">—— {quotes[quoteIndex].author}</p>
                    </motion.div>
                  </AnimatePresence>

                  {/* 最小化按钮 */}
                  <button
                    onClick={() => setProcessingMinimized(true)}
                    className="mx-auto flex items-center gap-1.5 text-[11px] text-stone-400 hover:text-primary transition-colors"
                  >
                    <Minimize2 size={12} />
                    <span>后台处理</span>
                  </button>
                </>
              )}
            </div>
          </motion.div>
        ))}
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

function CommunityView({ setCurrentView }: { setCurrentView: (v: View) => void }) {
  const [filter, setFilter] = useState('全部');
  const [posts, setPosts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [personaData, setPersonaData] = useState<any>(null);
  const [detailPost, setDetailPost] = useState<any>(null);
  const [swipeMode, setSwipeMode] = useState(false);
  const [swipeIndex, setSwipeIndex] = useState(0);

  const fetchFeed = async (type = '全部') => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/community/feed?limit=30&post_type=${type}`);
      if (res.ok) {
        const data = await res.json();
        setPosts(data.posts || []);
      }
    } catch (e) {
      console.error('Failed to load community feed:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetch(`${API_BASE}/weread/persona?book_title=${encodeURIComponent('万历十五年')}`)
      .then(r => r.json()).then(setPersonaData).catch(() => {});
  }, []);

  useEffect(() => {
    fetchFeed(filter);
    setSwipeIndex(0);
  }, [filter]);

  const filters = ['全部', '思考', '困惑', '荐书', '攻略'];

  // Hero = 点赞最多的帖子；其余按时间排
  const sorted = [...posts].sort((a, b) => (b.likes || 0) - (a.likes || 0));
  const heroPost = sorted.length > 0 ? sorted[0] : null;
  const restPosts = posts.filter(p => p.id !== heroPost?.id);

  const typeGradient: Record<string, string> = {
    '思考': 'from-primary/8 to-primary/[0.02]',
    '困惑': 'from-amber-100/60 to-amber-50/20',
    '荐书': 'from-blue-100/60 to-blue-50/20',
    '攻略': 'from-purple-100/50 to-purple-50/20',
  };

  const typeColor: Record<string, string> = {
    '思考': 'bg-primary/15 text-primary/70 border-primary/20',
    '困惑': 'bg-amber-100/60 text-amber-700 border-amber-200/50',
    '荐书': 'bg-blue-100/60 text-blue-700 border-blue-200/50',
    '攻略': 'bg-purple-100/60 text-purple-700 border-purple-200/50',
  };

  const typeAccent: Record<string, string> = {
    '思考': 'border-primary/30',
    '困惑': 'border-amber-400/40',
    '荐书': 'border-blue-400/40',
    '攻略': 'border-purple-400/40',
  };

  // Participant count
  const participantCount = new Set(posts.map(p => p.author_name)).size;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="h-full overflow-hidden flex flex-col max-w-2xl mx-auto"
    >
      {/* Header */}
      <header className="px-6 pt-10 pb-2 shrink-0">
        <div className="flex items-end justify-between mb-1">
          <div>
            <h2 className="text-4xl font-serif font-bold">社区</h2>
            <p className="text-sm text-on-surface/40 mt-1">被一段话打动，然后去读一本书</p>
          </div>
          {posts.length > 0 && (
            <button
              onClick={() => { setSwipeMode(!swipeMode); setSwipeIndex(0); }}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-medium transition-all ${
                swipeMode
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-surface-container/40 text-on-surface/40 hover:bg-surface-container hover:text-on-surface/60'
              }`}
            >
              <Zap size={13} />
              {swipeMode ? '退出刷卡' : '刷一刷'}
            </button>
          )}
        </div>

        {/* Stats bar */}
        {!isLoading && posts.length > 0 && (
          <div className="flex items-center gap-4 mb-3 text-[11px] text-on-surface/25">
            <span>{posts.length} 篇帖子</span>
            <span className="w-0.5 h-0.5 rounded-full bg-on-surface/20" />
            <span>{participantCount} 位读者</span>
            <span className="w-0.5 h-0.5 rounded-full bg-on-surface/20" />
            <span className="text-amber-500/60">{heroPost?.likes || 0} 赞热帖</span>
          </div>
        )}

        {/* Filter chips */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {filters.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
                filter === f
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-surface-container/40 text-on-surface/40 hover:bg-surface-container hover:text-on-surface/60'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </header>

      {/* Swipe stack mode */}
      {swipeMode && posts.length > 0 && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 pb-10 overflow-hidden">
          {/* Counter */}
          <div className="mb-4 text-center">
            <span className="text-xs text-on-surface/35 font-medium">{swipeIndex + 1}</span>
            <span className="text-xs text-on-surface/15"> / {posts.length}</span>
          </div>

          {/* Card stack */}
          <div className="relative w-full max-w-sm flex-1 flex items-center justify-center max-h-[65vh]">
            {/* Background cards (stack illusion) */}
            {[1, 2].map(offset => {
              const idx = swipeIndex + offset;
              if (idx >= posts.length) return null;
              const bgPost = posts[idx];
              return (
                <div
                  key={bgPost.id}
                  className="absolute inset-0 glaze-card rounded-2xl opacity-30"
                  style={{
                    transform: `scale(${1 - offset * 0.05}) translateY(${offset * 12}px)`,
                    zIndex: -offset,
                  }}
                />
              );
            })}

            {/* Top swipeable card — raw motion.div drag */}
            <AnimatePresence mode="popLayout">
              <motion.div
                key={posts[swipeIndex]?.id}
                drag="x"
                dragElastic={0.9}
                style={{ touchAction: 'pan-y' }}
                onDragEnd={(_, info) => {
                  if (info.offset.x < -80) {
                    setSwipeIndex(i => Math.min(i + 1, posts.length - 1));
                  } else if (info.offset.x > 80) {
                    setDetailPost(posts[swipeIndex]);
                  }
                }}
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0, x: -200, transition: { duration: 0.2 } }}
                whileTap={{ scale: 0.97 }}
                className="w-full glaze-card rounded-2xl overflow-hidden cursor-grab active:cursor-grabbing select-none"
              >
                <div className="p-5 flex flex-col" style={{ minHeight: '320px' }}>
                  {/* Type + date */}
                  <div className="flex items-center justify-between mb-4">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${typeColor[posts[swipeIndex]?.type] || typeColor['思考']}`}>
                      {posts[swipeIndex]?.type}
                    </span>
                    <span className="text-[10px] text-on-surface/25">{posts[swipeIndex]?.created_at?.slice(0, 10)}</span>
                  </div>

                  {/* 目的地：书名 */}
                  <div className="flex items-center gap-2 mb-4">
                    <BookOpen size={14} className="text-on-surface/25" />
                    <span className="text-[13px] font-bold text-on-surface/55 font-serif">《{posts[swipeIndex]?.book_title}》</span>
                  </div>

                  {/* Quote — 邀请的核心 */}
                  <div className="relative mb-4 flex-1">
                    <span className="absolute -top-2 left-0 text-5xl text-on-surface/6 font-serif select-none">&ldquo;</span>
                    <p className="relative z-10 text-[17px] text-on-surface/75 leading-[2.1] font-serif pl-4">
                      {posts[swipeIndex]?.quote || posts[swipeIndex]?.content?.replace(/^[-▪*]\s*/, '')}
                    </p>
                  </div>

                  {/* Thought */}
                  {posts[swipeIndex]?.thought && (
                    <div className="rounded-xl bg-surface-container/25 border border-outline-variant/8 p-4 mb-4">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Lightbulb size={10} className="text-amber-500/60" />
                        <span className="text-[9px] text-on-surface/25 tracking-wider">{posts[swipeIndex]?.author_name} 的思考</span>
                      </div>
                      <p className="text-[13px] text-on-surface/50 leading-relaxed">
                        {posts[swipeIndex]?.thought}
                      </p>
                    </div>
                  )}

                  {/* CTA — 去读这本书 */}
                  <button
                    onClick={(e) => { e.stopPropagation(); setCurrentView('library'); }}
                    className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-primary/90 text-white text-sm font-medium hover:bg-primary transition-colors shadow-sm mt-auto"
                  >
                    <BookOpen size={14} />
                    去读这本书
                  </button>

                  {/* Author */}
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-outline-variant/8">
                    <div className="w-6 h-6 rounded-full bg-surface-container flex items-center justify-center text-[10px] font-bold text-on-surface/25">
                      {posts[swipeIndex]?.author_name?.charAt(0)}
                    </div>
                    <span className="text-[11px] text-on-surface/35">{posts[swipeIndex]?.author_name}</span>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Swipe hints */}
          <div className="flex items-center gap-8 mt-4">
            <span className="flex items-center gap-1 text-[10px] text-on-surface/20">
              <ChevronLeft size={12} /> 跳过
            </span>
            <span className="flex items-center gap-1 text-[10px] text-on-surface/20">
              查看详情 <ChevronRight size={12} />
            </span>
          </div>
        </div>
      )}

      {/* Card feed (list mode) */}
      {!swipeMode && (
      <div className="flex-1 overflow-y-auto px-6 pb-20">
        {isLoading ? (
          <div className="space-y-4 pt-4">
            <div className="glaze-card p-6 rounded-2xl h-56 animate-pulse" />
            {[1, 2, 3].map(i => (
              <div key={i} className="glaze-card p-6 rounded-2xl h-36 animate-pulse" />
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-24">
            <div className="w-16 h-16 rounded-2xl bg-surface-container/40 flex items-center justify-center mx-auto mb-5">
              <MessageCircleQuestion size={24} className="text-on-surface/15" />
            </div>
            <p className="text-on-surface/35 font-serif text-[15px]">还没有人分享</p>
            <p className="text-xs text-on-surface/20 mt-1.5 leading-relaxed">
              去书库的「今日回顾」刷几条笔记，<br />点击分享即可出现在这里
            </p>
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            {/* WeRead 洞察卡片 */}
            {personaData?.persona && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="glaze-card p-5 rounded-2xl border-l-2 border-emerald-400/50"
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
                    <Sparkles size={10} className="text-emerald-600" />
                  </div>
                  <span className="text-[10px] font-bold text-emerald-700/70 uppercase tracking-widest">WeRead 阅读画像</span>
                </div>
                <p className="text-[13px] text-on-surface/65 leading-relaxed font-serif">
                  {personaData.persona}
                </p>
              </motion.div>
            )}

            {/* ── Hero 卡片：点赞最多的阅读邀请 ── */}
            {heroPost && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => setDetailPost(heroPost)}
                className={`relative overflow-hidden rounded-2xl bg-gradient-to-b ${typeGradient[heroPost.type] || typeGradient['思考']} border ${typeAccent[heroPost.type] || typeAccent['思考']} shadow-sm cursor-pointer`}
              >
                {/* 热门角标 */}
                <div className="absolute top-4 right-4 flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/60 backdrop-blur border border-white/50 text-[10px] font-bold text-amber-600">
                  <Flame size={11} />
                  热门
                </div>

                <div className="p-6 pt-5">
                  {/* 目的地：书名 */}
                  <div className="flex items-center gap-2 mb-5">
                    <BookOpen size={15} className="text-on-surface/25" />
                    <span className="text-[13px] font-bold text-on-surface/60 font-serif">《{heroPost.book_title}》</span>
                  </div>

                  {/* Hero quote — 邀请的核心 */}
                  <div className="relative mb-4">
                    <span className="absolute -top-3 -left-1 text-5xl text-on-surface/8 font-serif select-none">&ldquo;</span>
                    <p className="relative z-10 text-[18px] text-on-surface/80 leading-[2.1] font-serif pl-4">
                      {heroPost.quote || heroPost.content?.replace(/^[-▪*]\s*/, '')}
                    </p>
                  </div>

                  {/* Hero thought — 为邀请增加深度 */}
                  {heroPost.thought && (
                    <div className="rounded-xl bg-white/50 backdrop-blur border border-white/60 p-4 mb-4">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Lightbulb size={10} className="text-amber-500/60" />
                        <span className="text-[9px] text-on-surface/25 tracking-wider">{heroPost.author_name} 的思考</span>
                      </div>
                      <p className="text-[13px] text-on-surface/55 leading-relaxed">
                        {heroPost.thought}
                      </p>
                    </div>
                  )}

                  {/* Actions + CTA */}
                  <div className="flex items-center gap-5">
                    <button className="flex items-center gap-1.5 text-xs text-on-surface/30 hover:text-rose-500 transition-colors">
                      <Heart size={13} />
                      <span className="font-medium">{heroPost.likes || 0}</span>
                    </button>
                    <button className="flex items-center gap-1.5 text-xs text-on-surface/30 hover:text-primary transition-colors">
                      <MessageCircle size={13} />
                      <span className="font-medium">{heroPost.comments || 0}</span>
                    </button>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${typeColor[heroPost.type] || typeColor['思考']}`}>
                      {heroPost.type}
                    </span>
                    <div className="flex-1" />
                    <button
                      onClick={(e) => { e.stopPropagation(); setCurrentView('library'); }}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary/90 text-white text-xs font-medium hover:bg-primary transition-colors shadow-sm"
                    >
                      <BookOpen size={12} />
                      去读这本书
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── "更多发现" 分割线 ── */}
            {restPosts.length > 0 && (
              <div className="flex items-center gap-3 pt-2 pb-1">
                <span className="h-px flex-1 bg-outline-variant/20" />
                <span className="text-[10px] text-on-surface/20 tracking-widest">更多发现</span>
                <span className="h-px flex-1 bg-outline-variant/20" />
              </div>
            )}

            {/* ── 常规帖子流 ── */}
            {restPosts.map((post: any, idx: number) => (
              <motion.div
                key={post.id}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(idx * 0.05, 0.4) }}
                whileHover={{ y: -2 }}
                onClick={() => setDetailPost(post)}
                className={`glaze-card rounded-2xl overflow-hidden border-l-[3px] ${typeAccent[post.type] || typeAccent['思考']} transition-shadow hover:shadow-md cursor-pointer`}
              >
                <div className="p-4">
                  {/* 目的地：书名 + 作者 */}
                  <div className="flex items-center gap-2 mb-3">
                    <BookOpen size={13} className="text-on-surface/20" />
                    <span className="text-[12px] font-bold text-on-surface/55 font-serif">《{post.book_title}》</span>
                    <span className="text-[10px] text-on-surface/25">— {post.author_name}</span>
                    <div className="flex-1" />
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${typeColor[post.type] || typeColor['思考']}`}>
                      {post.type}
                    </span>
                  </div>

                  {/* Quote — 邀请的核心 */}
                  <div className="relative mb-3">
                    <span className="absolute -top-2 left-0 text-4xl text-on-surface/6 font-serif select-none leading-none">&ldquo;</span>
                    <p className="relative z-10 text-[15px] text-on-surface/75 leading-[2] font-serif pl-3.5 line-clamp-3">
                      {post.quote || post.content?.replace(/^[-▪*]\s*/, '')}
                    </p>
                  </div>

                  {/* Thought */}
                  {post.thought && (
                    <div className="mt-2.5 p-3 rounded-lg bg-surface-container/20 border border-outline-variant/5">
                      <p className="text-[11px] text-on-surface/45 leading-relaxed line-clamp-2">
                        {post.thought}
                      </p>
                    </div>
                  )}

                  {/* Actions + CTA */}
                  <div className="flex items-center gap-4 mt-3 pt-2.5 border-t border-outline-variant/5">
                    <button className="flex items-center gap-1 text-[10px] text-on-surface/20 hover:text-rose-500 transition-colors">
                      <Heart size={11} />
                      <span>{post.likes || 0}</span>
                    </button>
                    <button className="flex items-center gap-1 text-[10px] text-on-surface/20 hover:text-primary transition-colors">
                      <MessageCircle size={11} />
                      <span>{post.comments || 0}</span>
                    </button>
                    <div className="flex-1" />
                    <button
                      onClick={(e) => { e.stopPropagation(); setCurrentView('library'); }}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary/10 text-primary/70 text-[10px] font-medium hover:bg-primary/20 transition-colors"
                    >
                      <BookOpen size={10} />
                      去读这本书
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}

            {/* ── 底部引导 ── */}
            <div className="text-center pt-6 pb-4">
              <p className="text-[11px] text-on-surface/18 font-serif">
                每一段划线都是一扇门——分享你的笔记，邀请别人走进一本书
              </p>
            </div>
          </div>
        )}
      </div>
      )}

      {/* ── 帖子详情 modal ── */}
      <AnimatePresence>
        {detailPost && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 backdrop-blur-sm px-4"
            onClick={() => setDetailPost(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-[28px] shadow-2xl border border-outline-variant/10 w-full max-w-md max-h-[85vh] overflow-y-auto"
            >
              <div className="p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-5">
                  <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${typeColor[detailPost.type] || typeColor['思考']}`}>
                    {detailPost.type}
                  </span>
                  <button
                    onClick={() => setDetailPost(null)}
                    className="p-2 rounded-full hover:bg-surface-container/30 text-on-surface/25 transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* 目的地：书名 — 醒目的阅读邀请 */}
                <div className="flex items-center gap-2 mb-5 px-4 py-3 rounded-2xl bg-surface-container/15 border border-outline-variant/8">
                  <BookOpen size={16} className="text-primary/50" />
                  <div className="flex-1">
                    <p className="text-[11px] text-on-surface/30 mb-0.5">来自</p>
                    <p className="text-[15px] font-bold text-on-surface/70 font-serif">《{detailPost.book_title}》</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDetailPost(null); setCurrentView('library'); }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary/90 text-white text-xs font-medium hover:bg-primary transition-colors shadow-sm"
                  >
                    <BookOpen size={12} />
                    去读这本书
                  </button>
                </div>

                {/* 谁分享的 */}
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-9 h-9 rounded-full bg-surface-container flex items-center justify-center text-sm font-bold text-on-surface/25">
                    {detailPost.author_name?.charAt(0)}
                  </div>
                  <div>
                    <p className="text-[13px] font-bold text-on-surface/65">{detailPost.author_name}</p>
                    <p className="text-[10px] text-on-surface/25">{detailPost.created_at?.slice(0, 10)}</p>
                  </div>
                </div>

                {/* 原文出处 */}
                <div className="mb-5">
                  <p className="text-[10px] text-on-surface/25 uppercase tracking-widest mb-2">打动人的段落</p>
                  <div className="relative rounded-2xl bg-surface-container/20 border border-outline-variant/10 p-5">
                    <span className="absolute -top-2 left-4 text-5xl text-on-surface/6 font-serif select-none">&ldquo;</span>
                    <p className="text-[15px] text-on-surface/75 leading-[2] font-serif">
                      {detailPost.content?.replace(/^[-▪*]\s*/, '')}
                    </p>
                  </div>
                </div>

                {/* 思考内容 */}
                {detailPost.thought && (
                  <div className="mb-5">
                    <p className="text-[10px] text-on-surface/25 uppercase tracking-widest mb-2">{detailPost.author_name} 的思考</p>
                    <div className="rounded-2xl bg-surface-container/20 border border-outline-variant/10 p-5">
                      <p className="text-[14px] text-on-surface/65 leading-[1.9] font-serif">
                        {detailPost.thought}
                      </p>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-5 pt-4 border-t border-outline-variant/10">
                  <button className="flex items-center gap-1.5 text-xs text-on-surface/30 hover:text-rose-500 transition-colors">
                    <Heart size={14} />
                    <span className="font-medium">{detailPost.likes || 0}</span>
                  </button>
                  <button className="flex items-center gap-1.5 text-xs text-on-surface/30 hover:text-primary transition-colors">
                    <MessageCircle size={14} />
                    <span className="font-medium">{detailPost.comments || 0}</span>
                  </button>
                  <div className="flex-1" />
                  <button
                    onClick={() => setDetailPost(null)}
                    className="px-4 py-2 rounded-full bg-surface-container/60 text-xs text-on-surface/40 hover:bg-surface-container transition-colors"
                  >
                    关闭
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function LibraryView({ onBookClick, onStartWeReadProcessing, onDeepWorkBookClick }: { onBookClick: (id: string, status?: string, source?: string) => void | Promise<void>; onStartWeReadProcessing: (noteIds: string[]) => void; onDeepWorkBookClick?: (id: string) => void }) {
  const [books, setBooks] = useState<any[]>([]);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadType, setUploadType] = useState<'original' | 'dirty'>('dirty');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // WeRead 导入 state
  const [showWeReadModal, setShowWeReadModal] = useState(false);
  const [weReadStep, setWeReadStep] = useState<'input' | 'select' | 'importing' | 'source-upload'>('input');
  const [weReadApiKey, setWeReadApiKey] = useState('');
  const [weReadNotebooks, setWeReadNotebooks] = useState<any[]>([]);
  const [weReadSelectedBooks, setWeReadSelectedBooks] = useState<Set<string>>(new Set());
  const [weReadIsLoading, setWeReadIsLoading] = useState(false);
  const [weReadError, setWeReadError] = useState('');
  const [weReadImported, setWeReadImported] = useState<any[]>([]);
  const [weReadSourceFiles, setWeReadSourceFiles] = useState<Map<string, File | null>>(new Map());

  // 跨书碰撞 teaser state
  const [collisionTeaser, setCollisionTeaser] = useState<any>(null);
  const [showCollisionModal, setShowCollisionModal] = useState(false);

  // Share to community state
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareNote, setShareNote] = useState<{ bookTitle: string; content: string; quote: string } | null>(null);

  // 书籍推荐 state
  const [bookRecommendations, setBookRecommendations] = useState<any[]>([]);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [recommendationsBasis, setRecommendationsBasis] = useState('');
  const [recIndex, setRecIndex] = useState(0);
  const [recDetail, setRecDetail] = useState<any>(null);

  const handleShareFromReview = (note: any) => {
    setShareNote({
      bookTitle: note.data?.book_title || '',
      content: note.data?.markdown || note.data?.core_concept || '',
      quote: note.data?.markdown?.replace(/^[-▪*]\s*/, '').slice(0, 80) || note.data?.core_concept || '',
    });
    setShowShareModal(true);
  };

  // 深度看这本：触发完整 L3 加工流程（含冥想）
  const handleDeepWorkClick = (bookId: string) => {
    onDeepWorkBookClick?.(bookId);
  };

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
    fetch(`${API_BASE}/review/collisions/teaser`)
      .then(res => res.json())
      .then(data => { if (data.pair) setCollisionTeaser(data); })
      .catch(() => {});

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

  // 书籍推荐：当 books 加载后异步获取
  useEffect(() => {
    if (books.length === 0 || bookRecommendations.length > 0) return;
    const fetchRecommendations = async () => {
      setRecommendationsLoading(true);
      try {
        const ownedTitles = books.map((b: any) => b.title || '').filter(Boolean);
        const res = await fetch(`${API_BASE}/review/recommendations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ owned_books: ownedTitles, count: 4 }),
        });
        const data = await res.json();
        if (data.recommendations?.length > 0) {
          setBookRecommendations(data.recommendations);
          setRecommendationsBasis(data.based_on || '');
        }
      } catch (e) {
        console.error('Failed to fetch recommendations:', e);
      } finally {
        setRecommendationsLoading(false);
      }
    };
    fetchRecommendations();
  }, [books]);

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

  const handleDeleteBook = async (bookId: string, title: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!confirm(`确定要删除《${title}》吗？\n\n此操作将删除源文件、清洗结果和 L3 缓存，不可恢复。`)) return;
    try {
      const res = await fetch(`${API_BASE}/library/books/${bookId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        fetchBooks();
      } else {
        alert('删除失败：' + (data.message || data.detail || '未知错误'));
      }
    } catch (err) {
      console.error('Delete failed:', err);
      alert('删除失败，请检查后端服务');
    }
  };

  const resetWeReadModal = () => {
    setShowWeReadModal(false);
    setWeReadStep('input');
    setWeReadApiKey('');
    setWeReadNotebooks([]);
    setWeReadSelectedBooks(new Set());
    setWeReadError('');
    setWeReadIsLoading(false);
    setWeReadImported([]);
    setWeReadSourceFiles(new Map());
  };

  const handleWeReadVerify = async () => {
    if (!weReadApiKey.trim()) {
      setWeReadError('请输入 API Key');
      return;
    }
    setWeReadError('');
    setWeReadIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/weread/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: weReadApiKey.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setWeReadNotebooks(data.books || []);
        setWeReadStep('select');
      } else {
        setWeReadError(data.detail || '验证失败');
      }
    } catch (e: any) {
      setWeReadError(e.message || '网络错误');
    } finally {
      setWeReadIsLoading(false);
    }
  };

  const handleWeReadImport = async () => {
    if (weReadSelectedBooks.size === 0) return;
    setWeReadStep('importing');
    setWeReadIsLoading(true);
    setWeReadError('');
    try {
      const res = await fetch(`${API_BASE}/weread/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: weReadApiKey.trim(),
          book_ids: Array.from(weReadSelectedBooks),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setWeReadImported(data.imported || []);
        fetchBooks();
      } else {
        setWeReadError(data.detail || '导入失败');
      }
    } catch (e: any) {
      setWeReadError(e.message || '网络错误');
    } finally {
      setWeReadIsLoading(false);
    }
  };

  const handleSkipToDeepWork = async () => {
    const noteIds = weReadImported.map((b: any) => b.noteId);
    setWeReadIsLoading(true);
    try {
      await fetch(`${API_BASE}/weread/clean`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note_ids: noteIds }),
      });
      fetchBooks();
    } catch (e: any) {
      console.error('启动清洗失败:', e);
    }
    resetWeReadModal();
    if (noteIds.length > 0) {
      onStartWeReadProcessing(noteIds);
    }
  };

  const handleFinishAndClean = async () => {
    const noteIds = weReadImported.map((b: any) => b.noteId);
    setWeReadIsLoading(true);
    try {
      await fetch(`${API_BASE}/weread/clean`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note_ids: noteIds }),
      });
      fetchBooks();
    } catch (e: any) {
      console.error('启动清洗失败:', e);
    }
    resetWeReadModal();
    if (noteIds.length > 0) {
      onStartWeReadProcessing(noteIds);
    }
  };

  const handleSourceUpload = async (bookTitle: string, file: File) => {
    setWeReadIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'original');
      // 用书名作为文件名，确保和 WeRead 笔记标题匹配
      const safeTitle = bookTitle.replace(/《|》|\//g, '');
      formData.append('filename', `${safeTitle}.txt`);

      const res = await fetch(`${API_BASE}/upload/file`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        setWeReadSourceFiles(prev => new Map(prev).set(bookTitle, file));
        // 刷新库以扫描新源书
        fetchBooks();
      } else {
        setWeReadError(data.detail || '上传失败');
      }
    } catch (e: any) {
      setWeReadError(e.message || '网络错误');
    } finally {
      setWeReadIsLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="h-full overflow-y-auto p-10 max-w-6xl mx-auto"
    >
      <header className="mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-4xl font-serif font-bold">书库</h2>
            <button
              onClick={handleRefresh}
              className="p-2 hover:bg-surface-container/50 rounded-full transition-all text-on-surface/40 hover:text-primary active:rotate-180 duration-500"
              title="同步本地数据"
            >
              <RefreshCw size={18} />
            </button>
            <button
              onClick={() => setShowWeReadModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-outline-variant/50 text-[11px] text-on-surface/40 hover:bg-surface-container/30 transition-colors"
            >
              <BookOpen size={13} />
              <span>微信读书</span>
            </button>
            <button
              onClick={() => setShowUploadModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-white text-[11px] hover:opacity-90 transition-opacity"
              style={{ backgroundColor: '#436463' }}
            >
              <UploadCloud size={13} />
              <span>上传</span>
            </button>
          </div>
          <span className="text-sm text-on-surface/30">{books.length} 本藏书</span>
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
              className="bg-surface rounded-3xl shadow-2xl w-full max-w-md p-8 m-4"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-serif font-bold">导入文件</h3>
                <button
                  onClick={() => !isUploading && setShowUploadModal(false)}
                  className="p-2 hover:bg-surface-container/50 rounded-full transition-colors"
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
                        : 'border-outline-variant/50 hover:border-outline-variant'
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
                        : 'border-outline-variant/50 hover:border-outline-variant'
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
                      : 'border-outline-variant/50 hover:border-primary hover:bg-primary/5 text-on-surface/50'
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
                  <div className="h-2 bg-outline-variant/30 rounded-full overflow-hidden">
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
                  className="flex-1 py-3 rounded-xl border border-outline-variant/50 text-on-surface/60 hover:bg-surface-container/30 transition-colors disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  onClick={handleUpload}
                  disabled={!selectedFile || isUploading}
                  className="flex-1 py-3 rounded-xl text-white font-medium hover:opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundColor: '#1a3a36' }}
                >
                  {isUploading ? '上传中...' : '确认上传'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* WeRead 导入模态框 */}
      <AnimatePresence>
        {showWeReadModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[80] flex items-center justify-center"
            onClick={() => !weReadIsLoading && resetWeReadModal()}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-surface rounded-3xl shadow-2xl w-full max-w-md p-8 m-4 max-h-[80vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-serif font-bold">
                  {weReadStep === 'input' && '微信读书导入'}
                  {weReadStep === 'select' && '选择书籍'}
                  {weReadStep === 'importing' && '导入中'}
                </h3>
                <button
                  onClick={() => !weReadIsLoading && resetWeReadModal()}
                  className="p-2 hover:bg-surface-container/50 rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Step 1: 输入 API Key */}
              {weReadStep === 'input' && (
                <>
                  <p className="text-sm text-on-surface/50 mb-4">
                    输入你的微信读书 API Key，验证后可选择要导入的笔记。
                  </p>
                  <div className="mb-4">
                    <label className="text-sm font-medium text-stone-600 mb-2 block">API Key</label>
                    <input
                      type="password"
                      value={weReadApiKey}
                      onChange={e => setWeReadApiKey(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleWeReadVerify(); }}
                      placeholder="wrk-xxxxxxxx"
                      className="w-full px-4 py-3 rounded-xl border border-outline-variant/50 bg-surface-container/30 text-sm focus:outline-none focus:border-primary transition-colors"
                      disabled={weReadIsLoading}
                    />
                    <p className="text-[10px] text-on-surface/30 mt-1">
                      Key 仅本次导入使用，不会存储在你的服务器上
                    </p>
                  </div>
                  {weReadError && (
                    <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 text-red-600 text-sm flex items-center gap-2">
                      <AlertCircle size={14} />
                      {weReadError}
                    </div>
                  )}
                  <button
                    onClick={handleWeReadVerify}
                    disabled={weReadIsLoading || !weReadApiKey.trim()}
                    className="w-full py-3 rounded-xl text-white font-medium hover:opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    style={{ backgroundColor: '#436463' }}
                  >
                    {weReadIsLoading ? (
                      <><Loader2 size={16} className="animate-spin" />验证中...</>
                    ) : (
                      '验证 API Key'
                    )}
                  </button>
                </>
              )}

              {/* Step 2: 选择书籍 */}
              {weReadStep === 'select' && (
                <>
                  <p className="text-sm text-on-surface/50 mb-4">
                    共 {weReadNotebooks.length} 本有笔记的书，勾选要导入的：
                  </p>
                  <div className="space-y-2 mb-4 max-h-80 overflow-y-auto">
                    {weReadNotebooks.map((book: any) => {
                      const totalNotes = (book.noteCount || 0) + (book.reviewCount || 0) + (book.bookmarkCount || 0);
                      return (
                        <label
                          key={book.bookId}
                          className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                            weReadSelectedBooks.has(book.bookId)
                              ? 'border-primary bg-primary/5'
                              : 'border-outline-variant/30 hover:border-outline-variant/50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={weReadSelectedBooks.has(book.bookId)}
                            onChange={() => {
                              const next = new Set(weReadSelectedBooks);
                              if (next.has(book.bookId)) next.delete(book.bookId);
                              else next.add(book.bookId);
                              setWeReadSelectedBooks(next);
                            }}
                            className="w-4 h-4 rounded accent-primary"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{book.title}</p>
                            <p className="text-[11px] text-on-surface/40">{book.author} · {totalNotes} 条笔记</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                  {weReadNotebooks.length === 0 && (
                    <p className="text-center text-on-surface/40 py-8 text-sm">没有找到有笔记的书籍</p>
                  )}
                  <div className="flex gap-3">
                    <button
                      onClick={() => { setWeReadStep('input'); setWeReadError(''); }}
                      disabled={weReadIsLoading}
                      className="flex-1 py-3 rounded-xl border border-outline-variant/50 text-on-surface/60 hover:bg-surface-container/30 transition-colors"
                    >
                      返回
                    </button>
                    <button
                      onClick={handleWeReadImport}
                      disabled={weReadSelectedBooks.size === 0 || weReadIsLoading}
                      className="flex-1 py-3 rounded-xl text-white font-medium hover:opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ backgroundColor: '#436463' }}
                    >
                      导入选中（{weReadSelectedBooks.size}）
                    </button>
                  </div>
                </>
              )}

              {/* Step 3: 导入中 / 完成 */}
              {weReadStep === 'importing' && (
                <>
                  <div className="text-center py-8">
                    {weReadIsLoading ? (
                      <>
                        <Loader2 size={40} className="mx-auto mb-4 animate-spin text-primary" />
                        <p className="text-sm text-on-surface/50">正在导入并清洗，请稍候...</p>
                      </>
                    ) : weReadError ? (
                      <>
                        <AlertCircle size={40} className="mx-auto mb-4 text-red-400" />
                        <p className="text-sm text-red-600 mb-4">{weReadError}</p>
                        <button
                          onClick={() => setWeReadStep('select')}
                          className="px-4 py-2 rounded-xl border border-outline-variant/50 text-sm hover:bg-surface-container/30 transition-colors"
                        >
                          返回重试
                        </button>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={40} className="mx-auto mb-4 text-green-500" />
                        <p className="text-sm font-medium">导入完成</p>
                        <p className="text-xs text-on-surface/40 mt-1">
                          {weReadImported.length > 0 ? weReadImported.map((b: any) => b.title).join('、') : '已开始后台清洗'}
                        </p>
                        <p className="text-xs text-on-surface/30 mt-3 max-w-xs mx-auto leading-relaxed">
                          有这些书的原著文件吗？上传后 InkTrace 可以做原文比对，分析更精准。
                        </p>
                        <div className="flex gap-3 mt-4 justify-center">
                          <button
                            onClick={() => {
                              const noteIds = weReadImported.map((b: any) => b.noteId);
                              resetWeReadModal();
                              if (noteIds.length > 0) {
                                // 跳过原著，直接触发清洗 + 进度条
                                fetch(`${API_BASE}/weread/clean`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ note_ids: noteIds }),
                                }).then(() => fetchBooks()).catch(console.error);
                                onStartWeReadProcessing(noteIds);
                              }
                            }}
                            className="px-4 py-2 rounded-xl border border-outline-variant/50 text-sm text-on-surface/50 hover:bg-surface-container/30 transition-colors"
                          >
                            跳过
                          </button>
                          <button
                            onClick={() => setWeReadStep('source-upload')}
                            className="px-4 py-2 rounded-xl text-white text-sm font-medium hover:opacity-90 transition-colors"
                            style={{ backgroundColor: '#436463' }}
                          >
                            上传原著文件
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}

              {/* Step 4: 上传原著文件（可选） */}
              {weReadStep === 'source-upload' && (
                <>
                  <p className="text-sm text-on-surface/50 mb-4">
                    上传原著 .txt 文件后，InkTrace 可进行原文比对，分析更精准。不上传也可正常使用。
                  </p>
                  <div className="space-y-3 mb-4 max-h-60 overflow-y-auto">
                    {weReadImported.map((book: any) => {
                      const uploaded = weReadSourceFiles.has(book.title);
                      return (
                        <div
                          key={book.bookId || book.title}
                          className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                            uploaded
                              ? 'border-green-300 bg-green-50/50'
                              : 'border-outline-variant/30'
                          }`}
                        >
                          <BookOpen size={18} className={uploaded ? 'text-green-500' : 'text-on-surface/25'} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{book.title}</p>
                            <p className="text-[10px] text-on-surface/40">
                              {uploaded ? '已上传' : '未上传原著'}
                            </p>
                          </div>
                          <label className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                            uploaded
                              ? 'bg-green-100 text-green-700'
                              : 'border border-outline-variant/50 text-on-surface/50 hover:bg-surface-container/30'
                          }`}>
                            {uploaded ? '已上传' : '选择文件'}
                            <input
                              type="file"
                              accept=".txt,.md"
                              className="hidden"
                              disabled={weReadIsLoading}
                              onChange={e => {
                                const file = e.target.files?.[0];
                                if (file) handleSourceUpload(book.title, file);
                              }}
                            />
                          </label>
                        </div>
                      );
                    })}
                  </div>
                  {weReadError && (
                    <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 text-red-600 text-sm flex items-center gap-2">
                      <AlertCircle size={14} />
                      {weReadError}
                    </div>
                  )}
                  <div className="flex gap-3">
                    <button
                      onClick={handleSkipToDeepWork}
                      className="flex-1 py-3 rounded-xl border border-outline-variant/50 text-on-surface/60 hover:bg-surface-container/30 transition-colors"
                    >
                      跳过，直接查看笔记
                    </button>
                    <button
                      onClick={handleFinishAndClean}
                      disabled={weReadIsLoading}
                      className="flex-1 py-3 rounded-xl text-white font-medium hover:opacity-90 transition-colors disabled:opacity-50"
                      style={{ backgroundColor: '#436463' }}
                    >
                      {weReadIsLoading ? '启动中...' : '完成，开始清洗'}
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 跨书碰撞详情 modal */}
      <AnimatePresence>
        {showCollisionModal && collisionTeaser && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 backdrop-blur-sm px-4"
            onClick={() => setShowCollisionModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-[28px] shadow-2xl border border-outline-variant/10 w-full max-w-lg max-h-[85vh] overflow-y-auto"
            >
              <div className="p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2">
                    <Sparkles size={14} className="text-amber-500" />
                    <span className="text-[10px] font-bold text-on-surface/30 uppercase tracking-widest">跨书碰撞</span>
                  </div>
                  <button
                    onClick={() => setShowCollisionModal(false)}
                    className="p-2 rounded-full hover:bg-surface-container/30 text-on-surface/25 transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* LLM 洞察 —— 醒目展示 */}
                <div className="text-center mb-5">
                  <p className="text-[15px] text-on-surface/75 font-serif leading-relaxed">
                    {collisionTeaser.pair.insight || '两本书之间，有些神奇的联系'}
                  </p>
                  <div className="flex items-center justify-center gap-3 mt-3">
                    <span className="text-[11px] text-on-surface/35 font-serif">
                      《{collisionTeaser.pair.book_a}》
                    </span>
                    <span className="text-on-surface/20 text-xs">×</span>
                    <span className="text-[11px] text-on-surface/35 font-serif">
                      《{collisionTeaser.pair.book_b}》
                    </span>
                  </div>
                </div>

                {/* 左右对照：两段笔记原文 */}
                {collisionTeaser.cards.map((card: any, i: number) => (
                  <div key={i} className="grid grid-cols-2 gap-3 mb-5">
                    <div className="rounded-2xl bg-surface-container/30 border border-outline-variant/10 p-4">
                      <p className="text-[10px] text-primary/50 font-medium mb-2">
                        《{(card.data.source_book || '').slice(0, 10)}》
                      </p>
                      <p className="text-[13px] text-on-surface/70 leading-relaxed font-serif">
                        {(card.data.source_text || '').slice(0, 180)}
                        {(card.data.source_text || '').length > 180 ? '...' : ''}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-surface-container/30 border border-outline-variant/10 p-4">
                      <p className="text-[10px] text-primary/50 font-medium mb-2">
                        《{(card.data.target_book || '').slice(0, 10)}》
                      </p>
                      <p className="text-[13px] text-on-surface/70 leading-relaxed font-serif">
                        {(card.data.target_text || '').slice(0, 180)}
                        {(card.data.target_text || '').length > 180 ? '...' : ''}
                      </p>
                    </div>
                  </div>
                ))}

                {/* 启发提问 */}
                <div className="rounded-2xl bg-amber-50/40 border border-amber-200/30 p-4 mb-5">
                  <div className="flex items-start gap-2">
                    <Lightbulb size={14} className="text-amber-500/60 shrink-0 mt-0.5" />
                    <p className="text-[13px] text-amber-800/70 leading-relaxed font-serif">
                      {collisionTeaser.pair.provocation_question || '它们在不同的语境里指向了同一个问题吗？'}
                    </p>
                  </div>
                </div>

                {/* 操作：跳转到书中 */}
                <div className="flex flex-col gap-2">
                  {(() => {
                    const findBook = (title: string) => {
                      const clean = (s: string) => s.replace(/[《》]/g, '').trim();
                      return books.find((b: any) =>
                        clean(b.title || '') === clean(title) ||
                        clean(b.title || '').includes(clean(title)) ||
                        clean(title).includes(clean(b.title || ''))
                      );
                    };
                    const bookA = findBook(collisionTeaser.pair.book_a);
                    const bookB = findBook(collisionTeaser.pair.book_b);
                    return (
                      <>
                        {bookA && (
                          <button
                            onClick={() => { setShowCollisionModal(false); onBookClick(bookA.id, bookA.status, bookA.source); }}
                            className="w-full py-3 rounded-xl border border-outline-variant/30 hover:bg-surface-container/30 hover:border-primary/20 transition-colors text-sm text-on-surface/55 font-serif"
                          >
                            在《{collisionTeaser.pair.book_a}》中查看这条笔记
                          </button>
                        )}
                        {bookB && (
                          <button
                            onClick={() => { setShowCollisionModal(false); onBookClick(bookB.id, bookB.status, bookB.source); }}
                            className="w-full py-3 rounded-xl border border-outline-variant/30 hover:bg-surface-container/30 hover:border-primary/20 transition-colors text-sm text-on-surface/55 font-serif"
                          >
                            在《{collisionTeaser.pair.book_b}》中查看这条笔记
                          </button>
                        )}
                      </>
                    );
                  })()}
                  <button
                    onClick={() => setShowCollisionModal(false)}
                    className="w-full py-2.5 rounded-xl text-xs text-on-surface/25 hover:text-on-surface/45 transition-colors mt-1"
                  >
                    关闭
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 发现区 + 藏书：左右分栏 */}
      {books.length > 0 && (
        <>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
              <Sparkles size={10} className="text-primary/60" />
            </div>
            <h3 className="text-xs font-bold text-on-surface/30 uppercase tracking-widest">发现</h3>
            <span className="text-[10px] text-on-surface/20">基于你的阅读笔记</span>
          </div>

          <div className="flex gap-5 mb-6">
            {/* 左列：今日回顾 + 藏书 */}
            <div className="flex-1 min-w-0">
              <ReviewStream
                onShareNote={handleShareFromReview}
              />

              {/* 藏书 */}
              <div className="mt-6 space-y-8">
                <div className="flex items-center gap-2">
                  <BookOpen size={14} className="text-primary/50" />
                  <h3 className="text-xs font-bold text-on-surface/40 uppercase tracking-widest">藏书</h3>
                </div>

                {/* 原著 */}
                {(() => {
                  const lib = books.filter((b: any) => b.source === 'Library');
                  if (!lib.length) return null;
                  return (
                    <section>
                      <div className="flex items-center gap-2 mb-3">
                        <BookOpen size={14} className="text-primary/50" />
                        <h3 className="text-xs font-bold text-on-surface/40 uppercase tracking-widest">原著</h3>
                        <span className="text-[10px] text-on-surface/25">{lib.length}</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {lib.map((book: any) => (
                          <div key={book.id} onClick={() => onBookClick(book.id, book.status, book.source)}>
                            <BookCard {...book} onDelete={(e: React.MouseEvent) => handleDeleteBook(book.id, book.title, e)} onDeepWorkClick={() => handleDeepWorkClick(book.id)} />
                          </div>
                        ))}
                      </div>
                    </section>
                  );
                })()}

                {/* WeRead */}
                {(() => {
                  const weread = books.filter((b: any) => b.source === 'WeRead');
                  if (!weread.length) return null;
                  return (
                    <section>
                      <div className="flex items-center gap-2 mb-3">
                        <Bookmark size={14} className="text-primary/50" />
                        <h3 className="text-xs font-bold text-on-surface/40 uppercase tracking-widest">微信读书</h3>
                        <span className="text-[10px] text-on-surface/25">{weread.length}</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {weread.map((book: any) => (
                          <div key={book.id} onClick={() => onBookClick(book.id, book.status, book.source)}>
                            <BookCard {...book} onDelete={(e: React.MouseEvent) => handleDeleteBook(book.id, book.title, e)} onDeepWorkClick={() => handleDeepWorkClick(book.id)} />
                          </div>
                        ))}
                      </div>
                    </section>
                  );
                })()}
              </div>
            </div>

            {/* 右列：跨书碰撞 + 为你推荐 */}
            <div className="w-72 shrink-0 space-y-4">
              {/* 跨书碰撞 */}
              {collisionTeaser && (
                <motion.button
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => setShowCollisionModal(true)}
                  className="w-full text-left glaze-card p-4 rounded-2xl border border-amber-200/60 bg-amber-50/30 hover:bg-amber-50/50 transition-colors group"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Zap size={13} className="text-amber-500/70" />
                    <span className="text-[9px] font-bold text-amber-600/70 uppercase tracking-wider">跨书碰撞</span>
                  </div>
                  <p className="text-[12px] text-on-surface/55 font-serif leading-relaxed mb-2 line-clamp-2">
                    {collisionTeaser.pair.insight || `《${collisionTeaser.pair.book_a}》和《${collisionTeaser.pair.book_b}》之间，有些神奇的联系哦`}
                  </p>
                  <div className="flex items-center gap-1 text-[10px] text-amber-500/60 group-hover:text-amber-500 transition-colors">
                    展开看看 <ChevronRight size={10} />
                  </div>
                </motion.button>
              )}

              {/* 为你推荐 — 单卡滑动 */}
              {bookRecommendations.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5">
                      <Lightbulb size={11} className="text-amber-500/60" />
                      <span className="text-[10px] font-bold text-on-surface/25 uppercase tracking-wider">为你推荐</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setRecIndex(i => i > 0 ? i - 1 : bookRecommendations.length - 1)}
                        className="p-0.5 rounded-full hover:bg-surface-container/30 transition-colors"
                      >
                        <ChevronLeft size={12} className="text-on-surface/25" />
                      </button>
                      <span className="text-[9px] text-on-surface/20 tabular-nums w-8 text-center">
                        {recIndex + 1}/{bookRecommendations.length}
                      </span>
                      <button
                        onClick={() => setRecIndex(i => i < bookRecommendations.length - 1 ? i + 1 : 0)}
                        className="p-0.5 rounded-full hover:bg-surface-container/30 transition-colors"
                      >
                        <ChevronRight size={12} className="text-on-surface/25" />
                      </button>
                    </div>
                  </div>

                  <AnimatePresence mode="wait">
                    <motion.div
                      key={recIndex}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.15 }}
                      onClick={() => setRecDetail(bookRecommendations[recIndex])}
                      className="glaze-card p-4 rounded-2xl border border-outline-variant/10 hover:border-amber-200/50 transition-colors cursor-pointer group"
                    >
                      <div className="flex items-start gap-3 mb-3">
                        <div className="w-9 h-12 rounded-lg bg-gradient-to-br from-amber-100/60 to-orange-100/40 flex items-center justify-center shrink-0 shadow-sm">
                          <BookOpen size={12} className="text-amber-500/60" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] font-bold text-on-surface/70 font-serif leading-tight mb-0.5">
                            《{bookRecommendations[recIndex]?.title}》
                          </p>
                          <p className="text-[10px] text-on-surface/30">{bookRecommendations[recIndex]?.author}</p>
                        </div>
                      </div>
                      <p className="text-[11px] text-on-surface/45 leading-relaxed font-serif line-clamp-2">
                        {bookRecommendations[recIndex]?.reason}
                      </p>
                      <div className="flex items-center gap-1 mt-3 text-[9px] text-primary/30 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Search size={9} />
                        点击查看推荐详情
                      </div>
                    </motion.div>
                  </AnimatePresence>
                </div>
              )}

              {recommendationsLoading && (
                <div>
                  <div className="flex items-center gap-1.5 mb-3">
                    <Lightbulb size={11} className="text-amber-500/60" />
                    <span className="text-[10px] font-bold text-on-surface/25 uppercase tracking-wider">为你推荐</span>
                  </div>
                  <div className="glaze-card p-4 rounded-2xl h-28 animate-pulse" />
                </div>
              )}

              {!collisionTeaser && !bookRecommendations.length && !recommendationsLoading && (
                <div className="glaze-card p-5 rounded-2xl text-center">
                  <p className="text-[11px] text-on-surface/25 font-serif">
                    导入书籍并划线后，<br />跨书碰撞和推荐将会出现
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* 无藏书时的空状态 */}
      {books.length === 0 && (
        <div className="text-center py-20">
          <BookOpen size={40} className="mx-auto mb-4 text-outline-variant/30" />
          <p className="text-on-surface/40 font-serif">还没有藏书</p>
          <p className="text-xs text-on-surface/25 mt-1">点击上方"导入"开始你的阅读之旅</p>
        </div>
      )}

      {/* Share to community modal */}
      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        bookTitle={shareNote?.bookTitle || ''}
        content={shareNote?.content || ''}
        quote={shareNote?.quote}
      />

      {/* 推荐详情弹窗 */}
      <AnimatePresence>
        {recDetail && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 backdrop-blur-sm px-4"
            onClick={() => setRecDetail(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-[28px] shadow-2xl border border-outline-variant/10 w-full max-w-sm overflow-hidden"
            >
              {/* 顶部装饰 */}
              <div className="h-24 bg-gradient-to-br from-amber-100/60 via-orange-50/40 to-yellow-50/30 relative flex items-center justify-center">
                <div className="absolute top-4 right-4">
                  <button
                    onClick={() => setRecDetail(null)}
                    className="p-2 rounded-full bg-white/60 backdrop-blur text-on-surface/30 hover:text-on-surface/50 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
                <BookOpen size={32} className="text-amber-400/60" />
              </div>

              <div className="p-6">
                {/* 书名 + 作者 */}
                <h3 className="text-xl font-bold text-on-surface/80 font-serif mb-1">
                  《{recDetail.title}》
                </h3>
                <p className="text-sm text-on-surface/40 mb-5">{recDetail.author}</p>

                {/* 推荐理由 */}
                <div className="mb-5">
                  <p className="text-[10px] text-on-surface/25 uppercase tracking-widest mb-2">推荐理由</p>
                  <div className="rounded-2xl bg-amber-50/40 border border-amber-200/30 p-5">
                    <div className="flex items-start gap-2.5">
                      <Lightbulb size={14} className="text-amber-500/70 shrink-0 mt-0.5" />
                      <p className="text-[14px] text-on-surface/65 leading-[1.9] font-serif">
                        {recDetail.reason}
                      </p>
                    </div>
                  </div>
                </div>

                {/* 为什么推荐 */}
                <div className="rounded-2xl bg-surface-container/20 border border-outline-variant/10 p-5">
                  <p className="text-[10px] text-on-surface/25 uppercase tracking-widest mb-2">为什么推荐给你</p>
                  <p className="text-[12px] text-on-surface/45 leading-relaxed font-serif">
                    基于你笔记中体现的阅读品味和思考方式，这本书可能在你当前的兴趣方向上为你打开新的视角。
                  </p>
                </div>

                {/* 关闭 */}
                <div className="mt-6 pt-4 border-t border-outline-variant/10 flex justify-end">
                  <button
                    onClick={() => setRecDetail(null)}
                    className="px-5 py-2 rounded-full bg-surface-container/60 text-xs text-on-surface/40 hover:bg-surface-container transition-colors"
                  >
                    关闭
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function BookCard({ title, author, source, progress, status, statusColor, isError, onDelete, onDeepWorkClick }: any) {
  return (
    <div className="group rounded-xl bg-white border border-outline-variant/30 hover:border-outline-variant/50 hover:shadow-md transition-all cursor-pointer relative overflow-hidden">
      <div className={`h-24 flex items-center justify-center relative ${source === 'Library' ? 'bg-primary/[0.06]' : source === 'WeRead' ? 'bg-stone-100/30' : 'bg-surface-container/40'}`}>
        {source === 'Library' ? <BookOpen size={28} className="text-primary/25" /> : source === 'WeRead' ? <Bookmark size={28} className="text-stone-300/60" /> : <FileText size={28} className="text-on-surface/25" />}
        <div className="absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-surface/80 backdrop-blur-sm border border-outline-variant/20">
          <span className={`w-1.5 h-1.5 rounded-full ${statusColor}`} />
          <span className="text-[9px] text-on-surface/50">{status}</span>
        </div>
        {onDelete && (
          <button
            onClick={onDelete}
            title="删除"
            className="absolute top-2 left-2 w-5 h-5 flex items-center justify-center rounded-full bg-surface/80 backdrop-blur-sm border border-outline-variant/20 opacity-0 group-hover:opacity-100 transition-opacity text-on-surface/40 hover:text-red-500 hover:bg-red-50"
          >
            <X size={10} />
          </button>
        )}
      </div>
      <div className="p-3">
        <h4 className="font-serif text-sm font-bold truncate">{title}</h4>
        <p className="text-[11px] text-on-surface/40 mt-0.5 truncate">{author}</p>
        <div className="mt-2 h-0.5 w-full bg-outline-variant/30 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${isError ? 'bg-red-400' : 'bg-primary/40'}`} style={{ width: `${Math.max(progress || 0, 5)}%` }} />
        </div>
        {(status === '已完成' || status === '已深度思考') && (
          <button
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              onDeepWorkClick?.();
            }}
            className="mt-2 w-full py-1.5 text-[10px] font-bold text-primary/70 bg-primary/[0.04] rounded-lg border border-primary/10 opacity-0 group-hover:opacity-100 transition-all hover:bg-primary/10 hover:text-primary flex items-center justify-center gap-1"
          >
            <Sparkles size={10} />
            深度看这本
          </button>
        )}
      </div>
    </div>
  );
}

// ---------- 微冥想覆盖层 ----------
const BREATHING = { inhale: 4, hold: 4, exhale: 6, total: 14 } as const;
const MEDITATION_TOTAL = 30;

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

// 颂钵音合成（Web Audio API）
function useBowlSound() {
  const ctxRef = useRef<AudioContext | null>(null);

  const strike = useCallback(() => {
    try {
      if (!ctxRef.current) ctxRef.current = new AudioContext();
      const ctx = ctxRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      const now = ctx.currentTime;

      const tones = [
        { f: 261.6, g: 0.28 },  // C4
        { f: 329.6, g: 0.16 },  // E4
        { f: 392.0, g: 0.10 },  // G4
        { f: 523.2, g: 0.06 },  // C5
        { f: 332.6, g: 0.07 },  // slightly detuned E4 for beating
        { f: 658.0, g: 0.04 },  // E5
      ];

      const master = ctx.createGain();
      master.gain.setValueAtTime(0.35, now);
      master.gain.exponentialRampToValueAtTime(0.001, now + 7);
      master.connect(ctx.destination);

      tones.forEach(({ f, g }) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, now);
        osc.frequency.linearRampToValueAtTime(f * 0.996, now + 6);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(g, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 5.5);

        osc.connect(gain);
        gain.connect(master);
        osc.start(now);
        osc.stop(now + 7);
      });
    } catch (_) { /* audio not available */ }
  }, []);

  return strike;
}

function MeditationOverlay({ onComplete, onSkip }: { onComplete: () => void; onSkip: () => void }) {
  const [elapsed, setElapsed] = useState(0);
  const [isExiting, setIsExiting] = useState(false);
  const [strikeCount, setStrikeCount] = useState(0);
  const startRef = useRef(0);
  const lastPhaseRef = useRef('');
  const strike = useBowlSound();

  useEffect(() => {
    let raf: number;
    startRef.current = performance.now();
    const tick = () => {
      const secs = (performance.now() - startRef.current) / 1000;
      if (secs >= MEDITATION_TOTAL) {
        setElapsed(MEDITATION_TOTAL);
        setIsExiting(true);
        setTimeout(onComplete, 900);
        return;
      }
      setElapsed(secs);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // 首次敲钵
  useEffect(() => {
    const timer = setTimeout(() => strike(), 400);
    return () => clearTimeout(timer);
  }, []);

  const cyclePos = elapsed % BREATHING.total;
  const phase = (() => {
    if (cyclePos < BREATHING.inhale) return { name: 'inhale' as const, pos: cyclePos, dur: BREATHING.inhale };
    if (cyclePos < BREATHING.inhale + BREATHING.hold) return { name: 'hold' as const, pos: cyclePos - BREATHING.inhale, dur: BREATHING.hold };
    return { name: 'exhale' as const, pos: cyclePos - BREATHING.inhale - BREATHING.hold, dur: BREATHING.exhale };
  })();

  // 每个呼吸周期开始时敲钵
  useEffect(() => {
    if (phase.name === 'inhale' && phase.pos < 0.3 && lastPhaseRef.current !== 'inhale') {
      setStrikeCount(c => c + 1);
      strike();
    }
    lastPhaseRef.current = phase.name;
  }, [phase.name, phase.pos]);

  const breatheScale = (() => {
    if (isExiting) return 0.06;
    const ratio = Math.min(phase.pos / phase.dur, 1);
    const eased = easeInOut(ratio);
    if (phase.name === 'inhale') return 0.06 + 0.94 * eased;
    if (phase.name === 'hold') return 1.0;
    return 1.0 - 0.94 * eased;
  })();

  const ringOpacity = (() => {
    if (phase.name === 'inhale' && phase.pos < 4) return 0.85 * (1 - phase.pos / 4);
    return 0;
  })();

  const text = (() => {
    if (isExiting) return { main: '好了，放松肩膀', sub: '带着安静的心，进入深度阅读' };
    switch (phase.name) {
      case 'inhale': return { main: '缓缓吸气', sub: '随钵声吸入，感受空气充盈' };
      case 'hold': return { main: '屏住呼吸', sub: '停在这一刻，聆听余韵' };
      case 'exhale': return { main: '慢慢呼出', sub: '从嘴唇缓缓吐出，放下脑中杂念' };
    }
  })();
  const remaining = Math.ceil(MEDITATION_TOTAL - elapsed);
  const progress = elapsed / MEDITATION_TOTAL;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.8 }}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden"
      style={{
        background: '#f2f4f2',
        backgroundImage: `
          repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(130,145,138,0.04) 2px, rgba(130,145,138,0.04) 3px),
          repeating-linear-gradient(90deg, transparent, transparent 28px, rgba(120,138,130,0.03) 28px, rgba(120,138,130,0.03) 29px),
          radial-gradient(ellipse at 50% 40%, rgba(165,185,175,0.25) 0%, transparent 60%),
          radial-gradient(ellipse at 50% 100%, rgba(150,170,160,0.12) 0%, transparent 40%)
        `,
      }}
    >
      {/* 抽象画布 */}
      <div className="relative mb-10" style={{ width: 320, height: 300 }}>
        {/* 涟漪（每次"共振"时扩散） */}
        {ringOpacity > 0.01 && [1, 2, 3, 4].map((n) => (
          <motion.div
            key={`ring-${strikeCount}-${n}`}
            initial={{ scale: 0.25, opacity: ringOpacity }}
            animate={{ scale: 2.4, opacity: 0 }}
            transition={{ duration: 4 + n * 0.7, ease: 'easeOut' }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              width: 120, height: 120,
              border: `1px solid rgba(140,100,60,${ringOpacity * (1 - n * 0.22)})`,
            }}
          />
        ))}

        {/* 中心抽象圆（圆相/enso） */}
        <svg className="absolute top-0 left-0 w-full h-full" viewBox="0 0 320 300">
          {/* 外层淡晕 */}
          <motion.circle
            cx="160" cy="142" r="70"
            fill="none"
            stroke="rgba(160,120,70,0.06)"
            strokeWidth="12"
            animate={{ scale: breatheScale }}
            transition={{ duration: 0 }}
            style={{ transformOrigin: '160px 142px' }}
          />
          {/* 内层细环 */}
          <motion.circle
            cx="160" cy="142" r="52"
            fill="none"
            stroke="rgba(130,90,50,0.25)"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeDasharray="0 8"
            animate={{ scale: breatheScale, rotate: [0, 360] }}
            transition={{ duration: 0, rotate: { duration: 40, repeat: Infinity, ease: 'linear' } }}
            style={{ transformOrigin: '160px 142px' }}
          />
          {/* 主圆（圆相） */}
          <motion.circle
            cx="160" cy="142" r="58"
            fill="none"
            stroke="rgba(110,70,35,0.35)"
            strokeWidth="1.5"
            strokeLinecap="round"
            animate={{ scale: breatheScale }}
            transition={{ duration: 0 }}
            style={{ transformOrigin: '160px 142px' }}
          />
          {/* 缺口暗示（不完整圆）- 用短弧线 */}
          <motion.circle
            cx="160" cy="142" r="62"
            fill="none"
            stroke="rgba(140,100,55,0.15)"
            strokeWidth="1"
            strokeLinecap="round"
            strokeDasharray="80 240"
            strokeDashoffset="30"
            animate={{ scale: breatheScale }}
            transition={{ duration: 0 }}
            style={{ transformOrigin: '160px 142px' }}
          />
          {/* 中心墨点（呼气时凸显） */}
          <motion.circle
            cx="160" cy="142" r="4.5"
            fill="rgba(100,50,20,0.6)"
            animate={{
              opacity: phase.name === 'exhale' ? 0.7 : phase.name === 'hold' ? 0.2 : 0.1,
              r: phase.name === 'exhale' ? 5 : 4,
            }}
            transition={{ duration: 0.3 }}
          />
        </svg>

        {/* 共振时中心晕开的光 */}
        <motion.div
          animate={{
            opacity: phase.name === 'inhale' && phase.pos < 2 ? 0.55 * (1 - phase.pos / 2) : 0,
            scale: phase.name === 'inhale' && phase.pos < 0.4 ? 1.4 : 1,
          }}
          transition={{ duration: 0 }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            width: 130, height: 130,
            background: 'radial-gradient(circle, rgba(190,140,70,0.28) 10%, rgba(160,110,50,0.1) 50%, transparent 80%)',
            filter: 'blur(14px)',
          }}
        />

        {/* 散布的微点（虚空中的呼吸感） */}
        {useMemo(() => Array.from({ length: 8 }, (_, i) => ({
          x: 20 + Math.random() * 280,
          y: 15 + Math.random() * 250,
          r: 1.2 + Math.random() * 2.8,
          o: 0.15 + Math.random() * 0.2,
          d: 2.5 + Math.random() * 4,
        })), []).map((dot, i) => (
          <motion.div
            key={`dot-${i}`}
            className="absolute rounded-full"
            style={{
              left: dot.x, top: dot.y,
              width: dot.r, height: dot.r,
              background: 'rgba(140,95,50,0.55)',
            }}
            animate={{ opacity: [dot.o, dot.o * 3, dot.o] }}
            transition={{ duration: dot.d, repeat: Infinity, ease: 'easeInOut', delay: i * 0.7 }}
          />
        ))}

        {/* 倒计时 */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" style={{ marginTop: 105 }}>
          <span className="text-stone-400/35 text-[10px] font-mono tracking-[0.25em] tabular-nums">{remaining}s</span>
        </div>

        {/* 进度环 */}
        <svg className="absolute top-0 left-0 w-full h-full -rotate-90" viewBox="0 0 320 300">
          <circle cx="160" cy="150" r="135" fill="none" stroke="rgba(160,130,90,0.04)" strokeWidth="0.5" />
          <circle
            cx="160" cy="150" r="135" fill="none" stroke="rgba(140,100,60,0.14)" strokeWidth="0.75"
            strokeDasharray={2 * Math.PI * 135}
            strokeDashoffset={2 * Math.PI * 135 * (1 - progress)}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.3s linear' }}
          />
        </svg>
      </div>

      {/* 引导文字 */}
      <div className="text-center min-h-[80px] flex flex-col items-center gap-2 mb-8">
        <motion.p
          key={text.main + (isExiting ? 'end' : phase.name)}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-stone-600/80 text-2xl font-serif tracking-[0.15em]"
        >
          {text.main}
        </motion.p>
        <motion.p
          key={text.sub + (isExiting ? 'end' : phase.name)}
          initial={{ opacity: 0 }} animate={{ opacity: 0.5 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="text-stone-400/60 text-[13px] tracking-wider"
        >
          {text.sub}
        </motion.p>
      </div>

      <button
        onClick={() => { setIsExiting(true); setTimeout(onSkip, 400); }}
        className="absolute bottom-10 text-stone-300/60 hover:text-stone-400/80 text-xs tracking-[0.2em] transition-all duration-500 hover:tracking-[0.25em]"
      >
        跳过冥想，直接阅读
      </button>

      <div className="absolute bottom-20 flex gap-2.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="w-1 h-1 rounded-full transition-all duration-700"
            style={{ background: i * 5 < elapsed ? 'rgba(160,120,60,0.25)' : 'rgba(160,120,60,0.05)' }}
          />
        ))}
      </div>
    </motion.div>
  );
}

// Review mode: full-screen swipe cards for lightweight review
function ReviewMode({ markdownContent, currentNoteId, reviewIndex, setReviewIndex, setDwMode }: any) {
  // 提取书名
  const bookTitle = useMemo(() => {
    if (!markdownContent) return '';
    const m = markdownContent.match(/book:\s*(.+)/)?.[1]?.trim()
      || markdownContent.match(/《(.+?)》/)?.[1]?.trim()
      || markdownContent.match(/^##?\s+《?(.+?)》?\s*$/m)?.[1]?.trim();
    return m || '';
  }, [markdownContent]);

  // 解析笔记块——优先提取 ▪ / - 开头的真实划线
  const blocks = useMemo(() => {
    if (!markdownContent) return [];
    const lines = markdownContent.split('\n');
    const result: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith('#') || trimmed.startsWith('---') || trimmed.startsWith('book:') || trimmed.startsWith('author:')) continue;
      if (trimmed.includes('L3_DATA_START') || trimmed.includes('L3_DATA_END') || trimmed.startsWith('term:') || trimmed.startsWith('explanation:')) continue;

      const match = trimmed.match(/^[▪\-]\s+(.+)/);
      if (match) {
        result.push(match[1].trim());
      }
    }
    // 如果没有找到 ▪ 格式，退回按段落拆分
    if (result.length === 0) {
      const paragraphs = markdownContent.split('\n\n');
      for (const p of paragraphs) {
        const trimmed = p.trim();
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('## ')) continue;
        if (trimmed.includes('L3_DATA_START') || trimmed.includes('L3_DATA_END')) continue;
        result.push(trimmed.replace(/^[-▪*]\s*/, ''));
      }
    }
    return result;
  }, [markdownContent]);

  const total = blocks.length;
  const currentBlock = blocks[reviewIndex] || '';

  const handlePrev = () => { if (reviewIndex > 0) setReviewIndex((i: number) => i - 1); };
  const handleNext = () => { if (reviewIndex < total - 1) setReviewIndex((i: number) => i + 1); };

  // 键盘翻页
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'ArrowRight') handleNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [reviewIndex, total]);

  if (!markdownContent || total === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <BookOpen size={32} className="mx-auto mb-3 text-on-surface/12" />
          <p className="text-on-surface/30 text-sm">暂无笔记内容</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 overflow-hidden">
      {/* Progress: 点状指示器 + 书名 */}
      <div className="w-full max-w-md mb-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] text-on-surface/25 uppercase tracking-widest">回顾模式</span>
          <span className="text-[11px] text-on-surface/35 font-medium">{reviewIndex + 1}<span className="text-on-surface/15"> / {total}</span></span>
        </div>
        {/* Dot progress */}
        <div className="flex gap-1.5">
          {blocks.slice(0, Math.min(total, 30)).map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                i <= reviewIndex ? 'bg-primary/50' : 'bg-outline-variant/20'
              }`}
            />
          ))}
        </div>
        {bookTitle && (
          <p className="text-[11px] text-primary/45 font-serif text-center mt-3">《{bookTitle}》</p>
        )}
      </div>

      {/* 卡片 —— 借用分享图的奶油渐变 + 玻璃质感 */}
      <div className="w-full max-w-md flex-1 flex flex-col justify-center max-h-[65vh]">
        <motion.div
          key={reviewIndex}
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ type: 'spring', damping: 30, stiffness: 280 }}
          className="overflow-hidden"
          style={{
            width: '100%',
            aspectRatio: '3 / 4',
            maxHeight: '60vh',
            borderRadius: 28,
            position: 'relative',
            background: 'linear-gradient(160deg, #F8F6F2 0%, #F2F0EB 30%, #F5F3EF 60%, #FAF8F5 100%)',
            boxShadow: '0 20px 50px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)',
            display: 'flex',
            flexDirection: 'column',
            padding: 36,
            boxSizing: 'border-box',
          }}
        >
          {/* 玻璃光效 */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: 'radial-gradient(ellipse 500px 350px at 50% -10%, rgba(255,255,255,0.4) 0%, transparent 50%), radial-gradient(ellipse 200px 150px at 80% 90%, rgba(200,200,210,0.04) 0%, transparent 60%)',
          }} />

          {/* INKTRACE 标识 */}
          <p style={{
            textAlign: 'center', position: 'relative', zIndex: 1,
            fontSize: 10, color: '#B0B0B0', letterSpacing: '0.35em',
            fontWeight: 400, marginBottom: 28,
          }}>
            INKTRACE
          </p>

          {/* 引用卡片 */}
          <div style={{
            flex: 1,
            background: 'rgba(255,255,255,0.5)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            borderRadius: 18,
            padding: '24px 22px',
            position: 'relative', zIndex: 1,
            border: '1px solid rgba(255,255,255,0.7)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.02), inset 0 0 0 1px rgba(255,255,255,0.5)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}>
            <div style={{
              flex: 1,
              overflowY: 'auto',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            }}>
              <p style={{
                fontSize: 15,
                lineHeight: 2.2,
                color: '#4A4A4A',
                margin: 0,
                letterSpacing: '0.03em',
                fontFamily: '"Noto Serif SC", serif',
              }}>
                {currentBlock}
              </p>
            </div>

            {bookTitle && (
              <p style={{
                fontSize: 10,
                color: '#A0A0A0',
                margin: '14px 0 0 0',
                textAlign: 'right',
                letterSpacing: '0.05em',
              }}>
                —— 《{bookTitle}》
              </p>
            )}
          </div>

          {/* 细分隔线 */}
          <div style={{
            width: 32, height: 1,
            background: '#D0D0D0', opacity: 0.4,
            alignSelf: 'center', margin: '16px 0',
          }} />

          {/* 底部署名 */}
          <p style={{
            textAlign: 'center', position: 'relative', zIndex: 1,
            fontSize: 12, color: '#8A8A8A', letterSpacing: '0.04em',
            fontFamily: '"Noto Serif SC", serif', fontStyle: 'italic',
          }}>
            阅读留下的墨迹，值得被重新看见
          </p>
        </motion.div>
      </div>

      {/* 导航 */}
      <div className="w-full max-w-md flex items-center justify-between mt-6">
        <button
          onClick={handlePrev}
          disabled={reviewIndex === 0}
          className="flex items-center gap-1 px-4 py-2.5 rounded-full text-xs font-medium text-on-surface/35 hover:text-primary hover:bg-surface-container/50 disabled:opacity-15 disabled:cursor-default transition-all"
        >
          <ChevronLeft size={14} />
          上一条
        </button>

        <button
          onClick={() => setDwMode('study')}
          className="px-5 py-2.5 rounded-full bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-all"
        >
          退出回顾
        </button>

        <button
          onClick={handleNext}
          disabled={reviewIndex >= total - 1}
          className="flex items-center gap-1 px-4 py-2.5 rounded-full text-xs font-medium text-on-surface/35 hover:text-primary hover:bg-surface-container/50 disabled:opacity-15 disabled:cursor-default transition-all"
        >
          下一条
          <ChevronRight size={14} />
        </button>
      </div>

      {/* 提示：键盘操作 */}
      <p className="text-[10px] text-on-surface/15 mt-3">← → 方向键翻页</p>
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
  setUserThoughts,
  showMeditation,
  setShowMeditation
}: any) {
  const [semanticData, setSemanticData] = useState<any>(null);
  const [isLoadingSemantic, setIsLoadingSemantic] = useState(false);
  const [pinnedIndices, setPinnedIndices] = useState<Set<number>>(new Set());
  const [dwMode, setDwMode] = useState<'study' | 'review'>('study');
  const [reviewIndex, setReviewIndex] = useState(0);
  const dialogueRef = useRef<HTMLDivElement>(null);

  // 使用 ref 来防止 React StrictMode 导致的重复加载
  const isLoadingRef = useRef(false);
  const lastLoadedNoteIdRef = useRef('');


  const [chatInput, setChatInput] = useState('');

  function goToLibrary() {
    setActiveTerm(null);
    setActiveBlockId(null);
    setShowMeditation(false);
    setCurrentView("library");
  }
  const [chatHistory, setChatHistory] = useState<any[]>([]);
  const [isChatting, setIsChatting] = useState(false);
  const [volumeSelections, setVolumeSelections] = useState<Set<number>>(new Set());

  // 浮窗深探 state
  const [floatWindowOpen, setFloatWindowOpen] = useState(false);
  const [floatWindowItem, setFloatWindowItem] = useState<any>(null);
  const [floatChatHistory, setFloatChatHistory] = useState<any[]>([]);
  const [floatChatInput, setFloatChatInput] = useState('');
  const [isFloatChatting, setIsFloatChatting] = useState(false);
  const floatChatRef = useRef<HTMLDivElement>(null);
  const [floatChatCache, setFloatChatCache] = useState<Map<string, any[]>>(new Map());
  const [thinkSeeds, setThinkSeeds] = useState<any[]>([]);

  // L4 语义搜索状态
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showSearchPanel, setShowSearchPanel] = useState(false);

  // 跨书概念碰撞状态
  const [crossBookResults, setCrossBookResults] = useState<any[]>([]);
  const [isLoadingCrossBook, setIsLoadingCrossBook] = useState(false);
  const [crossBookExpanded, setCrossBookExpanded] = useState(false);
  const [crossBookGlimpseShown, setCrossBookGlimpseShown] = useState(false);
  const [userGlimpseThought, setUserGlimpseThought] = useState('');

  const [showRestoreToast, setShowRestoreToast] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const saveTimeoutRef = useRef<number | null>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);
  const shareCardRef = useRef<HTMLDivElement>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareData, setShareData] = useState<{quote: string; thought: string; bookTitle: string} | null>(null);
  const [showConfusionModal, setShowConfusionModal] = useState(false);
  const [confusionData, setConfusionData] = useState<{bookTitle: string} | null>(null);
  const [confusionText, setConfusionText] = useState('');
  const confusionCardRef = useRef<HTMLDivElement>(null);

  // 从思考内容中提取原文引用和思考正文
  const parseThoughtContent = (content: string) => {
    const quoteMatch = content.match(/^「([\s\S]*?)」/);
    const bodyStart = content.indexOf('我的思考：');
    return {
      quote: quoteMatch ? quoteMatch[1].trim() : '',
      thought: bodyStart !== -1 ? content.slice(bodyStart + 5).trim() : (quoteMatch ? content.slice(quoteMatch[0].length).trim() : content)
    };
  };

  // 获取某段落的第一条思考中的原文引用（用于补充时复用）
  const getGroupQuote = (blockId: number): string => {
    const groupThoughts = userThoughts.filter(t => t.blockId == blockId);  // == 兼容 string/number
    console.log('[getGroupQuote] blockId:', blockId, 'type:', typeof blockId, 'groupThoughts count:', groupThoughts.length);
    for (const t of groupThoughts) {
      const { quote } = parseThoughtContent(t.content || '');
      console.log('[getGroupQuote] thought id:', t.id, 'blockId:', t.blockId, 'type:', typeof t.blockId, 'content:', (t.content || '').slice(0, 60), 'quote:', JSON.stringify(quote));
      if (quote) return quote;
    }
    return '';
  };

  const handleShareThought = (thought: any) => {
    console.log('[handleShareThought] thought:', thought.id, 'blockId:', thought.blockId, 'content:', (thought.content || '').slice(0, 80));
    const groupQuote = thought.blockId != null ? getGroupQuote(thought.blockId) : '';
    const { quote: ownQuote, thought: body } = parseThoughtContent(thought.content || '');
    // 第三层兜底：从 markdown 段落本身提取原文
    const fallbackQuote = (thought.blockId != null && markdownContent)
      ? getBlockSnippet(markdownContent, thought.blockId, 200)
      : '';
    const rawQuote = groupQuote || ownQuote || fallbackQuote;
    const finalQuote = rawQuote.length > 120 ? rawQuote.slice(0, 120) + '...' : rawQuote;
    const rawThought = body || '';
    const finalThought = rawThought.length > 80 ? rawThought.slice(0, 80) + '...' : rawThought;
    const bookTitle =
      markdownContent?.match(/book:\s*(.+)/)?.[1]?.trim() ||
      markdownContent?.match(/《(.+?)》/)?.[1]?.trim() ||
      markdownContent?.match(/^# (.+)$/m)?.[1]?.trim() ||
      '';
    console.log('[handleShareThought] groupQuote:', JSON.stringify(groupQuote), 'ownQuote:', JSON.stringify(ownQuote), 'fallbackQuote:', JSON.stringify(fallbackQuote), 'finalQuote:', JSON.stringify(finalQuote), 'bookTitle:', bookTitle);
    setShareData({ quote: finalQuote, thought: finalThought, bookTitle });
    setShowShareModal(true);
  };

  const handleConfusionExchange = (thought: any) => {
    const bookTitle =
      markdownContent?.match(/book:\s*(.+)/)?.[1]?.trim() ||
      markdownContent?.match(/《(.+?)》/)?.[1]?.trim() ||
      markdownContent?.match(/^# (.+)$/m)?.[1]?.trim() ||
      '';
    setConfusionData({ bookTitle });
    setConfusionText('');
    setShowConfusionModal(true);
  };

  const downloadConfusionCard = async () => {
    if (!confusionCardRef.current) return;
    try {
      const canvas = await html2canvas(confusionCardRef.current, {
        backgroundColor: '#F7F4ED',
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const link = document.createElement('a');
      link.download = `inktrace-困惑-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (e) {
      console.error('困惑卡片生成失败:', e);
    }
  };

  const generateShareCanvas = async (): Promise<HTMLCanvasElement | null> => {
    console.log('[generateShareCanvas] shareCardRef.current:', shareCardRef.current);
    if (!shareCardRef.current) {
      alert('卡片未就绪，请稍后重试');
      return null;
    }
    try {
      const canvas = await html2canvas(shareCardRef.current, {
        backgroundColor: '#F7F4ED',
        scale: 3,
        useCORS: true
      });
      console.log('[generateShareCanvas] canvas:', canvas.width, 'x', canvas.height);
      return canvas;
    } catch (e) {
      console.error('分享卡片生成失败:', e);
      alert('图片生成失败，请重试');
      return null;
    }
  };

  const downloadShareCard = async () => {
    const canvas = await generateShareCanvas();
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `InkTrace_思考_${new Date().toISOString().slice(0,10)}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const copyShareCard = async () => {
    const canvas = await generateShareCanvas();
    if (!canvas) return;
    try {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Blob 生成失败');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      alert('已复制到剪贴板，可直接粘贴到微信/朋友圈');
    } catch (e) {
      console.error('复制失败:', e);
      alert('复制失败，已改为下载图片');
      downloadShareCard();
    }
  };

  const getBlockSnippet = (markdown: string, blockIdx: number, maxLen: number = 18): string => {
    if (!markdown || blockIdx == null) return '';
    const blocks = markdown.split('\n\n');
    const block = blocks[blockIdx];
    if (!block) return '';
    const firstLine = block.split('\n')[0].replace(/^#+\s*/, '').replace(/\*+/g, '').trim();
    if (!firstLine) return '';
    return firstLine.length > maxLen ? firstLine.slice(0, maxLen) + '...' : firstLine;
  };

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

  // 浮窗深探
  const handleFloatDiscuss = (item: any) => {
    const termKey = item.term || 'unknown';
    const cached = floatChatCache.get(termKey);
    setFloatWindowItem(item);
    setFloatChatHistory(cached || []);
    setFloatChatInput('');
    setFloatWindowOpen(true);
  };

  const handleFloatSend = async () => {
    if (!floatChatInput.trim() || isFloatChatting || !floatWindowItem) return;
    const userMsg = { role: 'user', content: floatChatInput.trim(), timestamp: new Date().toISOString() };
    setFloatChatHistory(prev => [...prev, userMsg]);
    setFloatChatInput('');
    setIsFloatChatting(true);
    try {
      const contextText = `${floatWindowItem.term}: ${floatWindowItem.explanation || floatWindowItem.note || ''}. ${floatWindowItem.provocation || ''}`;
      const res = await fetch(`${API_BASE}/notes/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ book_title: currentNoteId || 'Deep Dive', note_id: `float_${Date.now()}`, highlighted_text: contextText, message: userMsg.content, history: floatChatHistory.slice(-6) })
      });
      const data = await res.json();
      const fullReply = data.reply || '';
      setFloatChatHistory(prev => [...prev, { role: 'assistant', content: '', timestamp: new Date().toISOString() }]);
      let displayed = '';
      const interval = setInterval(() => {
        if (displayed.length < fullReply.length) {
          displayed += fullReply[displayed.length];
          setFloatChatHistory(prev => { const updated = [...prev]; updated[updated.length - 1] = { ...updated[updated.length - 1], content: displayed }; return updated; });
        } else { clearInterval(interval); }
      }, 30);
    } catch (e) { console.error('Float chat failed:', e); }
    finally { setIsFloatChatting(false); }
  };

  const handleFloatSummarize = async () => {
    if (isFloatChatting || floatChatHistory.length === 0 || !floatWindowItem) return;
    setIsFloatChatting(true);
    try {
      const contextText = `${floatWindowItem.term}: ${floatWindowItem.explanation || ''}. ${floatWindowItem.provocation || ''}`;
      const res = await fetch(`${API_BASE}/notes/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ book_title: currentNoteId || 'Deep Dive', note_id: `float_summary_${Date.now()}`, highlighted_text: contextText, message: '请用100字以内浓缩以上探讨的核心精髓。', history: floatChatHistory.slice(-10) })
      });
      const data = await res.json();
      const fullReply = data.reply || '';
      setFloatChatHistory(prev => [...prev, { role: 'assistant', content: '', timestamp: new Date().toISOString(), isDigest: true }]);
      let displayed = '';
      const interval = setInterval(() => {
        if (displayed.length < fullReply.length) { displayed += fullReply[displayed.length]; setFloatChatHistory(prev => { const updated = [...prev]; updated[updated.length - 1] = { ...updated[updated.length - 1], content: displayed }; return updated; }); }
        else { clearInterval(interval); }
      }, 20);
    } catch (e) { console.error('Float summarize failed:', e); }
    finally { setIsFloatChatting(false); }
  };

  const handleFloatClose = () => {
    if (floatWindowItem && floatChatHistory.length > 0) {
      const termKey = floatWindowItem.term || 'unknown';
      setFloatChatCache(prev => { const next = new Map(prev); next.set(termKey, floatChatHistory); return next; });
    }
    setFloatWindowOpen(false);
  };

  const handleFloatPinToMain = () => {
    if (floatChatHistory.length === 0 || !floatWindowItem) return;
    const digestMsg = floatChatHistory.find((m: any) => m.isDigest);
    const summaryContent = digestMsg?.content || floatChatHistory.filter((m: any) => m.role === 'assistant').slice(-1)[0]?.content || '';
    setUserThoughts((prev: any) => [{ id: Date.now(), content: `${floatWindowItem.term}: ${summaryContent.slice(0, 200)}`, question: floatWindowItem.provocation || floatWindowItem.term, answer: summaryContent.slice(0, 300), createdAt: new Date().toLocaleString('zh-CN'), type: 'pinned', blockId: activeBlockId, paragraphIndex: 0, relation: floatWindowItem.relation, provocation: floatWindowItem.provocation }, ...prev]);
    setThinkSeeds((prev: any) => prev.map((s: any) => s.term === floatWindowItem.term ? { ...s, discussed: true } : s));
  };

  const handleFloatSaveToVolume = async () => {
    if (isFloatChatting || floatChatHistory.length === 0 || !floatWindowItem) return;
    setIsFloatChatting(true);
    try {
      // 1. 如果没有精萃摘要，先生成
      let digestContent = floatChatHistory.find((m: any) => m.isDigest)?.content || '';
      if (!digestContent) {
        const contextText = `${floatWindowItem.term}: ${floatWindowItem.explanation || ''}. ${floatWindowItem.provocation || ''}`;
        const res = await fetch(`${API_BASE}/notes/chat`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ book_title: currentNoteId || 'Deep Dive', note_id: `float_volume_${Date.now()}`, highlighted_text: contextText, message: '请用100字以内浓缩以上探讨的核心精髓，提炼出1-2个关键洞察。', history: floatChatHistory.slice(-10) })
        });
        const data = await res.json();
        digestContent = data.reply || '';
        setFloatChatHistory(prev => [...prev, { role: 'assistant', content: digestContent, timestamp: new Date().toISOString(), isDigest: true }]);
      }

      // 2. 保存到 userThoughts（会自动进入 session → 成册区）
      const summaryContent = digestContent || floatChatHistory.filter((m: any) => m.role === 'assistant').slice(-1)[0]?.content || '';
      const card = {
        id: Date.now(),
        content: `${floatWindowItem.term}: ${summaryContent.slice(0, 200)}`,
        question: floatWindowItem.provocation || floatWindowItem.term,
        answer: summaryContent.slice(0, 300),
        createdAt: new Date().toLocaleString('zh-CN'),
        type: 'pinned',
        blockId: activeBlockId,
        paragraphIndex: 0,
        relation: floatWindowItem.relation,
        provocation: floatWindowItem.provocation
      };
      setUserThoughts((prev: any) => [card, ...prev]);
      setThinkSeeds((prev: any) => prev.map((s: any) => s.term === floatWindowItem.term ? { ...s, discussed: true } : s));

      // 3. 立即持久化到 session
      await saveSession(currentNoteId, [card, ...userThoughts]);

      // 4. 关闭浮窗
      setFloatWindowOpen(false);
    } catch (e) {
      console.error('保存至成册失败:', e);
    } finally {
      setIsFloatChatting(false);
    }
  };

  // 思考种子
  const handleSeedLater = (item: any) => {
    setThinkSeeds((prev: any) => [{ id: Date.now(), term: item.term, relation: item.relation || '关联', explanation: item.explanation || item.note || '', provocation: item.provocation || '', blockId: activeBlockId, createdAt: new Date().toLocaleString('zh-CN'), type: 'think-seed', discussed: false }, ...prev]);
  };

  const handleSeedDiscuss = (seed: any) => { handleFloatDiscuss(seed); };

  const handleRemoveSeed = (seedId: number) => { setThinkSeeds((prev: any) => prev.filter((s: any) => s.id !== seedId)); };

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

  // 粒子动画状态
  const [flyingParticles, setFlyingParticles] = useState<Array<{id: number, x: number, y: number}>>([]);
  const [newCardId, setNewCardId] = useState<number | null>(null);

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
        right_cards: [
          ...thoughtsToSave.map((card, index) => ({
            id: card.id.toString(),
            type: card.type,
            content: card.content || card.answer || '',
            title: card.question || card.title || '',
            pinned: card.type === 'pinned',
            order: index,
            block_id: card.blockId || null,
            paragraph_index: card.paragraphIndex ?? 0,
            relation: card.relation || null,
            provocation: card.provocation || null,
            explanation: card.explanation || null
          })),
          ...thinkSeeds.map((seed, index) => ({
            id: seed.id.toString(),
            type: 'think-seed',
            content: seed.provocation || seed.term,
            title: seed.term,
            pinned: true,
            order: thoughtsToSave.length + index,
            relation: seed.relation || null,
            provocation: seed.provocation || null,
            explanation: seed.explanation || null,
            discussed: seed.discussed || false
          }))
        ],
        final_markdown: markdownToSave,
        volume_selections: {
          selected_message_indices: Array.from(volumeSelections)
        }
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
        const { chat_history, right_cards, final_markdown, volume_selections } = data.data;
        console.log('[restoreSession] right_cards:', right_cards);
        
        // 恢复 markdown 内容 - 只有当当前没有内容时才从 session 恢复
        // 这样可以保留从 API 加载的最新数据（包含 L3 数据）
        if (final_markdown && !markdownContent) {
          setProcessedMarkdown(final_markdown);
        }

        // 如果 session 没有 markdown 且当前也没有，从 note content API 加载
        if (!final_markdown && !markdownContent) {
          try {
            console.log('[restoreSession] 无缓存内容，从 API 加载笔记...');
            const noteRes = await fetch(`${API_BASE}/notes/${targetNoteId}/content`);
            const noteData = await noteRes.json();
            if (noteData.success && noteData.content) {
              setProcessedMarkdown(noteData.content);
              console.log('[restoreSession] ✅ 从 API 加载成功:', noteData.content.length, '字符');
            }
          } catch (e) {
            console.error('[restoreSession] 从 API 加载笔记失败:', e);
          }
        }
        
        if (chat_history && chat_history.length > 0) {
          setChatHistory(chat_history);
        } else {
          setChatHistory([]);
        }
        
        if (right_cards && right_cards.length > 0) {
          const userCards: any[] = [];
          const seeds: any[] = [];
          right_cards.forEach((card: any) => {
            if (card.type === 'think-seed') {
              seeds.push({ id: parseInt(card.id) || Date.now(), term: card.title || '', relation: card.relation || '关联', explanation: card.explanation || '', provocation: card.provocation || card.content || '', blockId: card.block_id || null, createdAt: new Date().toLocaleString('zh-CN'), type: 'think-seed', discussed: card.discussed || false });
            } else {
              userCards.push({ id: parseInt(card.id) || Date.now(), content: card.content, question: card.title, answer: card.content, createdAt: new Date().toLocaleString('zh-CN'), type: card.pinned ? 'pinned' : card.type || 'user', blockId: card.block_id ?? null, paragraphIndex: card.paragraph_index ?? 0, relation: card.relation, provocation: card.provocation });
            }
          });
          console.log('[restoreSession] Restored thoughts:', userCards, 'seeds:', seeds);
          setUserThoughts(userCards);
          setThinkSeeds(seeds);
        } else {
          console.log('[restoreSession] No thoughts to restore');
          setUserThoughts([]);
          setThinkSeeds([]);
        }

        // 恢复 volume 选择状态
        if (volume_selections && volume_selections.selected_message_indices) {
          setVolumeSelections(new Set(volume_selections.selected_message_indices));
        } else {
          setVolumeSelections(new Set());
        }
        
        setShowRestoreToast(true);
        setTimeout(() => setShowRestoreToast(false), 2000);
      } else {
        console.log('[restoreSession] No data found, clearing state');
        setChatHistory([]);
        setUserThoughts([]);

        // 尝试从 API 加载笔记内容作为回退
        if (!markdownContent) {
          try {
            console.log('[restoreSession] 无 session 记录，从 API 加载笔记...');
            const noteRes = await fetch(`${API_BASE}/notes/${targetNoteId}/content`);
            const noteData = await noteRes.json();
            if (noteData.success && noteData.content) {
              setProcessedMarkdown(noteData.content);
              console.log('[restoreSession] ✅ 从 API 加载成功:', noteData.content.length, '字符');
            }
          } catch (e) {
            console.error('[restoreSession] API 回退也失败了:', e);
          }
        }
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

      // 清空状态（不清空 markdown——restoreSession 会负责恢复或从 API 拉取）
      setSemanticData(null);
      setChatHistory([]);
      setUserThoughts([]);
      setPinnedIndices(new Set());
      setActiveTerm(null);
      setActiveBlockId(null);

      // 加载新笔记（内部有 API 回退逻辑）
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
          order: index,
          block_id: card.blockId || null,
          paragraph_index: card.paragraphIndex ?? 0
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
    // 生成粒子：从菜单位置飘向右面板
    const particles = Array.from({ length: 7 }, (_, i) => ({
      id: Date.now() + i,
      x: selectionMenuPos.x + (Math.random() - 0.5) * 60,
      y: selectionMenuPos.y + (Math.random() - 0.5) * 30,
    }));
    setFlyingParticles(particles);
    // 粒子飞完后再打开弹窗
    setTimeout(() => {
      setFlyingParticles([]);
      setNewThought(`「${selectedText}」\n\n我的思考：\n`);
      setShowThoughtModal(true);
    }, 400);
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
    setNewCardId(thought.id);
    // 滚动到新卡片让用户看到弹性动效
    setTimeout(() => {
      const el = document.getElementById(`thought-${thought.id}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
    setTimeout(() => setNewCardId(null), 1500);

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
          block_id: card.blockId || null,
          paragraph_index: card.paragraphIndex ?? 0
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
    } catch (e) {
      console.error("[handleSaveThought] Failed to save thought:", e);
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
          order: index,
          block_id: card.blockId || null,
          paragraph_index: card.paragraphIndex ?? 0
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

  const toggleVolumeSelection = (msgIndex: number) => {
    setVolumeSelections(prev => {
      const next = new Set(prev);
      if (next.has(msgIndex)) next.delete(msgIndex);
      else next.add(msgIndex);
      return next;
    });
  };


  const handleGoToVolume = async () => {
    await saveSession(currentNoteId);
    localStorage.setItem('inktrace_volume_auto_open', currentNoteId);
    setCurrentView('volume');
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
          order: index,
          block_id: card.blockId || null,
          paragraph_index: card.paragraphIndex ?? 0
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
      setShowMeditation(false);
      return;
    }

    setActiveBlockId(idx);
    setChatHistory([]);
    setChatInput("");

    // 重置跨书碰撞状态
    setCrossBookResults([]);
    setCrossBookExpanded(false);
    setCrossBookGlimpseShown(false);
    setUserGlimpseThought('');

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
        if (item.includes('|||')) {
          const parts = item.split('|||');
          return { term: parts[0]?.trim() || item, relation: parts[1]?.trim() || '关联', explanation: parts[2]?.trim() || '暂无详细解释', provocation: parts[3]?.trim() || '' };
        }
        const splitIdx = item.indexOf(':');
        if (splitIdx !== -1) {
          const term = item.substring(0, splitIdx).trim();
          let note = item.substring(splitIdx + 1).trim();
          if (note.toLowerCase() === 'none' || !note) note = "深度关联逻辑待补充";
          return { term, relation: '关联', explanation: note, provocation: '' };
        }
        return { term: item, relation: '关联', explanation: '深度关联逻辑待补充', provocation: '' };
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
        relation: item.relation || item.note || '关联',
        explanation: item.explanation || item.note || '暂无详细解释',
        provocation: item.provocation || ''
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
    const summaryPrompt = `针对你刚才的这段回答，请进行"精萃提取"。
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
          order: index,
          block_id: card.blockId || null,
          paragraph_index: card.paragraphIndex ?? 0
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


  // ==========================================
  // 跨书概念碰撞
  // ==========================================

  const handleCrossBookCollide = async () => {
    if (isLoadingCrossBook) return;
    setIsLoadingCrossBook(true);
    setCrossBookExpanded(true);
    setCrossBookGlimpseShown(true);

    const sourceBook = markdownContent.match(/book:\s*(.+)/)?.[1]?.trim()
      || markdownContent.match(/《(.+?)》/)?.[1]?.trim()
      || '';

    try {
      const concept = semanticData?.term || '';
      const params = new URLSearchParams({
        block_index: String(activeBlockId ?? 0),
        core_concept: concept,
        top_k: '5'
      });
      if (sourceBook) params.set('source_book_title', sourceBook);

      const res = await fetch(`${API_BASE}/search/collide/${currentNoteId}?${params}`);
      const data = await res.json();
      if (data.success) {
        setCrossBookResults(data.results || []);
      }
    } catch (e) {
      console.error('Cross-book collision failed:', e);
    } finally {
      setIsLoadingCrossBook(false);
    }
  };

  const tensionColors: Record<string, string> = {
    '支持': 'bg-emerald-50 text-emerald-700 border-emerald-200',
    '反驳': 'bg-rose-50 text-rose-700 border-rose-200',
    '互补': 'bg-sky-50 text-sky-700 border-sky-200',
    '案例化': 'bg-amber-50 text-amber-700 border-amber-200',
  };

  const tensionIcons: Record<string, any> = {
    '支持': CheckCircle2,
    '反驳': AlertCircle,
    '互补': Puzzle,
    '案例化': BookOpen,
  };


  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="h-full flex paper-texture"
    >
      <header className="fixed top-0 right-0 left-0 h-14 z-[60] flex justify-between items-center px-6 lg:px-10 pointer-events-none">
        <AnimatePresence>
          {!activeTerm && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2 }}
            >
              <button onClick={async () => {
                if (userThoughts.length > 0 || chatHistory.length > 0) {
                  await saveSession(currentNoteId);
                }
                goToLibrary();
              }} className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/40 backdrop-blur-xl border border-white/30 text-stone-500 hover:text-primary hover:bg-white/60 hover:border-white/40 transition-all group shadow-sm pointer-events-auto">
                <ChevronLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
                <span className="text-[11px] font-bold uppercase tracking-widest">文库</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {!activeTerm && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-3"
            >
              <button
                onClick={handleGoToVolume}
                className="flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-white/40 backdrop-blur-xl border border-white/30 text-stone-600 text-[11px] font-bold hover:bg-white/60 hover:border-white/40 hover:text-primary transition-all shadow-sm pointer-events-auto"
                title="将对话精华和思考卡片收束到成册区进行整理"
              >
                <BookOpen size={13} /> 收束成册
              </button>
              {/* Mode switcher */}
              <div className="flex rounded-2xl bg-white/40 backdrop-blur-xl border border-white/30 p-0.5 shadow-sm pointer-events-auto">
                <button
                  onClick={() => { setDwMode('study'); setReviewIndex(0); }}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all ${
                    dwMode === 'study' ? 'bg-white text-primary shadow-sm' : 'text-stone-400 hover:text-stone-600'
                  }`}
                >
                  研读
                </button>
                <button
                  onClick={() => setDwMode('review')}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all ${
                    dwMode === 'review' ? 'bg-white text-primary shadow-sm' : 'text-stone-400 hover:text-stone-600'
                  }`}
                >
                  回顾
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Review mode: full-screen swipe cards */}
      {dwMode === 'review' ? (
        <ReviewMode
          markdownContent={markdownContent}
          currentNoteId={currentNoteId}
          reviewIndex={reviewIndex}
          setReviewIndex={setReviewIndex}
          setDwMode={setDwMode}
        />
      ) : (
      <div className="flex-1 flex overflow-hidden relative z-[46]">
        <AnimatePresence>
          {activeTerm && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: "spring", damping: 35, stiffness: 300 }}
              className="h-[calc(100%-1rem)] my-2 mr-3 bg-white/40 backdrop-blur-3xl flex flex-col relative z-[50] overflow-hidden shrink-0 rounded-[2.5rem] border border-white/50 shadow-2xl shadow-black/[0.06] pointer-events-auto"
              style={{ WebkitBackdropFilter: 'blur(40px)' }}
            >
              <div className="p-6 flex justify-between items-center shrink-0 mt-2">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-primary uppercase tracking-[0.3em]">L4 Dialogue</span>
                  <span className="text-[10px] text-on-surface/40 uppercase tracking-widest mt-1">思想对话端</span>
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
                <div className="px-6 py-4 bg-surface/30 border-b border-outline-variant/20 space-y-3">
                  <div className="relative">
                    <input 
                      type="text" 
                      value={searchQuery} 
                      onChange={(e) => setSearchQuery(e.target.value)} 
                      onKeyDown={(e) => e.key === 'Enter' && handleSemanticSearch()}
                      placeholder="跨书语义搜索..." 
                      className="w-full bg-surface/60 border border-outline-variant/30 rounded-lg pl-4 pr-10 py-2.5 text-[11px] outline-none focus:bg-surface focus:border-primary/30 transition-all font-serif placeholder:text-on-surface/25"
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
                          className="p-3 rounded-xl bg-surface/50 border border-outline-variant/20 cursor-pointer hover:bg-surface/80 transition-all group"
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
                              <div className="flex-1 h-1 bg-outline-variant/40 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-primary rounded-full transition-all"
                                  style={{ width: `${result.relevance_score * 100}%` }}
                                />
                              </div>
                              <span className="text-[9px] text-on-surface/40">{Math.round(result.relevance_score * 100)}%</span>
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
                {/* 思考种子 */}
                {thinkSeeds.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2"><Bookmark size={12} className="text-slate-500" /><span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">思考种子</span><span className="text-[9px] text-stone-400 bg-stone-100 px-2 py-0.5 rounded-full">{thinkSeeds.length}</span></div>
                    {thinkSeeds.map((seed: any) => (
                      <motion.div key={seed.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="group p-4 rounded-2xl bg-indigo-50/30 border border-indigo-200/50 hover:border-indigo-300/60 transition-all">
                        <div className="flex items-start gap-2 mb-2"><span className="px-2 py-0.5 bg-indigo-100/50 text-slate-700 text-[9px] font-medium rounded-full shrink-0">{seed.relation}</span><span className="text-[13px] font-bold text-stone-800 font-serif">{seed.term}</span>{seed.discussed && <CheckCircle2 size={12} className="text-green-400 shrink-0 ml-auto" />}</div>
                        {seed.provocation && <p className="text-[11px] text-stone-500 leading-relaxed mb-3 pl-1">💡 {seed.provocation}</p>}
                        <div className="flex items-center gap-2"><button onClick={() => handleSeedDiscuss(seed)} className="flex items-center gap-1 text-[10px] text-slate-600 font-medium hover:underline"><MessageCircle size={10} />讨论</button><button onClick={() => handleRemoveSeed(seed.id)} className="flex items-center gap-1 text-[10px] text-stone-400 hover:text-red-400 transition-colors"><X size={10} />移除</button></div>
                      </motion.div>
                    ))}
                  </div>
                )}

                {/* 钉入的L4深度思考卡片 */}
                {userThoughts.filter(thought => thought.type === 'pinned').length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Pin size={12} className="text-slate-500" />
                      <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">钉入的思考</span>
                      <span className="text-[9px] text-stone-400 bg-stone-100 px-2 py-0.5 rounded-full">
                        {userThoughts.filter(thought => thought.type === 'pinned').length}
                      </span>
                    </div>
                    
                    {userThoughts
                      .filter(thought => thought.type === 'pinned')
                      .map((thought) => (
                        <motion.div
                          key={thought.id}
                          initial={{ opacity: 0, y: 20, scale: 0.92 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          transition={{ type: "spring", stiffness: 180, damping: 12, mass: 0.5 }}
                          className="group relative p-4 rounded-2xl bg-gradient-to-r from-indigo-50 to-white/50 border border-indigo-200 shadow-sm hover:shadow-md transition-all"
                        >
                          {thought.id === newCardId && (
                            <motion.div
                              initial={{ opacity: 1, scale: 0.85 }}
                              animate={{ opacity: 0, scale: 1.12 }}
                              transition={{ duration: 1.5, ease: "easeOut" }}
                              className="absolute inset-0 rounded-2xl pointer-events-none z-10"
                              style={{ boxShadow: '0 0 40px rgba(67,100,99,0.35), 0 0 80px rgba(67,100,99,0.15)' }}
                            />
                          )}
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
                        ? 'bg-[#2d4a47] text-white'
                        : msg.isDigest
                          ? 'bg-surface-container-high text-on-surface/70 border border-outline-variant/50'
                          : 'bg-surface/80 text-on-surface/70 border border-outline-variant/30'
                    }`}>
                      {msg.isDigest && (
                        <div className="flex items-center gap-1 mb-2 text-[10px] font-bold text-primary/70 uppercase tracking-wider">
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
                              className="w-7 h-7 rounded-full bg-primary/50 text-white flex items-center justify-center transition-all scale-75 group-hover:scale-100 shadow-xl z-[100] cursor-pointer pointer-events-auto active:scale-90 opacity-0 group-hover:opacity-100 hover:bg-primary/80"
                              title="提取精萃"
                            >
                              <Sparkles size={12} />
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleVolumeSelection(i);
                            }}
                            className={`w-7 h-7 rounded-full flex items-center justify-center transition-all scale-75 group-hover:scale-100 shadow-xl z-[100] cursor-pointer pointer-events-auto active:scale-90 ${volumeSelections.has(i) ? 'bg-primary text-white opacity-100' : 'bg-amber-500 text-white opacity-0 group-hover:opacity-100 hover:bg-primary'}`}
                            title={volumeSelections.has(i) ? "已收录" : "收录到成册"}
                          >
                            <BookOpen size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {isChatting && (
                  <div className="flex items-start">
                    <div className="bg-surface/50 p-3 rounded-xl">
                      <Loader2 className="animate-spin text-primary/40" size={16} />
                    </div>
                  </div>
                )}
              </div>
              <div className="p-5 bg-surface/40 backdrop-blur-md border-t border-outline-variant/20 rounded-t-[2rem]">
                {volumeSelections.size > 0 && (
                  <div className="flex items-center justify-between mb-3 px-1">
                    <span className="text-[11px] text-on-surface/60">已选 <b className="text-primary">{volumeSelections.size}</b> 条对话</span>
                    <button
                      onClick={handleGoToVolume}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a3a36] text-white rounded-full text-[11px] font-bold hover:bg-[#2d4a47] transition-colors shadow-sm"
                    >
                      <BookOpen size={12} /> 收束成册
                    </button>
                  </div>
                )}
                <div className="relative">
                  <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSendChat()} placeholder="深度对话..." className="w-full bg-surface/70 border border-outline-variant/30 rounded-full pl-5 pr-12 py-3 text-[12px] outline-none focus:bg-surface focus:border-primary/20 transition-all font-serif" />
                  <button onClick={handleSendChat} className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center hover:scale-105 transition-all">
                    <Send size={14} />
                  </button>
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
 
        <div className="flex-1 overflow-y-auto mt-14 py-20 scroll-smooth flex justify-center relative warm-study reading-light">
          <div className={`w-full px-10 transition-all duration-700 reading-content ${activeTerm ? 'max-w-2xl' : 'max-w-3xl'}`}>
            {console.log('🎨 [Render] markdownContent:', markdownContent?.length, 'chars | value:', markdownContent?.substring(0, 100))}
            {markdownContent ? (() => {
              // L3 数据块里也有 original: 字段，剥掉再判断是否真的有原文比对
              const contentWithoutL3 = markdownContent.replace(/<!-- L3_DATA_START[\s\S]*?L3_DATA_END -->/g, '');
              const hasSourceReference = /^original:/m.test(contentWithoutL3);
              return (
              <div className="space-y-6">
                {markdownContent.split('\n\n').map((block, idx) => {
                  if (block.startsWith('# ')) return (
                    <div key={idx} className="text-center mb-16 space-y-4">
                      <span className="text-[10px] font-bold text-on-surface/40 uppercase tracking-[0.5em] block">卷轴 · 清洗精萃</span>
                      <h1 className="text-3xl font-serif font-bold text-on-surface/80 leading-tight inline-block px-10 relative">
                        <div className="absolute left-0 top-1/2 w-8 h-[1px] bg-outline-variant/40" />
                        {block.replace('# ', '')}
                        <div className="absolute right-0 top-1/2 w-8 h-[1px] bg-outline-variant/40" />
                      </h1>
                      {!hasSourceReference && (
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-[11px] text-amber-700">
                          <AlertCircle size={12} />
                          无原文参照，分析基于划线
                        </div>
                      )}
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
                    <div key={idx} data-block-id={idx} className={`group relative py-3 transition-all duration-300 ${isActive ? 'bg-primary/3 -mx-8 px-8' : ''}`}>
                      {isIdiomCard && cardTitle && (
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm font-serif font-bold text-primary">{cardTitle}</span>
                          <span className="text-[10px] text-primary">· 典故</span>
                        </div>
                      )}
                      {/^original:/m.test(markdownContent || '') && (
                        <div className="absolute bottom-full left-0 mb-2 opacity-0 group-hover:opacity-100 transition-all bg-white/90 backdrop-blur-xl text-stone-600 text-[11px] py-3 px-4 rounded-2xl z-20 pointer-events-none max-w-sm shadow-xl border border-stone-200/60 leading-relaxed translate-y-2 group-hover:translate-y-0">
                          <span className="text-stone-400 font-bold block mb-1 text-[9px] uppercase tracking-wider">Raw Trace</span>
                          {(() => {
                            const m = block.match(/original: ([\s\S]*?)(?:\n\w+:|\n\n|$)/);
                            return m ? m[1].trim().replace(/\.\.\.$/, '') : "对比载入中";
                          })()}
                        </div>
                      )}
                      <p className={`text-[16px] leading-relaxed tracking-tight ${isQuote ? 'text-stone-500 font-serif italic pl-4 border-l-2 border-stone-200' : isIdiomCard ? 'text-stone-700 pl-4 border-l-2 border-primary/20 italic' : 'text-stone-800'}`}>{displayContent}</p>
                      {/* 思考笔记标记：点击跳转到右侧对应卡片 */}
                      {(() => {
                        const linkedThoughts = userThoughts.filter(t => t.blockId === idx);
                        if (linkedThoughts.length === 0) return null;
                        return (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveBlockId(idx);
                              const targetEl = document.getElementById(`thought-${linkedThoughts[0].id}`);
                              if (targetEl && rightPanelRef.current) {
                                targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              }
                            }}
                            className="mt-2 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-primary/5 border border-primary/20 text-[10px] text-primary hover:bg-primary/10 transition-colors"
                            title={`查看 ${linkedThoughts.length} 条思考`}
                          >
                            <Edit3 size={10} />
                            {linkedThoughts.length} 条思考
                          </button>
                        );
                      })()}
                      <button onClick={() => handleTermClick(block, idx)} className={`absolute -right-6 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white shadow-md border border-stone-200 flex items-center justify-center text-primary transition-all duration-200 hover:bg-primary hover:text-white hover:shadow-lg ${isActive ? 'opacity-100 scale-105' : 'opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100'}`}>
                        <Sparkles size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            );
            })() : (
              <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-6">
                <Loader2 className="animate-spin text-outline-variant/30" size={48} />
                <h2 className="text-2xl font-serif font-bold text-on-surface/20">载入中...</h2>
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
              className="h-[calc(100%-1rem)] my-2 ml-3 bg-white/40 backdrop-blur-3xl flex flex-col relative z-[50] overflow-hidden shrink-0 rounded-[2.5rem] border border-white/50 shadow-2xl shadow-black/[0.06] pointer-events-auto"
              style={{ WebkitBackdropFilter: 'blur(40px)' }}
            >
              <div ref={rightPanelRef} className="flex-1 overflow-y-auto pt-2 px-6 pb-12 space-y-6 scroll-smooth">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <h3 className="text-xl font-serif font-bold text-on-surface/80">Deep Origin</h3>
                    <p className="text-[10px] text-on-surface/40 uppercase tracking-[0.2em]">Semantic Analysis (L3)</p>
                  </div>
                  <button onClick={() => { setActiveTerm(null); setActiveBlockId(null); }} className="w-9 h-9 bg-black/5 hover:bg-black/10 rounded-full flex items-center justify-center transition-colors text-stone-400 hover:text-stone-600"><X size={16} /></button>
                </div>

                <button
                  onClick={handleOpenThoughtModal}
                  className="w-full py-3 border-2 border-dashed border-outline-variant/50 rounded-xl flex items-center justify-center gap-2 text-on-surface/50 hover:text-primary hover:border-primary/30 transition-all group"
                >
                  <Plus size={16} className="group-hover:rotate-90 transition-transform" />
                  <span className="text-sm font-medium">写下我的思考</span>
                </button>
                {isLoadingSemantic ? (
                  <div className="flex flex-col items-center justify-center h-48 text-stone-200 space-y-4">
                    <Loader2 className="animate-spin" size={24} />
                    <p className="text-[10px] uppercase tracking-widest font-bold">知识加载中</p>
                  </div>
                ) : null}
                
                {userThoughts.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <Edit3 size={14} className="text-primary" />
                      <h5 className="text-[11px] font-bold uppercase tracking-[0.2em] text-on-surface/40">我的思考</h5>
                    </div>
                    <div className="space-y-4">
                      {(() => {
                        // 按 blockId 分组，同段落思考聚合为一张卡片
                        const groups = new Map<number, any[]>();
                        const orphans: any[] = [];
                        userThoughts.forEach(t => {
                          if (t.blockId != null) {
                            if (!groups.has(t.blockId)) groups.set(t.blockId, []);
                            groups.get(t.blockId)!.push(t);
                          } else {
                            orphans.push(t);
                          }
                        });

                        const scrollToParagraph = (blockId: number) => {
                          setActiveBlockId(blockId);
                          const el = document.querySelector(`[data-block-id="${blockId}"]`);
                          el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        };

                        return (
                          <>
                            {/* 已关联段落的思考：按段落聚合 */}
                            {Array.from(groups.entries()).map(([blockId, thoughts]) => {
                              const snippet = getBlockSnippet(markdownContent, blockId);
                              const anchorId = `thought-group-${blockId}`;
                              return (
                                <motion.div
                                  key={anchorId}
                                  id={anchorId}
                                  initial={{ opacity: 0, x: -20, scale: 0.96 }}
                                  animate={{ opacity: 1, x: 0, scale: 1 }}
                                  transition={{ type: "spring", stiffness: 180, damping: 14, mass: 0.6 }}
                                  className="rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/5 to-surface shadow-sm overflow-hidden"
                                >
                                  {/* 段落引用头 */}
                                  {snippet && (
                                    <button
                                      onClick={() => scrollToParagraph(blockId)}
                                      className="w-full text-left px-5 pt-4 pb-2 flex items-center gap-2 group/head"
                                    >
                                      <BookOpen size={12} className="text-primary/50 shrink-0" />
                                      <span className="text-[11px] text-on-surface/50 font-serif truncate group-hover/head:text-primary transition-colors">
                                        {snippet}
                                      </span>
                                      <span className="text-[9px] text-on-surface/25 ml-auto shrink-0">
                                        {thoughts.length} 条思考
                                      </span>
                                    </button>
                                  )}

                                  {/* 思考条目列表 */}
                                  <div className="px-4 pb-2 space-y-2">
                                    {thoughts.map((thought, tIdx) => (
                                      <div
                                        key={thought.id}
                                        id={`thought-${thought.id}`}
                                        className={`group/item relative p-3 rounded-xl bg-white/60 border border-stone-100 hover:border-primary/20 transition-all ${
                                          tIdx < thoughts.length - 1 ? 'pb-4 border-b border-outline-variant/20' : ''
                                        }`}
                                      >
                                        {thought.id === newCardId && (
                                          <motion.div
                                            initial={{ opacity: 1, scale: 0.85 }}
                                            animate={{ opacity: 0, scale: 1.12 }}
                                            transition={{ duration: 1.5, ease: "easeOut" }}
                                            className="absolute inset-0 rounded-xl pointer-events-none z-10"
                                            style={{ boxShadow: '0 0 40px rgba(67,100,99,0.35), 0 0 80px rgba(67,100,99,0.15)' }}
                                          />
                                        )}
                                        <div className="flex items-center justify-between mb-1.5">
                                          <span className="text-[9px] text-on-surface/40">
                                            {thought.createdAt}
                                          </span>
                                          <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-all">
                                            <button
                                              onClick={() => handleShareThought(thought)}
                                              className="w-6 h-6 rounded-full bg-surface border border-outline-variant/40 flex items-center justify-center text-on-surface/40 hover:text-primary hover:border-primary/30 transition-all"
                                              title="分享"
                                            >
                                              <Share2 size={10} />
                                            </button>
                                            <button
                                              onClick={() => handleConfusionExchange(thought)}
                                              className="w-6 h-6 rounded-full bg-surface border border-outline-variant/40 flex items-center justify-center text-on-surface/40 hover:text-amber-600 hover:border-amber-300/50 transition-all"
                                              title="我还没想通..."
                                            >
                                              <HelpCircle size={10} />
                                            </button>
                                            <button
                                              onClick={() => handlePinThought(thought.id)}
                                              className={`w-6 h-6 rounded-full border flex items-center justify-center transition-all ${
                                                thought.type === 'pinned'
                                                  ? 'bg-primary/20 border-primary/30 text-primary'
                                                  : 'bg-white border-stone-200 text-stone-400 hover:text-primary hover:border-primary/30'
                                              }`}
                                              title={thought.type === 'pinned' ? "取消钉入" : "钉入左栏"}
                                            >
                                              <Pin size={10} className={thought.type === 'pinned' ? "fill-indigo-600" : ""} />
                                            </button>
                                            <button
                                              onClick={() => handleDeleteThought(thought.id)}
                                              className="w-6 h-6 rounded-full bg-surface border border-outline-variant/40 flex items-center justify-center text-on-surface/40 hover:text-red-500 hover:border-red-200 transition-all"
                                              title="删除"
                                            >
                                              <Trash2 size={10} />
                                            </button>
                                          </div>
                                        </div>
                                        {(() => {
                                          const { quote: quoteText, thought: thoughtBody } = parseThoughtContent(thought.content || '');
                                          return (
                                            <div className="space-y-1.5">
                                              {quoteText && (
                                                <p className="text-[11px] text-stone-400 leading-relaxed italic pl-3 border-l-2 border-stone-200 line-clamp-2">
                                                  {quoteText}
                                                </p>
                                              )}
                                              {thoughtBody && (
                                                <p className="text-[13px] text-stone-700 leading-relaxed font-serif">
                                                  {thoughtBody}
                                                </p>
                                              )}
                                            </div>
                                          );
                                        })()}
                                      </div>
                                    ))}
                                  </div>

                                  {/* 继续补充 */}
                                  <button
                                    onClick={() => {
                                      setActiveBlockId(blockId);
                                      setNewThought('');
                                      setShowThoughtModal(true);
                                    }}
                                    className="w-full px-5 py-2.5 flex items-center justify-center gap-1.5 text-[11px] text-primary hover:text-primary hover:bg-primary/5 transition-colors border-t border-primary/10"
                                  >
                                    <Plus size={12} />
                                    继续补充
                                  </button>
                                </motion.div>
                              );
                            })}

                            {/* 未关联段落的独立思考 */}
                            {orphans.map(thought => (
                              <motion.div
                                key={thought.id}
                                id={`thought-${thought.id}`}
                                initial={{ opacity: 0, x: -20, scale: 0.94 }}
                                animate={{ opacity: 1, x: 0, scale: 1 }}
                                exit={{ opacity: 0, x: 20, scale: 0.94 }}
                                transition={{ type: "spring", stiffness: 180, damping: 12, mass: 0.5 }}
                                className="group relative p-5 rounded-2xl border-l-4 bg-gradient-to-r from-surface-container to-surface border-outline-variant shadow-sm hover:shadow-md transition-all"
                              >
                                {thought.id === newCardId && (
                                  <motion.div
                                    initial={{ opacity: 1, scale: 0.85 }}
                                    animate={{ opacity: 0, scale: 1.12 }}
                                    transition={{ duration: 1.5, ease: "easeOut" }}
                                    className="absolute inset-0 rounded-2xl pointer-events-none z-10"
                                    style={{ boxShadow: '0 0 40px rgba(67,100,99,0.35), 0 0 80px rgba(67,100,99,0.15)' }}
                                  />
                                )}
                                <button
                                  onClick={() => handleDeleteThought(thought.id)}
                                  className="absolute top-3 right-3 w-7 h-7 rounded-full bg-surface/90 border border-outline-variant/40 flex items-center justify-center text-on-surface/40 opacity-0 group-hover:opacity-100 hover:text-red-500 hover:border-red-200 transition-all shadow-sm"
                                  title="删除"
                                >
                                  <Trash2 size={12} />
                                </button>
                                <button
                                  onClick={() => handlePinThought(thought.id)}
                                  className={`absolute top-3 right-12 w-7 h-7 rounded-full border flex items-center justify-center transition-all shadow-sm ${
                                    thought.type === 'pinned'
                                      ? 'bg-primary/10 border-primary/20 text-primary'
                                      : 'bg-surface/90 border-outline-variant/40 text-on-surface/40 opacity-0 group-hover:opacity-100 hover:text-primary hover:border-primary/30'
                                  }`}
                                  title={thought.type === 'pinned' ? "取消钉入" : "钉入左栏"}
                                >
                                  <Pin size={12} className={thought.type === 'pinned' ? "fill-indigo-600" : ""} />
                                </button>
                                <div className="flex items-center gap-2 mb-2">
                                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                                    <User size={12} className="text-primary" />
                                  </div>
                                  <span className="text-[10px] font-bold text-primary/70 uppercase tracking-widest">我的思考</span>
                                </div>
                                {(() => {
                                  const { quote: quoteText, thought: thoughtBody } = parseThoughtContent(thought.content || '');
                                  return (
                                    <div className="space-y-1.5">
                                      {quoteText && (
                                        <p className="text-[11px] text-stone-400 leading-relaxed italic pl-3 border-l-2 border-stone-200 line-clamp-2">
                                          {quoteText}
                                        </p>
                                      )}
                                      {thoughtBody && (
                                        <p className="text-[13px] text-stone-700 leading-relaxed font-serif">
                                          {thoughtBody}
                                        </p>
                                      )}
                                    </div>
                                  );
                                })()}
                                <p className="text-[10px] text-on-surface/40 mt-3">{thought.createdAt}</p>
                              </motion.div>
                            ))}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {!semanticData && userThoughts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-center space-y-4">
                    <div className="w-14 h-14 rounded-2xl bg-primary/5 flex items-center justify-center">
                      <Sparkles size={20} className="text-primary/50" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-base font-serif font-bold text-on-surface/60">AI 将在你阅读时</p>
                      <p className="text-sm text-on-surface/40">在这里提供语义延伸</p>
                    </div>
                  </div>
                ) : semanticData ? (
                  <>
                    <div className="bg-surface-container/80 rounded-[2.5rem] p-8 space-y-5 shadow-inner border border-white/20">
                      <h4 className="text-4xl font-serif font-bold text-stone-800 leading-tight">{semanticData.term}</h4>
                      <div className="flex flex-wrap gap-2">
                        {semanticData.tags?.map((tag: string) => (
                          <span key={tag} className="px-3 py-1 bg-surface-container/80 text-on-surface/60 text-[10px] font-bold rounded-full border border-outline-variant/30">{tag}</span>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <Search size={14} className="text-on-surface/25" />
                        <h5 className="text-[11px] font-bold uppercase tracking-[0.2em] text-on-surface/40">Deep Trace / 概念解析</h5>
                      </div>
                      <p className="text-[15px] text-on-surface/80 leading-relaxed font-serif px-1 bg-surface-container/30 p-4 rounded-2xl border border-outline-variant/10">{semanticData.explanation}</p>
                    </div>

                    <div className="p-8 bg-amber-50/70 rounded-[2.5rem] border border-amber-300/40 space-y-5 shadow-md relative overflow-hidden group">
                      <div className="absolute top-0 right-0 p-4 opacity-[0.04]">
                        <Brain size={80} className="text-amber-800" />
                      </div>
                      <div className="flex items-center gap-3 relative z-10">
                        <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
                        <h5 className="text-[10px] font-bold uppercase tracking-[0.3em] text-amber-800/60">观念碰撞 · 认知拓展</h5>
                      </div>
                      <p className="text-[15px] text-stone-700 leading-relaxed font-serif italic relative z-10">"{semanticData.cognitive_extension}"</p>
                    </div>

                    {semanticData.saved_dialogues?.length > 0 && (
                      <div ref={dialogueRef} className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="flex items-center gap-3">
                          <Pin size={14} className="text-slate-500 rotate-45" />
                          <h5 className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary/60">灵感采撷 · 思想结晶</h5>
                        </div>
                        <div className="space-y-4">
                          {semanticData.saved_dialogues.map((d: any, i: number) => (
                            <div key={i} className="p-5 rounded-2xl bg-surface/80 border-l-4 border-primary space-y-3 shadow-sm">
                              <p className="text-[11px] font-bold text-primary/60 uppercase tracking-widest">Q: {d.q}</p>
                              <p className="text-[13px] text-on-surface/70 leading-relaxed font-serif italic">"{d.a}"</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <Sparkles size={14} className="text-on-surface/25" />
                        <h5 className="text-[11px] font-bold uppercase tracking-[0.2em] text-on-surface/40">Semantic Network</h5>
                      </div>
                      <div className="space-y-3">
                        {semanticData.semantic_network?.map((item: any, idx: number) => (
                          <div key={idx} className="group p-5 rounded-2xl bg-surface-container/30 border border-outline-variant/20 hover:border-primary/10 hover:bg-primary/[0.02] transition-all">
                            <div className="flex flex-col gap-3">
                              <div className="flex items-center gap-2">
                                <div className="w-1 h-1 bg-primary rounded-full shrink-0" />
                                <span className="text-[14px] font-bold text-on-surface/80 font-serif">{item.term}</span>
                                <span className="px-2 py-0.5 bg-primary/5 text-primary/70 text-[10px] font-medium rounded-full border border-primary/10">{item.relation || '关联'}</span>
                              </div>
                              {(item.explanation || item.note) && (
                                <p className="text-[12px] text-on-surface/50 leading-relaxed pl-3 border-l-2 border-outline-variant/40 group-hover:border-primary/30 transition-colors">{item.explanation || item.note}</p>
                              )}
                              {item.provocation && (
                                <div className="p-3 bg-primary/5 rounded-xl border border-primary/15">
                                  <p className="text-[11px] text-primary leading-relaxed italic">💡 {item.provocation}</p>
                                </div>
                              )}
                              <div className="flex items-center gap-2 pt-1">
                                <button onClick={() => handleFloatDiscuss(item)} className="flex items-center gap-1 px-3 py-1.5 bg-stone-800 text-white text-[11px] font-medium rounded-full hover:bg-stone-900 transition-all shadow-sm"><MessageCircle size={11} />立即讨论</button>
                                <button onClick={() => handleSeedLater(item)} className="flex items-center gap-1 px-3 py-1.5 bg-surface-container/50 text-on-surface/50 text-[11px] font-medium rounded-full hover:bg-surface-container hover:text-on-surface/70 transition-all"><Bookmark size={11} />稍后</button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="pt-6 border-t border-outline-variant/20 space-y-4">
                      <h5 className="text-[11px] font-bold uppercase tracking-[0.2em] text-on-surface/40">References</h5>
                      <div className="flex flex-wrap gap-3">
                        {semanticData.reference_urls?.map((ref: any, idx: number) => (
                          <a
                            key={idx}
                            href={ref.url || `https://www.baidu.com/s?wd=${encodeURIComponent(ref.title)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-4 py-2 bg-surface-container/30 text-on-surface/60 text-xs rounded-2xl hover:bg-primary/5 hover:text-primary transition-all border border-outline-variant/20 group"
                          >
                            <ExternalLink size={12} className="opacity-40 group-hover:opacity-100" />
                            {ref.title}
                          </a>
                        ))}
                      </div>
                    </div>
                  </>
                ) : null}

                {/* ===== 跨书概念碰撞 ===== */}
                {semanticData && (
                  <div className="pt-6 border-t border-outline-variant/20 space-y-4">
                    <h5 className="text-[11px] font-bold uppercase tracking-[0.2em] text-on-surface/40">
                      跨书碰撞
                    </h5>

                    {!crossBookExpanded ? (
                      <button
                        onClick={handleCrossBookCollide}
                        disabled={isLoadingCrossBook}
                        className="w-full py-3 text-center border border-dashed border-outline-variant/30 rounded-2xl
                                   hover:border-primary/20 hover:bg-primary/[0.02] transition-all group"
                      >
                        <span className="text-[11px] text-on-surface/40 italic">
                          也许跟另一本书有点关联？
                        </span>
                        <span className="text-[11px] text-primary/60 font-medium ml-1.5 group-hover:text-primary transition-colors">
                          [点开看看]
                        </span>
                      </button>
                    ) : isLoadingCrossBook ? (
                      <div className="flex items-center justify-center py-6 gap-2 text-on-surface/30">
                        <Loader2 size={14} className="animate-spin" />
                        <span className="text-[11px]">正在检索其他书籍中的相关概念...</span>
                      </div>
                    ) : crossBookGlimpseShown && crossBookResults.length > 0 ? (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-4 bg-amber-50/70 rounded-xl border border-amber-200/60 space-y-3"
                      >
                        <p className="text-[12px] text-amber-900 leading-relaxed">
                          在其他书里，你有注意到过跟<span className="font-semibold text-primary mx-0.5">「{semanticData?.term}」</span>相关的观点吗？它们是一致的、矛盾的，还是从不同角度切入的？
                        </p>
                        {userGlimpseThought ? (
                          <div className="space-y-2">
                            <textarea
                              value={userGlimpseThought}
                              onChange={(e) => setUserGlimpseThought(e.target.value)}
                              placeholder="写下你想到的..."
                              rows={3}
                              className="w-full p-3 text-[12px] bg-white/80 rounded-lg border border-amber-300/40 resize-none focus:outline-none focus:border-primary/30 text-on-surface placeholder:text-on-surface/25"
                            />
                          </div>
                        ) : null}
                        <div className="flex items-center gap-3">
                          {!userGlimpseThought ? (
                            <button
                              onClick={() => setUserGlimpseThought(' ')}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-amber-800 text-[11px] font-medium rounded-full hover:bg-amber-100 transition-all border border-amber-300/40"
                            >
                              <Lightbulb size={12} />我回忆一下
                            </button>
                          ) : null}
                          <button
                            onClick={() => setCrossBookGlimpseShown(false)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-800 text-white text-[11px] font-medium rounded-full hover:bg-stone-900 transition-all"
                          >
                            直接查看 <ArrowRight size={11} />
                          </button>
                        </div>
                      </motion.div>
                    ) : crossBookResults.length > 0 ? (
                      <div className="space-y-3">
                        {crossBookResults.map((item: any, idx: number) => {
                          const TIcon = tensionIcons[item.tension_type] || Puzzle;
                          return (
                            <motion.div
                              key={idx}
                              initial={{ opacity: 0, y: 12 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: idx * 0.08 }}
                              className="glaze-card rounded-2xl p-4 space-y-3"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <p className="text-[12px] font-semibold text-on-surface truncate">
                                    《{item.book_title}》
                                  </p>
                                  <p className="text-[11px] text-on-surface/50 mt-0.5 truncate">
                                    {item.core_concept}
                                  </p>
                                </div>
                                <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full border ${tensionColors[item.tension_type] || 'bg-stone-50 text-stone-600 border-stone-200'}`}>
                                  <TIcon size={10} />{item.tension_type}
                                </span>
                              </div>

                              <p className="text-[11px] text-on-surface/60 leading-relaxed">
                                {item.tension_reason}
                              </p>

                              {item.provocation_question && (
                                <div className="p-3 bg-primary/[0.04] rounded-lg border border-primary/10">
                                  <p className="text-[11px] text-primary/80 leading-relaxed italic">
                                    {item.provocation_question}
                                  </p>
                                </div>
                              )}

                              <button
                                onClick={() => handleFloatDiscuss({
                                  term: item.core_concept,
                                  relation: item.tension_type,
                                  explanation: item.tension_reason,
                                  provocation: item.provocation_question
                                })}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-800 text-white text-[11px] font-medium rounded-full hover:bg-stone-900 transition-all"
                              >
                                <MessageCircle size={11} />聊聊这个
                              </button>
                            </motion.div>
                          );
                        })}
                      </div>
                    ) : crossBookExpanded && !isLoadingCrossBook ? (
                      <div className="py-4 text-center">
                        <p className="text-[11px] text-on-surface/30 italic">
                          目前没有找到其他书籍中跟「{semanticData?.term}」强相关的内容，可能是领域太独特了。
                        </p>
                      </div>
                    ) : null}
                  </div>
                )}
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
                    backgroundColor: '#2d4a47',
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
                className="flex items-center gap-2 px-4 py-2.5 bg-surface/95 backdrop-blur-xl rounded-xl shadow-lg border border-outline-variant/30 text-on-surface/70 hover:text-primary hover:border-primary/30 transition-all text-sm font-medium whitespace-nowrap"
                style={{
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)'
                }}
              >
                <Lightbulb size={16} className="text-primary" />
                <span>围绕此处思考</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 粒子飘向右侧 — "你的想法被传递了" */}
        {flyingParticles.map(p => (
          <motion.div
            key={p.id}
            initial={{ x: p.x, y: p.y, opacity: 0.9, scale: 0 }}
            animate={{ x: window.innerWidth - 220, y: p.y + (Math.random() - 0.5) * 160, opacity: 0, scale: 1 }}
            transition={{ duration: 0.55, ease: "easeOut" }}
            className="fixed z-[120] w-1.5 h-1.5 rounded-full pointer-events-none"
            style={{ background: `hsl(${170 + Math.random() * 10}, 25%, ${50 + Math.random() * 20}%)`, boxShadow: '0 0 6px rgba(67,100,99,0.5)' }}
          />
        ))}

        {/* 思考分享卡片弹窗 */}
        <AnimatePresence>
          {showShareModal && shareData && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowShareModal(false)}
              className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-8"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="flex flex-col items-center gap-4 max-h-[90vh]"
              >
                {/* 分享卡片本体 — 极简玻璃 */}
                <div
                  ref={shareCardRef}
                  className="overflow-hidden"
                  style={{
                    width: 420,
                    aspectRatio: '3 / 4',
                    fontFamily: '"Noto Serif SC", "Source Han Serif SC", serif',
                    padding: 48,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    boxSizing: 'border-box',
                    borderRadius: 40,
                    position: 'relative',
                    background: 'linear-gradient(160deg, #F8F6F2 0%, #F2F0EB 30%, #F5F3EF 60%, #FAF8F5 100%)',
                    boxShadow: '0 30px 60px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.04)',
                  }}
                >
                  {/* 玻璃光效层 */}
                  <div style={{
                    position: 'absolute', inset: 0, pointerEvents: 'none',
                    background: `
                      radial-gradient(ellipse 600px 400px at 50% -15%, rgba(255,255,255,0.5) 0%, transparent 50%),
                      radial-gradient(ellipse 300px 200px at 80% 90%, rgba(200,200,210,0.08) 0%, transparent 60%),
                      linear-gradient(160deg, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0) 35%, rgba(0,0,0,0.02) 100%)
                    `
                  }} />

                  {/* 品牌 */}
                  <div style={{
                    textAlign: 'center', position: 'relative', zIndex: 1,
                    marginBottom: 36, marginTop: 8
                  }}>
                    <div style={{
                      fontSize: 12,
                      color: '#8C8C8C',
                      letterSpacing: '0.35em',
                      fontWeight: 400,
                    }}>
                      INKTRACE
                    </div>
                  </div>

                  {/* 引用 — 玻璃卡片 */}
                  {shareData.quote ? (
                    <div style={{
                      background: 'rgba(255,255,255,0.55)',
                      backdropFilter: 'blur(16px)',
                      WebkitBackdropFilter: 'blur(16px)',
                      borderRadius: 20,
                      padding: '28px 28px',
                      width: '100%',
                      boxSizing: 'border-box',
                      position: 'relative', zIndex: 1,
                      marginBottom: 28,
                      border: '1px solid rgba(255,255,255,0.8)',
                      boxShadow: '0 4px 24px rgba(0,0,0,0.04), inset 0 0 0 1px rgba(255,255,255,0.6)'
                    }}>
                      <p style={{
                        fontSize: 15,
                        lineHeight: 2,
                        color: '#4A4A4A',
                        margin: 0,
                        letterSpacing: '0.03em',
                        fontFamily: '"Noto Serif SC", serif',
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 6,
                        WebkitBoxOrient: 'vertical',
                      }}>
                        {shareData.quote}
                      </p>
                      {shareData.bookTitle && (
                        <p style={{
                          fontSize: 10,
                          color: '#9A9A9A',
                          margin: '14px 0 0 0',
                          textAlign: 'right',
                          letterSpacing: '0.05em',
                        }}>
                          —— 《{shareData.bookTitle}》
                        </p>
                      )}
                    </div>
                  ) : (
                    <div style={{ flex: 0.3 }} />
                  )}

                  {/* 分隔 */}
                  <div style={{
                    width: 48, height: 1,
                    background: '#D8D8D8',
                    opacity: 0.6,
                    marginBottom: 28
                  }} />

                  {/* 思考 */}
                  <div style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative', zIndex: 1,
                    width: '100%',
                    textAlign: 'center'
                  }}>
                    <p style={{
                      fontSize: 17,
                      lineHeight: 2.2,
                      color: '#3A3A3A',
                      fontWeight: 400,
                      margin: 0,
                      letterSpacing: '0.04em',
                      fontFamily: '"Noto Serif SC", serif',
                      padding: '0 8px',
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 5,
                      WebkitBoxOrient: 'vertical',
                    }}>
                      {shareData.thought}
                    </p>
                  </div>

                  {/* 底部 */}
                  <div style={{
                    width: '100%', position: 'relative', zIndex: 1,
                    marginTop: 'auto', textAlign: 'center'
                  }}>
                    <span style={{
                      fontSize: 10,
                      color: '#B0B0B0',
                      letterSpacing: '0.08em',
                      fontWeight: 400
                    }}>
                      {shareData.bookTitle ? `《${shareData.bookTitle}》` : 'InkTrace · 墨迹溯源'}
                      {' · '}
                      {new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </span>
                  </div>
                </div>

                {/* 操作按钮 */}
                <div className="flex items-center gap-3 mt-4">
                  <button
                    onClick={() => setShowShareModal(false)}
                    className="px-6 py-2.5 rounded-full text-sm bg-white/10 backdrop-blur-sm border border-white/20 text-white/80 hover:bg-white/20 transition-colors flex items-center gap-1.5"
                  >
                    <X size={14} />
                    关闭
                  </button>
                  <button
                    onClick={downloadShareCard}
                    className="px-6 py-2.5 rounded-full text-sm text-white hover:opacity-90 transition-colors flex items-center gap-1.5 shadow-lg"
                    style={{ backgroundColor: '#5A8A88', boxShadow: '0 8px 20px rgba(90,138,136,0.35)' }}
                  >
                    <Download size={14} />
                    保存海报
                  </button>
                  <button
                    onClick={copyShareCard}
                    className="px-6 py-2.5 rounded-full text-sm bg-white/10 backdrop-blur-sm border border-white/20 text-white/80 hover:bg-white/20 transition-colors flex items-center gap-1.5"
                  >
                    <Copy size={14} />
                    复制
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 困惑交换弹窗 */}
        <AnimatePresence>
          {showConfusionModal && confusionData && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowConfusionModal(false)}
              className="fixed inset-0 z-[110] bg-black/40 backdrop-blur-sm flex items-center justify-center p-8"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="flex flex-col items-center gap-4 max-h-[90vh]"
              >
                {/* 困惑卡片预览 */}
                <div
                  ref={confusionCardRef}
                  className="overflow-hidden"
                  style={{
                    width: 420,
                    aspectRatio: '3 / 4',
                    fontFamily: '"Noto Serif SC", "Source Han Serif SC", serif',
                    padding: 48,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    boxSizing: 'border-box',
                    borderRadius: 40,
                    position: 'relative',
                    background: 'linear-gradient(160deg, #FCFAF7 0%, #F7F3EC 30%, #FAF6F1 60%, #FDFBF8 100%)',
                    boxShadow: '0 30px 60px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.04)',
                  }}
                >
                  <div style={{
                    position: 'absolute', inset: 0, pointerEvents: 'none',
                    background: `
                      radial-gradient(ellipse 600px 400px at 50% -15%, rgba(255,255,255,0.5) 0%, transparent 50%),
                      radial-gradient(ellipse 300px 200px at 80% 90%, rgba(220,200,180,0.06) 0%, transparent 60%),
                      linear-gradient(160deg, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0) 35%, rgba(0,0,0,0.02) 100%)
                    `
                  }} />

                  {/* 品牌 */}
                  <div style={{
                    textAlign: 'center', position: 'relative', zIndex: 1,
                    marginBottom: 36, marginTop: 8
                  }}>
                    <div style={{ fontSize: 12, color: '#8C8C8C', letterSpacing: '0.35em', fontWeight: 400 }}>
                      INKTRACE
                    </div>
                  </div>

                  {/* 大问号 */}
                  <div style={{
                    position: 'relative', zIndex: 1, marginBottom: 32,
                    width: 72, height: 72, borderRadius: '50%',
                    background: 'rgba(245,158,11,0.08)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <HelpCircle size={36} strokeWidth={1} style={{ color: '#B8804A' }} />
                  </div>

                  {/* 困惑文字 */}
                  <div style={{
                    flex: 1, position: 'relative', zIndex: 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: '100%', padding: '0 8px',
                  }}>
                    {confusionText.trim() ? (
                      <p style={{
                        fontSize: 19,
                        lineHeight: 2.2,
                        color: '#3A3A3A',
                        fontWeight: 400,
                        textAlign: 'center',
                        letterSpacing: '0.04em',
                        fontFamily: '"Noto Serif SC", serif',
                      }}>
                        {confusionText}
                      </p>
                    ) : (
                      <p style={{
                        fontSize: 17,
                        lineHeight: 2.2,
                        color: '#C0B8A8',
                        fontWeight: 400,
                        textAlign: 'center',
                        letterSpacing: '0.04em',
                        fontStyle: 'italic',
                        fontFamily: '"Noto Serif SC", serif',
                      }}>
                        写下你的困惑...
                      </p>
                    )}
                  </div>

                  {/* 等待标签 */}
                  <div style={{
                    position: 'relative', zIndex: 1, marginTop: 24,
                    padding: '8px 20px',
                    borderRadius: 20,
                    background: 'rgba(184,128,74,0.06)',
                    border: '1px solid rgba(184,128,74,0.15)',
                  }}>
                    <span style={{
                      fontSize: 11,
                      color: '#B8804A',
                      letterSpacing: '0.06em',
                      fontWeight: 500
                    }}>
                      等待另一个思考者
                    </span>
                  </div>

                  {/* 底部 */}
                  <div style={{
                    width: '100%', position: 'relative', zIndex: 1,
                    marginTop: 32, textAlign: 'center'
                  }}>
                    <span style={{
                      fontSize: 10,
                      color: '#B0B0B0',
                      letterSpacing: '0.08em',
                      fontWeight: 400
                    }}>
                      {confusionData.bookTitle ? `《${confusionData.bookTitle}》` : 'InkTrace · 墨迹溯源'}
                      {' · '}
                      {new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </span>
                  </div>
                </div>

                {/* 输入区 + 操作按钮 */}
                <div className="w-full max-w-[420px] space-y-3">
                  <div className="relative">
                    <textarea
                      value={confusionText}
                      onChange={(e) => setConfusionText(e.target.value)}
                      placeholder="说说你困惑的地方？不一定需要答案，诚实地写下'没想通'本身就是思考。"
                      rows={3}
                      className="w-full p-4 text-sm bg-white/80 backdrop-blur-sm rounded-2xl border border-stone-200/60 resize-none focus:outline-none focus:border-amber-300/60 text-stone-700 placeholder:text-stone-400 font-serif leading-relaxed"
                    />
                  </div>
                  <div className="flex items-center gap-3 justify-center">
                    <button
                      onClick={() => setShowConfusionModal(false)}
                      className="px-5 py-2 rounded-full text-sm bg-white/10 backdrop-blur-sm border border-white/20 text-white/80 hover:bg-white/20 transition-colors flex items-center gap-1.5"
                    >
                      <X size={14} />
                      关闭
                    </button>
                    <button
                      onClick={downloadConfusionCard}
                      disabled={!confusionText.trim()}
                      className="px-5 py-2 rounded-full text-sm text-white hover:opacity-90 transition-colors flex items-center gap-1.5 shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{ backgroundColor: '#B8804A', boxShadow: '0 8px 20px rgba(184,128,74,0.3)' }}
                    >
                      <Download size={14} />
                      保存困惑卡片
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      {/* 浮窗深探 */}
      <AnimatePresence>
        {floatWindowOpen && floatWindowItem && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[85] bg-stone-900/40 backdrop-blur-sm" onClick={handleFloatClose} />
            <motion.div initial={{ opacity: 0, scale: 0.92, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.92, y: 20 }} transition={{ type: "spring", damping: 30, stiffness: 250 }} className="fixed z-[90] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] max-h-[80vh] rounded-3xl overflow-hidden bg-white/70 backdrop-blur-2xl border border-white/40 shadow-[0_25px_80px_rgba(0,0,0,0.15),0_0_0_1px_rgba(255,255,255,0.3)] flex flex-col" style={{ WebkitBackdropFilter: 'blur(40px)' }}>
              <div className="p-6 border-b border-stone-200/30 shrink-0">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2"><span className="px-2 py-0.5 bg-primary/10 text-primary text-[11px] font-bold rounded-full">{floatWindowItem.relation || '关联'}</span><h3 className="text-xl font-serif font-bold text-stone-800 truncate">{floatWindowItem.term}</h3></div>
                    {(floatWindowItem.explanation || floatWindowItem.note) && <p className="text-[13px] text-stone-500 leading-relaxed">{floatWindowItem.explanation || floatWindowItem.note}</p>}
                  </div>
                  <button onClick={handleFloatClose} className="w-8 h-8 rounded-full bg-stone-200/60 hover:bg-stone-300/60 flex items-center justify-center transition-colors shrink-0 ml-2"><X size={14} className="text-stone-400" /></button>
                </div>
                {floatWindowItem.provocation && <div className="mt-3 p-3 bg-primary/5 rounded-xl border border-primary/15"><p className="text-[13px] text-primary leading-relaxed italic">💡 {floatWindowItem.provocation}</p></div>}
              </div>
              <div ref={floatChatRef} className="flex-1 overflow-y-auto p-6 space-y-5 min-h-[180px] max-h-[42vh]">
                {floatChatHistory.length === 0 && <div className="flex flex-col items-center justify-center py-10 text-stone-300"><MessageCircle size={36} className="mb-3 opacity-20" /><p className="text-[13px]">输入你的追问，深入探讨这个概念</p></div>}
                {floatChatHistory.map((msg: any, i: number) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-[14px] leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-slate-700 rounded-br-md [&_p]:!text-white [&_strong]:!text-amber-200 [&_h3]:!text-white [&_blockquote]:!text-white/60 [&_blockquote]:!border-white/30 [&_span]:!text-white/80'
                        : msg.isDigest
                          ? 'bg-primary/5 text-primary border border-primary/15 rounded-bl-md [&_p]:!text-primary [&_strong]:!text-primary'
                          : 'bg-white/80 text-stone-700 border border-stone-200/60 rounded-bl-md [&_p]:!text-stone-700 [&_strong]:!text-stone-800 [&_h3]:!text-stone-800 [&_blockquote]:!text-stone-500'
                    }`}><SimpleMarkdown content={msg.content || '...'} /></div>
                  </div>
                ))}
                {isFloatChatting && <div className="flex justify-start"><div className="bg-white/60 px-4 py-3 rounded-2xl border border-stone-200/30"><Loader2 className="animate-spin text-primary/40" size={16} /></div></div>}
              </div>
              <div className="p-4 border-t border-stone-200/30 shrink-0">
                <div className="flex items-center gap-2">
                  <button onClick={handleFloatPinToMain} disabled={floatChatHistory.length === 0} className="w-9 h-9 rounded-full bg-stone-100/80 text-stone-400 flex items-center justify-center hover:bg-indigo-50 hover:text-slate-600 transition-all disabled:opacity-30 shrink-0" title="钉到主面板"><Pin size={13} /></button>
                  <button onClick={handleFloatSaveToVolume} disabled={isFloatChatting || floatChatHistory.length === 0} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-[11px] font-bold hover:bg-primary/20 transition-all disabled:opacity-30 shrink-0" title="保存至成册"><BookOpen size={12} />保存至成册</button>
                  <div className="flex-1 relative">
                    <input type="text" value={floatChatInput} onChange={(e) => setFloatChatInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleFloatSend()} placeholder="深入追问这个概念..." className="w-full bg-stone-100/60 border border-stone-200/40 rounded-full pl-4 pr-16 py-3 text-[13px] outline-none focus:bg-white focus:border-primary/30 transition-all font-serif" />
                    <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex gap-0.5">
                      <button onClick={handleFloatSummarize} disabled={isFloatChatting || floatChatHistory.length === 0} className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20 transition-all disabled:opacity-30" title="精炼"><Sparkles size={13} /></button>
                      <button onClick={handleFloatSend} disabled={!floatChatInput.trim() || isFloatChatting} className="w-8 h-8 rounded-full bg-slate-700 text-white flex items-center justify-center hover:bg-slate-800 transition-all disabled:opacity-30"><Send size={13} /></button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      </div>
      )}
      <AnimatePresence>
        {showMeditation && (
          <MeditationOverlay
            onComplete={() => setShowMeditation(false)}
            onSkip={() => setShowMeditation(false)}
          />
        )}
      </AnimatePresence>
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
            <button className="w-full py-4 bg-[#0052D9] text-white rounded-xl flex items-center justify-center gap-3 shadow-xl shadow-indigo-500/20 hover:bg-indigo-600 transition-all font-bold tracking-widest text-xs mb-8 uppercase">
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
      className="h-full overflow-y-auto p-16 max-w-2xl mx-auto"
    >
      <header className="mb-16">
        <h1 className="text-4xl font-serif font-bold text-stone-800 mb-3">设置</h1>
        <p className="text-stone-400 text-sm">连接外部服务，管理本地数据</p>
      </header>

      <div className="space-y-8">
        <section className="glaze-card rounded-[2rem] p-8 border border-white">
          <header className="flex items-center gap-4 mb-8">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary"><LinkIcon size={20} /></div>
            <h2 className="text-xl font-serif font-bold">腾讯文档同步</h2>
          </header>
          <SyncTile name="腾讯文档" connected />
        </section>

        <section className="glaze-card rounded-[2rem] p-8 border border-white">
          <header className="flex items-center gap-4 mb-6">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary"><Sliders size={20} /></div>
            <h2 className="text-xl font-serif font-bold">界面主题</h2>
          </header>
          <p className="text-sm text-stone-500 leading-relaxed mb-6">选择让你更专注的视觉氛围</p>
          <div className="flex gap-3">
            <button
              onClick={() => {
                document.documentElement.dataset.theme = 'warm';
                localStorage.setItem('inktrace_theme', 'warm');
              }}
              className="flex-1 py-4 rounded-2xl border-2 text-center transition-all"
              style={{
                background: 'linear-gradient(135deg, #f4f6f5 0%, #e9edeb 100%)',
                borderColor: '#c1c7c4',
                color: '#2a2e2c'
              }}
            >
              <span className="block text-lg mb-1">暖</span>
              <span className="text-xs font-bold uppercase tracking-widest">温暖版</span>
            </button>
            <button
              onClick={() => {
                document.documentElement.dataset.theme = 'clean';
                localStorage.setItem('inktrace_theme', 'clean');
              }}
              className="flex-1 py-4 rounded-2xl border-2 text-center transition-all"
              style={{
                background: 'linear-gradient(135deg, #ffffff 0%, #f5f5f4 100%)',
                borderColor: '#d6d3d1',
                color: '#1c1917'
              }}
            >
              <span className="block text-lg mb-1">清</span>
              <span className="text-xs font-bold uppercase tracking-widest">简明版</span>
            </button>
          </div>
        </section>

        <section className="glaze-card rounded-[2rem] p-8 border border-white">
          <header className="flex items-center gap-4 mb-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary"><Database size={20} /></div>
            <h2 className="text-xl font-serif font-bold">藏骨所</h2>
          </header>
          <p className="text-sm text-stone-500 leading-relaxed mb-8">本地 L4 向量数据库路径</p>
          <div className="space-y-8">
            <div className="group">
              <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest group-focus-within:text-primary transition-colors">存储路径</label>
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
      </div>
    </motion.div>
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

