const {
  SlashCommandBuilder, ModalBuilder, TextInputBuilder,
  TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder,
  ChannelSelectMenuBuilder, ChannelType
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-panel')
    .setDescription('إنشاء بانل التذاكر'),

  async execute(interaction, client) {
    // Step 1: Modal - embed info
    const modal = new ModalBuilder()
      .setCustomId('panel_embed_info')
      .setTitle('انشاء معلومات الايمبد 🎫');

    const msgInput = new TextInputBuilder()
      .setCustomId('embed_msg')
      .setLabel('رسالة الايمبد (اختياري)')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setMaxLength(4000);

    const titleInput = new TextInputBuilder()
      .setCustomId('embed_title')
      .setLabel('عنوان الايمبد (اختياري)')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(256);

    const imageInput = new TextInputBuilder()
      .setCustomId('embed_image')
      .setLabel('رابط صورة الايمبد (اختياري)')
      .setStyle(TextInputStyle.Short)
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(msgInput),
      new ActionRowBuilder().addComponents(titleInput),
      new ActionRowBuilder().addComponents(imageInput),
    );

    await interaction.showModal(modal);
  }
};
