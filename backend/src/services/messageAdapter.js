const sanitizeHtml = require('sanitize-html');
const { decode } = require('html-entities');

class MessageAdapter {
  constructor() {
    this.allowedHtmlTags = ['b', 'i', 'code', 'pre', 'a', 'ul', 'ol', 'li'];
  }

  toTeamsFormat(message) {
    let content = message.content;

    // Convert markdown-style formatting to HTML
    content = content
      .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
      .replace(/\*(.*?)\*/g, '<i>$1</i>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/```([\s\S]+?)```/g, '<pre>$1</pre>');

    // Handle mentions
    if (message.mentions) {
      message.mentions.forEach(mention => {
        content = content.replace(
          `@${mention.name}`,
          `<at id="${mention.id}">${mention.name}</at>`
        );
      });
    }

    return {
      content,
      contentType: 'html',
      importance: message.priority === 'high' ? 'high' : 'normal'
    };
  }

  fromTeamsFormat(teamsMessage) {
    // Extract basic message content
    let content = teamsMessage.body.content;

    // Convert Teams-specific HTML to our format
    content = sanitizeHtml(content, {
      allowedTags: this.allowedHtmlTags,
      allowedAttributes: {
        'a': ['href'],
        'at': ['id']
      }
    });

    // Convert HTML to markdown-style formatting
    content = content
      .replace(/<b>(.*?)<\/b>/g, '**$1**')
      .replace(/<i>(.*?)<\/i>/g, '*$1*')
      .replace(/<code>(.*?)<\/code>/g, '`$1`')
      .replace(/<pre>([\s\S]+?)<\/pre>/g, '```$1```');

    // Handle Teams mentions
    const mentions = [];
    const mentionRegex = /<at id="([^"]+)">([^<]+)<\/at>/g;
    let match;

    while ((match = mentionRegex.exec(content)) !== null) {
      mentions.push({
        id: match[1],
        name: match[2]
      });
      content = content.replace(match[0], `@${match[2]}`);
    }

    // Clean up any remaining HTML and decode entities
    content = decode(content.replace(/<[^>]+>/g, ''));

    return {
      content: content.trim(),
      mentions,
      attachments: this.extractAttachments(teamsMessage),
      metadata: {
        importance: teamsMessage.importance || 'normal',
        locale: teamsMessage.locale,
        messageType: teamsMessage.messageType
      }
    };
  }

  extractAttachments(teamsMessage) {
    const attachments = [];

    if (teamsMessage.attachments && teamsMessage.attachments.length > 0) {
      teamsMessage.attachments.forEach(attachment => {
        attachments.push({
          id: attachment.id,
          type: this.mapAttachmentType(attachment.contentType),
          name: attachment.name,
          contentUrl: attachment.contentUrl,
          size: attachment.size,
          metadata: {
            contentType: attachment.contentType,
            thumbnailUrl: attachment.thumbnailUrl
          }
        });
      });
    }

    return attachments;
  }

  mapAttachmentType(teamsContentType) {
    const typeMap = {
      'image/png': 'image',
      'image/jpeg': 'image',
      'image/gif': 'image',
      'application/pdf': 'document',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'document',
      'video/mp4': 'video',
      'audio/mpeg': 'audio'
    };

    return typeMap[teamsContentType] || 'file';
  }

  // Handle rich text formatting
  formatRichText(content, format = 'html') {
    switch (format) {
      case 'html':
        return this.toTeamsFormat({ content }).content;
      case 'markdown':
        return content
          .replace(/<b>(.*?)<\/b>/g, '**$1**')
          .replace(/<i>(.*?)<\/i>/g, '*$1*')
          .replace(/<code>(.*?)<\/code>/g, '`$1`')
          .replace(/<pre>([\s\S]+?)<\/pre>/g, '```$1```');
      default:
        return content;
    }
  }
}

module.exports = new MessageAdapter();