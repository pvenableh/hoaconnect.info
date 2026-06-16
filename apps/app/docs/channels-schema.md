# Slack-like Channels System - Directus Collection Schema

## Overview
This document outlines the Directus collections needed for a Slack-like channel communication system within the HOA management application.

## Collections

### 1. `hoa_channels` - Channel Collection

Stores channel information for organization-based communication.

```json
{
  "collection": "hoa_channels",
  "fields": [
    {
      "field": "id",
      "type": "uuid",
      "meta": { "primaryKey": true }
    },
    {
      "field": "status",
      "type": "string",
      "schema": { "default_value": "published" },
      "meta": {
        "interface": "select-dropdown",
        "options": {
          "choices": [
            { "text": "Published", "value": "published" },
            { "text": "Draft", "value": "draft" },
            { "text": "Archived", "value": "archived" }
          ]
        }
      }
    },
    {
      "field": "name",
      "type": "string",
      "meta": { "required": true, "note": "Channel name (e.g., 'general', 'announcements')" }
    },
    {
      "field": "slug",
      "type": "string",
      "meta": { "required": true, "note": "URL-friendly slug for the channel" }
    },
    {
      "field": "description",
      "type": "text",
      "meta": { "note": "Channel description/purpose" }
    },
    {
      "field": "is_private",
      "type": "boolean",
      "schema": { "default_value": false },
      "meta": { "note": "If true, only invited members can see the channel" }
    },
    {
      "field": "is_default",
      "type": "boolean",
      "schema": { "default_value": false },
      "meta": { "note": "If true, all new members automatically join this channel" }
    },
    {
      "field": "organization",
      "type": "uuid",
      "meta": { "required": true, "note": "Parent organization" },
      "relation": {
        "collection": "hoa_organizations",
        "field": "id"
      }
    },
    {
      "field": "created_by",
      "type": "uuid",
      "relation": { "collection": "directus_users", "field": "id" }
    },
    {
      "field": "date_created",
      "type": "timestamp",
      "meta": { "special": ["date-created"] }
    },
    {
      "field": "date_updated",
      "type": "timestamp",
      "meta": { "special": ["date-updated"] }
    },
    {
      "field": "user_created",
      "type": "uuid",
      "meta": { "special": ["user-created"] },
      "relation": { "collection": "directus_users", "field": "id" }
    },
    {
      "field": "user_updated",
      "type": "uuid",
      "meta": { "special": ["user-updated"] },
      "relation": { "collection": "directus_users", "field": "id" }
    }
  ]
}
```

### 2. `hoa_channel_messages` - Message Collection

Stores messages within channels with support for threaded replies.

```json
{
  "collection": "hoa_channel_messages",
  "fields": [
    {
      "field": "id",
      "type": "uuid",
      "meta": { "primaryKey": true }
    },
    {
      "field": "status",
      "type": "string",
      "schema": { "default_value": "published" },
      "meta": {
        "interface": "select-dropdown",
        "options": {
          "choices": [
            { "text": "Published", "value": "published" },
            { "text": "Draft", "value": "draft" },
            { "text": "Deleted", "value": "deleted" }
          ]
        }
      }
    },
    {
      "field": "content",
      "type": "text",
      "meta": { "required": true, "interface": "input-rich-text-html", "note": "Message content (HTML with mentions)" }
    },
    {
      "field": "channel",
      "type": "uuid",
      "meta": { "required": true },
      "relation": {
        "collection": "hoa_channels",
        "field": "id"
      }
    },
    {
      "field": "parent_message",
      "type": "uuid",
      "meta": { "note": "Parent message for threaded replies" },
      "relation": {
        "collection": "hoa_channel_messages",
        "field": "id"
      }
    },
    {
      "field": "user_created",
      "type": "uuid",
      "meta": { "special": ["user-created"], "required": true },
      "relation": { "collection": "directus_users", "field": "id" }
    },
    {
      "field": "date_created",
      "type": "timestamp",
      "meta": { "special": ["date-created"] }
    },
    {
      "field": "date_updated",
      "type": "timestamp",
      "meta": { "special": ["date-updated"] }
    },
    {
      "field": "user_updated",
      "type": "uuid",
      "meta": { "special": ["user-updated"] },
      "relation": { "collection": "directus_users", "field": "id" }
    },
    {
      "field": "is_edited",
      "type": "boolean",
      "schema": { "default_value": false }
    },
    {
      "field": "attachments",
      "type": "json",
      "meta": { "note": "Array of file IDs attached to the message" }
    }
  ]
}
```

### 3. `hoa_channel_members` - Channel Membership Collection

Tracks which users are members of which channels (especially for private channels).

```json
{
  "collection": "hoa_channel_members",
  "fields": [
    {
      "field": "id",
      "type": "uuid",
      "meta": { "primaryKey": true }
    },
    {
      "field": "channel",
      "type": "uuid",
      "meta": { "required": true },
      "relation": {
        "collection": "hoa_channels",
        "field": "id"
      }
    },
    {
      "field": "user",
      "type": "uuid",
      "meta": { "required": true },
      "relation": {
        "collection": "directus_users",
        "field": "id"
      }
    },
    {
      "field": "hoa_member",
      "type": "uuid",
      "meta": { "note": "Optional reference to hoa_members for hoa_member invitations" },
      "relation": {
        "collection": "hoa_members",
        "field": "id"
      }
    },
    {
      "field": "role",
      "type": "string",
      "schema": { "default_value": "member" },
      "meta": {
        "interface": "select-dropdown",
        "options": {
          "choices": [
            { "text": "Admin", "value": "admin" },
            { "text": "Member", "value": "member" },
            { "text": "Guest", "value": "guest" }
          ]
        },
        "note": "Channel-specific role"
      }
    },
    {
      "field": "invited_by",
      "type": "uuid",
      "relation": { "collection": "directus_users", "field": "id" }
    },
    {
      "field": "date_created",
      "type": "timestamp",
      "meta": { "special": ["date-created"] }
    },
    {
      "field": "last_read_at",
      "type": "timestamp",
      "meta": { "note": "Last time user read messages in this channel" }
    },
    {
      "field": "notifications_enabled",
      "type": "boolean",
      "schema": { "default_value": true }
    }
  ]
}
```

### 4. `hoa_channel_mentions` - Mention Tracking Collection

Tracks @mentions for notifications and analytics.

```json
{
  "collection": "hoa_channel_mentions",
  "fields": [
    {
      "field": "id",
      "type": "uuid",
      "meta": { "primaryKey": true }
    },
    {
      "field": "message",
      "type": "uuid",
      "meta": { "required": true },
      "relation": {
        "collection": "hoa_channel_messages",
        "field": "id"
      }
    },
    {
      "field": "mentioned_user",
      "type": "uuid",
      "meta": { "required": true },
      "relation": {
        "collection": "directus_users",
        "field": "id"
      }
    },
    {
      "field": "mentioned_by",
      "type": "uuid",
      "meta": { "required": true },
      "relation": {
        "collection": "directus_users",
        "field": "id"
      }
    },
    {
      "field": "channel",
      "type": "uuid",
      "meta": { "required": true },
      "relation": {
        "collection": "hoa_channels",
        "field": "id"
      }
    },
    {
      "field": "date_created",
      "type": "timestamp",
      "meta": { "special": ["date-created"] }
    },
    {
      "field": "is_read",
      "type": "boolean",
      "schema": { "default_value": false }
    }
  ]
}
```

## Access Control Rules

### hoa_admin (HOA Administrators)
- **Full access** to all channels in their organization
- Can create, edit, archive channels
- Can invite hoa_members to private channels
- Can delete any message in their organization's channels
- Can see all messages and mentions

### hoa_member (HOA Members)
- Can only access channels they are invited to (for private channels)
- Automatic access to public/default channels
- Can send messages in channels they have access to
- Can delete their own messages only
- Can see mentions directed at them

## Recommended Directus Permissions

```json
{
  "hoa_admin": {
    "hoa_channels": { "create": true, "read": "org_filter", "update": "org_filter", "delete": "org_filter" },
    "hoa_channel_messages": { "create": true, "read": "channel_access", "update": "own", "delete": "org_filter" },
    "hoa_channel_members": { "create": true, "read": "org_filter", "update": "org_filter", "delete": "org_filter" },
    "hoa_channel_mentions": { "create": true, "read": "org_filter", "update": false, "delete": false }
  },
  "hoa_member": {
    "hoa_channels": { "create": false, "read": "member_access", "update": false, "delete": false },
    "hoa_channel_messages": { "create": "member_access", "read": "channel_access", "update": "own", "delete": "own" },
    "hoa_channel_members": { "create": false, "read": "own", "update": "own", "delete": false },
    "hoa_channel_mentions": { "create": true, "read": "mentioned_user", "update": "mentioned_user", "delete": false }
  }
}
```

## Filter Definitions

- `org_filter`: `{ "channel": { "organization": { "_eq": "$CURRENT_USER.organization" } } }`
- `channel_access`: Combined filter for public channels OR private channels with membership
- `own`: `{ "user_created": { "_eq": "$CURRENT_USER" } }`
- `member_access`: User is a member of the channel OR channel is public in their org
- `mentioned_user`: `{ "mentioned_user": { "_eq": "$CURRENT_USER" } }`

## Real-time Subscription Events

The system should subscribe to:
1. `hoa_channel_messages` - For new messages in visible channels
2. `hoa_channel_mentions` - For mentions directed at the current user
3. `hoa_channel_members` - For membership changes

## TypeScript Interfaces

See `/types/directus.ts` for the full TypeScript interfaces that will be generated.
