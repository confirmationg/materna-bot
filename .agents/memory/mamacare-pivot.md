---
name: MamaCare pivot from plant bot
description: This project was repurposed from a plant-identification bot (Flora Scan/PlantNet) into a maternal health Telegram bot (MamaCare). Useful when old references or assumptions about plant features surface.
---

The original project was a Telegram plant-ID bot using PlantNet for image identification. It was fully repurposed into MamaCare, a text-only maternal health support bot (pregnancy, antenatal/postnatal care, breastfeeding, nutrition, danger signs, maternal mental health, reminders).

**Why:** User request changed the product's entire domain; PlantNet/image identification no longer applies, and the bot became text-first with keyword-based danger-sign detection and in-memory reminders instead of photo analysis.

**How to apply:** Don't assume `plantnet.js`, disease-check flows, or image-based identification still exist — they were removed. Reminders and chat history are in-memory only (no database), so they reset on restart. If reminders need persistence, that would require adding a database.
