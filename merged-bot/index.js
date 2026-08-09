require('dotenv').config();
const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const fs = require('fs');
const PersistentMap = require('./utils/persistentMap');
const pointsHandler = require('./utils/pointsHandler');

// نخزن التوكن مرة وحدة بمتغير محلي، ونستخدم نفس النسخة بكل مكان.
// هذا يتفادى أي مشكلة لو process.env.TOKEN تصرف بشكل غير مستقر أثناء تشغيل العملية
// (مثلاً لو كان معرّف كـ Sealed/Reference Variable في Railway).
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

// كل البيانات دي بتُحفظ تلقائيًا في فولدر data/ ولا تنعاد أو تروح إلا لو سويت setup جديد بنفس الرقم
// (لازم فولدر data/ يكون على تخزين دائم/Volume في الاستضافة عشان ما يروح لو صار Redeploy)
client.ticketSettings = PersistentMap.load('ticketSettings.json'); // { ticketNum: {...} }
client.ticketPanels = PersistentMap.load('ticketPanels.json');     // { messageId: {...} }
client.openTickets = PersistentMap.load('openTickets.json');       // { channelId: {...} }

client.invitePoints = PersistentMap.load('invitePoints.json');     // { userId: points }
client.seenMembers = PersistentMap.load('seenMembers.json');       // { userId: true }
client.roomsSettings = PersistentMap.load('roomsSettings.json');   // { guildId: { prizeRoomId, inviteRoomId } }

console.log('📂 مجلد حفظ البيانات (Data Directory):', PersistentMap.DATA_DIR_PATH);
console.log('   ⚠️ لازم هذا المسار بالضبط يكون مربوط بـ Volume دائم بالاستضافة، وإلا الإعدادات بتنمسح عند أي Redeploy.');

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

  const rest = new REST({ version: '10' }).setToken(TOKEN);
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

      // نخزن دعوات كل سيرفر بالذاكرة عشان نقدر نعرف بعدين مين دعا العضو الجديد
      await pointsHandler.cacheGuildInvites(guild);
    }

    // Remove an older global registration, if this bot previously used one.
    await rest.put(Routes.applicationCommands(client.user.id), { body: [] });
    console.log(`✅ Registered ${commandsData.length} slash commands in ${guilds.length} server(s)`);
    console.log('✅ تم حفظ الدعوات الحالية لجميع السيرفرات.');
  } catch (e) {
    console.error('❌ Failed to register slash commands:', e);
  }
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

// عضو جديد انضم للسيرفر → تحديد صاحب الدعوة وإعطاؤه نقطة (لو مستحق)
client.on('guildMemberAdd', async member => {
  await pointsHandler.handleGuildMemberAdd(member, client).catch(console.error);
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
    // أزرار عجلة الحظ (normal_spin / super_spin) — لها أولوية، وإلا نكمل لأزرار التذاكر
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

client.on('messageCreate', async (message) => {
  const { handlePrefixCommand } = require('./utils/ticketHandler');
  await handlePrefixCommand(message, client).catch(console.error);
  await pointsHandler.handlePrefixCommand(message, client).catch(console.error);
});

client.login(TOKEN);
