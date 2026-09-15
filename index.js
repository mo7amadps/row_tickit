require('dotenv').config();
const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const fs = require('fs');
const PersistentMap = require('./utils/persistentMap');
const pointsHandler = require('./utils/pointsHandler');
const { reconcileOpenTickets } = require('./utils/ticketHandler');

const TOKEN = process.env.TOKEN;
if (!TOKEN) {
  console.error('❌ TOKEN غير موجود. تأكد من إضافته في .env أو Variables تبع الاستضافة.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ]
});

client.commands = new Collection();

// PersistentMap migrates the old JSON files, then uses one SQLite state file.
client.ticketSettings = PersistentMap.load('ticketSettings.json'); // { ticketNum: {...} }
client.ticketPanels = PersistentMap.load('ticketPanels.json');     // { messageId: {...} }
client.openTickets = PersistentMap.load('openTickets.json');       // { channelId: {...} }
client.invitePoints = PersistentMap.load('invitePoints.json');     // { userId: points }
client.seenMembers = PersistentMap.load('seenMembers.json');       // { userId: true }
client.roomsSettings = PersistentMap.load('roomsSettings.json');   // { guildId: { prizeRoomId, inviteRoomId } }

console.log('📂 مجلد حفظ البيانات:', PersistentMap.DATA_DIR_PATH);
console.log('🗃️ قاعدة البيانات:', PersistentMap.DATABASE_PATH);
console.log(`🛟 عدد النسخ الاحتياطية المحتفظ بها: ${PersistentMap.MAX_BACKUPS}`);

const commandFiles = fs.readdirSync('./commands').filter(f => f.endsWith('.js'));
const commandsData = [];
for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  client.commands.set(command.data.name, command);
  commandsData.push(command.data.toJSON());
}

let backupTimer = null;
let cleanupTimer = null;

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
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
    await pointsHandler.cacheGuildInvites(guild);
  }

  await rest.put(Routes.applicationCommands(client.user.id), { body: [] });
  console.log(`✅ Registered ${commandsData.length} slash commands in ${guilds.length} server(s)`);
  console.log('✅ تم حفظ الدعوات الحالية لجميع السيرفرات.');
}

function startMaintenance() {
  // نسخة كل 15 دقيقة، مع الاحتفاظ بآخر 4 فقط وحذف الأقدم تلقائياً.
  backupTimer = setInterval(() => {
    PersistentMap.backupNow('scheduled').catch(console.error);
  }, 15 * 60 * 1000);

  // Remove records for channels deleted while the bot was offline.
  cleanupTimer = setInterval(() => {
    reconcileOpenTickets(client).catch(console.error);
  }, 15 * 60 * 1000);
}

client.once('ready', async () => {
  console.log(`✅ Bot is online: ${client.user.tag}`);
  await registerCommands();
  // Keep restored tickets open; they can still be closed with the button or !close.
  await reconcileOpenTickets(client);
  startMaintenance();
});

client.on('guildCreate', async guild => {
  try {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, guild.id),
      { body: commandsData }
    );
    console.log(`✅ Slash commands registered in new server: ${guild.name} (${guild.id})`);
  } catch (e) {
    console.error(`❌ Failed to register slash commands in ${guild.name}:`, e);
  }
  await pointsHandler.cacheGuildInvites(guild);
});

client.on('guildMemberAdd', async member => {
  await pointsHandler.handleGuildMemberAdd(member, client).catch(console.error);
});

client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    try { await command.execute(interaction, client); }
    catch (e) { console.error(e); }
  }

  if (interaction.isButton()) {
    const handled = await pointsHandler.handleButton(interaction, client).catch(console.error);
    if (handled) return;

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

client.on('messageCreate', async message => {
  const { handlePrefixCommand } = require('./utils/ticketHandler');
  await handlePrefixCommand(message, client).catch(console.error);
  await pointsHandler.handlePrefixCommand(message, client).catch(console.error);
});

async function shutdown(signal) {
  console.log(`🛑 ${signal}: حفظ آخر نسخة قبل الإغلاق...`);
  if (backupTimer) clearInterval(backupTimer);
  if (cleanupTimer) clearInterval(cleanupTimer);
  await PersistentMap.backupNow(`shutdown:${signal}`).catch(console.error);
  if (client.isReady()) await client.destroy().catch(() => {});
  await PersistentMap.close().catch(console.error);
  process.exit(0);
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));

async function boot() {
  try {
    await PersistentMap.initialize();
    await client.login(TOKEN);
  } catch (error) {
    console.error('❌ فشل تشغيل البوت:', error);
    process.exit(1);
  }
}

boot();