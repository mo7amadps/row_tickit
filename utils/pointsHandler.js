const { EmbedBuilder } = require('discord.js');
const { getRandomPrize } = require('./prizes');

// أقل عمر مسموح للحساب حتى يُحسب لصاحب الدعوة (أسبوعين ونص = 17.5 يوم)
const MIN_ACCOUNT_AGE_MS = 17.5 * 24 * 60 * 60 * 1000;

// كاش الدعوات بالذاكرة (guildId -> Map(code -> uses)) — يُبنى من جديد عند كل تشغيل من بيانات ديسكورد نفسها
const invitesCache = new Map();

function getRooms(client, guildId) {
  return client.roomsSettings.get(guildId) || {};
}

// ─────────────────────────────────────────
// تخزين/تحديث دعوات سيرفر معيّن بالكاش
// ─────────────────────────────────────────
async function cacheGuildInvites(guild) {
  try {
    const guildInvites = await guild.invites.fetch();
    const map = new Map();
    guildInvites.forEach(invite => map.set(invite.code, invite.uses || 0));
    invitesCache.set(guild.id, map);
  } catch (e) {
    console.error(`❌ ما قدرت أجيب دعوات السيرفر ${guild.name}:`, e);
  }
}

// ─────────────────────────────────────────
// عضو جديد انضم → تحديد صاحب الدعوة وإعطاؤه نقطة
// ─────────────────────────────────────────
async function handleGuildMemberAdd(member, client) {
  if (member.user.bot) return;
  const guild = member.guild;

  const oldInvites = invitesCache.get(guild.id) || new Map();
  const newInvites = await guild.invites.fetch().catch(() => null);
  if (!newInvites) return;

  const rooms = getRooms(client, guild.id);
  const channel = rooms.inviteRoomId ? guild.channels.cache.get(rooms.inviteRoomId) : null;

  const usedInvite = newInvites.find(invite => {
    const oldUses = oldInvites.get(invite.code) || 0;
    return invite.uses > oldUses;
  });

  if (usedInvite && usedInvite.inviter) {
    const inviter = usedInvite.inviter;

    // 1) هل العضو سبق ودخل السيرفر من قبل؟ (طالع داخل / عضو قديم) => ما يُحسب
    if (client.seenMembers.get(member.id)) {
      if (channel) channel.send(`⚠️ <@${inviter.id}> هذا العضو <@${member.id}> سبق دخل السيرفر من قبل، لن تحصل على نقاط.`);
    } else {
      // 2) هل عمر حساب العضو أقل من أسبوعين ونص؟ (حساب وهمي/جديد) => ما يُحسب
      const accountAge = Date.now() - member.user.createdTimestamp;
      if (accountAge < MIN_ACCOUNT_AGE_MS) {
        if (channel) channel.send(`⚠️ <@${inviter.id}> حساب العضو <@${member.id}> عمره أقل من أسبوعين ونص (حساب جديد/مشتبه به)، لن تحصل على نقاط.`);
      } else {
        // عضو جديد فعلاً وحسابه قديم بما فيه الكفاية => يُحسب
        const currentPoints = client.invitePoints.get(inviter.id) || 0;
        client.invitePoints.set(inviter.id, currentPoints + 1);
        if (channel) channel.send(`✅ <@${inviter.id}> دعوت <@${member.id}> إلى السيرفر! نقاطك الآن: ${currentPoints + 1} 🔥`);
      }
      // نسجل العضو كـ "شوفناه" حتى لو ما احتسبنا له نقطة، عشان لو طلع ودخل مرة ثانية ما يُحسب أبداً
      client.seenMembers.set(member.id, true);
    }
  }

  const map = new Map();
  newInvites.forEach(invite => map.set(invite.code, invite.uses || 0));
  invitesCache.set(guild.id, map);
}

// ─────────────────────────────────────────
// أوامر البادئة: +add-points, +points, +spin
// ─────────────────────────────────────────
async function handlePrefixCommand(message, client) {
  if (message.author.bot || !message.guild) return;

  if (message.content.startsWith('+add-points')) {
    if (!message.member.permissions.has('ManageGuild')) return message.reply('❌ ليس لديك صلاحية استخدام هذا الأمر.');
    const args = message.content.split(' ');
    const member = message.mentions.members.first();
    const pointsToAdd = parseInt(args[2], 10);
    if (!member || isNaN(pointsToAdd)) return message.reply('❌ صيغة الأمر غير صحيحة. استخدم: `+add-points @mentionUser عدد_النقاط`');
    const currentPoints = client.invitePoints.get(member.id) || 0;
    client.invitePoints.set(member.id, currentPoints + pointsToAdd);
    return message.reply(`✅ تم إضافة ${pointsToAdd} نقطة لـ <@${member.id}>. النقاط الحالية: ${currentPoints + pointsToAdd}`);
  }

  if (message.content.startsWith('+points')) {
    const member = message.mentions.members.first() || message.member;
    const currentPoints = client.invitePoints.get(member.id) || 0;
    return message.reply(`📊 نقاط <@${member.id}>: ${currentPoints}`);
  }

  if (message.content === '+spin') {
    const userPointsCount = client.invitePoints.get(message.author.id) || 0;
    if (userPointsCount < 1) return message.reply('❌ تحتاج على الأقل إلى 1 دعوة لاستخدام عجلة الحظ العادية!');
    const embed = new EmbedBuilder()
      .setTitle('🎉 لعبة عجلة الحظ 🎉')
      .setDescription('اختر نوع العجلة التي تريد اللعب بها:')
      .addFields(
        { name: '🎡 عجلة الحظ العادية', value: 'يتطلب 1 نقطة' },
        { name: '🔥 عجلة الحظ السوبر', value: 'يتطلب 2 نقاط' }
      )
      .setColor('Blue');
    const row = {
      type: 1,
      components: [
        { type: 2, label: 'لف العجلة العادية', style: 1, custom_id: 'normal_spin' },
        { type: 2, label: 'لف العجلة السوبر', style: 4, custom_id: 'super_spin' }
      ]
    };
    return message.reply({ embeds: [embed], components: [row] });
  }
}

// ─────────────────────────────────────────
// أزرار عجلة الحظ (normal_spin / super_spin)
// ─────────────────────────────────────────
async function handleButton(interaction, client) {
  if (interaction.customId !== 'normal_spin' && interaction.customId !== 'super_spin') return false;

  const rooms = getRooms(client, interaction.guild.id);
  const prizeChannel = rooms.prizeRoomId ? interaction.guild.channels.cache.get(rooms.prizeRoomId) : null;
  const userPointsCount = client.invitePoints.get(interaction.user.id) || 0;

  if (interaction.customId === 'normal_spin') {
    if (userPointsCount < 1) {
      await interaction.reply({ content: '❌ ليس لديك نقاط كافية.', ephemeral: true });
      return true;
    }
    client.invitePoints.set(interaction.user.id, userPointsCount - 1);
    const prize = getRandomPrize('normal');
    if (prizeChannel) prizeChannel.send(`> 🥳 مبروك <@${interaction.user.id}>! لقد فزت بـ **${prize}** 🏆`);
    await interaction.reply(`🎉 مبروك <@${interaction.user.id}>! لقد فزت بـ **${prize}**! 🏆`);
    return true;
  }

  if (interaction.customId === 'super_spin') {
    if (userPointsCount < 2) {
      await interaction.reply({ content: '❌ ليس لديك نقاط كافية.', ephemeral: true });
      return true;
    }
    client.invitePoints.set(interaction.user.id, userPointsCount - 2);
    const prize = getRandomPrize('super');
    if (prizeChannel) prizeChannel.send(`> 🥳 مبروك <@${interaction.user.id}>! لقد فزت بـ **${prize}** 🏆`);
    await interaction.reply(`🎉 مبروك <@${interaction.user.id}>! لقد فزت بـ **${prize}**! 🏆`);
    return true;
  }
}

module.exports = { cacheGuildInvites, handleGuildMemberAdd, handlePrefixCommand, handleButton };
