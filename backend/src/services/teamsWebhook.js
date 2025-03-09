const express = require('express');
const router = express.Router();
const teamsService = require('./teams');
const messageAdapter = require('./messageAdapter');
const { pubsub } = require('../resolvers');
const { EVENTS } = require('../constants');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');

// Teams webhook endpoint
router.post('/webhooks/teams', async (req, res) => {
  try {
    // Verify webhook signature
    if (!teamsService.verifyWebhookSignature(req.headers['authorization'], req.body)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Handle validation request from Teams
    if (req.query.validationToken) {
      return res.set('Content-Type', 'text/plain').send(req.query.validationToken);
    }

    // Process the notification
    const { value: notifications } = req.body;
    await Promise.all(notifications.map(processTeamsNotification));

    res.status(200).send();
  } catch (error) {
    console.error('Teams webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

async function processTeamsNotification(notification) {
  const { resourceData, resourceUrl, changeType } = notification;

  try {
    switch (changeType) {
      case 'created':
        if (resourceUrl.includes('/messages')) {
          await handleNewMessage(resourceData);
        } else if (resourceUrl.includes('/chats')) {
          await handleNewChat(resourceData);
        }
        break;

      case 'updated':
        if (resourceUrl.includes('/messages')) {
          await handleMessageUpdate(resourceData);
        }
        break;

      case 'deleted':
        if (resourceUrl.includes('/messages')) {
          await handleMessageDelete(resourceData);
        }
        break;
    }
  } catch (error) {
    console.error('Error processing Teams notification:', error);
  }
}

async function handleNewMessage(teamsMessage) {
  try {
    // Find the corresponding conversation
    const conversation = await Conversation.findOne({
      'metadata.teamsId': teamsMessage.chatId
    });

    if (!conversation) {
      console.error('Conversation not found for Teams chat:', teamsMessage.chatId);
      return;
    }

    // Convert Teams message to our format
    const adaptedMessage = messageAdapter.fromTeamsFormat(teamsMessage);

    // Create new message in our system
    const message = await Message.create({
      content: adaptedMessage.content,
      sender: await findOrCreateUser(teamsMessage.from),
      conversation: conversation.id,
      platform: 'teams',
      metadata: {
        ...adaptedMessage.metadata,
        teamsMessageId: teamsMessage.id
      },
      mentions: adaptedMessage.mentions,
      attachments: adaptedMessage.attachments,
      createdAt: new Date(teamsMessage.createdDateTime)
    });

    // Populate message with related data
    await message.populate('sender');

    // Update conversation's last message
    await Conversation.findByIdAndUpdate(conversation.id, {
      lastMessage: message.id,
      updatedAt: new Date()
    });

    // Publish updates through our real-time channels
    pubsub.publish(EVENTS.MESSAGE_CREATED, {
      messageCreated: message,
      conversationId: conversation.id
    });

  } catch (error) {
    console.error('Error handling new Teams message:', error);
    throw error;
  }
}

async function handleMessageUpdate(teamsMessage) {
  try {
    // Find the message in our system
    const message = await Message.findOne({
      'metadata.teamsMessageId': teamsMessage.id
    });

    if (!message) {
      console.error('Message not found for Teams update:', teamsMessage.id);
      return;
    }

    // Convert and update the message
    const adaptedMessage = messageAdapter.fromTeamsFormat(teamsMessage);
    
    const updatedMessage = await Message.findByIdAndUpdate(
      message.id,
      {
        content: adaptedMessage.content,
        metadata: {
          ...message.metadata,
          ...adaptedMessage.metadata
        },
        mentions: adaptedMessage.mentions,
        attachments: adaptedMessage.attachments,
        updatedAt: new Date()
      },
      { new: true }
    ).populate('sender');

    // Publish update
    pubsub.publish(EVENTS.MESSAGE_UPDATED, {
      messageUpdated: updatedMessage,
      conversationId: message.conversation
    });

  } catch (error) {
    console.error('Error handling Teams message update:', error);
    throw error;
  }
}

async function handleMessageDelete(teamsMessage) {
  try {
    // Find and delete the message
    const message = await Message.findOne({
      'metadata.teamsMessageId': teamsMessage.id
    });

    if (!message) {
      console.error('Message not found for Teams deletion:', teamsMessage.id);
      return;
    }

    const conversationId = message.conversation;
    await Message.findByIdAndDelete(message.id);

    // Publish deletion
    pubsub.publish(EVENTS.MESSAGE_DELETED, {
      messageDeleted: message.id,
      conversationId
    });

  } catch (error) {
    console.error('Error handling Teams message deletion:', error);
    throw error;
  }
}

async function handleNewChat(teamsChat) {
  try {
    // Create or update conversation in our system
    const conversation = await Conversation.findOneAndUpdate(
      { 'metadata.teamsId': teamsChat.id },
      {
        title: teamsChat.topic || 'Teams Chat',
        platform: 'teams',
        metadata: {
          teamsId: teamsChat.id,
          webUrl: teamsChat.webUrl
        }
      },
      { upsert: true, new: true }
    );

    // Add participants
    const participants = await Promise.all(
      teamsChat.members.map(async member => {
        const user = await findOrCreateUser(member);
        return {
          user: user.id,
          role: member.roles.includes('owner') ? 'organizer' : 'attendee'
        };
      })
    );

    conversation.participants = participants;
    await conversation.save();

  } catch (error) {
    console.error('Error handling new Teams chat:', error);
    throw error;
  }
}

// Helper to find or create user from Teams data
async function findOrCreateUser(teamsUser) {
  // Implementation will depend on your user management system
  // This is a placeholder that should be implemented based on your needs
  return {
    id: teamsUser.id,
    name: teamsUser.displayName
  };
}

module.exports = router;