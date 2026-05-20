import re
import os
from typing import Optional, Tuple
from pypinyin import lazy_pinyin
from thefuzz import fuzz

class BookMatcherService:
    """实体对齐服务：负责将用户笔记中的书名匹配到本地真实的文件库"""
    
    def __init__(self, library_path: str = "data/source_books"):
        self.library_path = library_path
        # 别名词典 (防线 1.5：解决常见的中英互译或缩写)
        self.aliases = {
            "三体": ["santi", "the three-body problem", "3 body problem"],
            "了不起的盖茨比": ["the great gatsby"],
            "人类简史": ["sapiens"]
        }

    def _get_available_books(self) -> list[str]:
        """扫描本地书库，获取所有可用原著的书名（去扩展名）"""
        if not os.path.exists(self.library_path):
            return []
        # 返回类似 ["三体_纯净版", "乔布斯传_精装", "活着"] 的列表
        return [os.path.splitext(f)[0] for f in os.listdir(self.library_path) if f.endswith('.txt')]

    def _normalize_title(self, title: str) -> str:
        """防线 1：书名极速卸妆"""
        title = title.lower().strip()
        # 扒掉书名号和括号
        title = re.sub(r'[《》\(\)（）【】]', '', title)
        # 去掉常见无意义后缀
        title = re.sub(r'(精装版|纯净版|完整版|修订版|著|译|txt|epub).*$', '', title).strip()
        # 去掉类似 "作者: 刘慈欣"
        title = re.sub(r'(作者|原名)[:：]?.*$', '', title).strip()
        return title

    def find_best_match(self, raw_note_title: str) -> Tuple[Optional[str], str]:
        """
        核心漏斗策略：返回 (匹配到的真实文件名, 匹配策略或原因)
        """
        available_books = self._get_available_books()
        if not available_books:
            return None, "书库为空"

        norm_note_title = self._normalize_title(raw_note_title)
        
        # --- 漏斗层 1：精确匹配 (0成本) ---
        for db_book in available_books:
            if norm_note_title == self._normalize_title(db_book):
                return db_book, "L1 精确匹配"

        # --- 漏斗层 1.5：别名词典命中 ---
        for standard_name, alias_list in self.aliases.items():
            if norm_note_title in alias_list:
                for db_book in available_books:
                    if standard_name in db_book:
                        return db_book, "L1.5 别名词典命中"

        # --- 漏斗层 2：拼音与模糊匹配 (低成本) ---
        best_match = None
        highest_score = 0
        
        # 计算拼音
        note_pinyin = "".join(lazy_pinyin(norm_note_title))
        
        for db_book in available_books:
            norm_db_title = self._normalize_title(db_book)
            db_pinyin = "".join(lazy_pinyin(norm_db_title))
            
            # 计算中文字符的编辑距离得分 (0-100)
            char_score = fuzz.ratio(norm_note_title, norm_db_title)
            # 计算拼音的编辑距离得分 (对付拼音输入或谐音错字)
            pinyin_score = fuzz.ratio(note_pinyin, db_pinyin)
            
            score = max(char_score, pinyin_score)
            if score > highest_score:
                highest_score = score
                best_match = db_book

        # 阈值判定
        if highest_score >= 85:
            return best_match, f"L2 强模糊匹配自动关联 (得分: {highest_score})"
        elif 65 <= highest_score < 85:
            # 处于暧昧区间，拒绝静默关联，留给前端让用户手动选（L4 策略）
            return None, f"匹配度暧昧 ({highest_score})，需用户手动确认"
            
        return None, "无匹配原著"

    def read_book_content(self, filename_without_ext: str) -> str:
        """读取匹配成功的全书内容"""
        file_path = os.path.join(self.library_path, f"{filename_without_ext}.txt")
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return f.read()
        except Exception:
            return ""