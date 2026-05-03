import os
import datetime
import uuid
from typing import Dict, Any

# ==========================================
# 内存数据库 (MOCK DB)
# ==========================================

class MockStore:
    def __init__(self):
        self.books = {}
        self.jobs: Dict[str, Dict[str, Any]] = {}
        self.semantic_cards: Dict[str, Dict[str, Any]] = {}
        
        self._load_real_books()
        
    def _load_real_books(self):
        """扫描 data 目录加载真实数据，并同步处理状态"""
        # 使用绝对路径确保可靠性
        current_file = os.path.abspath(__file__)
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(current_file)))
        source_dir = os.path.join(base_dir, "data", "source_books")
        notes_dir = os.path.join(base_dir, "data", "raw_notes")
        output_dir = os.path.join(base_dir, "data", "output")
        
        print(f"🔍 开始扫描数据目录: {base_dir}")
        
        # 1. 记录已处理完成的书籍 (扫描 output 目录)
        completed_books = set()
        if os.path.exists(output_dir):
            for item in os.listdir(output_dir):
                item_path = os.path.join(output_dir, item)
                if os.path.isdir(item_path):
                    if any(f.endswith("_Notes.md") for f in os.listdir(item_path)):
                        completed_books.add(item)
                elif item.endswith(".md"):
                    title = item.replace("cleaned_", "").replace(".md", "")
                    completed_books.add(title)

        # 2. 加载 Source Books (递归扫描子目录)
        if os.path.exists(source_dir):
            for root, dirs, files in os.walk(source_dir):
                for filename in files:
                    if filename.endswith(".txt") or filename.endswith(".md"):
                        raw_title = os.path.splitext(filename)[0]
                        clean_title = raw_title.replace("《", "").replace("》", "")
                        book_id = str(uuid.uuid5(uuid.NAMESPACE_URL, clean_title))[:8]
                        
                        is_done = clean_title in completed_books or raw_title in completed_books
                        
                        self.books[book_id] = {
                            "id": book_id,
                            "title": raw_title,
                            "author": "原著全文",
                            "source": "Library",
                            "progress": 100,
                            "status": "已完成" if is_done else "就绪",
                            "statusColor": "bg-green-500" if is_done else "bg-blue-400",
                            "isError": False,
                            "img": ""
                        }
            print(f"✅ 已加载 {len(self.books)} 本原著")

        # 3. 加载 Raw Notes (待清洗数据)
        if os.path.exists(notes_dir):
            notes_count = 0
            for filename in os.listdir(notes_dir):
                if filename.lower().endswith((".txt", ".md", ".rtf")):
                    raw_title = os.path.splitext(filename)[0]
                    # 智能清理标题（移除书名号和常见后缀）
                    clean_title = raw_title.replace("notes", "").replace("dirty", "").replace("sample", "").strip("_ 《》")
                    
                    note_id = "note_" + str(uuid.uuid5(uuid.NAMESPACE_URL, raw_title))[:8]
                    
                    # 检查 output 目录：匹配文件夹名或文件名
                    is_done = False
                    raw_no_brackets = raw_title.replace("《", "").replace("》", "")
                    for cb in completed_books:
                        if raw_title in cb or raw_no_brackets in cb or clean_title in cb:
                            is_done = True
                            break
                    
                    self.books[note_id] = {
                        "id": note_id,
                        "title": raw_title,
                        "author": "待处理笔记",
                        "source": "Dirty Notes",
                        "progress": 100 if is_done else 0,
                        "status": "已完成" if is_done else "需清洗",
                        "statusColor": "bg-green-500" if is_done else "bg-red-500",
                        "isError": not is_done,
                        "img": ""
                    }
                    notes_count += 1
            print(f"✅ 已加载 {notes_count} 份待处理笔记")
                
    def reset(self):
        """重新扫描磁盘数据"""
        print("🔄 正在重新同步磁盘数据...")
        self.books = {}
        self._load_real_books()

# 全局单例
store = MockStore()
