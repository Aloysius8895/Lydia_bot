// Original Crew design metadata. Runtime methods come from business/skills via agents/skills.ts.
// This visual list does not directly call a persona or select the backend execution order.

export const me = { name: 'Personal workspace', initials: 'ME' };

// Keys map to the --bot-<key> color tokens in styles.css (light and dark variants).
export const palette = [
  { key: 'blue', label: 'Blue' },
  { key: 'purple', label: 'Purple' },
  { key: 'rose', label: 'Rose' },
  { key: 'orange', label: 'Orange' },
  { key: 'amber', label: 'Amber' },
  { key: 'green', label: 'Green' },
  { key: 'teal', label: 'Teal' },
  { key: 'sky', label: 'Sky' },
  { key: 'ink', label: 'Ink' },
];

export const suggestions = [
  { name: 'Deadline Keeper', color: 'orange', description: 'Tracks due dates and nudges you before they slip.' },
  { name: 'Meeting Prep', color: 'purple', description: 'Reads your calendar and drafts briefs the evening before.' },
  { name: 'Reply Writer', color: 'green', description: 'Drafts email replies in your voice for you to approve.' },
];

export const bots = [
  {
    id: 'steve',
    name: 'Steve Blank',
    color: 'blue',
    skill: 'steve-blank-discovery',
    status: 'Customer discovery · hypotheses and validation order',
    role: '把猜测改写成可反驳的假设，先验证问题再验证方案，决定继续、调整还是停止。',
    pinned: true,
    starters: ['我的黑客松点子是……，最该先验证哪个假设？', '帮我把这个想法拆成可反驳的客户/问题/渠道假设', '一个漂亮的 Demo 能证明有需求吗？'],
  },
  {
    id: 'ash',
    name: 'Ash Maurya',
    color: 'orange',
    skill: 'ash-maurya-lean-model',
    status: 'Lean model · one-page model and riskiest assumption',
    role: '在选定的缺口上做一页商业模式，排出最高风险假设，设计最小验证实验。',
    pinned: true,
    starters: ['帮我为这个缺口写一页精益画布：……', '我的模式里风险最高的假设是什么？', '怎么设计一个一周内能做完的最小实验？'],
  },
  {
    id: 'teresa',
    name: 'Teresa Torres',
    color: 'green',
    skill: 'teresa-torres-opportunity',
    status: 'Opportunity mapping · story-based interviews',
    role: '用具体经历访谈收集故事，归纳机会，搭建机会-方案树并检查需求覆盖。',
    pinned: true,
    starters: ['帮我写一份问具体经历的访谈提纲', '这几条用户反馈能归纳出什么机会？……', '怎么把机会整理成机会-方案树？'],
  },
  {
    id: 'april',
    name: 'April Dunford',
    color: 'rose',
    skill: 'april-dunford-positioning',
    status: 'Positioning · real alternatives and differentiated value',
    role: '从真实竞争替代出发，找出独特能力与价值、在意它的人，再选市场类别。',
    starters: ['用户现在不用我的产品时，会用什么替代？', '帮我写一个定位假设：……', '我该把产品放进哪个市场类别？'],
  },
  {
    id: 'bob',
    name: 'Bob Moesta',
    color: 'purple',
    skill: 'bob-moesta-demand',
    status: 'Demand-side · switching timeline and the four forces',
    role: '还原用户的转换时间线，分析推力、拉力、焦虑与习惯，以及谁买单、谁决策。',
    starters: ['用户为什么会从现有办法换到我的方案？', '帮我画一条用户购买的转换时间线', '“感兴趣”和“会付费”差在哪里？'],
  },
];

// Room members are visual metadata. The RAG controller schedules experts and gates Ash behind Gap selection.
export const rooms = [
  {
    id: 'team',
    name: 'Expert team',
    members: [
      { id: 'steve', status: 'Hypotheses and validation order' },
      { id: 'teresa', status: 'Stories and opportunities' },
      { id: 'april', status: 'Alternatives and positioning' },
      { id: 'bob', status: 'Switching and buying forces' },
      { id: 'ash', status: 'One-page model and experiments' },
    ],
    pinned: [],
    starters: ['我们的黑客松题目是……，每人从自己的方法给一个最该先做的动作', '@steve @bob 这个想法的需求证据够不够？……'],
  },
];

export const seedThreads = Object.fromEntries([...bots.map((b) => [`bot:${b.id}`, []]), ...rooms.map((r) => [`room:${r.id}`, []])]);
