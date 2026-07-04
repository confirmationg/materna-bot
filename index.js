require('dotenv').config();

const { Bot } = require('grammy');
const axios = require('axios');
const { answerMaternalHealthQuestion } = require('./ai');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

function escapeHtml(text = '') {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

if (!TELEGRAM_BOT_TOKEN) {
  console.error('Missing TELEGRAM_BOT_TOKEN in .env — get one from @BotFather on Telegram.');
  process.exit(1);
}

const bot = new Bot(TELEGRAM_BOT_TOKEN);

// Per-chat conversation history for contextual Q&A
const MAX_HISTORY = 10; // max messages kept per chat (5 exchanges)
const MAX_CHATS = 500;  // evict oldest chat when map exceeds this size
const chatHistories = new Map();

function getHistory(chatId) {
  return chatHistories.get(chatId) || [];
}

function addToHistory(chatId, role, content) {
  const history = getHistory(chatId);
  history.push({ role, content });
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
  // Evict the oldest chat when the map gets too large
  if (!chatHistories.has(chatId) && chatHistories.size >= MAX_CHATS) {
    chatHistories.delete(chatHistories.keys().next().value);
  }
  chatHistories.set(chatId, history);
}

// ── Reminders (in-memory) ───────────────────────────────────────────────────

const MAX_REMINDERS_PER_CHAT = 20;
const chatReminders = new Map(); // chatId -> [{ id, note, dueAt, timeout }]
let reminderIdCounter = 1;

function getReminders(chatId) {
  return chatReminders.get(chatId) || [];
}

function scheduleReminder(ctx, chatId, ms, note) {
  const id = reminderIdCounter++;
  const dueAt = Date.now() + ms;
  const timeout = setTimeout(async () => {
    const list = getReminders(chatId).filter((r) => r.id !== id);
    chatReminders.set(chatId, list);
    try {
      await ctx.api.sendMessage(
        chatId,
        `⏰ <b>Reminder:</b> ${escapeHtml(note)}`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('Failed to send reminder:', err.message);
    }
  }, ms);

  const list = getReminders(chatId);
  list.push({ id, note, dueAt, timeout });
  chatReminders.set(chatId, list);
  return id;
}

// Parses a duration string like "30m", "2h", "1d" into milliseconds. Returns null if invalid.
function parseDuration(input) {
  const match = /^(\d+)\s*(m|min|mins|h|hr|hrs|hour|hours|d|day|days)$/i.exec(input.trim());
  if (!match) return null;
  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  let multiplier;
  if (unit.startsWith('m')) multiplier = 60 * 1000;
  else if (unit.startsWith('h')) multiplier = 60 * 60 * 1000;
  else multiplier = 24 * 60 * 60 * 1000;
  const ms = value * multiplier;
  return ms > 0 ? ms : null;
}

// ── Danger sign detection ───────────────────────────────────────────────────

const DANGER_SIGN_REGEX =
  /(heavy\s*bleeding|severe\s*bleeding|severe\s*(abdominal|stomach)\s*pain|severe\s*headache|blurred?\s*vision|vision\s*changes|no\s*(fetal|baby)\s*movement|reduced\s*(fetal|baby)\s*movement|baby\s*(not|isn'?t)\s*moving|high\s*fever|seizure|convulsion|water\s*broke|my\s*water\s*broke|chest\s*pain|difficulty\s*breathing|can'?t\s*breathe|trouble\s*breathing|thoughts?\s*of\s*(self\s*[- ]?harm|suicide)|want\s*to\s*hurt\s*myself|swollen\s*(face|hands|feet)\s*(and|with)?\s*headache)/i;

const EMERGENCY_NOTICE =
  '🚨 <b>This could be a warning sign.</b> Please go to the nearest healthcare facility or contact emergency services right away — do not wait. ' +
  'What I share next is general information only and is not a substitute for urgent medical care.\n\n';

// ── Greeting & static replies ───────────────────────────────────────────────

const GREETING_REGEX = /^(hi|hello|hey|howdy|hiya|good\s*(morning|afternoon|evening|day|night)|greetings|what'?s\s*up|sup|yo)\b/i;

function buildGreeting(firstName) {
  return (
    `🤰 <b>Hello, ${escapeHtml(firstName)}! I'm Materna.</b>\n\n` +
    `I was built by <b>Godwin Obadiah</b>, a Fellow of the <b>3MTT Airtel NextGen Program</b> (Fellow ID: <b>FE/26/3092165155</b>), to make trustworthy maternal health support available to you anytime.\n\n` +
    `Here's how I can help:\n` +
    `🤰 Pregnancy guidance and education\n` +
    `🩺 Antenatal and postnatal care information\n` +
    `🤱 Breastfeeding and newborn care\n` +
    `🥗 Nutrition and healthy lifestyle advice\n` +
    `⚠️ Understanding common pregnancy symptoms and danger signs\n` +
    `🧠 Maternal mental health awareness\n` +
    `📅 Appointment, medication, and supplement reminders\n` +
    `❓ Answering evidence-based maternal health questions, 24/7\n\n` +
    `Please note: I provide educational information only, and I'm not a substitute for professional medical advice, diagnosis, or treatment. In a medical emergency, please go to the nearest healthcare facility or contact emergency services immediately.\n\n` +
    `💬 How can I support you today?`
  );
}

const OFFTOPIC_REPLY =
  '🤰 I am MamaCare, your maternal health assistant. ' +
  'I can help with pregnancy, antenatal/postnatal care, breastfeeding, newborn care, nutrition, danger signs, and maternal mental health — but not with topics outside those areas.\n\n' +
  'Try asking about pregnancy symptoms, prenatal nutrition, breastfeeding tips, or how to set a reminder with /remind!';

// ── Commands ──────────────────────────────────────────────────────────────────

bot.command('start', (ctx) => {
  const name = ctx.from?.first_name || 'there';
  return ctx.reply(buildGreeting(name), { parse_mode: 'HTML' });
});

bot.command('help', (ctx) =>
  ctx.reply(
    'Here is what MamaCare can do for you:\n\n' +
      '🤰 Ask about pregnancy, antenatal/postnatal care, breastfeeding, newborn care, or nutrition — just type your question\n' +
      '⚠️ Describe a symptom and I will let you know if it could be a danger sign that needs urgent care\n' +
      '🧠 Ask about maternal mental health — stress, baby blues, postpartum depression\n' +
      '📅 /remind <time> <note> → set a reminder, e.g. /remind 2h Take my prenatal vitamin\n' +
      '📋 /reminders → see your upcoming reminders\n' +
      '❌ /cancelreminder <id> → cancel a reminder\n\n' +
      'I provide educational information only — not a substitute for professional medical advice. ' +
      'In a medical emergency, go to the nearest healthcare facility or contact emergency services immediately.',
    { parse_mode: 'HTML' }
  )
);

bot.command('remind', async (ctx) => {
  const chatId = ctx.chat.id;
  const args = ctx.match?.trim();

  if (!args) {
    return ctx.reply(
      'Please tell me when and what to remind you about, e.g.:\n' +
        '<code>/remind 2h Take my prenatal vitamin</code>\n' +
        '<code>/remind 30m Drink a glass of water</code>\n' +
        '<code>/remind 1d Antenatal appointment tomorrow</code>\n\n' +
        'Supported units: m (minutes), h (hours), d (days).',
      { parse_mode: 'HTML' }
    );
  }

  const [durationToken, ...rest] = args.split(/\s+/);
  const note = rest.join(' ').trim();
  const ms = parseDuration(durationToken);

  if (!ms || !note) {
    return ctx.reply(
      "I couldn't understand that. Use the format:\n<code>/remind 2h Take my prenatal vitamin</code>\n\nSupported units: m (minutes), h (hours), d (days).",
      { parse_mode: 'HTML' }
    );
  }

  if (getReminders(chatId).length >= MAX_REMINDERS_PER_CHAT) {
    return ctx.reply('You have reached the maximum of 20 active reminders. Please cancel one before adding another.');
  }

  const id = scheduleReminder(ctx, chatId, ms, note);
  return ctx.reply(
    `✅ Reminder <b>#${id}</b> set: "${escapeHtml(note)}" in ${escapeHtml(durationToken)}.`,
    { parse_mode: 'HTML' }
  );
});

bot.command('reminders', (ctx) => {
  const chatId = ctx.chat.id;
  const list = getReminders(chatId);
  if (list.length === 0) {
    return ctx.reply('You have no active reminders. Set one with /remind <time> <note>, e.g. /remind 2h Take my prenatal vitamin.');
  }
  const lines = list
    .sort((a, b) => a.dueAt - b.dueAt)
    .map((r) => {
      const minsLeft = Math.max(1, Math.round((r.dueAt - Date.now()) / 60000));
      return `#${r.id} — ${escapeHtml(r.note)} (in ~${minsLeft} min)`;
    });
  return ctx.reply(`📋 <b>Your reminders:</b>\n\n${lines.join('\n')}`, { parse_mode: 'HTML' });
});

bot.command('cancelreminder', (ctx) => {
  const chatId = ctx.chat.id;
  const idArg = ctx.match?.trim();
  const id = parseInt(idArg, 10);

  if (!id) {
    return ctx.reply('Please provide the reminder number to cancel, e.g. /cancelreminder 3 (see /reminders for the list).');
  }

  const list = getReminders(chatId);
  const reminder = list.find((r) => r.id === id);
  if (!reminder) {
    return ctx.reply(`I couldn't find an active reminder with #${id}. Check /reminders for your current list.`);
  }

  clearTimeout(reminder.timeout);
  chatReminders.set(chatId, list.filter((r) => r.id !== id));
  return ctx.reply(`❌ Reminder #${id} cancelled.`);
});

// ── Media handlers (not supported in this domain) ───────────────────────────

bot.on(['message:photo', 'message:document'], (ctx) =>
  ctx.reply(
    "I can't analyse photos — I'm a text-based maternal health assistant. " +
      'Please describe your question or symptom in words, and I will do my best to help. ' +
      'If you need a visual diagnosis, please consult a healthcare professional.'
  )
);

// ── Text handler ───────────────────────────────────────────────────────────────

bot.on('message:text', async (ctx) => {
  const text = ctx.message.text.trim();
  const chatId = ctx.chat.id;
  const firstName = ctx.from?.first_name || 'there';

  if (GREETING_REGEX.test(text)) {
    return ctx.reply(buildGreeting(firstName), { parse_mode: 'HTML' });
  }

  const isDangerSign = DANGER_SIGN_REGEX.test(text);

  await ctx.replyWithChatAction('typing');
  try {
    const history = getHistory(chatId);
    const answer = await answerMaternalHealthQuestion(text, history);

    if (!answer) {
      const fallback = "I couldn't find an answer right now. Please try rephrasing your question, or ask me something else about pregnancy, birth, or newborn care.";
      if (isDangerSign) {
        return ctx.reply(EMERGENCY_NOTICE + escapeHtml(fallback), { parse_mode: 'HTML' });
      }
      return ctx.reply(fallback);
    }

    if (answer.offTopic) {
      return ctx.reply(OFFTOPIC_REPLY);
    }

    // Save exchange to history
    addToHistory(chatId, 'user', text);
    addToHistory(chatId, 'assistant', answer.text);

    if (isDangerSign) {
      return ctx.reply(EMERGENCY_NOTICE + escapeHtml(answer.text), { parse_mode: 'HTML' });
    }

    return ctx.reply(`🤰 ${answer.text}`);
  } catch (err) {
    console.error('Error answering question:', err.message);
    return ctx.reply('⚠️ Something went wrong. Please try again.');
  }
});

// ── Bot error handler & startup ────────────────────────────────────────────────

bot.catch((err) => {
  console.error('Bot error:', err);
});

// Clear any existing webhook so long polling works uninterrupted
axios
  .post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteWebhook`, { drop_pending_updates: false })
  .then(() => console.log('✅ Webhook cleared.'))
  .catch((err) => console.warn('Could not clear webhook:', err.message));

bot.start();
console.log('✅ MamaCare maternal health bot is running.');
