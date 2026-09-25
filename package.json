require('dotenv').config();
const express = require('express');
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');

const app = express();

const {
  DISCORD_BOT_TOKEN,
  DISCORD_GUILD_ID,
  DISCORD_CLIENT_ID,
  PORT = 3000,
  CACHE_TTL_SECONDS = 120,
  API_KEY,
} = process.env;

if (!DISCORD_BOT_TOKEN || !DISCORD_GUILD_ID) {
  console.error('DISCORD_BOT_TOKEN et DISCORD_GUILD_ID sont obligatoires dans le fichier .env');
  process.exit(1);
}

if (!DISCORD_CLIENT_ID) {
  console.warn('DISCORD_CLIENT_ID manquant : la commande /statut-vol ne pourra pas etre enregistree.');
}

// Statuts personnalises definis via la commande /statut-vol, en memoire : { [eventId]: "Embarquement" }
const customStatuses = {};

const STATUS_CHOICES = ['Prévu', 'Embarquement', 'Dernier appel', 'Retardé', 'Parti', 'Annulé'];

let cache = {
  data: null,
  fetchedAt: 0,
};

async function fetchDiscordEventsRaw() {
  const url = `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/scheduled-events?with_user_count=true`;

  const response = await fetch(url, {
    headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Discord API error ${response.status}: ${errorText}`);
  }

  return response.json();
}

async function fetchDiscordEvents() {
  const events = await fetchDiscordEventsRaw();

  return events.map((e) => ({
    id: e.id,
    name: e.name,
    description: e.description || '',
    startTime: e.scheduled_start_time,
    endTime: e.scheduled_end_time,
    status: e.status,
    userCount: e.user_count || 0,
    coverImage: e.image
      ? `https://cdn.discordapp.com/guild-events/${e.id}/${e.image}.png`
      : null,
    location: (e.entity_metadata && e.entity_metadata.location) || null,
    customStatus: customStatuses[e.id] || null,
  }));
}

// ============ API pour Roblox ============
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

// ============ Bot Discord (commande /statut-vol) ============
const discordClient = new Client({ intents: [GatewayIntentBits.Guilds] });

async function registerSlashCommand() {
  if (!DISCORD_CLIENT_ID) return;

  const command = new SlashCommandBuilder()
    .setName('statut-vol')
    .setDescription("Definir le statut personnalise d'un vol")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents)
    .addStringOption((option) =>
      option
        .setName('evenement')
        .setDescription('Le vol concerne')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption((option) => {
      option.setName('statut').setDescription('Le nouveau statut').setRequired(true);
      STATUS_CHOICES.forEach((s) => option.addChoices({ name: s, value: s }));
      return option;
    });

  const rest = new REST({ version: '10' }).setToken(DISCORD_BOT_TOKEN);
  await rest.put(Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID), {
    body: [command.toJSON()],
  });
  console.log('Commande /statut-vol enregistree.');
}

discordClient.on('ready', () => {
  console.log(`Bot Discord connecte en tant que ${discordClient.user.tag}`);
  registerSlashCommand().catch((err) => console.error('Erreur enregistrement commande:', err));
});

discordClient.on('interactionCreate', async (interaction) => {
  if (interaction.isAutocomplete() && interaction.commandName === 'statut-vol') {
    try {
      const events = await fetchDiscordEventsRaw();
      const focused = interaction.options.getFocused().toLowerCase();
      const filtered = events
        .filter((e) => e.name.toLowerCase().includes(focused))
        .slice(0, 25);
      await interaction.respond(filtered.map((e) => ({ name: e.name, value: e.id })));
    } catch (err) {
      console.error(err);
      await interaction.respond([]);
    }
    return;
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'statut-vol') {
    const eventId = interaction.options.getString('evenement');
    const statut = interaction.options.getString('statut');

    customStatuses[eventId] = statut;
    cache = { data: null, fetchedAt: 0 }; // force le prochain /events a refleter le changement tout de suite

    await interaction.reply({ content: `Statut mis a jour : **${statut}**`, ephemeral: true });
  }
});

discordClient.login(DISCORD_BOT_TOKEN).catch((err) => {
  console.error('Impossible de connecter le bot Discord (le serveur web continue de fonctionner):', err.message);
});
