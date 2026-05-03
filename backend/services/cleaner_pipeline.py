# backend/services/cleaner_pipeline.py
import re
import os
import difflib
from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Callable
from collections import OrderedDict
import logging

logger = logging.getLogger(__name__)


# ==============================================================================
# 遗留函数 (供 llm_service.py 兼容导入)
# ==============================================================================

def clean_basic_noise(text: str, full_text: str = "") -> str:
    """
    清洗常见噪声：孤立的页码数字、多余空行、中文硬换行合并。
    不修改任何元数据行，确保出处信息完整保留。
    可选传入原文全文 full_text 以启用上下文修复。
    """
    lines = text.strip().splitlines()
    cleaned_lines = []
    for line in lines:
        line = line.strip()
        if re.fullmatch(r'\d{1,4}', line):
            continue
        cleaned_lines.append(line)

    merged_lines = []
    buffer = ""
    for line in cleaned_lines:
        if not line:
            if buffer:
                merged_lines.append(buffer)
                buffer = ""
            merged_lines.append("")
        else:
            if buffer and re.search(r'[\u4e00-\u9fff\w]$', buffer) and re.search(r'^[\u4e00-\u9fff\w]', line):
                buffer += line
            else:
                if buffer:
                    merged_lines.append(buffer)
                buffer = line
    if buffer:
        merged_lines.append(buffer)

    final_lines = []
    prev_empty = False
    for line in merged_lines:
        if line == "":
            if not prev_empty:
                final_lines.append(line)
                prev_empty = True
        else:
            final_lines.append(line)
            prev_empty = False

    text = "\n".join(final_lines).strip()
    text = beautify_timestamps(text)
    text = merge_orphan_lines_safe(text)
    if full_text:
        text = apply_context_fixes(text, full_text)
    return text


def beautify_timestamps(text: str) -> str:
    pattern = r'添加于 (\d{4})年(\d{1,2})月(\d{1,2})日星期[一二三四五六日] (上午|下午)(\d{1,2}):(\d{2}):(\d{2})'
    def replacer(match):
        year, month, day, ampm, hour, minute, second = match.groups()
        hour = int(hour)
        if ampm == '下午' and hour != 12:
            hour += 12
        elif ampm == '上午' and hour == 12:
            hour = 0
        return f"添加于 {year}年{month}月{day}日 {hour:02d}:{minute}"
    return re.sub(pattern, replacer, text)


def normalize_book_name(raw_name: str) -> str:
    name = raw_name.strip().replace('（', '(').replace('）', ')')
    original_title = None
    first_orig = re.search(r'[«‹](.+?)[»›]', name)
    if first_orig:
        original_title = first_orig.group(1).strip()
    name = re.sub(r'[«‹].+?[»›]', '', name)
    name = re.sub(r'\s*=\s*', '', name).strip()
    author_str = ''
    first_paren = name.find('(')
    if first_paren != -1:
        count = 0
        end = first_paren
        for i in range(first_paren, len(name)):
            if name[i] == '(':
                count += 1
            elif name[i] == ')':
                count -= 1
                if count == 0:
                    end = i
                    break
        raw_author = name[first_paren+1:end]
        raw_author = re.sub(r'\[.*?\]|\(.*?\)', '', raw_author).strip()
        parts = re.split(r'\s*[,;，；]\s*|\s+', raw_author)
        author = None
        translator = None
        for part in parts:
            if re.search(r'著|編|编', part):
                author = re.sub(r'\s*(著|編|编)\s*', '', part).strip()
            elif re.search(r'译', part):
                translator = re.sub(r'\s*译\s*', '', part).strip()
        if not author and not translator:
            for part in parts:
                if part and part.lower() not in ('unknown', '著', '译'):
                    author = part
                    break
        if author and translator:
            author_str = f"{author} 著, {translator} 译"
        elif author:
            author_str = author
        title_part = name[:first_paren].strip()
    else:
        title_part = name.strip()
    title_part = re.sub(r'[=«»\s]+$', '', title_part).strip()
    if not title_part:
        return raw_name
    if original_title and original_title != title_part:
        clean_name = f"{title_part} (原名: {original_title})"
    else:
        clean_name = title_part
    if author_str:
        clean_name += f" ({author_str})"
    return clean_name.strip()


SourceExtractor = Callable[[str], Optional[str]]


def extract_by_kindle_style(segment: str) -> Optional[str]:
    lines = segment.strip().splitlines()
    first_line = lines[0].strip().lstrip("\ufeff")
    if first_line and len(first_line) < 100 and re.match(r'^[^\-].+\(.+\)\s*$', first_line):
        return first_line
    for i, line in enumerate(lines):
        if re.search(r'您在位置\s*#|标注|添加于', line):
            if i >= 2:
                candidate = lines[i-2].strip() if lines[i-1].strip() == "" else lines[i-1].strip()
                if candidate and len(candidate) < 100:
                    return candidate
            break
    return None


def extract_by_generic_metadata(segment: str) -> Optional[str]:
    for line in segment.splitlines():
        line = line.strip()
        match = re.match(r'^(来源|出自|Source|From|摘自)\s*[：:]\s*(.+)', line, re.IGNORECASE)
        if match:
            return match.group(2).strip()
        if line.startswith('# '):
            return line[2:].strip()
    return None


def extract_by_book_title_in_brackets(segment: str) -> Optional[str]:
    head = segment[:500]
    titles = re.findall(r'《([^》]+)》', head)
    if not titles:
        return None
    from collections import Counter
    most_common = Counter(titles).most_common(1)[0][0]
    return most_common


DEFAULT_EXTRACTORS = [
    extract_by_kindle_style,
    extract_by_generic_metadata,
    extract_by_book_title_in_brackets
]


def create_source_extractor(strategy: str = "auto") -> SourceExtractor:
    if callable(strategy):
        return strategy
    strategies = {
        "auto": DEFAULT_EXTRACTORS,
        "kindle": [extract_by_kindle_style],
        "generic": [extract_by_generic_metadata],
        "bracket": [extract_by_book_title_in_brackets],
    }
    extractors = strategies.get(strategy, DEFAULT_EXTRACTORS)

    def combined_extractor(segment: str) -> Optional[str]:
        for func in extractors:
            result = func(segment)
            if result:
                return result
        return None
    return combined_extractor


def group_by_source(text: str, source_extractor: Optional[SourceExtractor] = None) -> Dict[str, List[str]]:
    if source_extractor is None:
        source_extractor = create_source_extractor("auto")
    separators = re.finditer(r'^[=-\*]{3,}\s*$', text, re.MULTILINE)
    boundaries = [0]
    for sep in separators:
        boundaries.append(sep.end())
    boundaries.append(len(text))
    if len(boundaries) <= 2:
        raw_entries = [block.strip() for block in re.split(r'\n\s*\n', text) if block.strip()]
    else:
        raw_entries = []
        for i in range(len(boundaries)-1):
            entry = text[boundaries[i]:boundaries[i+1]].strip()
            if entry:
                raw_entries.append(entry)
    grouped = OrderedDict()
    unknown_key = "未分类笔记"
    for entry in raw_entries:
        source = source_extractor(entry)
        if source is None:
            source = unknown_key
        grouped.setdefault(source, []).append(entry)
    return grouped


def split_by_source_as_chunks(text: str,
                              source_extractor: Optional[SourceExtractor] = None,
                              max_chunk_words: int = 5000) -> List[Dict[str, str]]:
    grouped = group_by_source(text, source_extractor)
    chunks = []
    for source, entries in grouped.items():
        clean_source = normalize_book_name(source)
        source_text = "\n\n---\n\n".join(entries)
        if len(source_text) <= max_chunk_words:
            chunks.append({"source": clean_source, "text": source_text, "part": "1/1"})
        else:
            paragraphs = re.split(r'\n\s*\n', source_text)
            sub_texts = []
            current = []
            current_len = 0
            for para in paragraphs:
                para_len = len(para)
                if current_len + para_len > max_chunk_words and current:
                    sub_texts.append("\n\n".join(current))
                    current = []
                    current_len = 0
                current.append(para)
                current_len += para_len + 2
            if current:
                sub_texts.append("\n\n".join(current))
            for idx, sub in enumerate(sub_texts, start=1):
                chunks.append({"source": clean_source, "text": sub, "part": f"{idx}/{len(sub_texts)}"})
    return chunks


def split_text_into_chunks(text: str, chunk_size: int = 5000, overlap: int = 200) -> List[str]:
    paragraphs = re.split(r'\n\s*\n', text)
    chunks = []
    current_chunk = []
    current_len = 0
    for para in paragraphs:
        para_len = len(para)
        if current_len + para_len > chunk_size and current_chunk:
            chunks.append("\n\n".join(current_chunk))
            if overlap > 0 and len(current_chunk) > 1:
                overlap_text = current_chunk[-1]
                current_chunk = [overlap_text]
                current_len = len(overlap_text) + 2
            else:
                current_chunk = []
                current_len = 0
        current_chunk.append(para)
        current_len += para_len + 2
    if current_chunk:
        chunks.append("\n\n".join(current_chunk))
    return chunks


def build_safe_query(source: str) -> str:
    match = re.match(r'(.+?)\s*\((.+)\)', source)
    title = match.group(1).strip() if match else source
    author = match.group(2).strip() if match else ''
    title = re.sub(r'\s*\(原名:.*?\)', '', title).strip()
    return f"《{title}》 {author} 主题 背景 书评"


def merge_orphan_lines_safe(text: str) -> str:
    safe_tails = set('的了吗呢着在叫被把可也又还就才')
    lines = text.split('\n')
    merged_lines = []
    skip = False
    for i in range(len(lines) - 1):
        if skip:
            skip = False
            continue
        curr = lines[i].rstrip()
        nxt = lines[i+1].lstrip()
        if (curr and nxt and len(nxt) == 1 and
            re.search(r'[\u4e00-\u9fff]$', curr) and
            re.search(r'^[\u4e00-\u9fff]', nxt)):
            if curr[-1] in safe_tails:
                context = '\n'.join(lines[max(0,i-1):i+3])
                if curr[-1] + nxt in context:
                    merged_lines.append(curr + nxt)
                    skip = True
                    continue
        merged_lines.append(curr)
    if not skip:
        merged_lines.append(lines[-1] if lines else '')
    return '\n'.join(merged_lines)


def load_source_text(filepath: str = None) -> str:
    if filepath and os.path.exists(filepath):
        with open(filepath, 'r', encoding='utf-8') as f:
            return f.read()
    return ""


def search_context(query: str, full_text: str, window_size: int = 30) -> str:
    if not full_text or not query:
        return ""
    best_ratio = 0
    best_start = 0
    for i in range(len(full_text) - window_size):
        candidate = full_text[i:i+window_size]
        ratio = difflib.SequenceMatcher(None, query, candidate).ratio()
        if ratio > best_ratio:
            best_ratio = ratio
            best_start = i
    if best_ratio > 0.6:
        start = max(0, best_start - 50)
        end = min(len(full_text), best_start + window_size + 50)
        return full_text[start:end]
    return ""


def detect_suspicious_spans(text: str) -> list:
    lines = text.split('\n')
    suspects = []
    for i in range(len(lines)-1):
        curr = lines[i].rstrip()
        nxt = lines[i+1].lstrip()
        if curr and nxt and len(nxt) <= 2 and re.search(r'[\u4e00-\u9fff]$', curr) and re.match(r'^[\u4e00-\u9fff]', nxt):
            suspects.append({'type': 'orphan', 'line': i, 'curr': curr, 'nxt': nxt})
        if curr and re.search(r'[\u4e00-\u9fff]$', curr) and not re.search(r'[。！？.!?]$', curr):
            suspects.append({'type': 'missing_punct', 'line': i, 'text': curr})
    return suspects


def apply_context_fixes(text: str, full_text: str) -> str:
    if not full_text:
        return text
    suspects = detect_suspicious_spans(text)
    lines = text.split('\n')
    for sus in suspects:
        if sus['type'] == 'orphan':
            query = sus['curr'][-10:] + sus['nxt'][:10]
            ctx = search_context(query, full_text)
            if ctx:
                lines[sus['line']] = lines[sus['line']].rstrip() + lines[sus['line']+1].lstrip()
                lines[sus['line']+1] = ''
        elif sus['type'] == 'missing_punct':
            ctx = search_context(sus['text'][-15:], full_text)
            if ctx:
                punct_match = re.search(r'[。！？.!?]', ctx)
                if punct_match:
                    lines[sus['line']] = lines[sus['line']].rstrip() + punct_match.group()
    cleaned = [l for l in lines if l.strip() != '']
    return '\n'.join(cleaned)

# ==========================================
# 1. 基础拦截器接口
# ==========================================
class TextCleanerStep(ABC):
    """文本清洗步骤的抽象基类"""
    @abstractmethod
    def process(self, text: str, full_text: Optional[str] = None) -> str:
        pass

# ==========================================
# 2. 具体清洗规则 (按单一职责拆分)
# ==========================================
class OrphanNumberRemover(TextCleanerStep):
    """去除孤立的页码或无关数字"""
    def process(self, text: str, full_text: Optional[str] = None) -> str:
        lines = text.strip().splitlines()
        cleaned_lines = [line for line in lines if not re.fullmatch(r'\d{1,4}', line.strip())]
        return "\n".join(cleaned_lines)

class ChineseHardLineBreakMerger(TextCleanerStep):
    #"""缝合中文硬换行（修复 PDF/电子书复制导致的断句）"""
    #def process(self, text: str, full_text: Optional[str] = None) -> str:
    #    lines = text.splitlines()
    #    merged_lines = []
    #   buffer = ""
    #    
    #    for line in lines:
    #        line = line.strip()
    #        if not line:
    #            if buffer:
    #                merged_lines.append(buffer)
    #                buffer = ""
    #            merged_lines.append("")  # 保留合理空行
    #        else:
    #            # 若 buffer 以中文结尾，当前行以中文开头，则无缝缝合
    #            if buffer and re.search(r'[\u4e00-\u9fff\w]$', buffer) and re.search(r'^[\u4e00-\u9fff\w]', line):
    #                buffer += line
    #            else:
    #                if buffer:
    #                    merged_lines.append(buffer)
    #                buffer = line
    #                
    #    if buffer:
    #       merged_lines.append(buffer)
    #      
    #    return re.sub(r'\n{3,}', '\n\n', "\n".join(merged_lines)).strip()
    """缝合中文硬换行（修复 PDF/电子书复制导致的断句）"""
    def process(self, text: str, full_text: Optional[str] = None) -> str:
        lines = text.splitlines()
        merged_lines = []
        buffer = ""
        
        for line in lines:
            line = line.strip()
            if not line:
                if buffer:
                    merged_lines.append(buffer)
                    buffer = ""
                merged_lines.append("")  
            else:
                # 【Fix】：去掉了 \w，严格要求上一行必须以纯汉字结尾，且没有标点
                if buffer and re.search(r'[\u4e00-\u9fff]$', buffer) and re.search(r'^[\u4e00-\u9fff]', line):
                    buffer += line
                else:
                    if buffer:
                        merged_lines.append(buffer)
                    buffer = line
                    
        if buffer:
            merged_lines.append(buffer)
            
        return re.sub(r'\n{3,}', '\n\n', "\n".join(merged_lines)).strip()

class TimestampBeautifier(TextCleanerStep):
    """美化导出工具的冗长时间戳"""
    def process(self, text: str, full_text: Optional[str] = None) -> str:
        pattern = r'添加于 (\d{4})年(\d{1,2})月(\d{1,2})日星期[一二三四五六日] (上午|下午)(\d{1,2}):(\d{2}):(\d{2})'
        
        def replacer(match):
            year, month, day, ampm, hour, minute, _ = match.groups()
            hour = int(hour)
            if ampm == '下午' and hour != 12: hour += 12
            elif ampm == '上午' and hour == 12: hour = 0
            return f"添加于 {year}年{month}月{day}日 {hour:02d}:{minute}"
            
        return re.sub(pattern, replacer, text)

class BoundarySanitizer(TextCleanerStep):
    """强制移除所有段落开头的不合理标点（如孤立的句号）"""
    def process(self, text: str, full_text: Optional[str] = None) -> str:
        lines = text.splitlines()
        cleaned = []
        for line in lines:
            # 剥离段落开头的不合理标点
            line = re.sub(r'^[。、”，？；！]+', '', line.strip())
            cleaned.append(line)
        return "\n".join(cleaned)

class L2FuzzyContextFixer(TextCleanerStep):
    """L2 核心：零幻觉原文辅助修复 (全局区间合并终极版)"""
    def __init__(self):
        self.structured_blocks = []

    def process(self, text: str, full_text: Optional[str] = None) -> str:
        self.structured_blocks = []
        if not full_text:
            return text
            
        shadow_text = re.sub(r'[\n\r\u3000\s]+', '', full_text)
        lines = text.split('\n')
        
        intervals = []
        unmapped_lines = []
        current_search_start = 0
        
        for i, curr in enumerate(lines):
            c_curr = curr.strip()
            if not c_curr:
                continue
                
            dehydrated = re.sub(r'[\n\r\u3000\s]+', '', c_curr)
            
            idx = -1
            match_len = len(dehydrated)
            
            if '...' in dehydrated or '…' in dehydrated:
                parts = re.split(r'[…\.]+', dehydrated)
                parts = [p for p in parts if len(p) >= 3]
                if parts:
                    h_idx = shadow_text.find(parts[0], current_search_start, current_search_start + 5000)
                    if h_idx == -1: h_idx = shadow_text.find(parts[0])
                    
                    if h_idx != -1:
                        idx = h_idx
                        if len(parts) > 1:
                            t_idx = shadow_text.find(parts[-1], h_idx, h_idx + 5000)
                            if t_idx != -1:
                                match_len = t_idx + len(parts[-1]) - h_idx
                            else:
                                match_len = len(dehydrated)
                        else:
                            match_len = len(dehydrated)
            else:
                if len(dehydrated) >= 3:
                    idx = shadow_text.find(dehydrated, current_search_start, current_search_start + 2000)
                    if idx == -1:
                        idx = shadow_text.find(dehydrated)
                elif len(dehydrated) > 0:
                    idx = shadow_text.find(dehydrated, current_search_start, current_search_start + 50)
                    
                if idx == -1 and len(dehydrated) >= 10:
                    head_anchor = dehydrated[:8]
                    tail_anchor = dehydrated[-8:]
                    
                    h_idx = shadow_text.find(head_anchor, current_search_start, current_search_start + 5000)
                    if h_idx == -1: h_idx = shadow_text.find(head_anchor)
                    
                    t_idx = shadow_text.find(tail_anchor, current_search_start, current_search_start + 5000)
                    if t_idx == -1: t_idx = shadow_text.find(tail_anchor)
                    
                    if h_idx != -1 and t_idx != -1 and t_idx >= h_idx:
                        idx = h_idx
                        match_len = t_idx + 8 - h_idx
                    elif h_idx != -1:
                        idx = h_idx
                    elif t_idx != -1:
                        idx = max(0, t_idx - len(dehydrated) + 8)

            if idx != -1:
                intervals.append([idx, idx + match_len])
                current_search_start = idx + match_len
            else:
                unmapped_lines.append(curr)

        if not intervals:
            return text
            
        intervals.sort(key=lambda x: x[0])
        merged = []
        for interval in intervals:
            if not merged:
                merged.append(interval)
            else:
                last = merged[-1]
                if interval[0] <= last[1] + 15:
                    last[1] = max(last[1], interval[1])
                else:
                    merged.append(interval)
                    
        final_lines = []
        
        for start, end in merged:
            # 1. 寻找句子级安全边界 (Sentence expansion)
            left_candidates = [shadow_text.rfind(p, 0, start) for p in ['。', '！', '？', '；']]
            left_candidates = [c for c in left_candidates if c != -1]
            s_left = max(left_candidates) + 1 if left_candidates else 0
            
            r_match = re.search(r'[。！？；]', shadow_text[end:])
            if r_match:
                s_right = end + r_match.end()
            else:
                s_right = len(shadow_text)
            
            sentence = shadow_text[s_left:s_right].strip()
            
            # 2. 如果划线区间很短（<= 15 个字），判断为“成语/词汇积累”模式
            if end - start <= 15:
                # 寻找词语级边界 (Word/Clause expansion)
                w_left_candidates = [shadow_text.rfind(p, s_left, start) for p in '，。！？；：、“”‘’《》（）']
                w_left_candidates = [c for c in w_left_candidates if c != -1]
                w_left = max(w_left_candidates) + 1 if w_left_candidates else s_left
                
                w_right_candidates = [shadow_text.find(p, end, s_right) for p in '，。！？；：、“”‘’《》（）']
                w_right_candidates = [c for c in w_right_candidates if c != -1]
                w_right = min(w_right_candidates) if w_right_candidates else s_right
                
                phrase = shadow_text[w_left:w_right].strip()
                original_highlight = shadow_text[start:end].strip()
                
                # 如果标点扩展出来的短语不算太长（<= 20），且不等于整句话，采纳这个完美边界
                if phrase and len(phrase) <= 20 and len(phrase) < len(sentence):
                    heading = phrase
                else:
                    # 否则退回使用用户原始划线作为标题
                    heading = original_highlight
                
                # 生成成语格式：加粗成语 + 灰色原文（不添加可见的元数据标记）
                markdown_block = f"**{heading}**\n> {sentence}"
                core_concept = heading
            else:
                markdown_block = f"- {sentence}"
                core_concept = sentence[:20] + "..." if len(sentence) > 20 else sentence
                
            final_lines.append(markdown_block)
            
            ctx_start = max(0, s_left - 500)
            ctx_end = min(len(shadow_text), s_right + 500)
            
            self.structured_blocks.append({
                "markdown": markdown_block,
                "core_concept": core_concept,
                "raw_text": sentence,
                "context_window": shadow_text[ctx_start:ctx_end]
            })
            
        for unmapped in unmapped_lines:
            md = "- " + unmapped
            final_lines.append(md)
            self.structured_blocks.append({
                "markdown": md,
                "core_concept": unmapped[:20] + "...",
                "raw_text": unmapped,
                "context_window": ""
            })
            
        logger.info(f"L2 全局区间合并引擎将零散碎片融合成 {len(final_lines)} 个连贯段落。")
        
        return '\n\n'.join(final_lines)

# ==========================================
# 3. 管道管理器
# ==========================================
class DataCleaningPipeline:
    """按序执行清洗任务的流水线"""
    def __init__(self):
        self.l2_fixer = L2FuzzyContextFixer()
        self.steps: List[TextCleanerStep] = [
            OrphanNumberRemover(),
            TimestampBeautifier(),
            ChineseHardLineBreakMerger(),
            BoundarySanitizer(),
            self.l2_fixer
        ]

    def run(self, raw_text: str, full_text: Optional[str] = None) -> str:
        processed_text = raw_text
        for step in self.steps:
            processed_text = step.process(processed_text, full_text)
        return processed_text
        
    def get_structured_blocks(self):
        return self.l2_fixer.structured_blocks