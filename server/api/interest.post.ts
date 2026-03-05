// server/api/interest.post.ts
// Captures early access / interest form submissions from sell sheet and event toolkit.
// Stores in Directus early_access_leads collection + sends team notification via SendGrid.

import { createItem } from '@directus/sdk'

interface InterestSubmission {
  name: string
  email: string
  building?: string
  phone?: string
  role: 'realtor' | 'board' | 'manager' | 'developer'
  interest?: 'warm' | 'hot' | 'followup'
  notes?: string
  source?: string
  event?: string
  timestamp?: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody<InterestSubmission>(event)

  if (!body.name || !body.email) {
    throw createError({ statusCode: 400, message: 'Name and email are required' })
  }

  const config = useRuntimeConfig()
  const directus = getTypedDirectus()

  // 1. Store in Directus
  try {
    await directus.request(
      createItem('early_access_leads', {
        name: body.name,
        email: body.email,
        building: body.building || null,
        phone: body.phone || null,
        role: body.role,
        interest: body.interest || 'warm',
        notes: body.notes || null,
        source: body.source || 'website',
        event_name: body.event || null,
        date_submitted: body.timestamp || new Date().toISOString(),
        status: 'new',
      })
    )
  } catch (directusError) {
    console.error('Directus storage error:', directusError)
    // Continue — email notification is the fallback
  }

  // 2. Send team notification email via SendGrid
  try {
    await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.sendgridApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{
          to: [{ email: 'contact@huestudios.com', name: 'HOA Connect' }],
        }],
        from: { email: config.public.fromEmail || 'noreply@hoaconnect.info', name: 'HOA Connect Leads' },
        reply_to: { email: body.email, name: body.name },
        subject: `🏢 New Lead: ${body.name} (${body.role})`,
        content: [{
          type: 'text/plain',
          value: [
            `New early access request`,
            `Name: ${body.name}`,
            `Email: ${body.email}`,
            `Building/Company: ${body.building || 'Not specified'}`,
            `Phone: ${body.phone || 'Not provided'}`,
            `Role: ${body.role}`,
            `Interest: ${body.interest || 'warm'}`,
            `Source: ${body.source || 'website'}`,
            `Event: ${body.event || 'N/A'}`,
            `Notes: ${body.notes || 'None'}`,
            `Submitted: ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}`,
          ].join('\n'),
        }],
      }),
    })
  } catch (emailError) {
    console.error('Email notification error:', emailError)
  }

  return { success: true, message: 'Interest recorded successfully' }
})
