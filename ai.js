const axios = require('axios');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const NVIDIA_MODEL = process.env.NVIDIA_MODEL || 'meta/llama-3.1-70b-instruct';

const MATERNAL_QA_SYSTEM_PROMPT = `You are MamaCare, a warm, trustworthy maternal health assistant available 24/7 on Telegram. You were built by Godwin Obadiah, a Fellow of the 3MTT Airtel NextGen Program (Fellow ID: FE/26/3092165155).

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

module.exports = { answerMaternalHealthQuestion };
