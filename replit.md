# MamaCare — Telegram Maternal Health Bot

A Telegram bot providing 24/7 evidence-based maternal health support: pregnancy guidance, antenatal/postnatal care, breastfeeding and newborn care, nutrition, danger-sign awareness, maternal mental health, and appointment/medication/supplement reminders. AI answers are generated via Groq (falling back to Nvidia NIM).

Built by Godwin Obadiah, a Fellow of the 3MTT Airtel NextGen Program (Fellow ID: FE/26/3092165155).

The bot is educational only and is not a substitute for professional medical advice, diagnosis, or treatment. It detects common danger-sign keywords (heavy bleeding, severe headache, reduced fetal movement, etc.) and urges the user to seek immediate care.

## How to run

```
npm start
```

The bot uses long-polling (`bot.start()` from grammY), so no webhook setup is needed.

## Required secrets

| Secret | Description |
|---|---|
| `TELEGRAM_BOT_TOKEN` | From [@BotFather](https://t.me/BotFather) on Telegram |
| `GROQ_API_KEY` | Free at https://console.groq.com/keys (primary AI provider) |
| `NVIDIA_API_KEY` | Free at https://build.nvidia.com/ (fallback AI provider if Groq fails) |

## Stack

- **grammy** — Telegram bot framework
- **Groq / Nvidia NIM** — LLM providers for maternal health Q&A
- **axios** — HTTP client

## File layout

- `index.js` — bot entry point; handles commands, reminders, danger-sign detection, and text Q&A
- `ai.js` — Groq/Nvidia LLM calls for maternal health Q&A

## Features

- Conversational Q&A restricted to maternal/newborn health topics (off-topic questions are politely redirected)
- Danger-sign keyword detection that prepends an urgent care notice to relevant answers
- In-memory reminders via `/remind <time> <note>` (e.g. `/remind 2h Take my prenatal vitamin`), `/reminders`, `/cancelreminder <id>` — reminders are lost on restart since there is no database
- Photo/document messages are declined with a note that this bot is text-only

## User preferences

<!-- Add user preferences here -->
