const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const DEFAULT_IMAGE = 'https://i.imgur.com/YourROWImage.png';
const JOIN_BUTTON_ID = 'giveaway_join';
const CREATE_MODAL_ID = 'giveaway_create_modal';

function parseDuration(text) {
  const durationText = String(text || '').toLowerCase().trim();
  let seconds = 0;
  try {
    if (durationText.endsWith('s')) seconds = parseInt(durationText.slice(0, -1), 10);
    else if (durationText.endsWith('m')) seconds = parseInt(durationText.slice(0, -1), 10) * 60;
    else if (durationText.endsWith('h')) seconds = parseInt(durationText.slice(0, -1), 10) * 3600;
    else if (durationText.endsWith('d')) seconds = parseInt(durationText.slice(0, -1), 10) * 86400;
    else return null;
  } catch {
    return null;
  }
  if (!Number.isFinite(seconds) || seconds < 10) return null;
  return seconds;
}

function buildActiveEmbed(g) {
  const endTimestamp = Math.floor(g.end_time);
  const count = (g.participants || []).length;
  return new EmbedBuilder()
    .setTitle(`🎁  ${g.prize}  🎁`)
    .setDescription(
      [
        '### ✨ Giveaway Started ✨',
        '',
        '🎊 **Click the button below to enter!**',
        '',
        `⏰ **Ends:** <t:${endTimestamp}:R>`,
        `👥 **Participants:** \`${count}\`   |   🏆 **Winners:** \`${g.winners}\``,
        `📅 **Exact time:** <t:${endTimestamp}:F>`,
        '',
        `👑 **Hosted by:** <@${g.host}>`,
        '',
        '━━━━━━━━━━━━━━━━━━━━',
        '**Made by ROW**',
      ].join('\n')
    )
    .setColor(0xff6b00)
    .setTimestamp(new Date(g.end_time * 1000))
    .setFooter({ text: 'ROW' })
    .setImage(g.image || DEFAULT_IMAGE)
    .setThumbnail(g.thumbnail || null);
}

function buildEndedEmbed(g, winnersMentions, participantsCount) {
  return new EmbedBuilder()
    .setTitle(`🎁  ${g.prize}  🎁`)
    .setDescription(
      [
        '### 🏆 Giveaway Ended 🏆',
        '',
        `🎉 **Winner(s):** ${winnersMentions}`,
        '',
        `👑 **Hosted by:** <@${g.host}>`,
        '',
        '━━━━━━━━━━━━━━━━━━━━',
        '**Made by ROW**',
      ].join('\n')
    )
    .setColor(0xff6b00)
    .setTimestamp(new Date())
    .setFooter({ text: `${participantsCount} participants  •  ROW` });
}

function joinRow(giveawayId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${JOIN_BUTTON_ID}:${giveawayId}`)
      .setEmoji('🎉')
      .setStyle(ButtonStyle.Success)
  );
}

function createGiveawayModal() {
  const modal = new ModalBuilder()
    .setCustomId(CREATE_MODAL_ID)
    .setTitle('Create Your Own Giveaway');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('duration')
        .setLabel('Giveaway Duration')
        .setPlaceholder('10s, 1m, 10h, 1d')
        .setRequired(true)
        .setMaxLength(10)
        .setStyle(TextInputStyle.Short)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('winners')
        .setLabel('Giveaway Winner Count')
        .setPlaceholder('1')
        .setValue('1')
        .setRequired(true)
        .setMaxLength(2)
        .setStyle(TextInputStyle.Short)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('prize')
        .setLabel('Giveaway Prize')
        .setPlaceholder('Nitro, Gamepass, $10 Gift Card')
        .setRequired(true)
        .setMaxLength(100)
        .setStyle(TextInputStyle.Short)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('image')
        .setLabel('Giveaway Image (Optional)')
        .setPlaceholder('https://media.discordapp.net/...')
        .setRequired(false)
        .setMaxLength(300)
        .setStyle(TextInputStyle.Short)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('thumbnail')
        .setLabel('Giveaway Thumbnail (Optional)')
        .setPlaceholder('https://media.discordapp.net/...')
        .setRequired(false)
        .setMaxLength(300)
        .setStyle(TextInputStyle.Short)
    )
  );

  return modal;
}

async function endGiveaway(client, giveawayId) {
  const g = client.giveaways.get(giveawayId);
  if (!g) return;

  const channel = await client.channels.fetch(g.channel_id).catch(() => null);
  if (!channel) {
    client.giveaways.delete(giveawayId);
    return;
  }

  const participants = Array.isArray(g.participants) ? g.participants : [];
  const winnersCount = Math.min(g.winners || 1, participants.length);

  let winnersMentions = 'لا يوجد';
  if (winnersCount === 0) {
    winnersMentions = 'لا يوجد';
  } else {
    const forcedList = Array.isArray(g.forced_winners) ? g.forced_winners : [];
    const forcedValid = forcedList.filter(uid => participants.includes(uid)).slice(0, winnersCount);
    const remaining = participants.filter(p => !forcedValid.includes(p));
    for (let i = remaining.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
    }
    const needed = winnersCount - forcedValid.length;
    const winners = forcedValid.concat(remaining.slice(0, needed));
    winnersMentions = winners.map(w => `<@${w}>`).join(', ');
  }

  const embed = buildEndedEmbed(g, winnersMentions, participants.length);

  try {
    const msg = await channel.messages.fetch(giveawayId).catch(() => null);
    if (msg) {
      await msg.edit({ embeds: [embed], components: [] });
    } else {
      await channel.send({ embeds: [embed] });
    }
    await channel.send(`🎊 القيف أواي خلص!\nالفائزين: ${winnersMentions}`);
  } catch (err) {
    console.error('[Giveaway] end error:', err.message);
  }

  client.giveaways.delete(giveawayId);
}

async function handleJoinButton(interaction, client) {
  if (!interaction.customId.startsWith(`${JOIN_BUTTON_ID}:`)) return false;

  const giveawayId = interaction.customId.slice(JOIN_BUTTON_ID.length + 1);
  const g = client.giveaways.get(giveawayId);
  if (!g) {
    await interaction.reply({ content: '❌ هذا القيف أواي انتهى أو غير موجود.', ephemeral: true });
    return true;
  }

  const userId = String(interaction.user.id);
  const participants = Array.isArray(g.participants) ? [...g.participants] : [];

  if (participants.includes(userId)) {
    g.participants = participants.filter(id => id !== userId);
    client.giveaways.set(giveawayId, g);
    await interaction.reply({ content: '❌ تم إلغاء مشاركتك في القيف أواي.', ephemeral: true });
  } else {
    participants.push(userId);
    g.participants = participants;
    client.giveaways.set(giveawayId, g);
    await interaction.reply({ content: '✅ تم تسجيلك في القيف أواي بنجاح!', ephemeral: true });
  }

  try {
    const channel = await client.channels.fetch(g.channel_id).catch(() => null);
    if (channel) {
      const msg = await channel.messages.fetch(giveawayId).catch(() => null);
      if (msg) {
        await msg.edit({ embeds: [buildActiveEmbed(g)], components: [joinRow(giveawayId)] });
      }
    }
  } catch {
    // ignore embed update failures
  }

  return true;
}

async function handleCreateModal(interaction, client) {
  if (interaction.customId !== CREATE_MODAL_ID) return false;

  const seconds = parseDuration(interaction.fields.getTextInputValue('duration'));
  if (!seconds) {
    await interaction.reply({
      content: '❌ صيغة المدة غلط. استخدم مثلاً: `30m` أو `2h` أو `1d` (الحد الأدنى 10 ثواني).',
      ephemeral: true,
    });
    return true;
  }

  let winnersCount = parseInt(interaction.fields.getTextInputValue('winners'), 10);
  if (!Number.isFinite(winnersCount) || winnersCount < 1) {
    await interaction.reply({ content: '❌ عدد الفائزين لازم يكون رقم صحيح أكبر من 0.', ephemeral: true });
    return true;
  }

  const prize = interaction.fields.getTextInputValue('prize').trim();
  const image = (interaction.fields.getTextInputValue('image') || '').trim() || null;
  const thumbnail = (interaction.fields.getTextInputValue('thumbnail') || '').trim() || null;

  const endTime = Date.now() / 1000 + seconds;
  const draft = {
    prize,
    channel_id: interaction.channelId,
    end_time: endTime,
    winners: winnersCount,
    participants: [],
    host: interaction.user.id,
    image,
    thumbnail,
    forced_winners: [],
  };

  const embed = buildActiveEmbed(draft);
  await interaction.reply({ embeds: [embed] });
  const msg = await interaction.fetchReply();

  const giveawayId = msg.id;
  client.giveaways.set(giveawayId, { ...draft });
  await msg.edit({ components: [joinRow(giveawayId)] });
  return true;
}

function startGiveawayLoop(client) {
  setInterval(async () => {
    const now = Date.now() / 1000;
    const toEnd = [];
    for (const [gid, g] of client.giveaways.entries()) {
      if (now >= g.end_time) toEnd.push(gid);
    }
    for (const gid of toEnd) {
      try {
        await endGiveaway(client, gid);
      } catch (err) {
        console.error('[Giveaway] loop error:', err.message);
      }
    }
  }, 20 * 1000);
}

module.exports = {
  createGiveawayModal,
  handleJoinButton,
  handleCreateModal,
  endGiveaway,
  startGiveawayLoop,
  JOIN_BUTTON_ID,
  CREATE_MODAL_ID,
};
