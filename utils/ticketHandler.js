const {
  ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder,
  ButtonStyle, EmbedBuilder, ChannelType, PermissionFlagsBits,
  StringSelectMenuOptionBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  AttachmentBuilder, ChannelSelectMenuBuilder
} = require('discord.js');
const fs = require('fs');
const path = require('path');

const sessions = new Map();
const cooldowns = new Map(); // key: `${userId}-${buttonId}-${channelId}` → timestamp
const COOLDOWN_MS = 10 * 60 * 1000; // 10 دقائق

function checkCooldown(userId, buttonId, channelId) {
  const key = `${userId}-${buttonId}-${channelId}`;
  const now = Date.now();
  const last = cooldowns.get(key);
  if (last && now - last < COOLDOWN_MS) {
    const remaining = Math.ceil((COOLDOWN_MS - (now - last)) / 1000);
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    return `⏳ انتظر ${mins}:${secs.toString().padStart(2, '0')} دقيقة قبل الاستخدام مجدداً.`;
  }
  cooldowns.set(key, now);
  return null;
}

// ─────────────────────────────────────────
// TICKET ACTION BUTTONS
// ─────────────────────────────────────────
function buildTicketButtons(claimedBy = null) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_close').setLabel('إغلاق').setEmoji('🔒').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('ticket_claim').setLabel(claimedBy ? 'مستلمة ✅' : 'استلام').setEmoji({ id: '1361433613513658398' }).setStyle(ButtonStyle.Success).setDisabled(!!claimedBy),
    new ButtonBuilder().setCustomId('ticket_unclaim').setLabel('ترك التذكرة').setEmoji({ id: '1180554100639801454' }).setStyle(ButtonStyle.Secondary).setDisabled(!claimedBy),
    new ButtonBuilder().setCustomId('ticket_add_user').setLabel('إضافة شخص').setEmoji('➕').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ticket_rename').setLabel('تغيير الاسم').setEmoji({ id: '1424467612854911127' }).setStyle(ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_call_support').setLabel('استدعاء سبورت').setEmoji({ id: '1395521401854890004' }).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ticket_call_admin').setLabel('استدعاء ادمن').setEmoji({ id: '1438284480153387209' }).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ticket_dm_user').setLabel('استدعاء العضو بالخاص').setEmoji({ id: '1317304004027486258' }).setStyle(ButtonStyle.Secondary),
  );
  return [row1, row2];
}

// أزرار التقييم
function buildRatingButtons() {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('rate_1').setLabel('⭐').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('rate_2').setLabel('⭐⭐').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('rate_3').setLabel('⭐⭐⭐').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('rate_4').setLabel('⭐⭐⭐⭐').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('rate_5').setLabel('⭐⭐⭐⭐⭐').setStyle(ButtonStyle.Secondary),
  )];
}

// ─────────────────────────────────────────
// جمع رسائل التذكرة وحفظها كـ txt
// ─────────────────────────────────────────
async function generateTranscript(channel) {
  try {
    const messages = [];
    let lastId;

    while (true) {
      const fetched = await channel.messages.fetch({ limit: 100, before: lastId });
      if (fetched.size === 0) break;
      messages.unshift(...fetched.values());
      lastId = fetched.last().id;
      if (fetched.size < 100) break;
    }

    messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    let content = `═══════════════════════════════════════\n`;
    content += `📋 سجل التذكرة: #${channel.name}\n`;
    content += `📅 التاريخ: ${new Date().toLocaleString('ar-SA')}\n`;
    content += `═══════════════════════════════════════\n\n`;

    for (const msg of messages) {
      const time = msg.createdAt.toLocaleString('ar-SA');
      const author = `${msg.author.tag}`;
      const text = msg.content || '[لا يوجد نص]';
      content += `[${time}] ${author}:\n${text}\n`;
      if (msg.attachments.size > 0) {
        msg.attachments.forEach(att => {
          content += `  📎 مرفق: ${att.url}\n`;
        });
      }
      content += `\n`;
    }

    content += `═══════════════════════════════════════\n`;
    content += `إجمالي الرسائل: ${messages.length}\n`;

    const tmpPath = path.join('/tmp', `transcript-${channel.id}.txt`);
    fs.writeFileSync(tmpPath, content, 'utf8');
    return tmpPath;
  } catch (e) {
    console.error('Transcript error:', e);
    return null;
  }
}

// ─────────────────────────────────────────
// دالة الإغلاق الفعلي بعد التقييم
// ─────────────────────────────────────────
async function closeTicket(interaction, client, ticket, settings, stars) {
  const guild = interaction.guild;
  const channel = interaction.channel;

  // إرسال التقييم لروم التقييم
  if (settings.tqeem_room) {
    const tqeemChannel = guild.channels.cache.get(settings.tqeem_room);
    if (tqeemChannel) {
      const ticketUser = await client.users.fetch(ticket.userId).catch(() => null);
      const adminUser = ticket.claimedBy ? await client.users.fetch(ticket.claimedBy).catch(() => null) : null;
      const starsText = '⭐'.repeat(stars);

      await tqeemChannel.send({
        embeds: [{
          title: '⭐ تقييم جديد',
          description:
            `👤 **العضو:** ${ticketUser ? ticketUser.tag : ticket.userId}\n` +
            `🛡️ **الاداري المستلم:** ${adminUser ? adminUser.tag : 'لم يُستلم'}\n` +
            `⭐ **التقييم:** ${starsText} (${stars}/5)`,
          color: 0xFEE75C,
          thumbnail: ticketUser ? { url: ticketUser.displayAvatarURL({ dynamic: true }) } : undefined,
          timestamp: new Date(),
        }]
      });
    }
  }

  // توليد ملف اللوق وإرساله
  if (settings.ticket_logs) {
    const logsChannel = guild.channels.cache.get(settings.ticket_logs);
    if (logsChannel) {
      const transcriptPath = await generateTranscript(channel);
      const ticketUser = await client.users.fetch(ticket.userId).catch(() => null);
      const claimedUser = ticket.claimedBy ? await client.users.fetch(ticket.claimedBy).catch(() => null) : null;

      const logEmbed = {
        title: '🔒 تذكرة مغلقة',
        description:
          `**التذكرة:** ${channel.name}\n` +
          `**فتحها:** ${ticketUser ? `${ticketUser} (${ticketUser.tag})` : ticket.userId}\n` +
          `**استلمها:** ${claimedUser ? `${claimedUser} (${claimedUser.tag})` : 'لم يتم الاستلام'}\n` +
          `**أُغلقت بواسطة:** ${interaction.user.tag}\n` +
          `**التقييم:** ${'⭐'.repeat(stars)} (${stars}/5)`,
        color: 0xED4245,
        timestamp: new Date(),
      };

      if (transcriptPath) {
        const attachment = new AttachmentBuilder(transcriptPath, { name: `transcript-${channel.name}.txt` });
        await logsChannel.send({ embeds: [logEmbed], files: [attachment] });
        fs.unlinkSync(transcriptPath);
      } else {
        await logsChannel.send({ embeds: [logEmbed] });
      }
    }
  }

  // نقل لكاتيقوري الإغلاق
  if (settings.close_category) {
    await channel.setParent(settings.close_category, { lockPermissions: false }).catch(() => { });
  }

  client.openTickets.delete(channel.id);
  setTimeout(() => channel.delete().catch(() => { }), 3000);
}

// ─────────────────────────────────────────
// MODAL SUBMIT
// ─────────────────────────────────────────
async function handleModal(interaction, client) {

  if (interaction.customId === 'panel_embed_info') {
    const embedMsg = interaction.fields.getTextInputValue('embed_msg');
    const embedTitle = interaction.fields.getTextInputValue('embed_title');
    const embedImage = interaction.fields.getTextInputValue('embed_image');
    sessions.set(interaction.user.id, { embedMsg, embedTitle, embedImage });

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('panel_thumbnail_type')
        .setPlaceholder('اختر صورة الايمبد على اليمين')
        .addOptions([
          new StringSelectMenuOptionBuilder().setLabel('صورتك').setValue('user').setEmoji('👤'),
          new StringSelectMenuOptionBuilder().setLabel('صورة السيرفر').setValue('guild').setEmoji('🏠'),
          new StringSelectMenuOptionBuilder().setLabel('صورة البوت').setValue('bot').setEmoji('🤖'),
          new StringSelectMenuOptionBuilder().setLabel('لاشي').setValue('none').setEmoji('🚫'),
        ])
    );
    await interaction.reply({ content: '**صورة الايمبد على اليمين**', components: [row], ephemeral: true });
  }

  if (interaction.customId.startsWith('reason_modal_')) {
    const ticketNum = parseInt(interaction.customId.split('_')[2]);
    const reason = interaction.fields.getTextInputValue('reason_input');
    await openTicket(interaction, client, ticketNum, reason);
  }

  if (interaction.customId === 'ticket_add_user_modal') {
    const userId = interaction.fields.getTextInputValue('add_user_id').trim();
    const ticket = client.openTickets.get(interaction.channelId);
    if (!ticket) return interaction.reply({ content: '❌ هذا ليس شانل تذكرة!', ephemeral: true });

    const member = await interaction.guild.members.fetch(userId).catch(() => null);
    if (!member) return interaction.reply({ content: '❌ المستخدم غير موجود، تأكد من الـ ID.', ephemeral: true });

    await interaction.channel.permissionOverwrites.edit(member.id, {
      ViewChannel: true, SendMessages: true, ReadMessageHistory: true,
    });
    await interaction.reply({ content: `✅ تم إضافة ${member} للتذكرة.` });
  }

  if (interaction.customId === 'ticket_rename_modal') {
    const ticket = client.openTickets.get(interaction.channelId);
    if (!ticket) return interaction.reply({ content: '❌ هذا ليس شانل تذكرة!', ephemeral: true });

    let newName = interaction.fields.getTextInputValue('new_ticket_name').trim();
    newName = newName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9أ-ي\-_]/g, '').slice(0, 90);
    if (!newName) return interaction.reply({ content: '❌ اسم غير صالح!', ephemeral: true });

    await interaction.channel.setName(newName).catch(() => null);
    await interaction.reply({ content: `✅ تم تغيير اسم التذكرة إلى **${newName}**` });
  }
}

// ─────────────────────────────────────────
// SELECT MENU
// ─────────────────────────────────────────
async function handleSelect(interaction, client) {

  if (interaction.customId === 'panel_thumbnail_type') {
    const session = sessions.get(interaction.user.id) || {};
    session.thumbnailType = interaction.values[0];
    sessions.set(interaction.user.id, session);

    const row = new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId('panel_channel_select')
        .setPlaceholder('اختر روم لإرسال البانل (تقدر تكتب وتدور باسمه)')
        .addChannelTypes(ChannelType.GuildText)
    );
    await interaction.update({ content: '**اختر روم لإرسال البانل**', components: [row] });
  }

  if (interaction.customId === 'panel_channel_select') {
    const session = sessions.get(interaction.user.id) || {};
    session.channelId = interaction.values[0];
    sessions.set(interaction.user.id, session);

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('panel_ticket_type')
        .setPlaceholder('اختر نوع التذاكر')
        .addOptions([
          new StringSelectMenuOptionBuilder().setLabel('منيو / Menu').setValue('menu').setEmoji('📋'),
          new StringSelectMenuOptionBuilder().setLabel('ازرار / Buttons').setValue('buttons').setEmoji('🔘'),
        ])
    );
    await interaction.update({ content: '**اختر نوع التذاكر**', components: [row] });
  }

  if (interaction.customId === 'panel_ticket_type') {
    const session = sessions.get(interaction.user.id) || {};
    session.panelType = interaction.values[0];
    session.selectedTickets = [];
    session.currentTicketIndex = 0;
    sessions.set(interaction.user.id, session);

    const availableTickets = [];
    for (let i = 1; i <= 5; i++) {
      const s = client.ticketSettings.get(i);
      availableTickets.push(
        new StringSelectMenuOptionBuilder()
          .setLabel(`التذكرة رقم ${i}${s?.name ? ` - ${s.name}` : ''}`)
          .setValue(String(i)).setEmoji('🎫')
      );
    }

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('panel_tickets_select')
        .setPlaceholder('اختر التذاكر اللي تبيها في البانل')
        .setMinValues(1).setMaxValues(availableTickets.length)
        .addOptions(availableTickets)
    );
    await interaction.update({ content: '**اختر التذاكر اللي تبيها في البانل**', components: [row] });
  }

  if (interaction.customId === 'panel_tickets_select') {
    const session = sessions.get(interaction.user.id) || {};
    session.selectedTickets = interaction.values.map(Number);
    session.ticketConfigs = {};
    session.currentTicketIndex = 0;
    sessions.set(interaction.user.id, session);
    await askTicketColor(interaction, session);
  }

  if (interaction.customId.startsWith('panel_color_')) {
    const session = sessions.get(interaction.user.id) || {};
    const ticketNum = session.selectedTickets[session.currentTicketIndex];
    session.ticketConfigs[ticketNum] = session.ticketConfigs[ticketNum] || {};
    session.ticketConfigs[ticketNum].color = interaction.values[0];
    sessions.set(interaction.user.id, session);

    await interaction.update({
      content: `**اكتب الإيموجي للتذكرة رقم ${ticketNum}**\nأو اكتب \`لا\` لتجاهل الإيموجي`,
      components: []
    });

    const filter = m => m.author.id === interaction.user.id;
    const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 60000 }).catch(() => null);
    if (!collected || collected.size === 0) return;
    const msg = collected.first();
    const emoji = msg.content.toLowerCase() === 'لا' ? null : msg.content.trim();
    session.ticketConfigs[ticketNum].emoji = emoji;
    await msg.delete().catch(() => { });

    await interaction.followUp({ content: `**اكتب اسم التذكرة رقم ${ticketNum}**`, ephemeral: true });

    const collected2 = await interaction.channel.awaitMessages({ filter, max: 1, time: 60000 }).catch(() => null);
    if (!collected2 || collected2.size === 0) return;
    const msg2 = collected2.first();
    session.ticketConfigs[ticketNum].label = msg2.content.trim();
    await msg2.delete().catch(() => { });
    sessions.set(interaction.user.id, session);

    session.currentTicketIndex++;
    if (session.currentTicketIndex < session.selectedTickets.length) {
      await askTicketColor(interaction, session, true);
    } else {
      await sendPanel(interaction, client, session);
    }
  }

  if (interaction.customId === 'ticket_menu_select') {
    // خيار Refresh داخل المنيو
    if (interaction.values[0] === 'panel_refresh') {
      return await interaction.reply({ content: '🔄 البانل شغال! اختر نوع التذكرة من المنيو.', ephemeral: true });
    }

    const ticketNum = parseInt(interaction.values[0]);
    const settings = client.ticketSettings.get(ticketNum) || {};

    if (settings.reason === 'yes') {
      const modal = new ModalBuilder().setCustomId(`reason_modal_${ticketNum}`).setTitle('سبب فتح التذكرة');
      const reasonInput = new TextInputBuilder().setCustomId('reason_input').setLabel('اكتب السبب').setStyle(TextInputStyle.Paragraph).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
      return await interaction.showModal(modal);
    }
    await openTicket(interaction, client, ticketNum, null);
  }
}

// ─────────────────────────────────────────
// BUTTON
// ─────────────────────────────────────────
async function handleButton(interaction, client) {

  // ── Refresh البانل الرئيسي (الكل يقدر يستخدمه) ──
  if (interaction.customId === 'panel_refresh') {
    await interaction.reply({ content: '🔄 البانل شغال! اختر نوع التذكرة من فوق.', ephemeral: true });
    return;
  }

  // فتح تذكرة من البانل
  if (interaction.customId.startsWith('ticket_btn_')) {
    const ticketNum = parseInt(interaction.customId.replace('ticket_btn_', ''));
    const settings = client.ticketSettings.get(ticketNum) || {};

    if (settings.reason === 'yes') {
      const modal = new ModalBuilder().setCustomId(`reason_modal_${ticketNum}`).setTitle('سبب فتح التذكرة');
      const reasonInput = new TextInputBuilder().setCustomId('reason_input').setLabel('اكتب السبب').setStyle(TextInputStyle.Paragraph).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
      return await interaction.showModal(modal);
    }
    return await openTicket(interaction, client, ticketNum, null);
  }

  // أزرار التقييم (rate_1 إلى rate_5)
  if (interaction.customId.startsWith('rate_')) {
    const stars = parseInt(interaction.customId.replace('rate_', ''));
    const ticket = client.openTickets.get(interaction.channelId);
    if (!ticket) return interaction.reply({ content: '❌ خطأ في التذكرة!', ephemeral: true });

    // بس صاحب التذكرة يقدر يقيّم
    if (interaction.user.id !== ticket.userId) {
      return interaction.reply({ content: '❌ بس صاحب التذكرة يقدر يقيّم!', ephemeral: true });
    }

    const settings = client.ticketSettings.get(ticket.ticketNum) || {};
    await interaction.update({ content: `✅ شكراً على تقييمك! **${'⭐'.repeat(stars)}**\nجاري إغلاق التذكرة...`, components: [] });
    await closeTicket(interaction, client, ticket, settings, stars);
    return;
  }

  // تسكير بدون تقييم (بس الادمن أو من يملك صلاحية)
  if (interaction.customId === 'ticket_close_skip') {
    const ticket = client.openTickets.get(interaction.channelId);
    if (!ticket) return interaction.reply({ content: '❌ خطأ في التذكرة!', ephemeral: true });

    const settings = client.ticketSettings.get(ticket.ticketNum) || {};
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    const hasAdmin = settings.admin && member?.roles.cache.has(settings.admin);
    const hasRole = settings.role && member?.roles.cache.has(settings.role);
    const isOwner = interaction.guild.ownerId === interaction.user.id;

    if (!hasAdmin && !hasRole && !isOwner) {
      return interaction.reply({ content: '❌ بس الإداريين يقدرون يسكرون بدون تقييم!', ephemeral: true });
    }

    await interaction.update({ content: '🔒 جاري إغلاق التذكرة...', components: [] });
    await closeTicket(interaction, client, ticket, settings, 0);
    return;
  }

  const ticket = client.openTickets.get(interaction.channelId);

  // ── إغلاق → يطلع تقييم أول ──
  if (interaction.customId === 'ticket_close') {
    if (!ticket) return interaction.reply({ content: '❌ هذا ليس شانل تذكرة!', ephemeral: true });
    const settings = client.ticketSettings.get(ticket.ticketNum) || {};

    // بس مستلم التذكرة أو الادمن يقدر يسكر من الزر
    const closerMember = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    const closerHasAdmin = settings.admin && closerMember?.roles.cache.has(settings.admin);
    const closerIsOwner = interaction.guild.ownerId === interaction.user.id;
    const closerIsClaimer = ticket.claimedBy && interaction.user.id === ticket.claimedBy;

    if (!closerIsClaimer && !closerHasAdmin && !closerIsOwner) {
      return interaction.reply({ content: '❌ بس مستلم التذكرة أو الإداري يقدر يسكر التذكرة!', ephemeral: true });
    }

    // إذا في روم تقييم، اطلب التقييم أول
    if (settings.tqeem_room) {
      const skipRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_close_skip').setLabel('تسكير بدون تقييم').setEmoji('🔒').setStyle(ButtonStyle.Danger)
      );
      await interaction.reply({
        content: `<@${ticket.userId}>\n⭐ **قيّم تجربتك قبل إغلاق التذكرة**`,
        components: [...buildRatingButtons(), skipRow],
      });
    } else {
      // ما في تقييم، سكّر مباشرة
      await interaction.reply({ content: '🔒 جاري إغلاق التذكرة...' });
      await closeTicket(interaction, client, ticket, settings, 0);
    }
    return;
  }

  // ── استلام (بس role أو admin) ──
  if (interaction.customId === 'ticket_claim') {
    if (!ticket) return interaction.reply({ content: '❌ هذا ليس شانل تذكرة!', ephemeral: true });
    if (ticket.claimedBy) return interaction.reply({ content: '❌ التذكرة مستلمة بالفعل!', ephemeral: true });

    // صاحب التذكرة ما يقدر يستلم تذكرته أبداً، حتى لو كان إداري
    if (interaction.user.id === ticket.userId) {
      return interaction.reply({ content: '❌ ما تقدر تستلم تذكرتك أنت!', ephemeral: true });
    }

    const settings = client.ticketSettings.get(ticket.ticketNum) || {};
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    const hasRole = settings.role && member?.roles.cache.has(settings.role);
    const hasAdmin = settings.admin && member?.roles.cache.has(settings.admin);
    const isOwner = interaction.guild.ownerId === interaction.user.id;

    if (!hasRole && !hasAdmin && !isOwner) {
      return interaction.reply({ content: '❌ بس المسؤولين يقدرون يستلمون التذاكر!', ephemeral: true });
    }

    // أعط المستلم صلاحية الكتابة صراحةً (صاحب التذكرة يبقى يكتب)
    await interaction.channel.permissionOverwrites.edit(interaction.user.id, {
      ViewChannel: true, SendMessages: true, ReadMessageHistory: true,
    }).catch(() => { });

    ticket.claimedBy = interaction.user.id;
    client.openTickets.set(interaction.channelId, ticket);
    await interaction.message.edit({ components: buildTicketButtons(interaction.user.id) }).catch(() => { });
    await interaction.reply({
      embeds: [{ description: `✋ **تم استلام التذكرة بواسطة ${interaction.user}**`, color: 0x57F287 }]
    });
    return;
  }

  // ── ترك التذكرة ──
  if (interaction.customId === 'ticket_unclaim') {
    if (!ticket) return interaction.reply({ content: '❌ هذا ليس شانل تذكرة!', ephemeral: true });
    if (ticket.claimedBy !== interaction.user.id) {
      return interaction.reply({ content: '❌ أنت لم تستلم هذه التذكرة!', ephemeral: true });
    }

    await interaction.channel.permissionOverwrites.edit(ticket.userId, {
      ViewChannel: true, SendMessages: true, ReadMessageHistory: true,
    }).catch(() => { });

    // اسحب صلاحية الكتابة من الشخص اللي ترك التذكرة (إلا إذا كان من رتبة الادمن، فتبقى له تلقائياً)
    const leaverSettings = client.ticketSettings.get(ticket.ticketNum) || {};
    const leaverMember = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    const leaverHasAdmin = leaverSettings.admin && leaverMember?.roles.cache.has(leaverSettings.admin);
    const leaverIsOwnerOfTicket = interaction.user.id === ticket.userId;
    if (!leaverHasAdmin && !leaverIsOwnerOfTicket) {
      await interaction.channel.permissionOverwrites.delete(interaction.user.id).catch(() => { });
    }

    ticket.claimedBy = null;
    client.openTickets.set(interaction.channelId, ticket);
    await interaction.message.edit({ components: buildTicketButtons(null) }).catch(() => { });
    await interaction.reply({
      embeds: [{ description: `🚪 **${interaction.user} ترك التذكرة، أصبحت متاحة للاستلام مجدداً.**`, color: 0xFEE75C }]
    });
    return;
  }

  // ── إضافة شخص (بس المستلم أو الادمن) ──
  if (interaction.customId === 'ticket_add_user') {
    if (!ticket) return interaction.reply({ content: '❌ هذا ليس شانل تذكرة!', ephemeral: true });
    const settings = client.ticketSettings.get(ticket.ticketNum) || {};
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    const hasAdmin = settings.admin && member?.roles.cache.has(settings.admin);
    const isClaimer = ticket.claimedBy && ticket.claimedBy === interaction.user.id;

    if (!hasAdmin && !isClaimer) {
      return interaction.reply({ content: '❌ بس مستلم التذكرة أو الإداريين يقدرون يضيفون أشخاص!', ephemeral: true });
    }

    const modal = new ModalBuilder().setCustomId('ticket_add_user_modal').setTitle('إضافة شخص للتذكرة');
    const userInput = new TextInputBuilder()
      .setCustomId('add_user_id').setLabel('ادخل ID المستخدم')
      .setStyle(TextInputStyle.Short).setRequired(true)
      .setPlaceholder('مثال: 123456789012345678');
    modal.addComponents(new ActionRowBuilder().addComponents(userInput));
    return await interaction.showModal(modal);
  }

  // ── تغيير اسم التذكرة (بس المستلم أو الادمن) ──
  if (interaction.customId === 'ticket_rename') {
    if (!ticket) return interaction.reply({ content: '❌ هذا ليس شانل تذكرة!', ephemeral: true });
    const settings = client.ticketSettings.get(ticket.ticketNum) || {};
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    const hasAdmin = settings.admin && member?.roles.cache.has(settings.admin);
    const isClaimer = ticket.claimedBy && ticket.claimedBy === interaction.user.id;

    if (!hasAdmin && !isClaimer) {
      return interaction.reply({ content: '❌ بس مستلم التذكرة أو الإداريين يقدرون يغيرون اسم التذكرة!', ephemeral: true });
    }

    const modal = new ModalBuilder().setCustomId('ticket_rename_modal').setTitle('تغيير اسم التذكرة');
    const nameInput = new TextInputBuilder()
      .setCustomId('new_ticket_name').setLabel('اكتب الاسم الجديد')
      .setStyle(TextInputStyle.Short).setRequired(true)
      .setPlaceholder('مثال: الف-روب');
    modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
    return await interaction.showModal(modal);
  }

  // ── استدعاء سبورت (بس المستلم أو الادمن) ──
  if (interaction.customId === 'ticket_call_support') {
    if (!ticket) return interaction.reply({ content: '❌ هذا ليس شانل تذكرة!', ephemeral: true });
    const settings = client.ticketSettings.get(ticket.ticketNum) || {};

    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    const hasAdmin = settings.admin && member?.roles.cache.has(settings.admin);
    const isClaimer = ticket.claimedBy && ticket.claimedBy === interaction.user.id;

    if (!hasAdmin && !isClaimer) {
      return interaction.reply({ content: '❌ بس مستلم التذكرة أو الإداريين يقدرون يستخدمون هذا الزر!', ephemeral: true });
    }

    const cdMsg = checkCooldown(interaction.user.id, 'call_support', interaction.channelId);
    if (cdMsg) return interaction.reply({ content: cdMsg, ephemeral: true });

    const mentionRole = settings.role ? `<@&${settings.role}>` : '@here';
    await interaction.reply({ content: `📢 ${mentionRole} مطلوبون في هذه التذكرة!` });
    return;
  }

  // ── استدعاء اداري (بس المستلم أو الادمن) ──
  if (interaction.customId === 'ticket_call_admin') {
    if (!ticket) return interaction.reply({ content: '❌ هذا ليس شانل تذكرة!', ephemeral: true });
    const settings = client.ticketSettings.get(ticket.ticketNum) || {};

    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    const hasAdmin = settings.admin && member?.roles.cache.has(settings.admin);
    const isClaimer = ticket.claimedBy && ticket.claimedBy === interaction.user.id;

    if (!hasAdmin && !isClaimer) {
      return interaction.reply({ content: '❌ بس مستلم التذكرة أو الإداريين يقدرون يستخدمون هذا الزر!', ephemeral: true });
    }

    const cdMsg = checkCooldown(interaction.user.id, 'call_admin', interaction.channelId);
    if (cdMsg) return interaction.reply({ content: cdMsg, ephemeral: true });

    const mentionAdmin = settings.admin ? `<@&${settings.admin}>` : '@here';
    await interaction.reply({ content: `👤 ${mentionAdmin} مطلوبون في هذه التذكرة!` });
    return;
  }

  // ── استدعاء العضو بالخاص (بس المستلم أو الادمن) ──
  if (interaction.customId === 'ticket_dm_user') {
    if (!ticket) return interaction.reply({ content: '❌ هذا ليس شانل تذكرة!', ephemeral: true });
    const settings = client.ticketSettings.get(ticket.ticketNum) || {};

    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    const hasAdmin = settings.admin && member?.roles.cache.has(settings.admin);
    const isClaimer = ticket.claimedBy && ticket.claimedBy === interaction.user.id;

    if (!hasAdmin && !isClaimer) {
      return interaction.reply({ content: '❌ بس مستلم التذكرة أو الإداريين يقدرون يستخدمون هذا الزر!', ephemeral: true });
    }

    const cdMsg = checkCooldown(interaction.user.id, 'dm_user', interaction.channelId);
    if (cdMsg) return interaction.reply({ content: cdMsg, ephemeral: true });

    const ticketUser = await interaction.client.users.fetch(ticket.userId).catch(() => null);
    if (!ticketUser) return interaction.reply({ content: '❌ ما قدرت أجد العضو.', ephemeral: true });

    const sent = await ticketUser.send({
      embeds: [{ description: `📩 **يرجى التوجه للتذكرة التي قمت بفتحها**\n\n🔗 ${interaction.channel}`, color: 0x5865F2 }]
    }).catch(() => null);

    if (!sent) return interaction.reply({ content: '❌ ما قدرت أرسل للعضو، ربما أغلق الخاص.', ephemeral: true });
    await interaction.reply({ content: `✅ تم إرسال رسالة خاصة لـ ${ticketUser.tag}`, ephemeral: true });
    return;
  }
}

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────
async function askTicketColor(interaction, session, followUp = false) {
  const ticketNum = session.selectedTickets[session.currentTicketIndex];
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`panel_color_${ticketNum}`)
      .setPlaceholder(`اختر لون الزر للتذكرة رقم ${ticketNum}`)
      .addOptions([
        new StringSelectMenuOptionBuilder().setLabel('أزرق').setValue('Primary').setEmoji('🔵'),
        new StringSelectMenuOptionBuilder().setLabel('رصاصي').setValue('Secondary').setEmoji('⚪'),
        new StringSelectMenuOptionBuilder().setLabel('أخضر').setValue('Success').setEmoji('🟢'),
        new StringSelectMenuOptionBuilder().setLabel('أحمر').setValue('Danger').setEmoji('🔴'),
      ])
  );
  const content = `**اختر لون الزر للتذكرة رقم ${ticketNum}**`;
  if (followUp) {
    await interaction.followUp({ content, components: [row], ephemeral: true });
  } else {
    await interaction.update({ content, components: [row] });
  }
}

async function sendPanel(interaction, client, session) {
  const channel = interaction.guild.channels.cache.get(session.channelId);
  if (!channel) return interaction.followUp({ content: '❌ الروم غير موجود', ephemeral: true });

  let thumbnailUrl = null;
  if (session.thumbnailType === 'user') thumbnailUrl = interaction.user.displayAvatarURL({ dynamic: true });
  else if (session.thumbnailType === 'guild') thumbnailUrl = interaction.guild.iconURL({ dynamic: true });
  else if (session.thumbnailType === 'bot') thumbnailUrl = interaction.client.user.displayAvatarURL({ dynamic: true });

  const embed = new EmbedBuilder()
    .setTitle(session.embedTitle || 'SERVER')
    .setDescription(session.embedMsg || 'اضغط على الزر بالاسفل واملأ المعلومات لارسال بانل التذكرة')
    .setColor(0x5865F2).setTimestamp();

  if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);
  if (session.embedImage) embed.setImage(session.embedImage);

  let components = [];

  if (session.panelType === 'buttons') {
    const colorMap = { Primary: ButtonStyle.Primary, Secondary: ButtonStyle.Secondary, Success: ButtonStyle.Success, Danger: ButtonStyle.Danger };
    const buttons = session.selectedTickets.map(num => {
      const cfg = session.ticketConfigs[num] || {};
      const btn = new ButtonBuilder()
        .setCustomId(`ticket_btn_${num}`)
        .setLabel(cfg.label || `تذكرة ${num}`)
        .setStyle(colorMap[cfg.color] || ButtonStyle.Primary);
      if (cfg.emoji) btn.setEmoji(cfg.emoji);
      return btn;
    });
    // أضف زر Refresh في آخر صف
    const refreshBtn = new ButtonBuilder()
      .setCustomId('panel_refresh')
      .setLabel('Refresh')
      .setEmoji({ id: '1506186758167990334' })
      .setStyle(ButtonStyle.Secondary);
    for (let i = 0; i < buttons.length; i += 5) {
      components.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
    }
    // أضف الرفرش في صف منفصل إذا الصف الأخير ممتلئ، وإلا في الصف الأخير
    const lastRow = components[components.length - 1];
    if (lastRow && lastRow.components.length < 5) {
      lastRow.addComponents(refreshBtn);
    } else {
      components.push(new ActionRowBuilder().addComponents(refreshBtn));
    }
  } else {
    const options = session.selectedTickets.map(num => {
      const cfg = session.ticketConfigs[num] || {};
      const opt = new StringSelectMenuOptionBuilder().setLabel(cfg.label || `تذكرة ${num}`).setValue(String(num));
      if (cfg.emoji) opt.setEmoji(cfg.emoji);
      return opt;
    });
    // أضف خيار Refresh داخل المنيو نفسه بدل ما يكون زر منفصل تحته
    options.push(
      new StringSelectMenuOptionBuilder()
        .setLabel('Refresh')
        .setValue('panel_refresh')
        .setEmoji({ id: '1506186758167990334' })
    );
    components.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('ticket_menu_select').setPlaceholder('بانل التذكرة').addOptions(options)
    ));
  }

  await channel.send({ embeds: [embed], components });
  await interaction.followUp({ content: `✅ تم إرسال البانل إلى ${channel}`, ephemeral: true });
}

async function openTicket(interaction, client, ticketNum, reason) {
  const settings = client.ticketSettings.get(ticketNum) || {};
  const guild = interaction.guild;
  const user = interaction.user;

  const existingTicket = [...client.openTickets.values()].find(t => t.userId === user.id && t.ticketNum === ticketNum);
  if (existingTicket) return interaction.reply({ content: `❌ لديك تذكرة بالفعل`, ephemeral: true });

  let channelName = `ticket-${user.username}`;
  if (settings.username_number === 'yes') channelName = `ticket-${user.username}-${guild.memberCount}`;
  if (settings.name) channelName = `${settings.name}-${user.username}`;

  const permOverwrites = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
  ];
  // الرول العادي (settings.role) يشوف التذكرة بس ما يكتب فيها إلا إذا استلمها أو كان من رتبة الادمن
  if (settings.role) permOverwrites.push({ id: settings.role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] });
  if (settings.admin) permOverwrites.push({ id: settings.admin, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages] });
  if (settings.ownership === 'yes') {
    const owner = await guild.fetchOwner().catch(() => null);
    if (owner) permOverwrites.push({ id: owner.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
  }

  const ticketChannel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: settings.category || null,
    permissionOverwrites: permOverwrites,
  });

  client.openTickets.set(ticketChannel.id, { userId: user.id, ticketNum, guildId: guild.id, claimedBy: null });

  const welcomeEmbed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('Ticket Opened')
    .setDescription(
      (settings.welcome_msg || `مرحباً ${user}، شكراً لفتح التذكرة. يرجى انتظار الاداريين!`) +
      (reason ? `\n\n📝 **السبب:** ${reason}` : '')
    )
    .setThumbnail(user.displayAvatarURL({ dynamic: true }))
    .setFooter({ text: `SERVER | 's Tickets`, iconURL: guild.iconURL({ dynamic: true }) })
    .setTimestamp();

  if (settings.welcome_image) welcomeEmbed.setImage(settings.welcome_image);

  let mentionContent = user.toString();
  if (settings.mentions) mentionContent += ` ${settings.mentions}`;
  if (settings.ownership === 'yes') {
    const owner = await guild.fetchOwner().catch(() => null);
    if (owner) mentionContent += ` ${owner}`;
  }

  await ticketChannel.send({ content: mentionContent, embeds: [welcomeEmbed], components: buildTicketButtons(null) });
  if (settings.line) await ticketChannel.send({ content: settings.line });

  if (settings.ticket_logs) {
    const logsChannel = guild.channels.cache.get(settings.ticket_logs);
    if (logsChannel) {
      await logsChannel.send({
        embeds: [{
          title: '🎫 تذكرة جديدة',
          description: `**المستخدم:** ${user.tag}\n**التذكرة:** ${ticketChannel}\n**النوع:** ${settings.name || `ticket ${ticketNum}`}${reason ? `\n**السبب:** ${reason}` : ''}`,
          color: 0x57F287, timestamp: new Date(),
        }]
      });
    }
  }

  await interaction.reply({ content: `✅ تم فتح تذكرتك: ${ticketChannel}`, ephemeral: true });
}

// ─────────────────────────────────────────
// PREFIX COMMANDS (!close, !rename)
// ─────────────────────────────────────────
async function handlePrefixCommand(message, client) {
  if (message.author.bot || !message.guild) return;
  const content = message.content.trim();

  // !close → نفس سلوك زر الإغلاق (يطلع التقييم لو موجود، وإلا يسكر مباشرة)
  if (content === '!close') {
    const ticket = client.openTickets.get(message.channelId);
    if (!ticket) return;
    const settings = client.ticketSettings.get(ticket.ticketNum) || {};

    if (settings.tqeem_room) {
      const skipRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_close_skip').setLabel('تسكير بدون تقييم').setEmoji('🔒').setStyle(ButtonStyle.Danger)
      );
      await message.reply({
        content: `<@${ticket.userId}>\n⭐ **قيّم تجربتك قبل إغلاق التذكرة**`,
        components: [...buildRatingButtons(), skipRow],
      });
    } else {
      const reply = await message.reply({ content: '🔒 جاري إغلاق التذكرة...' });
      await closeTicket({ guild: message.guild, channel: message.channel, user: message.author }, client, ticket, settings, 0);
    }
    return;
  }

  // !rename <اسم جديد> → بس المستلم أو الادمن
  if (content.startsWith('!rename')) {
    const ticket = client.openTickets.get(message.channelId);
    if (!ticket) return;

    const settings = client.ticketSettings.get(ticket.ticketNum) || {};
    const member = await message.guild.members.fetch(message.author.id).catch(() => null);
    const hasAdmin = settings.admin && member?.roles.cache.has(settings.admin);
    const isClaimer = ticket.claimedBy && ticket.claimedBy === message.author.id;

    if (!hasAdmin && !isClaimer) {
      return message.reply({ content: '❌ بس مستلم التذكرة أو الإداريين يقدرون يغيرون اسم التذكرة!' });
    }

    let newName = content.replace('!rename', '').trim();
    if (!newName) return message.reply({ content: '❌ اكتب الاسم الجديد بعد الأمر، مثال: `!rename 1000 روب`' });

    newName = newName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9أ-ي\-_]/g, '').slice(0, 90);
    if (!newName) return message.reply({ content: '❌ اسم غير صالح!' });

    await message.channel.setName(newName).catch(() => null);
    await message.reply({ content: `✅ تم تغيير اسم التذكرة إلى **${newName}**` });
    return;
  }
}

module.exports = { handleModal, handleSelect, handleButton, handlePrefixCommand };
