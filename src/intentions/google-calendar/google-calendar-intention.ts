export const createGoogleCalendarIntention = {
  toolName: 'schedule_google_meeting',
  description: 'Schedule meetings in Google Calendar',
  preprocessingMessage: 'MANUAL',
  preprocessingText:
    'I need to schedule a meeting in Google Calendar with the provided details.',
  type: 'WEBHOOK',
  httpMethod: 'POST',
  url: 'https://www.googleapis.com/calendar/v3/calendars/primary/events',

  preconditions: [
    {
      name: 'Check Time Slot Availability',
      url: 'https://www.googleapis.com/calendar/v3/freeBusy',
      httpMethod: 'POST',
      headers: [
        {
          name: 'Authorization',
          value: 'Bearer {{DYNAMIC_GOOGLE_ACCESS_TOKEN}}',
        },
        {
          name: 'Content-Type',
          value: 'application/json',
        },
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
      failureMessage:
        'The selected time slot is unavailable in Google Calendar. Please choose a different time.',
    },
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
      name: 'Meeting Title',
      jsonName: 'meetingTitle',
      description: 'The title/subject of the meeting',
      type: 'TEXT',
      required: true,
      validation: { minLength: 1, maxLength: 1024 },
    },
    {
      name: 'Meeting Description',
      jsonName: 'meetingDescription',
      description: 'Detailed description of the meeting',
      type: 'TEXT',
      required: false,
      validation: { maxLength: 8192 },
    },
    {
      name: 'Start Date Time',
      jsonName: 'startDateTime',
      description: 'ISO 8601 meeting start time (e.g., 2025-06-10T14:00:00)',
      type: 'DATETIME',
      required: true,
      validation: {
        format: 'iso8601',
        futureOnly: true,
      },
    },
    {
      name: 'End Date Time',
      jsonName: 'endDateTime',
      description: 'ISO 8601 meeting end time',
      type: 'DATETIME',
      required: true,
      validation: {
        format: 'iso8601',
        afterField: 'startDateTime',
      },
    },
    {
      name: 'Time Zone',
      jsonName: 'timeZone',
      description: 'Time zone (e.g., America/Bahia)',
      type: 'TEXT',
      required: true,
      defaultValue: 'UTC',
      validation: {
        pattern: '^[A-Za-z_]+/[A-Za-z_]+$',
      },
    },
    {
      name: 'Attendee Emails',
      jsonName: 'attendeesList',
      description: 'Comma-separated list of emails',
      type: 'TEXT',
      required: false,
      validation: { emailList: true },
    },
    {
      name: 'Add Google Meet',
      jsonName: 'addGoogleMeet',
      description: 'Add Google Meet link?',
      type: 'BOOLEAN',
      required: false,
      defaultValue: false,
    },
    {
      name: 'Request ID',
      jsonName: 'requestId',
      description: 'Unique ID for Google Meet creation (UUID recommended)',
      type: 'TEXT',
      required: false,
    },
    {
      name: 'Contact Name',
      jsonName: 'contactName',
      description: 'The name of the user requesting the meeting',
      type: 'TEXT',
      required: false,
    },
    {
      name: 'Contact Phone',
      jsonName: 'contactPhone',
      description: 'The phone number of the user requesting the meeting',
      type: 'TEXT',
      required: false,
    },
  ],

  headers: [
    {
      name: 'Authorization',
      value: 'Bearer {{DYNAMIC_GOOGLE_ACCESS_TOKEN}}',
    },
    {
      name: 'Content-Type',
      value: 'application/json',
    },
  ],

  authentication: {
    type: 'GOOGLE_OAUTH',
    scopes: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events.freebusy',
      'https://www.googleapis.com/auth/calendar.freebusy',
    ],
    required: true,
  },

  errorHandling: {
    retryPolicy: {
      maxRetries: 3,
      backoffStrategy: 'exponential',
    },
    errorMappings: [
      {
        condition: 'response.status === 401',
        action: 'REFRESH_TOKEN_AND_RETRY',
        message:
          'Authentication expired, please reconnect your Google Calendar',
      },
      {
        condition: 'response.status === 403',
        action: 'FAIL',
        message: 'Insufficient permissions to access Google Calendar',
      },
      {
        condition: 'response.status === 409',
        action: 'FAIL',
        message: 'Time conflict with an existing calendar event',
      },
    ],
  },

  responseProcessing: {
    successCondition: 'response.status >= 200 && response.status < 300',
    extractData: {
      eventId: 'response.data.id',
      eventLink: 'response.data.htmlLink',
      meetLink: 'response.data.conferenceData?.entryPoints?.[0]?.uri',
    },
  },
};

export const suggestAvailableGoogleMeetingSlotsIntention = {
  toolName: 'suggest_available_google_meeting_slots',
  description: 'Suggest next available meeting times from Google Calendar',
  preprocessingMessage: 'MANUAL',
  preprocessingText:
    'I need to fetch and suggest the next available meeting slots from Google Calendar.',
  type: 'WEBHOOK',
  httpMethod: 'POST',
  url: 'https://www.googleapis.com/calendar/v3/freeBusy',

  requestBody: `{
    "timeMin": "{{startSearch}}",
    "timeMax": "{{endSearch}}",
    "timeZone": "{{timeZone}}",
    "items": [{ "id": "primary" }]
  }`,

  autoGenerateParams: false,
  autoGenerateBody: false,

  fields: [
    {
      name: 'Start Search Window',
      jsonName: 'startSearch',
      description: 'ISO 8601 start of the availability window',
      type: 'DATETIME',
      required: true,
      validation: {
        format: 'iso8601',
        futureOnly: true,
      },
    },
    {
      name: 'End Search Window',
      jsonName: 'endSearch',
      description: 'ISO 8601 end of the availability window',
      type: 'DATETIME',
      required: true,
      validation: {
        format: 'iso8601',
        afterField: 'startSearch',
      },
    },
    {
      name: 'Time Zone',
      jsonName: 'timeZone',
      description: 'Time zone to evaluate availability',
      type: 'TEXT',
      required: true,
      defaultValue: 'UTC',
      validation: {
        pattern: '^[A-Za-z_]+/[A-Za-z_]+$',
      },
    },
    {
      name: 'Meeting Duration (Minutes)',
      jsonName: 'durationMinutes',
      description: 'Duration in minutes for suggested time slots',
      type: 'NUMBER',
      required: false,
      defaultValue: 30,
    },
  ],

  headers: [
    {
      name: 'Authorization',
      value: 'Bearer {{DYNAMIC_GOOGLE_ACCESS_TOKEN}}',
    },
    {
      name: 'Content-Type',
      value: 'application/json',
    },
  ],

  authentication: {
    type: 'GOOGLE_OAUTH',
    scopes: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events.freebusy',
    ],
    required: true,
  },

  responseProcessing: {
    successCondition: 'response.status >= 200 && response.status < 300',
    extractData: {
      busyTimes: 'response.data.calendars.primary.busy',
    },
  },
};

export const cancelGoogleCalendarMeetingIntention = {
  toolName: 'cancel_google_meeting',
  description:
    'Cancel a scheduled meeting in Google Calendar by searching for matching events.',
  preprocessingMessage: 'MANUAL',
  preprocessingText:
    "I need to find and cancel a scheduled meeting in Google Calendar based on the user's phone number and time range.",
  type: 'WEBHOOK',
  httpMethod: 'DELETE',
  url: 'https://www.googleapis.com/calendar/v3/calendars/primary/events/{{preconditions[0].dynamicEventId}}',

  autoGenerateParams: false,
  autoGenerateBody: false,

  headers: [
    {
      name: 'Authorization',
      value: 'Bearer {{DYNAMIC_GOOGLE_ACCESS_TOKEN}}',
    },
  ],

  queryParams: [
    {
      name: 'sendUpdates',
      value: '{{sendUpdates}}', // must be "all", "none", or "externalOnly"
    },
  ],

  fields: [
    {
      name: 'Contact Phone',
      jsonName: 'contactPhone',
      description:
        'Phone number used to identify the meeting (must be included in meeting description)',
      type: 'TEXT',
      required: true,
    },
    {
      name: 'Start Time',
      jsonName: 'timeMin',
      description: 'Earliest meeting start time (RFC3339 format)',
      type: 'DATETIME',
      required: true,
      defaultValue: '{{currentDateTime}}',
      validation: {
        format: 'iso8601',
      },
    },
    {
      name: 'End Time',
      jsonName: 'timeMax',
      description: 'Latest meeting start time (RFC3339 format)',
      type: 'DATETIME',
      required: true,
      defaultValue: '{{addDays(currentDateTime, 1)}}',
      validation: {
        format: 'iso8601',
      },
    },
    {
      name: 'Send Cancellation Notice',
      jsonName: 'sendUpdates',
      description: 'Who should receive meeting cancellation notifications',
      type: 'TEXT',
      required: false,
      defaultValue: 'all',
      validation: {
        enum: ['all', 'externalOnly', 'none'],
      },
    },
  ],

  preconditions: [
    {
      name: 'Find and Validate Meeting to Cancel',
      url: 'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      httpMethod: 'GET',
      headers: [
        {
          name: 'Authorization',
          value: 'Bearer {{DYNAMIC_GOOGLE_ACCESS_TOKEN}}',
        },
      ],
      queryParams: [
        { name: 'timeMin', value: '{{timeMin}}' },
        { name: 'timeMax', value: '{{timeMax}}' },
        { name: 'q', value: '{{contactPhone}}' },
        { name: 'singleEvents', value: 'true' },
        { name: 'orderBy', value: 'startTime' },
        { name: 'showDeleted', value: 'false' },
        { name: 'maxResults', value: '50' },
      ],
      failureCondition: `
        !preJson.items || 
        preJson.items.length === 0 ||
        !preJson.items.find(meeting => 
          meeting.status !== 'cancelled' &&
          meeting.start?.dateTime &&
          new Date(meeting.start.dateTime) > new Date()
        )
      `,
      failureMessage:
        'No matching upcoming meeting found with that phone number and time range.',
      successAction: `
        const validMeetings = preJson.items.filter(meeting =>
          meeting.status !== 'cancelled' &&
          meeting.start?.dateTime &&
          new Date(meeting.start.dateTime) > new Date()
        );

        validMeetings.sort((a, b) => new Date(a.start.dateTime) - new Date(b.start.dateTime));
        const selectedMeeting = validMeetings[0];

        this.dynamicEventId = selectedMeeting.id;
        this.selectedMeetingTitle = selectedMeeting.summary;
        this.selectedMeetingDate = selectedMeeting.start.dateTime;
        this.selectedMeetingDescription = selectedMeeting.description;
      `,
    },
  ],

  authentication: {
    type: 'GOOGLE_OAUTH',
    scopes: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar.readonly',
    ],
    required: true,
  },

  errorHandling: {
    retryPolicy: {
      maxRetries: 2,
      backoffStrategy: 'exponential',
    },
    errorMappings: [
      {
        condition: 'response.status === 401',
        action: 'REFRESH_TOKEN_AND_RETRY',
        message:
          'Authentication expired, please reconnect your Google Calendar',
      },
      {
        condition: 'response.status === 403',
        action: 'FAIL',
        message: 'Insufficient permissions to cancel meetings',
      },
      {
        condition: 'response.status === 404',
        action: 'FAIL',
        message: 'Meeting not found or already cancelled',
      },
      {
        condition: 'response.status === 410',
        action: 'FAIL',
        message: 'Meeting has already been cancelled',
      },
    ],
  },

  responseProcessing: {
    successCondition: 'response.status === 204 || response.status === 200',
    extractData: {
      cancelled: 'true',
      cancelledMeetingTitle: 'preconditions[0].selectedMeetingTitle',
      cancelledMeetingDate: 'preconditions[0].selectedMeetingDate',
      cancellationTime: 'new Date().toISOString()',
    },
  },
};

export const checkGoogleCalendarEventsIntention = {
  toolName: 'check_google_calendar_events',
  description:
    'Check existing meeting events in Google Calendar by searching for events within a time range and optional phone number filter.',
  preprocessingMessage: 'MANUAL',
  preprocessingText:
    "I'm searching for existing meetings in Google Calendar based on your criteria.",
  type: 'WEBHOOK',
  httpMethod: 'GET',
  url: 'https://www.googleapis.com/calendar/v3/calendars/primary/events',

  autoGenerateParams: false,
  autoGenerateBody: false,

  headers: [
    {
      name: 'Authorization',
      value: 'Bearer {{DYNAMIC_GOOGLE_ACCESS_TOKEN}}',
    },
  ],

  queryParams: [
    {
      name: 'timeMin',
      value: '{{timeMin}}',
    },
    {
      name: 'timeMax',
      value: '{{timeMax}}',
    },
    {
      name: 'q',
      value: '{{searchQuery}}',
    },
    {
      name: 'singleEvents',
      value: 'true',
    },
    {
      name: 'orderBy',
      value: 'startTime',
    },
    {
      name: 'showDeleted',
      value: 'false',
    },
    {
      name: 'maxResults',
      value: '{{maxResults}}',
    },
  ],

  fields: [
    {
      name: 'Start Time',
      jsonName: 'timeMin',
      description:
        'Earliest meeting start time to search from (RFC3339 format)',
      type: 'DATETIME',
      required: true,
      defaultValue: '{{currentDateTime}}',
      validation: {
        format: 'iso8601',
      },
    },
    {
      name: 'End Time',
      jsonName: 'timeMax',
      description: 'Latest meeting start time to search until (RFC3339 format)',
      type: 'DATETIME',
      required: true,
      defaultValue: '{{addDays(currentDateTime, 7)}}',
      validation: {
        format: 'iso8601',
      },
    },
    {
      name: 'Search Query',
      jsonName: 'searchQuery',
      description:
        'Optional search term to filter events (e.g., phone number, meeting title, or participant name)',
      type: 'TEXT',
      required: false,
      defaultValue: '',
    },
    {
      name: 'Max Results',
      jsonName: 'maxResults',
      description: 'Maximum number of events to return',
      type: 'TEXT',
      required: false,
      defaultValue: '50',
      validation: {
        pattern: '^[1-9][0-9]*$',
      },
    },
    {
      name: 'Include Past Events',
      jsonName: 'includePast',
      description: 'Whether to include events that have already started/ended',
      type: 'BOOLEAN',
      required: false,
      defaultValue: false,
    },
  ],

  authentication: {
    type: 'GOOGLE_OAUTH',
    scopes: [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar',
    ],
    required: true,
  },

  errorHandling: {
    retryPolicy: {
      maxRetries: 2,
      backoffStrategy: 'exponential',
    },
    errorMappings: [
      {
        condition: 'response.status === 401',
        action: 'REFRESH_TOKEN_AND_RETRY',
        message:
          'Authentication expired, please reconnect your Google Calendar',
      },
      {
        condition: 'response.status === 403',
        action: 'FAIL',
        message: 'Insufficient permissions to read calendar events',
      },
      {
        condition: 'response.status === 404',
        action: 'FAIL',
        message: 'Calendar not found',
      },
    ],
  },

  responseProcessing: {
    successCondition: 'response.status === 200',
    extractData: {
      totalEvents: 'json.items ? json.items.length : 0',
      events: `
        json.items ? json.items.map(event => ({
          id: event.id,
          title: event.summary || 'No Title',
          startTime: event.start?.dateTime || event.start?.date,
          endTime: event.end?.dateTime || event.end?.date,
          description: event.description || '',
          location: event.location || '',
          status: event.status,
          attendees: event.attendees ? event.attendees.map(a => a.email) : [],
          organizer: event.organizer?.email || '',
          isUpcoming: event.start?.dateTime ? new Date(event.start.dateTime) > new Date() : false,
          hasVideoConference: event.conferenceData ? true : false,
          meetingLink: event.conferenceData?.entryPoints?.[0]?.uri || ''
        })) : []
      `,
      upcomingEvents: `
        json.items ? json.items.filter(event => 
          event.status !== 'cancelled' &&
          event.start?.dateTime &&
          new Date(event.start.dateTime) > new Date()
        ).length : 0
      `,
      searchCriteria: {
        timeRange: '{{timeMin}} to {{timeMax}}',
        searchQuery: '{{searchQuery}}',
        maxResults: '{{maxResults}}',
      },
    },
  },
};
