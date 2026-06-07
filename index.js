'use strict';

// ═══════════════════════════════════════════════════════════════════════════
//  BOT INSCRIPTION — Gendarmerie Nationale RP
//  Formulaire modal → post forum → Accepter / Refuser → NIGEND + renommage
// ═══════════════════════════════════════════════════════════════════════════

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  PermissionsBitField,
  ActivityType,
} = require('discord.js');
const Database = require('better-sqlite3');

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const CFG = {
  TOKEN:     process.env.DISCORD_TOKEN  || '',
  CLIENT_ID: process.env.CLIENT_ID     || '',
  GUILD_ID:  process.env.GUILD_ID      || '',

  // Salon Forum où les candidatures sont postées
  FORUM_INSCRIPTION_ID: process.env.FORUM_INSCRIPTION_ID || '',

  // ── Rôles accordés si ACCEPTÉ ─────────────────────────────────────────────
  // Rôle école (à ajouter)
  ROLE_ECOLE_1: '1508161838968471742',
  ROLE_ECOLE_2: process.env.ROLE_ECOLE_2 || '', // à compléter dans les variables Railway

  // ── Rôles accordés si REFUSÉ ──────────────────────────────────────────────
  ROLE_REFUSE_1: '1509596844701909002',
  ROLE_REFUSE_2: '1508169377470480384',

  BOT_NAME: 'Administration Générale de la Gendarmerie',
  COLOR:    0x1d3461,
  COLOR_OK: 0x1d4a28,
  COLOR_KO: 0x6b1f1f,
};

if (!CFG.TOKEN)     { console.error('❌ DISCORD_TOKEN manquant'); process.exit(1); }
if (!CFG.CLIENT_ID) { console.error('❌ CLIENT_ID manquant');     process.exit(1); }

// ─── BASE DE DONNÉES ─────────────────────────────────────────────────────────
const db = new Database('./inscriptions.db');
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS inscriptions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      TEXT NOT NULL UNIQUE,
    username     TEXT NOT NULL,
    nom_prenom   TEXT NOT NULL,
    age          TEXT NOT NULL,
    affectation  TEXT NOT NULL,
    specialite   TEXT NOT NULL,
    nigend       TEXT,
    thread_id    TEXT,
    statut       TEXT NOT NULL DEFAULT 'en_attente',
    created_at   TEXT DEFAULT (datetime('now')),
    updated_at   TEXT DEFAULT (datetime('now'))
  );
`);

const Q = {
  insert:      db.prepare(`
    INSERT OR REPLACE INTO inscriptions
      (user_id, username, nom_prenom, age, affectation, specialite, thread_id, statut)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'en_attente')
  `),
  getByUser:   db.prepare(`SELECT * FROM inscriptions WHERE user_id = ?`),
  getByThread: db.prepare(`SELECT * FROM inscriptions WHERE thread_id = ?`),
  accept:      db.prepare(`UPDATE inscriptions SET statut='accepte', nigend=?, updated_at=datetime('now') WHERE user_id=?`),
  refuse:      db.prepare(`UPDATE inscriptions SET statut='refuse', updated_at=datetime('now') WHERE user_id=?`),
};

// ─── CLIENT ──────────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// ─── COMMANDES SLASH ─────────────────────────────────────────────────────────
const SLASH = [
  new SlashCommandBuilder()
    .setName('inscription')
    .setDescription('📋 Ouvrir le formulaire de candidature à la Gendarmerie Nationale'),

  new SlashCommandBuilder()
    .setName('panel_inscription')
    .setDescription('🛂 [ADMIN] Poster le panel d\'inscription dans ce salon')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild),
].map(c => c.toJSON());

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(CFG.TOKEN);
  try {
    console.log('🔄 Enregistrement des commandes...');
    if (CFG.GUILD_ID) {
      // Enregistrement par guild = instantané (recommandé pour dev/prod)
      await rest.put(Routes.applicationGuildCommands(CFG.CLIENT_ID, CFG.GUILD_ID), { body: SLASH });
    } else {
      await rest.put(Routes.applicationCommands(CFG.CLIENT_ID), { body: SLASH });
    }
    console.log(`✅ ${SLASH.length} commande(s) enregistrée(s).`);
  } catch (e) {
    console.error('❌ Erreur enregistrement:', e.message);
  }
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/** Génère un NIGEND à 6 chiffres unique */
function generateNIGEND() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** Embed du formulaire soumis (posté dans le forum) */
function buildCandidatureEmbed(data, user) {
  return new EmbedBuilder()
    .setColor(CFG.COLOR)
    .setAuthor({ name: CFG.BOT_NAME })
    .setTitle('📋 DOSSIER DE CANDIDATURE')
    .setDescription('> *Dossier soumis pour examen — En attente de décision*')
    .setThumbnail(user.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: '👤 Nom et Prénom RP',      value: `\`\`\`${data.nom_prenom}\`\`\``,  inline: false },
      { name: '🎂 Âge',                   value: `\`\`\`${data.age} ans\`\`\``,     inline: true  },
      { name: '📍 Affectation souhaitée', value: `\`\`\`${data.affectation}\`\`\``, inline: true  },
      { name: '⭐ Spécialité voulue',      value: `\`\`\`${data.specialite}\`\`\``,  inline: false },
      { name: '🆔 Compte Discord',         value: `<@${user.id}> — \`${user.tag}\``, inline: false },
      { name: '📅 Date de candidature',    value: `\`\`\`${nowFR()}\`\`\``,          inline: false },
    )
    .setFooter({ text: `${CFG.BOT_NAME} • Service des Ressources Humaines` })
    .setTimestamp();
}

/** Boutons Accepter / Refuser */
function buildDecisionRow(userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`accept_${userId}`)
      .setLabel('✅ Accepter la candidature')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`refuse_${userId}`)
      .setLabel('❌ Refuser la candidature')
      .setStyle(ButtonStyle.Danger),
  );
}

/** Embed résultat ACCEPTÉ */
function buildAcceptEmbed(data, nigend) {
  return new EmbedBuilder()
    .setColor(CFG.COLOR_OK)
    .setAuthor({ name: CFG.BOT_NAME })
    .setTitle('✅ CANDIDATURE ACCEPTÉE')
    .setDescription(`> La candidature de **${data.nom_prenom}** a été **acceptée**.\n> L'intéressé est convoqué à l'École de Formation.`)
    .addFields(
      { name: '👤 Identité',            value: data.nom_prenom, inline: true  },
      { name: '🔢 NIGEND attribué',     value: `\`${nigend}\``, inline: true  },
      { name: '📍 Affectation',         value: data.affectation, inline: false },
      { name: '⭐ Spécialité',          value: data.specialite,  inline: false },
      { name: '📅 Date de décision',    value: `\`${nowFR()}\``, inline: false },
    )
    .setFooter({ text: `${CFG.BOT_NAME} • Service RH — Décision définitive` })
    .setTimestamp();
}

/** Embed résultat REFUSÉ */
function buildRefuseEmbed(data) {
  return new EmbedBuilder()
    .setColor(CFG.COLOR_KO)
    .setAuthor({ name: CFG.BOT_NAME })
    .setTitle('❌ CANDIDATURE REFUSÉE')
    .setDescription(`> La candidature de **${data.nom_prenom}** a été **refusée**.\n> L'intéressé est libre de représenter une candidature ultérieurement.`)
    .addFields(
      { name: '👤 Identité',         value: data.nom_prenom, inline: true  },
      { name: '📅 Date de décision', value: `\`${nowFR()}\``, inline: false },
    )
    .setFooter({ text: `${CFG.BOT_NAME} • Service RH — Décision définitive` })
    .setTimestamp();
}

/** Notification DM au candidat */
async function dmCandidat(userId, accepted, nigend, nomPrenom) {
  try {
    const user = await client.users.fetch(userId);
    if (accepted) {
      await user.send({
        embeds: [new EmbedBuilder()
          .setColor(CFG.COLOR_OK)
          .setTitle('✅ Votre candidature a été acceptée !')
          .setDescription(
            `Félicitations **${nomPrenom}** !\n\n` +
            `Votre candidature à la **Gendarmerie Nationale** a été **acceptée**.\n\n` +
            `Votre **NIGEND** : \`${nigend}\`\n\n` +
            `Vous avez été affecté à l'École de Formation. Bonne continuation !`
          )
          .setFooter({ text: CFG.BOT_NAME })
          .setTimestamp()],
      });
    } else {
      await user.send({
        embeds: [new EmbedBuilder()
          .setColor(CFG.COLOR_KO)
          .setTitle('❌ Votre candidature n\'a pas été retenue')
          .setDescription(
            `Bonjour **${nomPrenom}**,\n\n` +
            `Nous avons le regret de vous informer que votre candidature à la **Gendarmerie Nationale** n'a pas été retenue à ce stade.\n\n` +
            `Vous êtes libre de représenter votre candidature ultérieurement.`
          )
          .setFooter({ text: CFG.BOT_NAME })
          .setTimestamp()],
      });
    }
  } catch {
    console.warn(`⚠️ Impossible d'envoyer un DM à ${userId}`);
  }
}

/** Date/heure FR */
function nowFR() {
  return new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Retirer tous les rôles du membre (sauf @everyone + rôles non gérables) */
async function removeAllRoles(member) {
  const toRemove = member.roles.cache.filter(r =>
    r.id !== member.guild.id &&       // exclure @everyone
    r.managed === false &&            // exclure rôles gérés par bots/intégrations
    r.position < member.guild.members.me.roles.highest.position // bot peut gérer
  );
  for (const [, role] of toRemove) {
    await member.roles.remove(role).catch(() => {});
  }
}

/** Récupérer le forum d'inscription */
async function getForumChannel(guild) {
  const id = CFG.FORUM_INSCRIPTION_ID;
  if (!id) return null;
  let ch = guild.channels.cache.get(id);
  if (!ch) ch = await guild.channels.fetch(id).catch(() => null);
  return ch?.type === ChannelType.GuildForum ? ch : null;
}

// ═══════════════════════════════════════════════════════════════════════════
//  EVENTS
// ═══════════════════════════════════════════════════════════════════════════

client.on('interactionCreate', async (interaction) => {

  // ── COMMANDES SLASH ────────────────────────────────────────────────────────

  if (interaction.isChatInputCommand()) {

    // /panel_inscription — poster un panel bouton dans le salon
    if (interaction.commandName === 'panel_inscription') {
      const embed = new EmbedBuilder()
        .setColor(CFG.COLOR)
        .setAuthor({ name: CFG.BOT_NAME })
        .setTitle('🎖️ RECRUTEMENT — GENDARMERIE NATIONALE')
        .setDescription(
          '> Vous souhaitez rejoindre la **Gendarmerie Nationale** ?\n\n' +
          'Cliquez sur le bouton ci-dessous pour soumettre votre dossier de candidature.\n' +
          'Un formulaire s\'ouvrira, complétez-le avec soin.\n\n' +
          '> ⚠️ Assurez-vous de renseigner vos informations **RP exactes**.'
        )
        .addFields(
          { name: '📋 Pièces demandées', value: '› Nom et Prénom RP\n› Âge RP\n› Affectation souhaitée\n› Spécialité voulue', inline: false }
        )
        .setFooter({ text: `${CFG.BOT_NAME} • Service des Ressources Humaines` })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ouvrir_formulaire')
          .setLabel('📋 Déposer ma candidature')
          .setStyle(ButtonStyle.Primary),
      );

      await interaction.reply({ content: '✅ Panel posté.', ephemeral: true });
      await interaction.channel.send({ embeds: [embed], components: [row] });
      return;
    }

    // /inscription — ouvrir directement le modal
    if (interaction.commandName === 'inscription') {
      // Vérifier si déjà une inscription en cours ou acceptée
      const existing = Q.getByUser.get(interaction.user.id);
      if (existing && existing.statut === 'accepte') {
        return interaction.reply({ content: '✅ Vous avez déjà été accepté dans la Gendarmerie Nationale.', ephemeral: true });
      }
      if (existing && existing.statut === 'en_attente') {
        return interaction.reply({ content: '⏳ Vous avez déjà une candidature en cours d\'examen.', ephemeral: true });
      }
      await showModal(interaction);
      return;
    }
  }

  // ── BOUTON — Ouvrir formulaire ──────────────────────────────────────────────
  if (interaction.isButton() && interaction.customId === 'ouvrir_formulaire') {
    const existing = Q.getByUser.get(interaction.user.id);
    if (existing && existing.statut === 'accepte') {
      return interaction.reply({ content: '✅ Vous êtes déjà membre de la Gendarmerie Nationale.', ephemeral: true });
    }
    if (existing && existing.statut === 'en_attente') {
      return interaction.reply({ content: '⏳ Votre dossier est déjà en cours d\'examen. Merci de patienter.', ephemeral: true });
    }
    await showModal(interaction);
    return;
  }

  // ── BOUTON — Accepter candidature ──────────────────────────────────────────
  if (interaction.isButton() && interaction.customId.startsWith('accept_')) {
    await interaction.deferReply({ ephemeral: true });

    const targetId = interaction.customId.replace('accept_', '');
    const data     = Q.getByUser.get(targetId);

    if (!data) return interaction.editReply({ content: '❌ Candidature introuvable en base.' });
    if (data.statut !== 'en_attente') return interaction.editReply({ content: `❌ Ce dossier est déjà traité (${data.statut}).` });

    const guild  = interaction.guild;
    const member = await guild.members.fetch(targetId).catch(() => null);

    if (!member) return interaction.editReply({ content: '❌ Impossible de trouver le membre sur le serveur.' });

    // Générer le NIGEND
    const nigend = generateNIGEND();

    // 1. Mettre à jour la DB
    Q.accept.run(nigend, targetId);

    // 2. Retirer tous les rôles
    await removeAllRoles(member);

    // 3. Ajouter rôles école
    const rolesToAdd = [CFG.ROLE_ECOLE_1, CFG.ROLE_ECOLE_2].filter(Boolean);
    for (const roleId of rolesToAdd) {
      const role = guild.roles.cache.get(roleId);
      if (role) await member.roles.add(role).catch(e => console.warn(`⚠️ Rôle ${roleId} non ajouté:`, e.message));
    }

    // 4. Renommer le membre : "Nom Prénom [NIGEND]"
    const newNick = `${data.nom_prenom} [${nigend}]`;
    await member.setNickname(newNick).catch(e => console.warn('⚠️ Impossible de renommer:', e.message));

    // 5. Mettre à jour l'embed du post forum
    try {
      const thread = await guild.channels.fetch(data.thread_id).catch(() => null);
      if (thread) {
        const msgs = await thread.messages.fetch({ limit: 10 });
        const botMsg = msgs.find(m => m.author.id === client.user.id && m.embeds.length > 0);
        if (botMsg) {
          await botMsg.edit({
            embeds: [buildAcceptEmbed(data, nigend)],
            components: [], // retirer les boutons
          });
        }
      }
    } catch (e) {
      console.warn('⚠️ Impossible de modifier le post forum:', e.message);
    }

    // 6. DM au candidat
    await dmCandidat(targetId, true, nigend, data.nom_prenom);

    await interaction.editReply({
      content: `✅ Candidature de **${data.nom_prenom}** acceptée.\nNIGEND : \`${nigend}\` — Renommé en \`${newNick}\``,
    });
    return;
  }

  // ── BOUTON — Refuser candidature ───────────────────────────────────────────
  if (interaction.isButton() && interaction.customId.startsWith('refuse_')) {
    await interaction.deferReply({ ephemeral: true });

    const targetId = interaction.customId.replace('refuse_', '');
    const data     = Q.getByUser.get(targetId);

    if (!data) return interaction.editReply({ content: '❌ Candidature introuvable en base.' });
    if (data.statut !== 'en_attente') return interaction.editReply({ content: `❌ Ce dossier est déjà traité (${data.statut}).` });

    const guild  = interaction.guild;
    const member = await guild.members.fetch(targetId).catch(() => null);

    if (!member) return interaction.editReply({ content: '❌ Membre introuvable sur le serveur.' });

    // 1. DB
    Q.refuse.run(targetId);

    // 2. Retirer tous les rôles
    await removeAllRoles(member);

    // 3. Ajouter rôles de refus
    const rolesToAdd = [CFG.ROLE_REFUSE_1, CFG.ROLE_REFUSE_2].filter(Boolean);
    for (const roleId of rolesToAdd) {
      const role = guild.roles.cache.get(roleId);
      if (role) await member.roles.add(role).catch(e => console.warn(`⚠️ Rôle ${roleId} non ajouté:`, e.message));
    }

    // 4. Mettre à jour l'embed du post forum
    try {
      const thread = await guild.channels.fetch(data.thread_id).catch(() => null);
      if (thread) {
        const msgs = await thread.messages.fetch({ limit: 10 });
        const botMsg = msgs.find(m => m.author.id === client.user.id && m.embeds.length > 0);
        if (botMsg) {
          await botMsg.edit({
            embeds: [buildRefuseEmbed(data)],
            components: [],
          });
        }
      }
    } catch (e) {
      console.warn('⚠️ Impossible de modifier le post forum:', e.message);
    }

    // 5. DM
    await dmCandidat(targetId, false, null, data.nom_prenom);

    await interaction.editReply({
      content: `❌ Candidature de **${data.nom_prenom}** refusée. Rôles mis à jour.`,
    });
    return;
  }

  // ── MODAL SUBMIT — Formulaire d'inscription ────────────────────────────────
  if (interaction.isModalSubmit() && interaction.customId === 'modal_inscription') {
    await interaction.deferReply({ ephemeral: true });

    const nom_prenom  = interaction.fields.getTextInputValue('nom_prenom').trim();
    const age         = interaction.fields.getTextInputValue('age').trim();
    const affectation = interaction.fields.getTextInputValue('affectation').trim();
    const specialite  = interaction.fields.getTextInputValue('specialite').trim();

    // Vérif doublon (peut arriver si deux soumissions rapides)
    const existing = Q.getByUser.get(interaction.user.id);
    if (existing && existing.statut === 'en_attente') {
      return interaction.editReply({ content: '⏳ Votre dossier est déjà en cours d\'examen.' });
    }
    if (existing && existing.statut === 'accepte') {
      return interaction.editReply({ content: '✅ Vous êtes déjà membre de la Gendarmerie Nationale.' });
    }

    const guild  = interaction.guild;
    const member = guild.members.cache.get(interaction.user.id)
                 || await guild.members.fetch(interaction.user.id).catch(() => null);

    // Créer le post dans le forum
    let threadId = null;
    try {
      const forum = await getForumChannel(guild);

      if (!forum) throw new Error(`Forum introuvable (FORUM_INSCRIPTION_ID: "${CFG.FORUM_INSCRIPTION_ID}")`);

      const embed = buildCandidatureEmbed(
        { nom_prenom, age, affectation, specialite },
        interaction.user
      );
      const row = buildDecisionRow(interaction.user.id);

      const thread = await forum.threads.create({
        name: nom_prenom,   // Titre du post = Nom Prénom RP
        message: { embeds: [embed], components: [row] },
      });

      threadId = thread.id;
    } catch (e) {
      console.error('❌ Erreur création post forum:', e.message);
      // Fallback : poster dans le salon courant si forum introuvable
      try {
        const embed = buildCandidatureEmbed({ nom_prenom, age, affectation, specialite }, interaction.user);
        const row   = buildDecisionRow(interaction.user.id);
        const msg   = await interaction.channel.send({ embeds: [embed], components: [row] });
        threadId    = msg.channelId; // fallback approximatif
        console.warn('⚠️ Fallback: candidature postée en message classique.');
      } catch (e2) {
        console.error('❌ Fallback échoué:', e2.message);
      }
    }

    // Enregistrer en DB
    Q.insert.run(
      interaction.user.id,
      interaction.user.tag,
      nom_prenom,
      age,
      affectation,
      specialite,
      threadId,
    );

    await interaction.editReply({
      content: `✅ **Dossier déposé avec succès.**\nVotre candidature pour **${nom_prenom}** est en cours d'examen. Vous serez notifié par message privé dès qu'une décision sera rendue.`,
    });
    return;
  }
});

// ─── AFFICHER LE MODAL ────────────────────────────────────────────────────────
async function showModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('modal_inscription')
    .setTitle('📋 Dossier de candidature — GN')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('nom_prenom')
          .setLabel('Nom et Prénom RP (ex : DUPONT Jean)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('DUPONT Jean')
          .setRequired(true)
          .setMaxLength(80)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('age')
          .setLabel('Âge RP')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ex : 24')
          .setRequired(true)
          .setMaxLength(3)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('affectation')
          .setLabel('Affectation souhaitée')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ex : Brigade de Gendarmerie de Paris')
          .setRequired(true)
          .setMaxLength(120)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('specialite')
          .setLabel('Spécialité voulue')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Ex : Gendarmerie Mobile, PSIG, Gendarmerie Maritime...')
          .setRequired(true)
          .setMaxLength(300)
      ),
    );

  await interaction.showModal(modal);
}

// ─── READY ────────────────────────────────────────────────────────────────────
client.once('ready', async () => {
  console.log(`✅ Connecté : ${client.user.tag}`);
  client.user.setActivity('Recrutement GN', { type: ActivityType.Watching });
  await registerCommands();
});

// ─── START ────────────────────────────────────────────────────────────────────
client.login(CFG.TOKEN).catch(e => {
  console.error('❌ Connexion échouée :', e.message);
  process.exit(1);
});
