require('dotenv').config();
const express = require('express');

const app = express();

const {
  DISCORD_BOT_TOKEN,
  DISCORD_GUILD_ID,
  PORT = 3000,
  CACHE_TTL_SECONDS = 120,
  API_KEY, // optionnelle, protege l'endpoint /events
} = process.env;

if (!DISCORD_BOT_TOKEN || !DISCORD_GUILD_ID) {
  console.error('DISCORD_BOT_TOKEN et DISCORD_GUILD_ID sont obligatoires dans le fichier .env');
  process.exit(1);
}

// Cache en memoire tres simple : { data, fetchedAt }
let cache = {
  data: null,
  fetchedAt: 0,
};

async function fetchDiscordEvents() {
  const url = `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/scheduled-events?with_user_count=true`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Discord API error ${response.status}: ${errorText}`);
  }

  const events = await response.json();

  // On simplifie et on ne garde que ce qui est utile a Roblox
  return events.map((e) => ({
    id: e.id,
    name: e.name,
    description: e.description || '',
    startTime: e.scheduled_start_time,
    endTime: e.scheduled_end_time,
    status: e.status, // 1=SCHEDULED, 2=ACTIVE, 3=COMPLETED, 4=CANCELED
    userCount: e.user_count || 0,
    coverImage: e.image
      ? `https://cdn.discordapp.com/guild-events/${e.id}/${e.image}.png`
      : null,
    location: (e.entity_metadata && e.entity_metadata.location) || null,
  }));
}

// Protection optionnelle par cle API partagee avec Roblox
app.use((req, res, next) => {
  if (API_KEY) {
    const key = req.header('x-api-key');
    if (key !== API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }
  next();
});

app.get('/events', async (req, res) => {
  const now = Date.now();
  const ttlMs = Number(CACHE_TTL_SECONDS) * 1000;

  if (cache.data && now - cache.fetchedAt < ttlMs) {
    return res.json({ cached: true, events: cache.data });
  }

  try {
    const events = await fetchDiscordEvents();
    cache = { data: events, fetchedAt: now };
    res.json({ cached: false, events });
  } catch (err) {
    console.error(err);
    // Si Discord echoue mais qu'on a un vieux cache, on le renvoie plutot qu'une erreur
    if (cache.data) {
      return res.json({ cached: true, stale: true, events: cache.data });
    }
    res.status(500).json({ error: 'Impossible de recuperer les evenements Discord' });
  }
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Serveur relais lance sur le port ${PORT}`);
});
