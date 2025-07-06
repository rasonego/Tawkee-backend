import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationsService } from '../conversations/conversations.service';
import { InteractionsService } from '../interactions/interactions.service';
import { WahaApiService } from '../waha-api/waha-api.service';
import { MediaService } from '../media/media.service';
import { WebsocketService } from '../websocket/websocket.service';
import { Chat, Interaction, Message } from '@prisma/client';
import { ConversationDto } from 'src/conversations/dto/conversation.dto';
import { CreditService } from 'src/credits/credit.service';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly creditService: CreditService,
    private readonly conversationsService: ConversationsService,
    private readonly interactionsService: InteractionsService,
    private readonly wahaApiService: WahaApiService,
    private readonly websocketService: WebsocketService,
    private readonly mediaService: MediaService
  ) {}

  async handleEvolutionWebhook(
    webhookData: any
  ): Promise<{ success: boolean }> {
    try {
      const event = webhookData?.event || 'unknown';
      const instance = webhookData?.instance || 'unknown';

      this.logger.log(`Received webhook: ${event} from instance ${instance}`);

      // Safety checks for required fields
      if (!event || !instance) {
        this.logger.warn('Missing required fields in webhook data');
        return { success: true }; // Return success to avoid retries
      }

      // Handle different event types from Evolution API
      // - messages.upsert: New message received
      // - connection.update: Connection status changed
      // - qr.updated: QR code updated
      // - send.message: Message was sent

      // Extract common data for all event types
      const instanceId = webhookData?.data?.instanceId || '';

      // Try to find the matching channel
      let eventChannel = await this.prisma.channel.findFirst({
        where: {
          config: {
            path: ['evolutionApi', 'instanceName'],
            equals: instance,
          },
        },
      });

      // If not found by instanceName, try to find by instanceId
      if (!eventChannel && instanceId) {
        eventChannel = await this.prisma.channel.findFirst({
          where: {
            config: {
              path: ['evolutionApi', 'instanceId'],
              equals: instanceId,
            },
          },
        });
      }

      // Process connection.update events to update channel status
      if (event === 'connection.update') {
        this.logger.log(
          `Processing connection update for instance: ${instance}`
        );

        const connectionState = webhookData?.data?.state || '';
        const statusReason = webhookData?.data?.statusReason;

        this.logger.log(
          `Connection state: ${connectionState}, Reason: ${statusReason}`
        );

        // Update the channel connection status if found
        if (eventChannel) {
          try {
            // Set connected=true if state is "open", connected=false otherwise
            const isConnected = connectionState === 'open';

            // Get the current config to update it properly
            const currentConfig = eventChannel.config as any;
            const evolutionApiConfig = currentConfig.evolutionApi || {};

            await this.prisma.channel.update({
              where: { id: eventChannel.id },
              data: {
                connected: isConnected,
                // Store the connection details in the config JSON
                config: {
                  ...currentConfig,
                  evolutionApi: {
                    ...evolutionApiConfig,
                    status: connectionState, // Update the status in evolutionApi config
                  },
                  connectionStatus: {
                    state: connectionState,
                    statusReason: statusReason,
                    updatedAt: new Date().toISOString(),
                  },
                },
              },
            });

            this.logger.log(
              `Updated channel ${eventChannel.id} connection status to: ${isConnected ? 'connected' : 'disconnected'}`
            );
          } catch (error) {
            this.logger.error(
              `Failed to update channel connection status: ${error.message}`
            );
          }
        } else {
          this.logger.warn(
            `Received connection update for unknown instance: ${instance}`
          );
        }
      }

      // // Store all events in the database for analysis (unless in test mode)
      // if (!webhookData._testMode) {
      //   try {
      //     // We can only store webhook events if we have a channel
      //     if (eventChannel) {
      //       await this.prisma.webhookEvent.create({
      //         data: {
      //           event: event,
      //           instance: instance,
      //           instanceId: instanceId,
      //           rawData: dataObject,
      //           processed: true, // Mark as processed since we're taking appropriate action
      //           dateTime: new Date(),
      //           apikey: webhookData?.apikey || '',
      //           channel: {
      //             connect: {
      //               id: eventChannel.id,
      //             },
      //           },
      //         },
      //       });

      //       this.logger.debug(`Stored ${event} event for analysis`);
      //     } else {
      //       this.logger.warn(
      //         `Could not store ${event} event: No matching channel found`
      //       );
      //     }
      //   } catch (error) {
      //     this.logger.warn(`Could not store ${event} event: ${error.message}`);
      //     this.logger.error(error);
      //   }
      // } else {
      //   this.logger.debug(
      //     `Test mode enabled - skipping database storage for ${event} event`
      //   );
      // }

      // Only continue processing for messages.upsert events
      if (event !== 'messages.upsert') {
        return { success: true };
      }

      // Skip messages from self (if we can determine that)
      if (webhookData?.data?.key?.fromMe) {
        this.logger.debug('Skipping message from self');
        return { success: true };
      }

      // Find the corresponding channel based on instanceName (which comes in the 'instance' property)
      const channel = await this.prisma.channel.findFirst({
        where: {
          config: {
            path: ['evolutionApi', 'instanceName'],
            equals: instance,
          },
        },
        include: {
          agent: true,
        },
      });

      if (!channel) {
        this.logger.warn(`No matching channel found for instance: ${instance}`);
        return { success: true }; // Return success to avoid retries
      }

      return this.processChannelWithEvolutionWebhook(webhookData, channel);
    } catch (error) {
      this.logger.error(
        `Error processing webhook: ${error.message}`,
        error.stack
      );
      return { success: false };
    }
  }

  async handleWahaWebhook(webhookData: any): Promise<{ success: boolean }> {
    try {
      const event = webhookData?.event || 'unknown';
      const instance = webhookData?.session || 'unknown';
      const metadata = webhookData?.metadata;

      this.logger.log(`Received webhook: ${event} from instance ${instance}`);

      // Safety checks for required fields
      if (!event || !instance) {
        this.logger.warn('Missing required fields in webhook data');
        return { success: true }; // Return success to avoid retries
      }

      // Handle different event types from Waha API
      // - message: New message received
      // - session.status: Connection status changed

      // Find the matching channel
      const eventChannel = await this.prisma.channel.findUnique({
        where: {
          id: metadata.channelId,
        },
      });

      // Process session.status events to update channel status
      if (event === 'session.status') {
        this.logger.log(
          `Processing connection update for instance: ${instance}`
        );

        const connectionState = webhookData?.payload?.status || '';

        this.logger.log(`Connection state: ${connectionState}`);

        // Update the channel connection status if found
        if (eventChannel) {
          try {
            // Set connected=true if state is "WORKING", connected=false otherwise
            const isConnected = connectionState === 'WORKING';

            // Get the current config to update it properly
            const currentConfig = eventChannel.config as any;
            const wahaApiConfig = currentConfig.wahaApi || {};

            await this.prisma.channel.update({
              where: { id: eventChannel.id },
              data: {
                connected: isConnected,
                // Store the connection details in the config JSON
                config: {
                  ...currentConfig,
                  wahaApi: {
                    ...wahaApiConfig,
                    status: connectionState, // Update the status in wahaApi config
                  },
                  connectionStatus: {
                    state: connectionState,
                    updatedAt: new Date().toISOString(),
                  },
                },
              },
            });

            this.logger.log(
              `Updated channel ${eventChannel.id} connection status to: ${isConnected ? 'connected' : 'disconnected'}`
            );

            this.websocketService.sendToClient(
              metadata.workspaceId,
              'channelConnectionStatusUpdate',
              {
                agentId: metadata.agentId,
                channelId: metadata.channelId,
                connectionStatus: connectionState,
              }
            );
          } catch (error) {
            this.logger.error(
              `Failed to update channel connection status: ${error.message}`
            );
          }
        } else {
          this.logger.warn(
            `Received connection update for unknown instance: ${instance}`
          );
        }
      }

      // // Store all events in the database for analysis
      // try {
      //   // We can only store webhook events if we have a channel
      //   if (eventChannel) {
      //     await this.prisma.webhookEvent.create({
      //       data: {
      //         event: event,
      //         instance: instance,
      //         instanceId: 'undefined',
      //         rawData: dataObject,
      //         processed: true, // Mark as processed since we're taking appropriate action
      //         dateTime: new Date(),
      //         apikey: 'undefined',
      //         channel: {
      //           connect: {
      //             id: eventChannel.id,
      //           },
      //         },
      //       },
      //     });

      //     this.logger.debug(`Stored ${event} event for analysis`);
      //   } else {
      //     this.logger.warn(
      //       `Could not store ${event} event: No matching channel found`
      //     );
      //   }
      // } catch (error) {
      //   this.logger.warn(`Could not store ${event} event: ${error.message}`);
      //   this.logger.error(error);
      // }

      // Only continue processing for message events
      if (event !== 'message') {
        return { success: true };
      }

      // Skip messages from self
      if (webhookData?.payload?.fromMe) {
        this.logger.debug('Skipping message from self');
        return { success: true };
      }

      // Find the corresponding channel based on instanceName (which comes in the 'instance' property)
      const channel = await this.prisma.channel.findFirst({
        where: {
          connected: true,
          config: {
            path: ['wahaApi', 'instanceName'],
            equals: instance,
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
        include: {
          agent: true,
        },
      });

      if (!channel) {
        this.logger.warn(`No matching channel found for instance: ${instance}`);
        return { success: true }; // Return success to avoid retries
      }

      return this.processChannelWithWahaWebhook(webhookData, channel);
    } catch (error) {
      this.logger.error(
        `Error processing webhook: ${error.message}`,
        error.stack
      );
      return { success: false };
    }
  }

  private async processWebhookEvent(webhookEventId: string): Promise<void> {
    const webhookEvent = await this.prisma.webhookEvent.findUnique({
      where: { id: webhookEventId },
      include: {
        channel: {
          include: {
            agent: {
              include: {
                settings: true,
                elevenLabsSettings: true,
              },
            },
          },
        },
      },
    });

    if (!webhookEvent) {
      this.logger.error(
        `Could not find webhook event with ID: ${webhookEventId}`
      );
      return;
    }

    if (webhookEvent.processed) {
      this.logger.debug(
        `Webhook event ${webhookEventId} already processed, skipping`
      );
      return;
    }

    if (!webhookEvent.channel) {
      this.logger.error(
        `Webhook event ${webhookEventId} has no associated channel`
      );
      await this.prisma.webhookEvent.update({
        where: { id: webhookEventId },
        data: {
          processed: true,
          processedAt: new Date(),
          error: 'No channel associated with this webhook event',
        },
      });
      return;
    }

    if (!webhookEvent.channel.agent) {
      this.logger.error(
        `Channel ${webhookEvent.channel.id} has no associated agent`
      );
      await this.prisma.webhookEvent.update({
        where: { id: webhookEventId },
        data: {
          processed: true,
          processedAt: new Date(),
          error: 'No agent associated with the channel',
        },
      });
      return;
    }

    let agentIsInactive: boolean = false;
    if (webhookEvent.channel.agent.isActive === false) {
      this.logger.log(
        `Skipping message processing for inactive agent: ${webhookEvent.channel.agent.id}`
      );
      await this.prisma.webhookEvent.update({
        where: { id: webhookEventId },
        data: {
          processed: true,
          processedAt: new Date(),
          error: 'Skipped processing because agent is inactive',
        },
      });
      agentIsInactive = true;
    }

    if (!webhookEvent.remoteJid) {
      this.logger.error(`Webhook event ${webhookEventId} has no remoteJid`);
      await this.prisma.webhookEvent.update({
        where: { id: webhookEventId },
        data: {
          processed: true,
          processedAt: new Date(),
          error: 'Missing remoteJid, cannot identify message source',
        },
      });
      return;
    }

    let insufficientCredits: boolean = false;
    const creditCheck =
      await this.creditService.checkAgentWorkspaceHasSufficientCredits(
        webhookEvent.channel.agent.id
      );
    if (creditCheck.allowed === false) {
      const creditsCost = creditCheck.requiredCredits;
      const creditsAvailable =
        creditCheck.planCreditsAvailable + creditCheck.extraCreditsAvailable;
      const model = creditCheck.model;
      this.logger.log(
        `Skipping message due to lack of credits: ${webhookEvent.channel.agent.id}'s model ${model} required ${creditsCost}, but only ${creditsAvailable} are available.`
      );
      await this.prisma.webhookEvent.update({
        where: { id: webhookEventId },
        data: {
          processed: true,
          processedAt: new Date(),
          error: 'Skipped processing because agent is inactive',
        },
      });
      insufficientCredits = true;
    }

    try {
      if (webhookEvent.event === 'message' && !webhookEvent.fromMe) {
        const remoteJid = webhookEvent.remoteJid;
        const phoneNumber = remoteJid.split('@')[0];

        let chat: Chat;
        let interaction: Partial<Interaction>;
        try {
          this.logger.log(
            `Looking for existing chat with phone: ${phoneNumber} and agent: ${webhookEvent.channel.agentId}`
          );
          chat = await this.prisma.chat.findFirst({
            where: {
              whatsappPhone: phoneNumber,
              agentId: webhookEvent.channel.agentId,
            },
          });

          if (!chat) {
            this.logger.log(
              `No existing chat found, creating new chat for phone: ${phoneNumber}`
            );
            if (!webhookEvent.channel.agent?.workspaceId) {
              throw new Error(
                `Unable to create chat: Missing workspaceId from agent data`
              );
            }
            const chatData = {
              title: `Chat with ${phoneNumber}`,
              contextId: `whatsapp-${phoneNumber}-${webhookEvent.channel.agentId}`,
              whatsappPhone: phoneNumber,
              userName: webhookEvent.pushName || phoneNumber,
              workspaceId: webhookEvent.channel.agent.workspaceId,
              agentId: webhookEvent.channel.agentId,
            };
            this.logger.log(
              `Creating new chat with data: ${JSON.stringify(chatData)}`
            );
            chat = await this.prisma.chat.create({ data: chatData });
            this.logger.log(`Chat created successfully with ID: ${chat.id}`);

          } else {
            this.logger.log(`Found existing chat with ID: ${chat.id}`);
           }
        } catch (error) {
          this.logger.error(
            `Error in chat creation process: ${error.message}`,
            error.stack
          );
          await this.prisma.webhookEvent.update({
            where: { id: webhookEvent.id },
            data: {
              error: `Chat creation failed: ${error.message}`,
              processed: true,
              processedAt: new Date(),
            },
          });
          throw new Error(`Failed to create or find chat: ${error.message}`);
        }

        try {
          interaction = await this.prisma.interaction.findFirst({
            where: {
              chatId: chat.id,
              status: { not: 'RESOLVED' },
            },
            orderBy: { startAt: 'desc' },
            select: {
              id: true,
            },
          });

          if (!interaction) {
            interaction = await this.prisma.interaction.create({
              data: {
                workspaceId: webhookEvent.channel.agent.workspaceId,
                agentId: webhookEvent.channel.agentId,
                chatId: chat.id,
                status: 'WAITING',
              },
            });
            this.logger.log(
              `Interaction ${interaction.id} created successfully for chat: ${chat.id}`
            );
          }
        } catch (error) {
          throw new Error(`Failed to create or find interaction: ${error.message}`);
        }

        let message: Message;
        try {
          this.logger.log(
            `Creating message for chat ${chat.id} with content: "${webhookEvent.messageContent}"`
          );
          if (!webhookEvent.messageContent) {
            this.logger.warn(
              `Empty message content for webhook ID: ${webhookEvent.id}, using fallback text`
            );
          }

          const messageData: Partial<Message> = {
            text: webhookEvent.messageContent || '(Empty message)',
            role: 'user',
            userName: webhookEvent.pushName,
            type: webhookEvent.messageType,
            whatsappMessageId: webhookEvent.messageId,
            whatsappTimestamp: webhookEvent.messageTimestamp,
            chatId: chat.id,
            interactionId: interaction.id,
          };

          if (
            webhookEvent.messageType === 'image' ||
            webhookEvent.messageType === 'video'
          ) {
            messageData.imageUrl = webhookEvent.mediaUrl;
          } else if (webhookEvent.messageType === 'audio') {
            messageData.audioUrl = webhookEvent.mediaUrl;
          } else if (webhookEvent.messageType === 'document') {
            messageData.documentUrl = webhookEvent.mediaUrl;
          }

          message = await this.prisma.message.create({
            data: messageData as Message,
          });
          this.logger.log(
            `Message created successfully with ID: ${message.id}`
          );

          this.logger.log(`Updating chat ${chat.id} as unread`);
          const updatedChat = await this.prisma.chat.update({
            where: { id: chat.id },
            data: {
              read: false,
              unReadCount: { increment: 1 },
              finished: false,
            },
            select: {
              id: true,
              agentId: true,
              title: true,
              name: true,
              userName: true,
              userPicture: true,
              whatsappPhone: true,
              humanTalk: true,
              read: true,
              finished: true,
              unReadCount: true,
            },
          });

          this.logger.log(
            `Linking message ${message.id} to webhook event ${webhookEvent.id}`
          );
          await this.prisma.webhookEvent.update({
            where: { id: webhookEvent.id },
            data: {
              relatedMessageId: message.id,
              processed: true,
              processedAt: new Date(),
            },
          });

          await this.prisma.interaction.update({
            where: { id: interaction.id },
            data: { status: 'WAITING' },
          });

          const latestInteractionUpdated =
            await this.interactionsService.findLatestInteractionByChatWithMessages(
              chat.id
            );

          this.websocketService.sendToClient(
            webhookEvent.channel.agent.workspaceId,
            'messageChatUpdate',
            {
              chat: updatedChat,
              latestInteraction: latestInteractionUpdated,
              latestMessage: {
                ...message,
                whatsappTimestamp: message?.whatsappTimestamp?.toString(),
                time: message?.time?.toString(),
              },
            }
          );
        } catch (error) {
          this.logger.error(
            `Error in message creation process: ${error.message}`,
            error.stack
          );
          await this.prisma.webhookEvent.update({
            where: { id: webhookEvent.id },
            data: {
              error: `Message creation failed: ${error.message}`,
              processed: true,
              processedAt: new Date(),
            },
          });
          throw new Error(`Failed to create message: ${error.message}`);
        }

        if (agentIsInactive) {
          const systemMessage = await this.prisma.message.create({
            data: {
              text: `${webhookEvent.channel.agent.name} is inactive and will not respond to messages.`,
              role: 'system',
              type: 'notification',
              chatId: chat.id,
              interactionId: interaction.id,
              time: Date.now(),
            },
          });

          const updatedChat = await this.prisma.chat.findUnique({
            where: { id: chat.id },
            select: {
              id: true,
              agentId: true,
              title: true,
              name: true,
              userName: true,
              userPicture: true,
              whatsappPhone: true,
              humanTalk: true,
              read: true,
              finished: true,
              unReadCount: true,
            },
          });

          const latestInteractionUpdated =
            await this.interactionsService.findLatestInteractionByChatWithMessages(
              chat.id
            );
          this.websocketService.sendToClient(
            webhookEvent.channel.agent.workspaceId,
            'messageChatUpdate',
            {
              chat: updatedChat,
              latestInteraction: latestInteractionUpdated,
              latestMessage: {
                ...systemMessage,
                whatsappTimestamp: systemMessage?.whatsappTimestamp?.toString(),
                time: systemMessage?.time?.toString(),
              },
            }
          );
          return;
        } else if (insufficientCredits) {
          const creditsAvailable =
            (creditCheck?.planCreditsAvailable || 0) +
            (creditCheck?.extraCreditsAvailable || 0);
          const systemMessage = await this.prisma.message.create({
            data: {
              text: `Workspace lacks credits to process ${webhookEvent.channel.agent.name}'s message using the ${creditCheck.model} model. It required ${creditCheck.requiredCredits} but only ${creditsAvailable} was available at the time.`,
              role: 'system',
              type: 'notification',
              chatId: chat.id,
              interactionId: interaction.id,
              time: Date.now(),
            },
          });
          const latestInteractionUpdated =
            await this.interactionsService.findLatestInteractionByChatWithMessages(
              chat.id
            );

          const updatedChat = await this.prisma.chat.findUnique({
            where: { id: chat.id },
            select: {
              id: true,
              agentId: true,
              title: true,
              name: true,
              userName: true,
              userPicture: true,
              whatsappPhone: true,
              humanTalk: true,
              read: true,
              finished: true,
              unReadCount: true,
            },
          });

          this.websocketService.sendToClient(
            webhookEvent.channel.agent.workspaceId,
            'messageChatUpdate',
            {
              chat: updatedChat,
              latestInteraction: latestInteractionUpdated,
              latestMessage: {
                ...systemMessage,
                whatsappTimestamp: systemMessage?.whatsappTimestamp?.toString(),
                time: systemMessage?.time?.toString(),
              },
            }
          );
          return;
        }

        if (!chat.humanTalk) {
          this.logger.log(
            `Chat ${chat.id} is in automated mode, generating agent response`
          );
          try {
            if (!webhookEvent.channel.agent?.id) {
              throw new Error('Missing agent ID for generating response');
            }
            this.logger.log(
              `Requesting agent response for agent: ${webhookEvent.channel.agent.id}, message: "${webhookEvent.messageContent}"`
            );

            const serializedWebhookEvent = {
              ...webhookEvent,
              messageTimestamp: webhookEvent?.messageTimestamp.toString(),
            };

            let prompt: string = serializedWebhookEvent.messageContent;
            if (serializedWebhookEvent.messageType !== 'chat') {
              const { apiKey } = this.wahaApiService.getWahaConfig();
              const documentTextContent =
                await this.mediaService.extractTextFromMedia(
                  serializedWebhookEvent.mediaUrl,
                  JSON.parse(serializedWebhookEvent.rawData as string)
                    ?.mimetype,
                  apiKey
                );
              prompt += `\nMedia content as text:\n${documentTextContent}`;
            }

            // Determine if audio response is requested
            const respondViaAudio =
              webhookEvent.channel.agent.elevenLabsSettings
                ?.alwaysRespondWithAudio === true ||
              (webhookEvent.messageType === 'audio' &&
                webhookEvent.channel.agent.elevenLabsSettings
                  ?.respondAudioWithAudio === true);

            const agentResponse = await this.conversationsService.converse(
              webhookEvent.channel.agent.id,
              {
                contextId: chat.contextId,
                prompt: prompt || '(Empty message)',
                chatName: webhookEvent.pushName || phoneNumber,
                respondViaAudio, // Pass the new parameter
              } as ConversationDto // Cast to ConversationDto to include respondViaAudio
            );

            if (
              !agentResponse ||
              (!agentResponse.message &&
                (!agentResponse.audios || agentResponse.audios.length === 0))
            ) {
              throw new Error('Empty or invalid response from agent');
            }

            // Handle text message
            if (agentResponse?.audios.length == 0 && agentResponse.message) {
              this.logger.log(
                `Got agent text response: "${agentResponse.message.substring(0, 50)}${agentResponse.message.length > 50 ? '...' : ''}"`
              );
              const botMessage = await this.prisma.message.create({
                data: {
                  text: agentResponse.message,
                  role: 'assistant',
                  type: 'chat',
                  chatId: chat.id,
                  sentToEvolution: false,
                  interactionId: interaction.id,
                },
              });
              this.logger.log(
                `Bot text message created with ID: ${botMessage.id}`
              );

              try {
                this.logger.log(
                  `Sending text response to ${phoneNumber}: "${agentResponse.message}"`
                );
                const responseData =
                  await this.wahaApiService.sendWhatsAppMessage(
                    webhookEvent.channel.agentId,
                    phoneNumber,
                    agentResponse.message
                  );
                if (responseData) {
                  const messageId: string = responseData.id.id;
                  await this.prisma.message.update({
                    where: { id: botMessage.id },
                    data: {
                      sentToEvolution: true,
                      whatsappMessageId: messageId,
                    },
                  });

                  this.creditService.logAndAggregateCredit(
                    webhookEvent.channel.agent.id,
                    {
                      messageId,
                      content: agentResponse.message,
                    }
                  );
                }
              } catch (error) {
                this.logger.error(
                  `Error sending text message to WhatsApp: ${error.message}`,
                  error.stack
                );
              }
            }

            // Handle audio messages
            else if (agentResponse?.audios.length > 0) {
              for (const audioData of agentResponse.audios) {
                this.logger.log(`Got agent audio response.`);
                const botAudioMessage = await this.prisma.message.create({
                  data: {
                    text: agentResponse.message || 'Audio message', // Use text if available, otherwise generic
                    role: 'assistant',
                    type: 'audio',
                    chatId: chat.id,
                    sentToEvolution: false,
                    interactionId: interaction.id,
                    // audioUrl will be updated after sending
                  },
                });
                this.logger.log(
                  `Bot audio message created with ID: ${botAudioMessage.id}`
                );

                try {
                  this.logger.log(`Sending audio response to ${phoneNumber}`);
                  const mediaResponseData =
                    await this.wahaApiService.sendWhatsAppMessage(
                      webhookEvent.channel.agentId,
                      phoneNumber,
                      agentResponse.message,
                      {
                        url: audioData,
                        type: 'audio',
                        mimetype: 'audio/ogg; codecs=opus',
                        caption: 'caption',
                        filename: 'audio.ogg',
                      }
                    );

                  if (mediaResponseData) {
                    const mediaData = mediaResponseData._data;
                    const messageId: string = mediaResponseData.id._serialized;

                    await this.prisma.message.update({
                      where: { id: botAudioMessage.id },
                      data: {
                        sentToEvolution: true,
                        type: mediaResponseData.type, // usually 'ppt'
                        audioUrl: mediaData.deprecatedMms3Url,
                        mimetype: mediaData.mimetype,
                        whatsappMessageId: messageId,
                        whatsappTimestamp: mediaResponseData.timestamp,
                        fileName: 'audio.ogg',
                      },
                    });

                    this.creditService.logAndAggregateCredit(
                      webhookEvent.channel.agent.id,
                      {
                        messageId,
                        content: agentResponse.message,
                      }
                    );
                  }
                } catch (error) {
                  this.logger.error(
                    `Error sending audio message to WhatsApp: ${error.message}`,
                    error.stack
                  );
                }
              }
            }

            const chatMayHaveBeenUpdated = await this.prisma.chat.findUnique({
              where: { id: chat.id}
            });

            await this.prisma.interaction.update({
              where: { id: interaction.id },
              data: { status: chatMayHaveBeenUpdated.humanTalk ? 'WAITING' : 'RUNNING' },
            });

            // Update chat status and send websocket updates after all messages (text and audio) are processed
            // This part remains largely the same, but ensures all messages are sent before updating UI
            this.logger.log(
              `Updating chat ${chat.id} as unread and unfinished`
            );
            await this.prisma.chat.update({
              where: { id: chat.id },
              data: {
                read: false,
                unReadCount: { increment: 1 },
                finished: false,
              },
            });

            const latestInteractionUpdated =
              await this.interactionsService.findLatestInteractionByChatWithMessages(
                chat.id
              );
            const agentAfterResponse = await this.prisma.agent.findFirst({
              where: { id: chat.agentId },
              select: { id: true, workspaceId: true },
            });

            // Fetch the latest message (could be text or audio) to send in websocket update
            const latestMessageSent = await this.prisma.message.findFirst({
              where: { chatId: chat.id, role: 'assistant' },
              orderBy: { createdAt: 'desc' },
            });

            const updatedChat = await this.prisma.chat.findUnique({
              where: { id: chat.id },
              select: {
                id: true,
                agentId: true,
                title: true,
                name: true,
                userName: true,
                userPicture: true,
                whatsappPhone: true,
                humanTalk: true,
                read: true,
                finished: true,
                unReadCount: true,
              },
            });

            this.websocketService.sendToClient(
              agentAfterResponse.workspaceId,
              'messageChatUpdate',
              {
                chat: updatedChat,
                latestInteraction: latestInteractionUpdated,
                latestMessage: {
                  ...latestMessageSent,
                  whatsappTimestamp:
                    latestMessageSent?.whatsappTimestamp?.toString(),
                  time: latestMessageSent?.time?.toString(),
                },
              }
            );
          } catch (error) {
            this.logger.error(
              `Error generating or sending agent response: ${error.message}`,
              error.stack
            );
            // Update webhook event with error
            await this.prisma.webhookEvent.update({
              where: { id: webhookEvent.id },
              data: {
                error: `Agent response failed: ${error.message}`,
                processed: true,
                processedAt: new Date(),
              },
            });
          }
        } else {
          this.logger.log(
            `Chat ${chat.id} is in human talk mode, skipping agent response generation`
          );          
        }
      }
    } catch (error) {
      this.logger.error(
        `Error processing webhook event ${webhookEventId}: ${error.message}`,
        error.stack
      );
      await this.prisma.webhookEvent.update({
        where: { id: webhookEventId },
        data: {
          error: `Processing failed: ${error.message}`,
          processed: true,
          processedAt: new Date(),
        },
      });
    }
  }

  /**
   * Helper function to determine if a message is from a group
   * @param remoteJid The remote JID from the message
   * @param dataObject The data object from the webhook
   * @param webhookData The full webhook data
   * @returns True if the message is from a group, false otherwise
   */
  private isGroupMessage(
    remoteJid: string,
    dataObject: any,
    webhookData: any
  ): boolean {
    // Check 3 conditions to identify group messages:

    // 1. remoteJid ending with @g.us (group) vs @s.whatsapp.net (private)
    const isGroupJid = remoteJid?.endsWith('@g.us');

    // 2. Message has senderKeyDistributionMessage attribute (present in group messages)
    const hasSenderKeyDistribution =
      !!dataObject?.message?.senderKeyDistributionMessage;

    // 3. JSON includes participant attribute (present in group messages)
    const hasParticipant = !!webhookData?.participant;

    // Log the detection for debugging
    if (isGroupJid || hasSenderKeyDistribution || hasParticipant) {
      this.logger.debug(
        `Group message detected: JID=${isGroupJid}, SenderKey=${hasSenderKeyDistribution}, Participant=${hasParticipant}`
      );

      // Additional details for debugging
      this.logger.debug(`Remote JID: ${remoteJid}`);
      if (hasParticipant) {
        this.logger.debug(`Participant: ${webhookData.participant}`);
      }
    }

    // Consider it a group message if any of the indicators are present
    return isGroupJid || hasSenderKeyDistribution || hasParticipant;
  }

  /**
   * Process Evolution webhook for a specific channel
   * @param webhookData The webhook data received from Evolution API
   * @param channel The channel matching the webhook instance
   */

  private async processChannelWithEvolutionWebhook(
    webhookData: any,
    channel: any
  ): Promise<{ success: boolean }> {
    try {
      // Basic validation
      if (!webhookData) {
        this.logger.error(
          `Invalid webhook data: received ${typeof webhookData}`
        );
        return { success: false };
      }

      if (!channel || !channel.id) {
        this.logger.error(`Invalid channel data: ${JSON.stringify(channel)}`);
        return { success: false };
      }

      // Safely extract data with optional chaining, fallbacks, and additional logging
      const event = webhookData?.event || 'unknown';
      if (event === 'unknown') {
        this.logger.warn(`Missing event type in webhook data, using "unknown"`);
      }

      const instance = webhookData?.instance || 'unknown';
      if (instance === 'unknown') {
        this.logger.warn(`Missing instance in webhook data, using "unknown"`);
      }

      const dataObject = webhookData?.data || {};
      if (!webhookData?.data) {
        this.logger.warn(`Missing data object in webhook, using empty object`);
      }

      const instanceId = dataObject?.instanceId || '';
      const keyObject = dataObject?.key || {};
      if (!keyObject || Object.keys(keyObject).length === 0) {
        this.logger.warn(`Missing or empty key object in webhook data`);
      }

      const remoteJid = keyObject?.remoteJid || '';
      if (!remoteJid) {
        this.logger.warn(`Missing remoteJid in webhook data`);
      }

      const fromMe = keyObject?.fromMe || false;
      const messageId = keyObject?.id || '';
      const pushName = dataObject?.pushName || '';

      const messageType = dataObject?.messageType || 'unknown';
      if (messageType === 'unknown') {
        this.logger.warn(
          `Missing messageType in webhook data, using "unknown"`
        );
      }

      // Safely handle timestamps to avoid conversion errors
      let messageTimestamp;
      try {
        messageTimestamp = dataObject?.messageTimestamp || Date.now();
        // Validate that it's a number
        if (isNaN(Number(messageTimestamp))) {
          this.logger.warn(
            `Invalid messageTimestamp format: ${messageTimestamp}, using current time`
          );
          messageTimestamp = Date.now();
        }
      } catch (error) {
        this.logger.warn(
          `Error processing messageTimestamp: ${error.message}, using current time`
        );
        messageTimestamp = Date.now();
      }

      // Check if this is a group message (we need to ignore these)
      const isGroupMessage = this.isGroupMessage(
        remoteJid,
        dataObject,
        webhookData
      );

      // Skip processing for group messages
      if (isGroupMessage) {
        this.logger.log(`Ignoring group message from ${remoteJid}`);
        return { success: true };
      }

      // Optional fields
      const dateTime = webhookData?.date_time
        ? new Date(webhookData.date_time)
        : new Date();
      const destination = webhookData?.destination || '';
      const sender = webhookData?.sender || '';
      const serverUrl = webhookData?.server_url || '';
      const apikey = webhookData?.apikey || '';

      // Extract message content based on message type
      let messageContent = '';
      try {
        const messageObj = dataObject?.message || {};

        if (!messageObj || Object.keys(messageObj).length === 0) {
          this.logger.warn(`Missing or empty message object in webhook data`);
        } else {
          this.logger.debug(
            `Message type: ${messageType}, Keys: ${Object.keys(messageObj).join(', ')}`
          );

          // Handle different message types
          if (messageType === 'conversation' && messageObj.conversation) {
            messageContent = messageObj.conversation;
            this.logger.debug(
              `Extracted conversation text: "${messageContent}"`
            );
          } else if (messageObj.extendedTextMessage?.text) {
            // Handle extended text messages (usually with formatting or links)
            messageContent = messageObj.extendedTextMessage.text;
            this.logger.debug(`Extracted extended text: "${messageContent}"`);
          } else if (messageObj.imageMessage?.caption) {
            // Handle image with caption
            messageContent = messageObj.imageMessage.caption;
            this.logger.debug(
              `Extracted image caption: "${messageContent}" (Image message)`
            );
          } else if (messageObj.videoMessage?.caption) {
            // Handle video with caption
            messageContent = messageObj.videoMessage.caption;
            this.logger.debug(
              `Extracted video caption: "${messageContent}" (Video message)`
            );
          } else if (messageObj.documentMessage?.caption) {
            // Handle document with caption
            messageContent = messageObj.documentMessage.caption;
            this.logger.debug(
              `Extracted document caption: "${messageContent}" (Document message)`
            );
          } else if (messageObj.audioMessage) {
            // Handle audio message (typically no text)
            messageContent = '(Audio message)';
            this.logger.debug(`Received audio message without text`);
          } else if (messageObj.stickerMessage) {
            // Handle sticker message
            messageContent = '(Sticker)';
            this.logger.debug(`Received sticker message`);
          } else if (
            messageObj.contactMessage ||
            messageObj.contactsArrayMessage
          ) {
            // Handle contact share
            messageContent = '(Contact shared)';
            this.logger.debug(`Received contact message`);
          } else if (messageObj.locationMessage) {
            // Handle location share
            const loc = messageObj.locationMessage;
            const hasName = loc.name && loc.name.trim() !== '';
            messageContent = hasName
              ? `(Location: ${loc.name})`
              : '(Location shared)';
            this.logger.debug(`Received location message: ${messageContent}`);
          } else {
            // Unknown message type
            this.logger.warn(
              `Unknown message type encountered, message keys: ${Object.keys(messageObj).join(', ')}`
            );
            messageContent = '(Message received)';
          }
        }
      } catch (error) {
        this.logger.error(
          `Error extracting message content: ${error.message}`,
          error.stack
        );
        messageContent = '(Message content extraction failed)';
      }

      // Log the received data for debugging
      this.logger.debug(
        `Processing webhook: ${event} for channel ${channel.id} with message: "${messageContent}"`
      );

      // Build the webhook event data object
      const webhookEventData = {
        event: event,
        instance: instance,
        instanceId: instanceId,
        rawData: JSON.stringify(dataObject),
        remoteJid: remoteJid,
        fromMe: fromMe,
        messageId: messageId,
        pushName: pushName,
        messageType: messageType,
        messageContent: messageContent,
        messageTimestamp: messageTimestamp.toString(),
        dateTime: dateTime,
        destination: destination,
        sender: sender,
        serverUrl: serverUrl,
        apikey: apikey,
        channel: {
          connect: {
            id: channel.id,
          },
        },
      };

      // Log for debugging
      this.logger.debug(
        `Preparing to save webhook event: ${JSON.stringify({
          event,
          instance,
          messageType,
          messageContent: messageContent?.substring(0, 50),
          remoteJid,
        })}`
      );

      // Save the webhook event with all necessary safety checks
      let webhookEvent;
      try {
        webhookEvent = await this.prisma.webhookEvent.create({
          data: webhookEventData,
        });

        this.logger.log(
          `Webhook event saved successfully with ID: ${webhookEvent.id}`
        );

        // Process the webhook to create or update a chat
        this.logger.log(`Processing webhook event ID: ${webhookEvent.id}`);
        await this.processWebhookEvent(webhookEvent.id);
      } catch (error) {
        this.logger.error(
          `Failed to save webhook event: ${error.message}`,
          error.stack
        );

        // Try to save a simplified version without the raw data if it might be too large
        if (
          error.message.includes('too large') ||
          error.message.includes('size exceeds')
        ) {
          this.logger.warn(
            `Attempting to save webhook event without raw data due to size constraints`
          );
          try {
            const simplifiedData = {
              ...webhookEventData,
              rawData: JSON.stringify({ message_too_large: true }),
            };
            webhookEvent = await this.prisma.webhookEvent.create({
              data: simplifiedData,
            });

            this.logger.log(
              `Simplified webhook event saved with ID: ${webhookEvent.id}`
            );

            // Process the webhook to create or update a chat
            this.logger.log(
              `Processing simplified webhook event ID: ${webhookEvent.id}`
            );
            await this.processWebhookEvent(webhookEvent.id);
          } catch (innerError) {
            this.logger.error(
              `Failed to save simplified webhook event: ${innerError.message}`,
              innerError.stack
            );
            throw innerError; // Re-throw to be caught by outer catch
          }
        } else {
          // Re-throw original error if it's not related to size
          throw error;
        }
      }

      return { success: true };
    } catch (error) {
      this.logger.error(
        `Error processing webhook channel data: ${error.message}`,
        error.stack
      );
      return { success: false };
    }
  }

  /**
   * Process Waha webhook for a specific channel
   * @param webhookData The webhook data received from Waha API
   * @param channel The channel matching the webhook instance
   */

  private async processChannelWithWahaWebhook(
    webhookData: any,
    channel: any
  ): Promise<{ success: boolean }> {
    try {
      // Basic validation
      if (!webhookData) {
        this.logger.error(
          `Invalid webhook data: received ${typeof webhookData}`
        );
        return { success: false };
      }

      if (!channel || !channel.id) {
        this.logger.error(`Invalid channel data: ${JSON.stringify(channel)}`);
        return { success: false };
      }

      // Safely extract data with optional chaining, fallbacks, and additional logging
      const event = webhookData?.event || 'unknown';
      if (event === 'unknown') {
        this.logger.warn(`Missing event type in webhook data, using "unknown"`);
      }

      const instance = webhookData?.session || 'unknown';
      if (instance === 'unknown') {
        this.logger.warn(`Missing instance in webhook data, using "unknown"`);
      }

      const dataObject = webhookData?.payload || {};
      if (!dataObject) {
        this.logger.warn(`Missing data object in webhook, using empty object`);
      }

      const remoteJid = dataObject?.from || '';
      if (!remoteJid) {
        this.logger.warn(`Missing remoteJid in webhook data`);
      }

      const fromMe = dataObject?.fromMe || false;
      const messageId = dataObject?.id || '';
      const pushName = dataObject?._data?.notifyName || '';

      let messageType: string;
      if (dataObject?._data?.type) {
        if (dataObject._data.type == 'location') {
          this.logger.warn(`Skipping location message`);
          return { success: false };
        } else if (dataObject._data.type == 'vcard') {
          this.logger.warn('Skipping contact message');
          return { success: false };
        }

        messageType =
          dataObject._data.type === 'ptt' ? 'audio' : dataObject._data.type;
      } else if (dataObject.hasMedia) {
        if (dataObject.media && dataObject.media.mimetype) {
          const mimetype = dataObject.media.mimetype;
          if (mimetype.startsWith('image/')) {
            messageType = 'image';
          } else if (mimetype.startsWith('video/')) {
            messageType = 'video';
          } else if (mimetype.startsWith('audio/')) {
            messageType = 'audio';
          } else {
            messageType = 'document';
          }
        } else {
          messageType = 'unknown';
        }
      } else {
        messageType = 'chat';
      }

      if (messageType === 'unknown') {
        this.logger.warn(
          `Missing messageType in webhook data, using "unknown"`
        );
      }

      // Safely handle timestamps to avoid conversion errors
      let messageTimestamp;
      try {
        messageTimestamp = webhookData?.timestamp || Date.now();
        // Validate that it's a number
        if (isNaN(Number(messageTimestamp))) {
          this.logger.warn(
            `Invalid messageTimestamp format: ${messageTimestamp}, using current time`
          );
          messageTimestamp = Date.now();
        }
      } catch (error) {
        this.logger.warn(
          `Error processing messageTimestamp: ${error.message}, using current time`
        );
        messageTimestamp = Date.now();
      }

      // Check if this is a group message (we need to ignore these)
      const isPrivateMessage = dataObject?.from.endsWith('@c.us');

      // Skip processing for group messages or others (e.g. status broadcasts)
      if (!isPrivateMessage) {
        this.logger.log(`Ignoring non-private message from ${remoteJid}`);
        return { success: true };
      }

      // Optional fields
      const dateTime = new Date();
      const destination = dataObject?.to || '';
      const sender = dataObject?.from || '';

      // Extract message content based on message type
      let messageContent = '';
      try {
        const messageObj = dataObject?.media || {};
        this.logger.debug(
          `Message type: ${messageType}, Keys: ${Object.keys(messageObj).join(', ')}`
        );

        // Handle different message types
        if (messageType === 'chat') {
          messageContent = dataObject.body;
          this.logger.debug(`Extracted conversation text: "${messageContent}"`);
        } else if (messageType === 'image') {
          // Handle image with caption
          messageContent = dataObject.body;
          this.logger.debug(
            `Extracted image caption: "${messageContent}" (Image message)`
          );
        } else if (messageType === 'video') {
          // Handle video with caption
          messageContent = dataObject.body;
          this.logger.debug(
            `Extracted video caption: "${messageContent}" (Video message)`
          );
        } else if (messageType === 'document') {
          // Handle document with caption
          messageContent = dataObject.body;
          this.logger.debug(
            `Extracted document caption: "${messageContent}" (Document message)`
          );
        } else if (messageType === 'audio') {
          // Handle audio message (typically no text)
          const { apiKey } = this.wahaApiService.getWahaConfig();
          const textContent =
            await this.mediaService.extractTextFromMedia(
              dataObject.media.url,
              JSON.parse(dataObject.media.mimetype as string)
                ?.mimetype,
              apiKey
            );
          messageContent = textContent || '(Audio message)';
        } else {
          // Unknown message type
          this.logger.warn(
            `Unknown message type encountered, message keys: ${Object.keys(messageObj).join(', ')}`
          );
          messageContent = '(Message received)';
        }
      } catch (error) {
        this.logger.error(
          `Error extracting message content: ${error.message}`,
          error.stack
        );
        messageContent = '(Message content extraction failed)';
      }

      // Log the received data for debugging
      this.logger.debug(
        `Processing webhook: ${event} for channel ${channel.id} with message: "${messageContent}"`
      );

      // Build the webhook event data object
      const webhookEventData = {
        event: event,
        instance: instance,
        instanceId: 'undefined',
        rawData: JSON.stringify(dataObject?.media),
        remoteJid: remoteJid,
        fromMe: fromMe,
        messageId: messageId,
        pushName: pushName,
        messageType: messageType,
        messageContent: messageContent,
        mediaUrl: dataObject?.media?.url,
        messageTimestamp: BigInt(messageTimestamp),
        dateTime: dateTime,
        destination: destination,
        sender: sender,
        serverUrl: 'undefined',
        apikey: 'undefined',
        channel: {
          connect: {
            id: channel.id,
          },
        },
      };

      // Log for debugging
      this.logger.debug(
        `Preparing to save webhook event: ${JSON.stringify({
          event,
          instance,
          messageType,
          messageContent: messageContent?.substring(0, 50),
          remoteJid,
        })}`
      );

      // Save the webhook event with all necessary safety checks
      let webhookEvent;
      try {
        webhookEvent = await this.prisma.webhookEvent.create({
          data: webhookEventData,
        });

        this.logger.log(
          `Webhook event saved successfully with ID: ${webhookEvent.id}`
        );

        // Process the webhook to create or update a chat
        this.logger.log(`Processing webhook event ID: ${webhookEvent.id}`);
        await this.processWebhookEvent(webhookEvent.id);
      } catch (error) {
        this.logger.error(
          `Failed to save webhook event: ${error.message}`,
          error.stack
        );

        // Try to save a simplified version without the raw data if it might be too large
        if (
          error.message.includes('too large') ||
          error.message.includes('size exceeds')
        ) {
          this.logger.warn(
            `Attempting to save webhook event without raw data due to size constraints`
          );
          try {
            const simplifiedData = {
              ...webhookEventData,
              rawData: JSON.stringify({ message_too_large: true }),
            };
            webhookEvent = await this.prisma.webhookEvent.create({
              data: simplifiedData,
            });

            this.logger.log(
              `Simplified webhook event saved with ID: ${webhookEvent.id}`
            );

            // Process the webhook to create or update a chat
            this.logger.log(
              `Processing simplified webhook event ID: ${webhookEvent.id}`
            );
            await this.processWebhookEvent(webhookEvent.id);
          } catch (innerError) {
            this.logger.error(
              `Failed to save simplified webhook event: ${innerError.message}`,
              innerError.stack
            );
            throw innerError; // Re-throw to be caught by outer catch
          }
        } else {
          // Re-throw original error if it's not related to size
          throw error;
        }
      }

      return { success: true };
    } catch (error) {
      this.logger.error(
        `Error processing webhook channel data: ${error.message}`,
        error.stack
      );
      return { success: false };
    }
  }
}
