# MamaCare — Telegram Maternal Health Bot

A Telegram bot that provides trustworthy, evidence-based maternal health support 24/7: pregnancy guidance, antenatal/postnatal care, breastfeeding and newborn care, nutrition, danger-sign awareness, maternal mental health, and appointment/medication/supplement reminders.

Built by Godwin Obadiah, a Fellow of the 3MTT Airtel NextGen Program (Fellow ID: FE/26/3092165155).

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Create a bot with [@BotFather](https://t.me/BotFather) on Telegram:
   - Send `/newbot`, follow the prompts, copy the token it gives you

3. Get API keys:
   - Groq (free): https://console.groq.com/keys
   - Nvidia NIM (free): https://build.nvidia.com/

4. Set the following secrets in your environment:
   - `TELEGRAM_BOT_TOKEN`
   - `GROQ_API_KEY`
   - `NVIDIA_API_KEY` (optional fallback)

5. Run the bot:
   ```
   npm start
   ```

6. Open your bot in Telegram (the link BotFather gave you) and send `/start`.

## How it works

- `ai.js` — tries Groq first (`GROQ_MODEL`), falls back to Nvidia NIM (`NVIDIA_MODEL`) if Groq fails or isn't configured. Answers are restricted to maternal/newborn health topics; off-topic questions get a redirect message instead of an AI answer.
- `index.js` — grammY bot: handles `/start`, `/help`, greetings, free-text Q&A with short-term conversation memory, danger-sign keyword detection (heavy bleeding, severe headache, reduced fetal movement, etc.) that prepends an urgent-care notice, and in-memory reminders (`/remind`, `/reminders`, `/cancelreminder`). Photos/documents are declined since the bot is text-only.

## Notes

- This bot provides educational information only and is not a substitute for professional medical advice, diagnosis, or treatment. In a medical emergency, users are told to seek immediate care.
- Reminders are stored in memory only and are lost if the bot restarts — there is no database in this project.
- Deploys the same way as other Telegram bots — long-polling (`bot.start()`) works anywhere.
