/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const THEMES = [
  {
    id: 'ru',
    name: '天青',
    origin: '汝窑 (Ru)',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCu0CYQBE6xK0MpXwlRAu9XR_L7kT-DXG-g_VpWBoMUQ7Sx-pALXlMssL9bzVj5UQwOZvWeUHHIhhhTrwJyzGq68gAer8VirXiydS4nbNbs_Mzomt2QdK-lWSNyR66k_GJkPT3Xv4OMsGbgSYFKiPwwB4ltZG69xMwFsOaFfmRNgo2nJA8H76g_UCpuflR24U52DoL-Ko9lRA65Fl39xH6lsWQPkB3w2w6EocjM3nX1Yg0V3Z4mlp8AwS8efMccw0sNysR77-LmqWrJ',
    active: true
  },
  {
    id: 'guan',
    name: '冰裂',
    origin: '官窑 (Guan)',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDQaUZvILL0r8p4ylUKP542pjMnw_ZNU_9YvNm7yjeyQRWMCfNa_w31XhQIGEzYwUAcrCqp9i8z2aDLPMWM8033ET-vjGzkzqWC0CMrjAFtswdOqhof0Ez3q1VbqSCRf7IjqQl50SoUfHsZAuP3WYsk8oNRDSW7JP1tU9mI3YljRlpIB5S8ui4owNHcHRNcQ1anVeg5ZW_Ah-IGC1Rc5wOP3_sYC7F_HpXZKssrZAMu09C6_eaSbVNL4P9HhhCZTBgSll6rJjXDAzFS',
    active: false
  },
  {
    id: 'jun',
    name: '玫瑰紫',
    origin: '钧窑 (Jun)',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuC1bfIAOUpkfuQ1rLO1nRfO-KGVigc35ZqPshn073IqLeU8BKzLwOjopXjq-ic-ongFfEi5n_VtIE8eBTghHfJT4yUUk12pBfW7pTYiJF_pwuPbH9g_hRX4OOgK7hMJ6N8yehQV2exK5uFghDtQN4p_GVWXB1z_HzYxa2r4M1UGCEPj3mpqBl1Vy4eOhNS_wL3dGCc9myr0Zpqk_MIOAom4gJOubYM7r8DrtXTCm9esrfI8tbZnGNJQDZeBZ7Cduadj03R8Rq7F-r1U',
    active: false
  }
];

export const DATA_SOURCES = [
  { id: 'wechat', name: '微信读书', status: '已连接', icon: 'Book' },
  { id: 'apple', name: 'Apple Books', status: '32 待同步', icon: 'BookOpen' },
  { id: 'kindle', name: 'Kindle', status: '离线', icon: 'Tablet' }
];

export const VOLUMES = [
  {
    id: 1,
    title: '宋代江南士绅阶层研究',
    purity: 98,
    description: '从地方志与文人笔记中提取的社会网络结构与经济活动分析模型。',
    tags: ['宗族网络', '水利经济', '科举'],
    type: 'history'
  },
  {
    id: 2,
    title: '王阳明心学演变史',
    purity: 95,
    description: '梳理自龙场悟道至晚年天泉证道的思想逻辑脉络与核心概念辨析。',
    tags: ['知行合一', '致良知', '四句教'],
    type: 'philosophy'
  }
];
