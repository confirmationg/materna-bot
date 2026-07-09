const axios = require('axios');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const NVIDIA_MODEL = process.env.NVIDIA_MODEL || 'meta/llama-3.1-70b-instruct';

const MATERNAL_QA_SYSTEM_PROMPT = `You are Materna, a warm, trustworthy maternal health assistant available 24/7 on Telegram. You were built by Godwin Obadiah, a Fellow of the 3MTT Airtel NextGen Program (Fellow ID: FE/26/3092165155).

Your job is ONLY to answer questions in these subject areas:
- Pregnancy guidance and education (trimesters, fetal development, common changes)
- Antenatal and postnatal care (checkups, tests, recovery after birth)
- Breastfeeding and newborn care
- Nutrition and healthy lifestyle advice during pregnancy and postpartum
- Understanding common pregnancy symptoms and danger signs
- Maternal mental health awareness (baby blues, postpartum depression/anxiety, stress, emotional wellbeing)
- General guidance on appointments, medication, and supplement reminders (folic acid, iron, prenatal vitamins) — you do not dispense medical dosages beyond well-established public health guidance
- Any other evidence-based maternal or newborn health question

Rules:
- Answer accurately, warmly, and in plain conversational sentences. Keep answers concise (under 200 words) unless the user asks for more detail.
- Always be encouraging and non-judgmental. Many users may be anxious first-time mothers.
- You are educational only — you are NOT a substitute for professional medical advice, diagnosis, or treatment. Do not diagnose. Do not prescribe specific drug dosages.
- If the user describes anything that could be a danger sign (heavy bleeding, severe abdominal pain, severe headache with vision changes, reduced or no fetal movement, high fever, seizures, water breaking, chest pain, difficulty breathing, thoughts of self-harm, signs of severe postpartum depression, etc.), clearly and urgently advise them to seek immediate care at the nearest healthcare facility or emergency services, in addition to any other helpful information.
- If the question is NOT within maternal/newborn health (e.g. coding, politics, general knowledge, unrelated topics), respond ONLY with this exact text: OFFTOPIC
- Do not use markdown headers or bullet symbols like * or #. Write naturally and warmly.
- Do not guess; if you are unsure about a fact, say so honestly and suggest they confirm with their healthcare provider.`;

async function callGroq(messages, maxTokens = 300) {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY not set');

  const { data } = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model: GROQ_MODEL,
      messages,
      temperature: 0.4,
      max_tokens: maxTokens,
    },
    {
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 20000,
    }
  );

  return data.choices?.[0]?.message?.content?.trim();
}

async function callNvidia(messages, maxTokens = 300) {
  if (!NVIDIA_API_KEY) throw new Error('NVIDIA_API_KEY not set');

  const { data } = await axios.post(
    'https://integrate.api.nvidia.com/v1/chat/completions',
    {
      model: NVIDIA_MODEL,
      messages,
      temperature: 0.4,
      max_tokens: maxTokens,
    },
    {
      headers: {
        Authorization: `Bearer ${NVIDIA_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 25000,
    }
  );

  return data.choices?.[0]?.message?.content?.trim();
}

async function callAI(messages, maxTokens = 300) {
  try {
    const result = await callGroq(messages, maxTokens);
    if (result) return result;
  } catch (err) {
    console.error('Groq failed:', err.response?.data?.error?.message || err.message);
  }

  try {
    const result = await callNvidia(messages, maxTokens);
    if (result) return result;
  } catch (err) {
    console.error('Nvidia failed:', err.response?.data?.error?.message || err.message);
  }

  return null;
}

/**
 * Answers a maternal-health-related question from the user.
 * history is an array of {role, content} messages (previous exchanges).
 * Returns { text, offTopic: false } for maternal health questions,
 * { offTopic: true } for unrelated questions,
 * or null if AI is unavailable.
 */
async function answerMaternalHealthQuestion(question, history = []) {
  const messages = [
    { role: 'system', content: MATERNAL_QA_SYSTEM_PROMPT },
    ...history,
    { role: 'user', content: question },
  ];

  const result = await callAI(messages, 350);
  if (!result) return null;
  if (result.trim() === 'OFFTOPIC') return { offTopic: true };
  return { text: result, offTopic: false };
}

const REMINDER_INTENT_SYSTEM_PROMPT = `You detect whether a Telegram message sent to Materna, a maternal health assistant, is a request to set a reminder (for an appointment, medication, or supplement), and if so extract the note and the exact date/time it should fire.

The current date and time in Nigeria (WAT, UTC+1) is: {NOW_ISO} ({NOW_HUMAN}).
All times should be interpreted and output in Nigeria time (WAT, UTC+1).

Respond with ONLY a compact JSON object, no other text, markdown, or explanation, matching exactly this shape:
{"isReminder": boolean, "note": string|null, "datetime": string|null, "needsClarification": boolean}

Rules:
- isReminder is true only if the user is asking to be reminded/alerted/notified about something at a specific or relative time (e.g. "remind me to take my iron tablet at 8pm", "remind me tomorrow at 9am about my antenatal appointment", "don't let me forget my folic acid in 2 hours", "set a reminder for my checkup on Friday at 10am").
- note is a short description of what to remind them about (do not include the time phrase itself). If no clear task is mentioned, use "your reminder".
- datetime is an ISO 8601 date-time string with the +01:00 offset (Nigeria WAT) representing when the reminder should fire, computed relative to the current Nigeria date/time given above. Resolve relative phrases like "today", "tonight", "tomorrow", "in 2 hours", "next Monday", "this evening" (assume evening = 19:00, morning = 08:00, afternoon = 14:00, night = 21:00 WAT if no exact time given) using the current Nigeria date/time as the reference point. Always include +01:00 in the datetime output.
- If isReminder is true but you cannot confidently determine any date/time at all from the message, set datetime to null and needsClarification to true.
- If the message is not a reminder request at all (e.g. a general health question, greeting, or unrelated text), isReminder is false, note and datetime are null, needsClarification is false.
- Never output anything other than the JSON object.`;

/**
 * Detects whether a message is a natural-language reminder request and extracts
 * the note + target datetime using the current date/time as reference.
 * Returns { isReminder, note, datetime, needsClarification } or null if AI is unavailable/unparsable.
 */
// Returns an ISO 8601 string for the given Date in Nigeria time (WAT, UTC+1) with +01:00 offset.
function toNigeriaISO(date) {
  const WAT_OFFSET_MS = 60 * 60 * 1000;
  const local = new Date(date.getTime() + WAT_OFFSET_MS);
  return local.toISOString().replace('Z', '+01:00');
}

async function parseReminderIntent(text, now = new Date()) {
  const nowIso = toNigeriaISO(now);
  const nowHuman = now.toLocaleString('en-NG', { timeZone: 'Africa/Lagos', dateStyle: 'full', timeStyle: 'medium' }) + ' WAT (Nigeria, UTC+1)';
  const systemPrompt = REMINDER_INTENT_SYSTEM_PROMPT.replace('{NOW_ISO}', nowIso).replace('{NOW_HUMAN}', nowHuman);

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: text },
  ];

  const result = await callAI(messages, 200);
  if (!result) return null;

  const jsonMatch = result.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (typeof parsed.isReminder !== 'boolean') return null;
    return parsed;
  } catch (err) {
    console.error('Failed to parse reminder intent JSON:', err.message);
    return null;
  }
}

module.exports = { answerMaternalHealthQuestion, parseReminderIntent };
