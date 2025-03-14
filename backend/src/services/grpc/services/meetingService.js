/**
 * gRPC Meeting Service Implementation
 * 
 * This module provides the implementation for meeting-related gRPC methods.
 */

const grpc = require('@grpc/grpc-js');
const db = require('../../../database/postgresql');
const redis = require('../../../database/redis');
const { createSpan } = require('../../../middleware/monitoring/tracing');
const { v4: uuidv4 } = require('uuid');

/**
 * Create a meeting
 * @param {Object} call - gRPC call object
 * @param {Function} callback - Callback function
 */
async function createMeeting(call, callback) {
  await createSpan('grpc.meetingService.createMeeting', { 
    platform: call.request.platform,
    organizerId: call.request.organizer_id
  }, async () => {
    try {
      // Validate request
      if (!call.request.title || !call.request.start_time || !call.request.organizer_id || !call.request.platform) {
        callback({
          code: grpc.status.INVALID_ARGUMENT,
          message: 'Missing required fields: title, start_time, organizer_id, platform'
        });
        return;
      }
      
      // Parse dates
      const startTime = new Date(call.request.start_time);
      const endTime = call.request.end_time ? new Date(call.request.end_time) : null;
      
      if (isNaN(startTime.getTime())) {
        callback({
          code: grpc.status.INVALID_ARGUMENT,
          message: 'Invalid start_time format'
        });
        return;
      }
      
      if (endTime && isNaN(endTime.getTime())) {
        callback({
          code: grpc.status.INVALID_ARGUMENT,
          message: 'Invalid end_time format'
        });
        return;
      }
      
      // Create meeting in database
      const meetingId = uuidv4();
      
      const meetingResult = await db.query(
        `INSERT INTO meetings (
           id, title, description, start_time, end_time, organizer_id, 
           platform, status
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, title, description, start_time, end_time, organizer_id, platform, status`,
        [
          meetingId,
          call.request.title,
          call.request.description || '',
          startTime,
          endTime,
          call.request.organizer_id,
          call.request.platform,
          'SCHEDULED'
        ]
      );
      
      // Create meeting settings
      if (call.request.settings) {
        await db.query(
          `INSERT INTO meeting_settings (
             meeting_id, auto_record, mute_participants_on_entry, enable_waiting_room,
             enable_chat, enable_screen_sharing, preferred_language, auto_translate
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            meetingId,
            call.request.settings.auto_record || false,
            call.request.settings.mute_participants_on_entry || true,
            call.request.settings.enable_waiting_room || false,
            call.request.settings.enable_chat || true,
            call.request.settings.enable_screen_sharing || true,
            call.request.settings.preferred_language || 'en',
            call.request.settings.auto_translate || false
          ]
        );
      } else {
        // Create default settings
        await db.query(
          `INSERT INTO meeting_settings (
             meeting_id, auto_record, mute_participants_on_entry, enable_waiting_room,
             enable_chat, enable_screen_sharing, preferred_language, auto_translate
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            meetingId,
            false,
            true,
            false,
            true,
            true,
            'en',
            false
          ]
        );
      }
      
      // Add organizer as participant
      await db.query(
        `INSERT INTO meeting_participants (
           meeting_id, user_id, role, status
         )
         VALUES ($1, $2, $3, $4)`,
        [
          meetingId,
          call.request.organizer_id,
          'organizer',
          'accepted'
        ]
      );
      
      // Add other participants if provided
      if (call.request.participant_ids && call.request.participant_ids.length > 0) {
        for (const participantId of call.request.participant_ids) {
          // Skip if participant is the organizer
          if (participantId === call.request.organizer_id) {
            continue;
          }
          
          await db.query(
            `INSERT INTO meeting_participants (
               meeting_id, user_id, role, status
             )
             VALUES ($1, $2, $3, $4)`,
            [
              meetingId,
              participantId,
              'attendee',
              'pending'
            ]
          );
        }
      }
      
      // Get meeting settings
      const settingsResult = await db.query(
        `SELECT auto_record, mute_participants_on_entry, enable_waiting_room,
                enable_chat, enable_screen_sharing, preferred_language, auto_translate
         FROM meeting_settings
         WHERE meeting_id = $1`,
        [meetingId]
      );
      
      // Get participants
      const participantsResult = await db.query(
        `SELECT user_id
         FROM meeting_participants
         WHERE meeting_id = $1`,
        [meetingId]
      );
      
      // Format meeting response
      const meeting = {
        id: meetingResult.rows[0].id,
        title: meetingResult.rows[0].title,
        description: meetingResult.rows[0].description,
        start_time: meetingResult.rows[0].start_time.toISOString(),
        end_time: meetingResult.rows[0].end_time?.toISOString(),
        organizer_id: meetingResult.rows[0].organizer_id,
        platform: meetingResult.rows[0].platform,
        platform_meeting_id: null,
        join_url: null,
        participant_ids: participantsResult.rows.map(p => p.user_id),
        status: meetingResult.rows[0].status,
        settings: settingsResult.rows[0] ? {
          auto_record: settingsResult.rows[0].auto_record,
          mute_participants_on_entry: settingsResult.rows[0].mute_participants_on_entry,
          enable_waiting_room: settingsResult.rows[0].enable_waiting_room,
          enable_chat: settingsResult.rows[0].enable_chat,
          enable_screen_sharing: settingsResult.rows[0].enable_screen_sharing,
          preferred_language: settingsResult.rows[0].preferred_language,
          auto_translate: settingsResult.rows[0].auto_translate
        } : null
      };
      
      // Publish meeting created event
      await redis.publish('meeting:created', {
        meetingId,
        organizerId: call.request.organizer_id,
        platform: call.request.platform,
        startTime: startTime.toISOString(),
        timestamp: new Date().toISOString()
      });
      
      callback(null, meeting);
    } catch (error) {
      console.error('Error in createMeeting:', error);
      callback({
        code: grpc.status.INTERNAL,
        message: `Internal server error: ${error.message}`
      });
    }
  });
}

/**
 * Join a meeting
 * @param {Object} call - gRPC call object
 * @param {Function} callback - Callback function
 */
async function joinMeeting(call, callback) {
  await createSpan('grpc.meetingService.joinMeeting', { 
    meetingId: call.request.meeting_id,
    userId: call.request.user_id
  }, async () => {
    try {
      // Validate request
      if (!call.request.meeting_id || !call.request.user_id) {
        callback({
          code: grpc.status.INVALID_ARGUMENT,
          message: 'Missing required fields: meeting_id, user_id'
        });
        return;
      }
      
      // Check if meeting exists
      const meetingResult = await db.query(
        `SELECT m.id, m.title, m.description, m.start_time, m.end_time, m.organizer_id, 
                m.platform, m.platform_meeting_id, m.join_url, m.status
         FROM meetings m
         WHERE m.id = $1`,
        [call.request.meeting_id]
      );
      
      if (meetingResult.rows.length === 0) {
        callback({
          code: grpc.status.NOT_FOUND,
          message: `Meeting not found: ${call.request.meeting_id}`
        });
        return;
      }
      
      const meeting = meetingResult.rows[0];
      
      // Check if meeting is active or scheduled
      if (meeting.status !== 'SCHEDULED' && meeting.status !== 'ACTIVE') {
        callback({
          code: grpc.status.FAILED_PRECONDITION,
          message: `Cannot join meeting with status: ${meeting.status}`
        });
        return;
      }
      
      // Check if user is a participant
      const participantResult = await db.query(
        `SELECT id, role, status
         FROM meeting_participants
         WHERE meeting_id = $1 AND user_id = $2`,
        [call.request.meeting_id, call.request.user_id]
      );
      
      if (participantResult.rows.length === 0) {
        // Add user as participant if not already
        await db.query(
          `INSERT INTO meeting_participants (
             meeting_id, user_id, role, status
           )
           VALUES ($1, $2, $3, $4)`,
          [
            call.request.meeting_id,
            call.request.user_id,
            'attendee',
            'accepted'
          ]
        );
      } else if (participantResult.rows[0].status === 'declined') {
        // Update participant status
        await db.query(
          `UPDATE meeting_participants
           SET status = 'accepted', updated_at = NOW()
           WHERE meeting_id = $1 AND user_id = $2`,
          [call.request.meeting_id, call.request.user_id]
        );
      }
      
      // Update join time
      await db.query(
        `UPDATE meeting_participants
         SET join_time = NOW(), updated_at = NOW()
         WHERE meeting_id = $1 AND user_id = $2`,
        [call.request.meeting_id, call.request.user_id]
      );
      
      // If meeting is scheduled, change to active
      if (meeting.status === 'SCHEDULED') {
        await db.query(
          `UPDATE meetings
           SET status = 'ACTIVE', updated_at = NOW()
           WHERE id = $1`,
          [call.request.meeting_id]
        );
        
        meeting.status = 'ACTIVE';
      }
      
      // Get meeting settings
      const settingsResult = await db.query(
        `SELECT auto_record, mute_participants_on_entry, enable_waiting_room,
                enable_chat, enable_screen_sharing, preferred_language, auto_translate
         FROM meeting_settings
         WHERE meeting_id = $1`,
        [call.request.meeting_id]
      );
      
      // Get participants
      const participantsResult = await db.query(
        `SELECT user_id
         FROM meeting_participants
         WHERE meeting_id = $1`,
        [call.request.meeting_id]
      );
      
      // Format meeting response
      const formattedMeeting = {
        id: meeting.id,
        title: meeting.title,
        description: meeting.description,
        start_time: meeting.start_time.toISOString(),
        end_time: meeting.end_time?.toISOString(),
        organizer_id: meeting.organizer_id,
        platform: meeting.platform,
        platform_meeting_id: meeting.platform_meeting_id,
        join_url: meeting.join_url,
        participant_ids: participantsResult.rows.map(p => p.user_id),
        status: meeting.status,
        settings: settingsResult.rows[0] ? {
          auto_record: settingsResult.rows[0].auto_record,
          mute_participants_on_entry: settingsResult.rows[0].mute_participants_on_entry,
          enable_waiting_room: settingsResult.rows[0].enable_waiting_room,
          enable_chat: settingsResult.rows[0].enable_chat,
          enable_screen_sharing: settingsResult.rows[0].enable_screen_sharing,
          preferred_language: settingsResult.rows[0].preferred_language,
          auto_translate: settingsResult.rows[0].auto_translate
        } : null
      };
      
      // Publish meeting joined event
      await redis.publish('meeting:joined', {
        meetingId: call.request.meeting_id,
        userId: call.request.user_id,
        timestamp: new Date().toISOString()
      });
      
      callback(null, {
        join_url: meeting.join_url || `https://uc-hub.example.com/meeting/${meeting.id}`,
        meeting: formattedMeeting
      });
    } catch (error) {
      console.error('Error in joinMeeting:', error);
      callback({
        code: grpc.status.INTERNAL,
        message: `Internal server error: ${error.message}`
      });
    }
  });
}

/**
 * End a meeting
 * @param {Object} call - gRPC call object
 * @param {Function} callback - Callback function
 */
async function endMeeting(call, callback) {
  await createSpan('grpc.meetingService.endMeeting', { 
    meetingId: call.request.meeting_id,
    userId: call.request.user_id
  }, async () => {
    try {
      // Validate request
      if (!call.request.meeting_id || !call.request.user_id) {
        callback({
          code: grpc.status.INVALID_ARGUMENT,
          message: 'Missing required fields: meeting_id, user_id'
        });
        return;
      }
      
      // Check if meeting exists
      const meetingResult = await db.query(
        `SELECT m.id, m.organizer_id, m.status
         FROM meetings m
         WHERE m.id = $1`,
        [call.request.meeting_id]
      );
      
      if (meetingResult.rows.length === 0) {
        callback({
          code: grpc.status.NOT_FOUND,
          message: `Meeting not found: ${call.request.meeting_id}`
        });
        return;
      }
      
      const meeting = meetingResult.rows[0];
      
      // Check if meeting is active
      if (meeting.status !== 'ACTIVE') {
        callback({
          code: grpc.status.FAILED_PRECONDITION,
          message: `Cannot end meeting with status: ${meeting.status}`
        });
        return;
      }
      
      // Check if user is the organizer or has permission
      if (meeting.organizer_id !== call.request.user_id) {
        // Check if user has admin role
        const participantResult = await db.query(
          `SELECT role
           FROM meeting_participants
           WHERE meeting_id = $1 AND user_id = $2`,
          [call.request.meeting_id, call.request.user_id]
        );
        
        if (participantResult.rows.length === 0 || 
            (participantResult.rows[0].role !== 'organizer' && participantResult.rows[0].role !== 'admin')) {
          callback({
            code: grpc.status.PERMISSION_DENIED,
            message: 'Only the organizer or an admin can end the meeting'
          });
          return;
        }
      }
      
      // Update meeting status
      await db.query(
        `UPDATE meetings
         SET status = 'ENDED', end_time = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [call.request.meeting_id]
      );
      
      // Update leave time for all participants
      await db.query(
        `UPDATE meeting_participants
         SET leave_time = NOW(), updated_at = NOW()
         WHERE meeting_id = $1 AND leave_time IS NULL`,
        [call.request.meeting_id]
      );
      
      // Publish meeting ended event
      await redis.publish('meeting:ended', {
        meetingId: call.request.meeting_id,
        userId: call.request.user_id,
        timestamp: new Date().toISOString()
      });
      
      callback(null, {
        success: true,
        message: 'Meeting ended successfully'
      });
    } catch (error) {
      console.error('Error in endMeeting:', error);
      callback({
        code: grpc.status.INTERNAL,
        message: `Internal server error: ${error.message}`
      });
    }
  });
}

/**
 * List meetings
 * @param {Object} call - gRPC call object
 * @param {Function} callback - Callback function
 */
async function listMeetings(call, callback) {
  await createSpan('grpc.meetingService.listMeetings', { 
    userId: call.request.user_id,
    status: call.request.status
  }, async () => {
    try {
      // Validate request
      if (!call.request.user_id) {
        callback({
          code: grpc.status.INVALID_ARGUMENT,
          message: 'Missing required field: user_id'
        });
        return;
      }
      
      const limit = call.request.limit || 50;
      const offset = call.request.offset || 0;
      const status = call.request.status || null;
      const startDate = call.request.start_date ? new Date(call.request.start_date) : null;
      const endDate = call.request.end_date ? new Date(call.request.end_date) : null;
      
      // Build query
      let query = `
        SELECT m.id, m.title, m.description, m.start_time, m.end_time, m.organizer_id, 
               m.platform, m.platform_meeting_id, m.join_url, m.status
        FROM meetings m
        JOIN meeting_participants mp ON m.id = mp.meeting_id
        WHERE mp.user_id = $1
      `;
      
      const queryParams = [call.request.user_id];
      let paramIndex = 2;
      
      if (status) {
        query += ` AND m.status = $${paramIndex}`;
        queryParams.push(status);
        paramIndex++;
      }
      
      if (startDate) {
        query += ` AND m.start_time >= $${paramIndex}`;
        queryParams.push(startDate);
        paramIndex++;
      }
      
      if (endDate) {
        query += ` AND m.start_time <= $${paramIndex}`;
        queryParams.push(endDate);
        paramIndex++;
      }
      
      // Get total count
      const countQuery = `SELECT COUNT(*) as total FROM (${query}) as filtered_meetings`;
      const countResult = await db.query(countQuery, queryParams);
      const totalCount = parseInt(countResult.rows[0].total);
      
      // Add ordering and pagination
      query += ` ORDER BY m.start_time DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      queryParams.push(limit, offset);
      
      // Execute query
      const result = await db.query(query, queryParams);
      
      // Format meetings
      const meetings = [];
      
      for (const meeting of result.rows) {
        // Get meeting settings
        const settingsResult = await db.query(
          `SELECT auto_record, mute_participants_on_entry, enable_waiting_room,
                  enable_chat, enable_screen_sharing, preferred_language, auto_translate
           FROM meeting_settings
           WHERE meeting_id = $1`,
          [meeting.id]
        );
        
        // Get participants
        const participantsResult = await db.query(
          `SELECT user_id
           FROM meeting_participants
           WHERE meeting_id = $1`,
          [meeting.id]
        );
        
        meetings.push({
          id: meeting.id,
          title: meeting.title,
          description: meeting.description,
          start_time: meeting.start_time.toISOString(),
          end_time: meeting.end_time?.toISOString(),
          organizer_id: meeting.organizer_id,
          platform: meeting.platform,
          platform_meeting_id: meeting.platform_meeting_id,
          join_url: meeting.join_url,
          participant_ids: participantsResult.rows.map(p => p.user_id),
          status: meeting.status,
          settings: settingsResult.rows[0] ? {
            auto_record: settingsResult.rows[0].auto_record,
            mute_participants_on_entry: settingsResult.rows[0].mute_participants_on_entry,
            enable_waiting_room: settingsResult.rows[0].enable_waiting_room,
            enable_chat: settingsResult.rows[0].enable_chat,
            enable_screen_sharing: settingsResult.rows[0].enable_screen_sharing,
            preferred_language: settingsResult.rows[0].preferred_language,
            auto_translate: settingsResult.rows[0].auto_translate
          } : null
        });
      }
      
      callback(null, {
        meetings,
        total_count: totalCount
      });
    } catch (error) {
      console.error('Error in listMeetings:', error);
      callback({
        code: grpc.status.INTERNAL,
        message: `Internal server error: ${error.message}`
      });
    }
  });
}

module.exports = {
  createMeeting,
  joinMeeting,
  endMeeting,
  listMeetings
};
