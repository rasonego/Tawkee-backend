export const createGoogleCalendarIntention = {
  toolName: "schedule_google_meeting",
  description: "Schedule meetings in Google Calendar",
  preprocessingMessage: "MANUAL",
  preprocessingText: "I need to schedule a meeting in Google Calendar with the provided details.",
  type: "WEBHOOK",
  httpMethod: "POST",
  url: "https://www.googleapis.com/calendar/v3/calendars/primary/events",

  preconditions: [
    {
      name: "Check Time Slot Availability",
      url: "https://www.googleapis.com/calendar/v3/freeBusy",
      httpMethod: "POST",
      headers: [
        {
          name: "Authorization",
          value: "Bearer {{DYNAMIC_GOOGLE_ACCESS_TOKEN}}"
        },
        {
          name: "Content-Type",
          value: "application/json"
        }
      ],
      requestBody: `{
        "timeMin": "{{startDateTime}}",
        "timeMax": "{{endDateTime}}",
        "timeZone": "{{timeZone}}",
        "items": [
          { "id": "primary" }
        ]
      }`,
      failureCondition: `preJson.calendars.primary.busy.length > 0`,
      failureMessage: "The selected time slot is unavailable in Google Calendar. Please choose a different time."
    }
  ],

  requestBody: `{
    "summary": "{{meetingTitle}}",
    "description": "{{meetingDescription}}\\n\\n---\\nContact Info:\\nName: {{contactName}}\\nPhone: {{contactPhone}}",
    "start": {
      "dateTime": "{{startDateTime}}",
      "timeZone": "{{timeZone}}"
    },
    "end": {
      "dateTime": "{{endDateTime}}",
      "timeZone": "{{timeZone}}"
    },
    "attendees": [
      {{#each attendeesList}}
        { "email": "{{this}}" }{{#unless @last}},{{/unless}}
      {{/each}}
    ],
    "sendUpdates": "all"{{#if addGoogleMeet}},
    "conferenceData": {
      "createRequest": {
        "requestId": "{{requestId}}",
        "conferenceSolutionKey": {
          "type": "hangoutsMeet"
        }
      }
    }
    {{/if}}
  }`,

  autoGenerateParams: false,
  autoGenerateBody: false,

  fields: [
    {
      name: "Meeting Title",
      jsonName: "meetingTitle",
      description: "The title/subject of the meeting",
      type: "TEXT",
      required: true,
      validation: { minLength: 1, maxLength: 1024 }
    },
    {
      name: "Meeting Description",
      jsonName: "meetingDescription",
      description: "Detailed description of the meeting",
      type: "TEXT",
      required: false,
      validation: { maxLength: 8192 }
    },
    {
      name: "Start Date Time",
      jsonName: "startDateTime",
      description: "ISO 8601 meeting start time (e.g., 2025-06-10T14:00:00)",
      type: "DATETIME",
      required: true,
      validation: {
        format: "iso8601",
        futureOnly: true
      }
    },
    {
      name: "End Date Time",
      jsonName: "endDateTime",
      description: "ISO 8601 meeting end time",
      type: "DATETIME",
      required: true,
      validation: {
        format: "iso8601",
        afterField: "startDateTime"
      }
    },
    {
      name: "Time Zone",
      jsonName: "timeZone",
      description: "Time zone (e.g., America/Bahia)",
      type: "TEXT",
      required: true,
      defaultValue: "UTC",
      validation: {
        pattern: "^[A-Za-z_]+/[A-Za-z_]+$"
      }
    },
    {
      name: "Attendee Emails",
      jsonName: "attendeesList",
      description: "Comma-separated list of emails",
      type: "TEXT",
      required: false,
      validation: { emailList: true }
    },
    {
      name: "Add Google Meet",
      jsonName: "addGoogleMeet",
      description: "Add Google Meet link?",
      type: "BOOLEAN",
      required: false,
      defaultValue: false
    },
    {
      name: "Request ID",
      jsonName: "requestId",
      description: "Unique ID for Google Meet creation (UUID recommended)",
      type: "TEXT",
      required: false
    },
    {
      name: "Contact Name",
      jsonName: "contactName",
      description: "The name of the user requesting the meeting",
      type: "TEXT",
      required: false
    },
    {
      name: "Contact Phone",
      jsonName: "contactPhone",
      description: "The phone number of the user requesting the meeting",
      type: "TEXT",
      required: false
    }
  ],

  headers: [
    {
      name: "Authorization",
      value: "Bearer {{DYNAMIC_GOOGLE_ACCESS_TOKEN}}"
    },
    {
      name: "Content-Type",
      value: "application/json"
    }
  ],

  authentication: {
    type: "GOOGLE_OAUTH",
    scopes: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events.freebusy',
      'https://www.googleapis.com/auth/calendar.freebusy'
    ],
    required: true
  },

  errorHandling: {
    retryPolicy: {
      maxRetries: 3,
      backoffStrategy: "exponential"
    },
    errorMappings: [
      {
        condition: "response.status === 401",
        action: "REFRESH_TOKEN_AND_RETRY",
        message: "Authentication expired, please reconnect your Google Calendar"
      },
      {
        condition: "response.status === 403",
        action: "FAIL",
        message: "Insufficient permissions to access Google Calendar"
      },
      {
        condition: "response.status === 409",
        action: "FAIL",
        message: "Time conflict with an existing calendar event"
      }
    ]
  },

  responseProcessing: {
    successCondition: "response.status >= 200 && response.status < 300",
    extractData: {
      eventId: "response.data.id",
      eventLink: "response.data.htmlLink",
      meetLink: "response.data.conferenceData?.entryPoints?.[0]?.uri"
    }
  }
};
