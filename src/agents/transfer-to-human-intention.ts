// local-intentions/start-human-attendance.intention.ts

import { FieldType } from "@prisma/client";
import { ChatsService } from "src/chats/chats.service";
import { IntentionDto } from "src/intentions/dto/intention.dto";

export function createStartHumanAttendanceIntention(chatService: ChatsService): IntentionDto {
  return {
    toolName: 'start_human_attendance',
    type: 'LOCAL',
    description: 'Escalate the conversation to a human agent when the user requests to speak to a person or expresses frustration.',
    preprocessingMessage: 'MANUAL',
    preprocessingText: 'The user has requested to speak to a human or is clearly dissatisfied. Inform them that the conversation has been transferred and ask them to wait for a human agent to respond.',
    outputHint: 'Reply briefly and clearly that the conversation has been handed off to a human agent and that they should wait a moment.',
    autoGenerateParams: false,
    autoGenerateBody: false,
    fields: [
      {
        name: 'Chat ID',
        jsonName: 'chatId',
        type: FieldType.TEXT,
        required: true,
        description: 'The ID of the chat',
      },
    ],
    localHandler: async ({ chatId }) => {
      return await chatService.transferAttendanceToHuman(chatId);
    },
  };
}

