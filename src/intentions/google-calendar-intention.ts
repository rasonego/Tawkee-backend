// Updated intention configuration for Google Calendar
export const createGoogleCalendarIntention = {
  description: "Schedule meetings in Google Calendar",
  preprocessingMessage: "MANUAL",
  preprocessingText: "I need to schedule a meeting in Google Calendar with the provided details",
  type: "WEBHOOK",
  httpMethod: "POST",
  url: "https://www.googleapis.com/calendar/v3/calendars/primary/events",
  
  // Updated request body with proper validation
  requestBody: JSON.stringify({
    summary: "{{meetingTitle}}",
    description: "{{meetingDescription}}",
    start: {
      dateTime: "{{startDateTime}}",
      timeZone: "{{timeZone}}"
    },
    end: {
      dateTime: "{{endDateTime}}",
      timeZone: "{{timeZone}}"
    },
    attendees: "{{attendeesList}}", // Handle multiple attendees
    sendUpdates: "all", // Send invitations to attendees
    conferenceData: { // Optional: Add Google Meet
      createRequest: {
        requestId: "{{requestId}}",
        conferenceSolutionKey: {
          type: "hangoutsMeet"
        }
      }
    }
  }),
  
  autoGenerateParams: false,
  autoGenerateBody: false,
  
  // Enhanced fields with better validation
  fields: [
    {
      name: "Meeting Title",
      jsonName: "meetingTitle",
      description: "The title/subject of the meeting",
      type: "TEXT",
      required: true,
      validation: {
        minLength: 1,
        maxLength: 1024
      }
    },
    {
      name: "Meeting Description",
      jsonName: "meetingDescription",
      description: "Detailed description of the meeting",
      type: "TEXT",
      required: false,
      validation: {
        maxLength: 8192
      }
    },
    {
      name: "Start Date Time",
      jsonName: "startDateTime",
      description: "Meeting start time in ISO 8601 format (e.g., 2024-01-15T10:00:00)",
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
      description: "Meeting end time in ISO 8601 format (e.g., 2024-01-15T11:00:00)",
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
      description: "Time zone for the meeting (e.g., America/New_York, Europe/London)",
      type: "TEXT",
      required: true,
      validation: {
        pattern: "^[A-Za-z_]+/[A-Za-z_]+$"
      },
      defaultValue: "UTC"
    },
    {
      name: "Attendee Emails",
      jsonName: "attendeesList", 
      description: "Comma-separated list of attendee email addresses",
      type: "TEXT", // Will be processed into array
      required: false,
      validation: {
        emailList: true
      }
    },
    {
      name: "Add Google Meet",
      jsonName: "addGoogleMeet",
      description: "Whether to add a Google Meet video conference",
      type: "BOOLEAN",
      required: false,
      defaultValue: false
    }
  ],
  
  // Headers with dynamic token - this needs special handling
  headers: [
    {
      name: "Authorization",
      value: "Bearer {{DYNAMIC_GOOGLE_ACCESS_TOKEN}}" // Special token that gets resolved at runtime
    },
    {
      name: "Content-Type",
      value: "application/json"
    }
  ],
  
  // Add authentication requirement
  authentication: {
    type: "GOOGLE_OAUTH",
    scopes: [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/calendar.events"
    ],
    required: true
  },
  
  // Enhanced error handling
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
        message: "Time conflict with existing calendar event"
      }
    ]
  },
  
  // Response processing
  responseProcessing: {
    successCondition: "response.status >= 200 && response.status < 300",
    extractData: {
      eventId: "response.data.id",
      eventLink: "response.data.htmlLink",
      meetLink: "response.data.conferenceData?.entryPoints?.[0]?.uri"
    }
  }
};