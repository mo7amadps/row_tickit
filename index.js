require('dotenv').config();
const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const fs = require('fs');
const PersistentMap = require('./utils/persistentMap');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ]
});

client.commands = new Collection();
// كل البيانات دي بتُحفظ تلقائيًا في فولدر data/ ولا تنعاد أو تروح إلا لو سويت ticket-setup جديد بنفس الرقم
client.ticketSettings = PersistentMap.load('ticketSettings.json'); // { ticketNum: { name, category, role, admin, ownership, reason, usernameNumber, welcomeMsg, welcomeImage, mentions, line, ticketLogs, closeCategory, tqeemRoom } }
client.ticketPanels = PersistentMap.load('ticketPanels.json');     // { messageId: { tickets: [...], type: 'buttons'|'menu' } }
client.openTickets = PersistentMap.load('openTickets.json');      // { channelId: { userId, ticketNum, guildId } }

// Load commands
const commandFiles = fs.readdirSync('./commands').filter(f => f.endsWith('.js'));
const commandsData = [];
for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  client.commands.set(command.data.name, command);
  commandsData.push(command.data.toJSON());
}

// Register slash commands directly in every server so they appear immediately.
// Global commands can take up to an hour to update in Discord.
client.once('ready', async () => {
  console.log(`✅ Bot is online: ${client.user.tag}`);
  if (!process.env.TOKEN) {
    console.error('❌ TOKEN is missing. Add TOKEN to your .env file or server environment variables.');
    return;
  }

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    const guilds = [...client.guilds.cache.values()];

    for (const guild of guilds) {
      try {
        await rest.put(
          Routes.applicationGuildCommands(client.user.id, guild.id),
          { body: commandsData }
        );
        console.log(`✅ Slash commands registered in: ${guild.name} (${guild.id})`);
      } catch (e) {
        console.error(`❌ Failed to register slash commands in ${guild.name}:`, e);
      }
    }

    // Remove an older global registration, if this bot previously used one.
    await rest.put(Routes.applicationCommands(client.user.id), { body: [] });
    console.log(`✅ Registered ${commandsData.length} slash commands in ${guilds.length} server(s)`);
  } catch (e) {
    console.error('❌ Failed to register slash commands:', e);
  }
});

client.on('guildCreate', async guild => {
  if (!process.env.TOKEN) return;

  try {
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, guild.id),
      { body: commandsData }
    );
    console.log(`✅ Slash commands registered in new server: ${guild.name} (${guild.id})`);
  } catch (e) {
    console.error(`❌ Failed to register slash commands in ${guild.name}:`, e);
  }
});

// Handle interactions
client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    try { await command.execute(interaction, client); }
    catch (e) { console.error(e); }
  }

  if (interaction.isButton()) {
    const { handleButton } = require('./utils/ticketHandler');
    await handleButton(interaction, client);
  }

  if (interaction.isStringSelectMenu() || interaction.isChannelSelectMenu()) {
    const { handleSelect } = require('./utils/ticketHandler');
    await handleSelect(interaction, client);
  }

  if (interaction.isModalSubmit()) {
    const { handleModal } = require('./utils/ticketHandler');
    await handleModal(interaction, client);
  }
});

client.on('messageCreate', async (message) => {
  const { handlePrefixCommand } = require('./utils/ticketHandler');
  await handlePrefixCommand(message, client).catch(console.error);
});

client.login(process.env.TOKEN);
