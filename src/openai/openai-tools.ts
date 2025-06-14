export const openAITools = [
  {
    type: 'function',
    function: {
      name: 'createCalendarEvent',
      description: 'Create a new event in the calendar',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          time: { type: 'string', description: 'ISO date-time' },
        },
        required: ['title', 'time'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generateAudio',
      description: 'Generate voice audio from a message',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string' },
        },
        required: ['text'],
      },
    },
  },
];
