
export interface ExtensionSeoMetadata {
    title?: string;
    meta_description?: string;
    og_image?: string;
    additional_fields?: Record<string, unknown>;
    sitemap?: {
        change_frequency: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
        priority: string;
    };
    no_index?: boolean;
    no_follow?: boolean;
}

export interface AiAction {
	/** @primaryKey */
	id: string;
	/** @required */
	organization: HoaOrganization | string;
	/** @description Catalog key (e.g. create_task, send_email). @required */
	action_type: string;
	/** @required */
	status: 'pending' | 'approved' | 'rejected' | 'executed' | 'failed';
	/** @description internal | record_update | scheduling | comms. */
	category?: string | null;
	/** @description low | medium | high. */
	risk?: string | null;
	/** @description Reaches residents/board — always requires approval. */
	outbound?: boolean | null;
	/** @description The action's parameters. */
	payload?: Record<string, any> | null;
	/** @description Human-readable preview of what will happen. */
	preview?: string | null;
	/** @description Execution result (on success). */
	result?: Record<string, any> | null;
	/** @description Failure detail (on failed execution). */
	error_message?: string | null;
	entity_type?: string | null;
	entity_id?: string | null;
	conversation?: AiConversation | string | null;
	/** @description The staff member whose turn proposed this action. */
	requested_by?: DirectusUser | string | null;
	/** @description Who approved/rejected it. */
	approved_by?: DirectusUser | string | null;
	date_created?: string | null;
	date_updated?: string | null;
	/** @description Human one-line summary of the proposed action. */
	title?: string | null;
}

export interface AiContextSnapshot {
	/** @primaryKey */
	id: string;
	/** @required */
	organization: HoaOrganization | string;
	/** @description Which context this snapshot holds (currently just 'org'). */
	context_type?: string;
	/** @description The assembled plain-text org-context block placed in the system prompt. */
	content?: string | null;
	/** @description Rough token estimate of `content` (~len/4). */
	token_estimate?: number | null;
	/** @description When this L2 snapshot goes stale and should be rebuilt. */
	expires_at?: string | null;
	date_created?: string | null;
	date_updated?: string | null;
}

export interface AiConversation {
	/** @primaryKey */
	id: string;
	/** @required */
	organization: HoaOrganization | string;
	/** @description The staff member who owns this conversation. */
	user?: DirectusUser | string | null;
	/** @description Short human label (first message or AI-derived). */
	title?: string | null;
	/** @description Most recent Anthropic model id used in this conversation. */
	model?: string | null;
	date_created?: string | null;
	date_updated?: string | null;
	/** @description What this conversation is scoped to: { entityType, entityId, label } or { scope, route }. */
	context?: Record<string, any> | null;
}

export interface AiDocChunk {
	/** @primaryKey */
	id: string;
	/** @required */
	organization: HoaOrganization | string;
	/** @description Which collection the chunk's source row lives in. @required */
	source_collection: 'hoa_governance' | 'hoa_documents';
	/** @description The source row id (governance or document). @required */
	source_id: string;
	/** @description Source title, denormalized for citation display. */
	source_title?: string | null;
	/** @description Section number for governance (e.g. "4.2.1"), if any. */
	section?: string | null;
	/** @description 0-based position of this chunk within its source. */
	chunk_index?: number | null;
	/** @description The chunk's plain text (what gets cited). */
	chunk_text?: string | null;
	/** @description Voyage embedding vector (unit-normalized float array). */
	embedding?: Record<string, any> | null;
	/** @description Voyage tokens billed for this chunk. */
	tokens?: number | null;
	/** @description sha256 of the source text — re-ingestion skips unchanged sources. */
	content_hash?: string | null;
	date_created?: string | null;
}

export interface AiMessage {
	/** @primaryKey */
	id: string;
	/** @required */
	organization: HoaOrganization | string;
	/** @required */
	conversation: AiConversation | string;
	/** @required */
	role: 'user' | 'assistant';
	/** @description The message text (assistant body is plain text/markdown). */
	content?: string | null;
	/** @description Anthropic model id used for an assistant turn. */
	model?: string | null;
	input_tokens?: number | null;
	output_tokens?: number | null;
	cache_read_tokens?: number | null;
	cache_write_tokens?: number | null;
	date_created?: string | null;
}

export interface AiTransaction {
	/** @primaryKey */
	id: string;
	/** @required */
	organization: HoaOrganization | string;
	/** @required */
	type: 'debit' | 'purchase' | 'grant' | 'refund';
	/** @description Positive magnitude of credits. @required */
	credits: number;
	feature?: 'draft' | 'rewrite' | 'summarize' | 'ask' | 'chat' | null;
	/** @description Anthropic model id used (for debits). */
	model?: string | null;
	input_tokens?: number | null;
	output_tokens?: number | null;
	cache_read_tokens?: number | null;
	cache_write_tokens?: number | null;
	/** @description Stripe payment_intent id — idempotency key for purchases. */
	stripe_id?: string | null;
	/** @description Acting user (for debits). */
	user?: DirectusUser | string | null;
	date_created?: string | null;
}

export interface AiWallet {
	/** @primaryKey */
	id: string;
	/** @required */
	organization: HoaOrganization | string;
	/** @description Cached total balance (allowance + purchased). */
	balance_credits?: number;
	/** @description Plan-funded credits remaining this period (resets). */
	allowance_credits?: number;
	/** @description Purchased credits remaining (never expire). */
	purchased_credits?: number;
	/** @description This plan's monthly allowance grant. */
	included_credits?: number;
	/** @description When the allowance pool next resets. */
	period_resets_at?: string | null;
	auto_refill_enabled?: boolean | null;
	/** @description Balance below which auto-refill triggers. */
	auto_refill_threshold?: number | null;
	auto_refill_pack?: 'small' | 'medium' | 'large' | null;
	date_created?: string | null;
	date_updated?: string | null;
}

export interface BillingAccountMember {
	/** @primaryKey */
	id: string;
	/** @required */
	billing_account: BillingAccount | string;
	/** @required */
	user: DirectusUser | string;
	/** @required */
	role: 'owner' | 'billing_admin' | 'viewer';
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
}

export interface BillingAccount {
	/** @primaryKey */
	id: string;
	/** @description e.g. "Acme Property Management" @required */
	name: string;
	/** @description Account lifecycle (mirrors Stripe) */
	status?: 'active' | 'past_due' | 'canceled' | 'suspended' | null;
	/** @description Primary billing contact */
	owner?: DirectusUser | string | null;
	/** @description SOURCE OF TRUTH for every org pointing at this account (entitlement resolves up). */
	subscription_status?: 'active' | 'trial' | 'past_due' | 'canceled' | 'expired' | null;
	/** @description One trial per agency; child properties don't carry their own once account-billed. */
	trial_ends_at?: string | null;
	/** @description Comped agency — bypasses subscription checks for all child orgs. */
	is_free_account?: boolean | null;
	/** @description The agency plan/tier */
	subscription_plan?: SubscriptionPlan | string | null;
	billing_cycle?: 'monthly' | 'yearly' | null;
	/** @description The single Stripe customer */
	stripe_customer_id?: string | null;
	/** @description The single Stripe subscription */
	stripe_subscription_id?: string | null;
	/** @description Denormalized mirror of the live Stripe quantity (= active property count). Not a hard cap. */
	seats_purchased?: number | null;
	/** @description Reserved: properties bundled before per-seat pricing. Left 0/unused in v1 (flat per-property). */
	included_properties?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
}

export interface BlockHero {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	title?: string | null;
	subtitle?: string | null;
	cta_text?: string | null;
	cta_link?: string | null;
	background_image?: DirectusFile | string | null;
	foreground_image?: DirectusFile | string | null;
}

export interface BlockSetting {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	heading_font?: 'serif' | `sans-serif` | null;
	body_font?: 'serif' | `sans-serif` | null;
	logo?: DirectusFile | string | null;
	icon?: DirectusFile | string | null;
	colors?: Array<{ primary: string; secondary: string; accent: string }> | null;
	description?: string | null;
	title?: string | null;
	seo?: ExtensionSeoMetadata | null;
	organization?: HoaOrganization | string | null;
	theme?: 'classic' | 'modern' | null;
	/** @description Custom line shown under the logo in emails, e.g. "Official Communication of {name}". Supports {name} and {legal_name}. */
	header_text?: string | null;
	/** @description Homepage link shown in the email footer. Falls back to the org's external site or resident portal. */
	homepage_url?: string | null;
	/** @description Building photo shown full-width at the bottom of the email footer. */
	footer_image?: DirectusFile | string | null;
	/** @description Public landing config (widgets, neighborhood/walk-score, listings, inquiry routing, cached geo). Edited via Settings → Public site. */
	landing?: Record<string, any> | null;
	/** @description Recipient count at/below which CC/BCC are attached to each email (everyone sees the CC). Above it, CC/BCC contacts each get one copy. Default 5. */
	cc_bcc_threshold?: number | null;
	/** @description Display name on outgoing email (defaults to the org name) */
	from_name?: string | null;
	/** @description From address — only used once the sending domain is verified */
	from_email?: string | null;
	/** @description Authenticated sending domain (SendGrid) */
	email_domain?: string | null;
	/** @description SendGrid domain-authentication id */
	email_domain_id?: string | null;
	/** @description Sending domain DNS validated in SendGrid */
	email_domain_verified?: boolean | null;
	/** @description CNAME records the org must add to DNS */
	email_domain_dns?: Record<string, any> | null;
}

export interface Coupon {
	/** @primaryKey */
	id: string;
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	/** @required */
	code: string;
	status?: 'active' | 'inactive' | 'expired' | null;
	valid_from?: string | null;
	max_uses?: number | null;
	max_uses_per_user?: number | null;
	min_purchase_amount?: number | null;
	/** @description Only for new signups. */
	is_first_purchase_only?: boolean | null;
	/** @required */
	amount: number;
	title?: string | null;
	description?: string | null;
	/** @required */
	type: 'percentage' | 'amount';
	valid_until?: string | null;
	stripe_coupon_id?: string | null;
	usage?: CouponUsage[] | string[];
	applicable_plans?: CouponsSubscriptionPlan[] | string[];
}

export interface CouponsSubscriptionPlan {
	/** @primaryKey */
	id: number;
	coupons_id?: Coupon | string | null;
	subscription_plans_id?: SubscriptionPlan | string | null;
}

export interface CouponUsage {
	/** @primaryKey */
	id: string;
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	coupon?: Coupon | string | null;
	user?: DirectusUser | string | null;
	organization?: HoaOrganization | string | null;
	used_at?: string | null;
	discount_applied?: number | null;
	subscription_plan?: SubscriptionPlan | string | null;
}

export interface HoaActivity {
	/** @primaryKey */
	id: string;
	/** @required */
	organization: HoaOrganization | string;
	/** @description The acting member. */
	member?: HoaMember | string | null;
	/** @description The auth identity. */
	user?: DirectusUser | string | null;
	/** @required */
	event_type: 'page_view' | 'download' | 'doc_view' | 'session_start' | 'login' | 'logout' | 'payment' | 'request' | 'profile_update' | 'upload' | 'search';
	path?: string | null;
	target_collection?: string | null;
	target_id?: string | null;
	label?: string | null;
	metadata?: Record<string, any> | null;
	session_id?: string | null;
	ip?: string | null;
	user_agent?: string | null;
	date_created?: string | null;
}

export interface HoaAmenity {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	title?: string | null;
	icon?: string | null;
	description?: string | null;
	image?: DirectusFile | string | null;
	organization?: HoaOrganization | string | null;
}

export interface HoaAnnouncement {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	title?: string | null;
	content?: string | null;
	announcement_type?: 'general' | 'urgent' | 'maintenance' | 'event' | 'reminder' | null;
	publish_date?: string | null;
	expiry_date?: string | null;
	target_audience?: 'all' | 'owners' | 'tenants' | `board members` | null;
	organization?: HoaOrganization | string | null;
	is_pinned?: boolean | null;
	/** @description Optional CTA button label shown on the announcement. */
	button_text?: string | null;
	/** @description CTA button destination — an internal path (/docs) or a full URL. */
	button_link?: string | null;
	/** @description Open the CTA link in a new tab even if it looks internal. */
	external_link?: boolean | null;
	/** @description Surface this announcement as a toast for members. Off = sheet/feed only. */
	show_toast?: boolean | null;
}

export interface HoaBoardMember {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	hoa_member?: HoaMember | string | null;
	term_start?: string | null;
	term_end?: string | null;
	title?: 'president' | 'vice_president' | 'secretary' | 'treasurer' | 'director' | null;
	icon?: string | null;
	message?: string | null;
}

export interface HoaChannelMember {
	/** @primaryKey */
	id: string;
	/** @required */
	channel: HoaChannel | string;
	/** @required */
	user: DirectusUser | string;
	/** @description Optional reference to hoa_members for member invitations */
	hoa_member?: HoaMember | string | null;
	/** @description Channel-specific role */
	role?: 'admin' | 'member' | 'guest' | null;
	invited_by?: DirectusUser | string | null;
	/** @description Last time user read messages in this channel */
	last_read_at?: string | null;
	/** @description Whether to send notifications for this channel */
	notifications_enabled?: boolean | null;
	date_created?: string | null;
}

export interface HoaChannelMention {
	/** @primaryKey */
	id: string;
	/** @required */
	message: HoaChannelMessage | string;
	/** @required */
	mentioned_user: DirectusUser | string;
	/** @required */
	mentioned_by: DirectusUser | string;
	/** @required */
	channel: HoaChannel | string;
	/** @description Whether the mention has been read */
	is_read?: boolean | null;
	date_created?: string | null;
}

export interface HoaChannelMessage {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'deleted' | null;
	/** @description Message content (HTML with mentions) @required */
	content: string;
	/** @required */
	channel: HoaChannel | string;
	/** @description Parent message for threaded replies */
	parent_message?: HoaChannelMessage | string | null;
	/** @description Whether message has been edited */
	is_edited?: boolean | null;
	/** @description Array of file IDs attached to the message */
	attachments?: Record<string, any> | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
}

export interface HoaChannelModerationLog {
	/** @primaryKey */
	id: string;
	organization?: HoaOrganization | string | null;
	channel?: HoaChannel | string | null;
	/** @description Who took the action (or the reporter). */
	moderator?: DirectusUser | string | null;
	action?: 'hide' | 'remove' | 'report' | null;
	reason?: string | null;
	/** @description Plain message uuid — survives a hard delete of the message. */
	message_id?: string | null;
	/** @description Snapshot of the message author. */
	message_author?: DirectusUser | string | null;
	/** @description Stripped-HTML snapshot of the message content. */
	message_snippet?: string | null;
	date_created?: string | null;
}

export interface HoaChannel {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived' | 'deleted' | null;
	sort?: number | null;
	/** @description Channel name (e.g., general, announcements) @required */
	name: string;
	/** @description URL-friendly identifier @required */
	slug: string;
	/** @description Channel description/purpose */
	description?: string | null;
	/** @description If true, only invited members can see this channel */
	is_private?: boolean | null;
	/** @description If true, all new members automatically join this channel */
	is_default?: boolean | null;
	/** @required */
	organization: HoaOrganization | string;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	/** @description The ticket this channel is the internal discussion thread for. */
	request?: HoaRequest | string | null;
	/** @description Pinned channels float to the top of the sidebar. */
	is_pinned?: boolean | null;
	/** @description Optional: the project this channel discusses. */
	project?: HoaProject | string | null;
	/** @description Optional: the vendor this channel discusses. */
	vendor?: HoaVendor | string | null;
	/** @description Members enrolled in / invited to this channel. */
	channel_members?: HoaChannelMember[] | string[];
}

export interface HoaCommentReport {
	/** @primaryKey */
	id: string;
	status?: 'open' | 'reviewed' | 'dismissed' | 'actioned' | null;
	/** @required */
	reason: 'vulgar' | 'harassment' | 'spam' | 'off_topic' | 'other';
	/** @description Optional context from the reporter */
	details?: string | null;
	/** @required */
	comment: HoaComment | string;
	reporter?: DirectusUser | string | null;
	/** @description Moderator note on resolution */
	resolution_note?: string | null;
	/** @required */
	organization: HoaOrganization | string;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
}

export interface HoaComment {
	/** @primaryKey */
	id: string;
	sort?: number | null;
	status?: 'published' | 'draft' | 'deleted' | null;
	/** @description e.g. hoa_announcements, hoa_requests, hoa_documents, hoa_meetings, payment_requests @required */
	target_collection: string;
	/** @description id of the target row (string to tolerate uuid/int pks) @required */
	target_id: string;
	/** @description Parent comment for threaded replies */
	parent_comment?: HoaComment | string | null;
	/** @description HTML with @mentions (TipTap), same as channel messages */
	body?: string | null;
	/** @description Array of file IDs */
	attachments?: Record<string, any> | null;
	/** @description Array of mentioned user IDs */
	mentioned_users?: Record<string, any> | null;
	is_edited?: boolean | null;
	/** @description Board/admin-only note — hidden from members */
	is_internal?: boolean | null;
	/** @description Hidden by a moderator — not shown to members */
	is_hidden?: boolean | null;
	/** @description Why the comment was hidden */
	hidden_reason?: string | null;
	/** @description Moderator who hid the comment */
	hidden_by?: DirectusUser | string | null;
	/** @description Open report count (denormalized) */
	report_count?: number | null;
	/** @required */
	organization: HoaOrganization | string;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
}

export interface HoaDocumentCategory {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	name?: string | null;
	slug?: string | null;
	description?: string | null;
	icon?: string | null;
	sort_by_date?: boolean | null;
	organization?: HoaOrganization | string | null;
}

export interface HoaDocument {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	title?: string | null;
	file?: DirectusFile | string | null;
	organization?: HoaOrganization | string | null;
	date_published?: string | null;
	folder?: DirectusFolder | string | null;
	document_category?: HoaDocumentCategory | string | null;
}

export interface HoaEmailActivity {
	/** @primaryKey */
	id: string;
	user_created?: string | null;
	date_created?: string | null;
	/** @required */
	event: 'processed' | 'dropped' | 'delivered' | 'deferred' | 'bounce' | 'open' | 'click' | 'spam_report' | 'unsubscribe' | 'group_unsubscribe' | 'group_resubscribe';
	/** @description Email address this event relates to */
	email?: string | null;
	/** @description SendGrid message ID for correlation */
	sg_message_id?: string | null;
	/** @description URL that was clicked (for click events) */
	clicked_url?: string | null;
	user_agent?: string | null;
	ip?: string | null;
	/** @description Bounce/drop reason */
	reason?: string | null;
	/** @description Raw event timestamp from SendGrid (Unix timestamp) */
	event_timestamp?: number | null;
	email_recipient?: HoaEmailRecipient | string | null;
	member?: HoaMember | string | null;
	organization?: HoaOrganization | string | null;
	/** @description The hoa_emails record this activity event belongs to (from the email_id custom_arg). */
	email_record?: HoaEmail | string | null;
}

export interface HoaEmailPartial {
	/** @primaryKey */
	id: string;
	/** @required */
	name: string;
	slug?: string | null;
	type?: 'header' | 'footer' | 'web_version_bar' | null;
	description?: string | null;
	mjml_source?: string | null;
	variables_schema?: Record<string, any> | null;
	instance_variables?: Record<string, any> | null;
	is_default?: boolean | null;
	/** @description Null = a platform/system row shared by all orgs. */
	organization?: HoaOrganization | string | null;
	date_created?: string | null;
	date_updated?: string | null;
}

export interface HoaEmailRecipient {
	/** @primaryKey */
	id: string;
	sort?: number | null;
	user_created?: string | null;
	date_created?: string | null;
	/** @description Email address at time of sending */
	recipient_email?: string | null;
	/** @description Recipient name at time of sending */
	recipient_name?: string | null;
	status?: 'pending' | 'sent' | 'delivered' | 'failed' | 'bounced' | null;
	sent_at?: string | null;
	/** @description Error message if delivery failed */
	error_message?: string | null;
	/** @description SendGrid message ID for tracking */
	sg_message_id?: string | null;
	email?: HoaEmail | string | null;
	/** @description The hoa_member this recipient row belongs to. */
	member?: HoaMember | string | null;
}

export interface HoaEmail {
	/** @primaryKey */
	id: string;
	status?: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed' | null;
	sort?: number | null;
	user_created?: string | null;
	date_created?: string | null;
	user_updated?: string | null;
	date_updated?: string | null;
	/** @description Email subject line @required */
	subject: string;
	/** @description Email body content (HTML supported) @required */
	content: string;
	/** @description Type of email for categorization @required */
	email_type: 'basic' | 'alert' | 'newsletter' | 'announcement' | 'reminder' | 'notice';
	/** @description When to send the email (leave empty for immediate send) */
	scheduled_at?: string | null;
	/** @description When the email was actually sent */
	sent_at?: string | null;
	/** @description Greeting template with {{first_name}} placeholder (e.g., 'Hello {{first_name}},') */
	greeting?: string | null;
	/** @description Custom salutation for footer (e.g., 'Warm regards', 'Best wishes') */
	salutation?: string | null;
	/** @description Whether to include board members in footer */
	include_board_footer?: boolean | null;
	/** @description Total recipients count */
	recipient_count?: number | null;
	/** @description Delivered count */
	delivered_count?: number | null;
	/** @description Failed delivery count */
	failed_count?: number | null;
	/** @required */
	organization: HoaOrganization | string;
	urgent?: boolean | null;
	subtitle?: string | null;
	/** @description Template this email was created from (optional) */
	template?: HoaEmailTemplate | string | null;
	/** @description Who a scheduled email is sent to */
	recipient_filter?: 'all' | 'owners' | 'tenants' | 'custom' | null;
	/** @description Array of hoa_members ids (used when recipient_filter = custom) */
	recipient_ids?: Record<string, any> | null;
	/** @description Repeat cadence for a scheduled email */
	recurrence_rule?: 'none' | 'weekly' | 'monthly' | null;
	/** @description Last successful send */
	last_run_at?: string | null;
	/** @description Next scheduled run (recurring) */
	next_run_at?: string | null;
	/** @description How `content` should be interpreted by the renderer */
	content_mode?: 'visual' | 'mjml' | null;
	/** @description Pretty URL slug for the public web view (/{org}/announcements/email/{web_slug}). Auto-derived from the subject; falls back to the id. */
	web_slug?: string | null;
	/** @description Optional override of the org's default header line for this send. */
	header_text?: string | null;
	/** @description Optional override of the org's default footer building photo for this send. */
	footer_image?: DirectusFile | string | null;
	/** @description CC recipients — emails and/or group tokens (@board, @property_manager) */
	cc?: string[] | null;
	/** @description BCC recipients — emails and/or group tokens (@board, @property_manager) */
	bcc?: string[] | null;
	/** @description Email recipients and their delivery status */
	recipients?: HoaEmailRecipient[] | string[];
	attachments?: HoaEmailsFile[] | string[];
}

export interface HoaEmailsFile {
	/** @primaryKey */
	id: number;
	hoa_emails_id?: HoaEmail | string | null;
	directus_files_id?: DirectusFile | string | null;
}

export interface HoaEmailTemplate {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived' | null;
	sort?: number | null;
	/** @description Template name shown in the picker @required */
	name: string;
	/** @description Which email type this template seeds */
	email_type?: 'basic' | 'alert' | 'newsletter' | 'announcement' | 'reminder' | 'notice' | null;
	/** @description Short description shown in the template library */
	description?: string | null;
	/** @description Default subject (merge fields like {{first_name}} allowed) */
	subject?: string | null;
	/** @description How `content` should be interpreted by the renderer */
	content_mode?: 'visual' | 'mjml' | null;
	/** @description Default board-footer toggle */
	include_board_footer?: boolean | null;
	/** @description Template body (HTML, or raw MJML when content_mode = mjml) */
	content?: string | null;
	/** @description Default greeting, e.g. Hello {{first_name}}, */
	greeting?: string | null;
	/** @description Default closing salutation */
	salutation?: string | null;
	/** @description Owning organization (leave empty for a global template) */
	organization?: HoaOrganization | string | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
}

export interface HoaGovernance {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived' | null;
	category?: 'bylaw' | 'rule' | 'ccr' | 'policy' | 'guideline' | null;
	/** @required */
	title: string;
	/** @description e.g. "4.2.1" (sortable) */
	section_number?: string | null;
	effective_date?: string | null;
	/** @description Short plain-text blurb (powers search snippets) */
	summary?: string | null;
	/** @description The rule body */
	content?: string | null;
	/** @description Keyword list */
	tags?: string[] | null;
	/** @description Parent section */
	parent?: HoaGovernance | string | null;
	/** @required */
	organization: HoaOrganization | string;
	sort?: number | null;
	date_created?: string | null;
	user_created?: DirectusUser | string | null;
	date_updated?: string | null;
	user_updated?: DirectusUser | string | null;
}

export interface HoaInvitation {
	/** @primaryKey */
	id: string;
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	email?: string | null;
	organization?: HoaOrganization | string | null;
	invited_by?: DirectusUser | string | null;
	role?: DirectusRole | string | null;
	token?: string | null;
	invitation_status?: 'pending' | 'accepted' | 'expired' | `canceled ` | null;
	/** @required */
	expires_at: string;
	accepted_at?: string | null;
}

export interface HoaJoinRequest {
	/** @primaryKey */
	id: string;
	date_created?: string | null;
	date_updated?: string | null;
	/** @description Review state of this join request. */
	status?: 'pending' | 'approved' | 'rejected' | null;
	/** @description The user asking to join. @required */
	user: DirectusUser | string;
	/** @description The org they want to join. @required */
	organization: HoaOrganization | string;
	/** @description Unit the applicant says they live in. */
	unit_number?: string | null;
	/** @description Owner or tenant, as claimed by the applicant. */
	member_type?: 'owner' | 'tenant' | null;
	/** @description Optional note from the applicant. */
	message?: string | null;
	/** @description Admin who approved/rejected. */
	processed_by?: DirectusUser | string | null;
	processed_at?: string | null;
	rejection_reason?: string | null;
}

export interface HoaLease {
	/** @primaryKey */
	id: string;
	status?: 'active' | 'expired' | 'terminated' | null;
	/** @required */
	unit: HoaUnit | string;
	/** @description The lessee */
	tenant?: HoaMember | string | null;
	/** @description Landlord / owner (optional) */
	owner?: HoaMember | string | null;
	start_date?: string | null;
	end_date?: string | null;
	rent_amount?: number | null;
	deposit_amount?: number | null;
	/** @description Signed lease PDF */
	document?: DirectusFile | string | null;
	notes?: string | null;
	/** @required */
	organization: HoaOrganization | string;
	sort?: number | null;
	date_created?: string | null;
	user_created?: DirectusUser | string | null;
	date_updated?: string | null;
	user_updated?: DirectusUser | string | null;
}

export interface HoaMailingListMember {
	/** @primaryKey */
	id: string;
	user_created?: string | null;
	date_created?: string | null;
	mailing_list?: HoaMailingList | string | null;
	member?: HoaMember | string | null;
}

export interface HoaMailingList {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived' | null;
	sort?: number | null;
	user_created?: string | null;
	date_created?: string | null;
	user_updated?: string | null;
	date_updated?: string | null;
	/** @required */
	name: string;
	description?: string | null;
	/** @description Filter type for auto-populating members */
	filter_type?: 'all' | 'owners' | 'tenants' | 'custom' | null;
	/** @description Custom filter criteria (for custom filter type) */
	filter_criteria?: Record<string, any> | null;
	/** @description Cached member count */
	member_count?: number | null;
	organization?: HoaOrganization | string | null;
	members?: HoaMailingListMember[] | string[];
}

export interface HoaMeetingAttendee {
	/** @primaryKey */
	id: string;
	/** @required */
	meeting: HoaMeeting | string;
	/** @description The person who attended */
	hoa_member?: HoaMember | string | null;
	/** @description The hoa_board_members term active on the meeting date */
	board_term?: HoaBoardMember | string | null;
	/** @description Role/title at the time of the meeting (frozen for history) */
	role_at_meeting?: string | null;
	is_board_member?: boolean | null;
	attendance?: 'present' | 'absent' | 'excused' | 'proxy' | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
}

export interface HoaMeeting {
	/** @primaryKey */
	id: string;
	sort?: number | null;
	/** @required */
	title: string;
	type?: 'board' | 'annual' | 'special' | 'committee' | null;
	status?: 'scheduled' | 'in_progress' | 'completed' | 'canceled' | null;
	/** @description Date & time the meeting starts */
	meeting_date?: string | null;
	/** @description Optional end date/time */
	end_date?: string | null;
	/** @description Physical location */
	location?: string | null;
	/** @description Video conference / livestream link */
	virtual_url?: string | null;
	/** @description Meeting notice document */
	notice_file?: DirectusFile | string | null;
	/** @description Meeting agenda */
	agenda?: string | null;
	/** @description Meeting minutes (published after the meeting) */
	minutes?: string | null;
	/** @description Link to recording (YouTube, Vimeo, etc.) */
	recording_url?: string | null;
	/** @description Uploaded recording file */
	recording_file?: DirectusFile | string | null;
	/** @description Visible to members when true */
	is_published?: boolean | null;
	target_audience?: 'all' | 'owners' | 'tenants' | 'board_members' | null;
	/** @required */
	organization: HoaOrganization | string;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	attendees?: HoaMeetingAttendee[] | string[];
	attachments?: HoaMeetingsFile[] | string[];
}

export interface HoaMeetingsFile {
	/** @primaryKey */
	id: string;
	hoa_meetings_id?: HoaMeeting | string | null;
	directus_files_id?: DirectusFile | string | null;
}

export interface HoaMemberChangeRequest {
	/** @primaryKey */
	id: string;
	/** @description Review state */
	status?: 'pending' | 'approved' | 'rejected' | 'cancelled' | null;
	/** @description What the resident is changing */
	kind?: 'contact' | 'mailing_address' | 'vehicle' | 'pet' | null;
	/** @description Add / update / remove */
	action?: 'create' | 'update' | 'delete' | null;
	/** @description Owning organization (tenant scope) @required */
	organization: HoaOrganization | string;
	/** @description The member this change belongs to @required */
	member: HoaMember | string;
	/** @description User who submitted the request */
	submitted_by?: DirectusUser | string | null;
	/** @description Admin / PM who decided */
	reviewed_by?: DirectusUser | string | null;
	/** @description hoa_members | hoa_vehicles | hoa_pets */
	target_collection?: string | null;
	/** @description Existing record id (null for new) */
	target_id?: string | null;
	/** @description Proposed field values */
	payload?: Record<string, any> | null;
	/** @description Resident's note to the reviewer */
	note?: string | null;
	/** @description Reviewer's note (esp. on reject) */
	review_note?: string | null;
	reviewed_at?: string | null;
	date_created?: string | null;
	date_updated?: string | null;
}

export interface HoaMember {
	/** @primaryKey */
	id: string;
	status?: 'archived' | 'active' | 'inactive' | 'pending';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	user?: DirectusUser | string | null;
	organization?: HoaOrganization | string | null;
	role?: DirectusRole | string | null;
	first_name?: string | null;
	last_name?: string | null;
	email?: string | null;
	phone?: string | null;
	member_type?: 'owner' | 'tenant' | null;
	total_payments?: number | null;
	last_payment_date?: string | null;
	last_payment_amount?: number | null;
	payment_status?: 'current' | 'overdue' | 'delinquent' | null;
	outstanding_balance?: number | null;
	company?: string | null;
	/** @description Per-manager grant flags for Property Manager members (inquiries, violations, directory, documents, communications). Enforced app-side + in server routes. */
	manager_permissions?: Record<string, any> | null;
	/** @description Separate mailing address { line1, line2, city, state, zip } (off-site owners). */
	mailing_address?: Record<string, any> | null;
	units?: HoaMemberUnit[] | string[];
	vehicles?: HoaVehicle[] | string[];
	pets?: HoaPet[] | string[];
	board_member_terms?: HoaBoardMember[] | string[];
}

export interface HoaMemberUnit {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	is_primary_unit?: boolean | null;
	start_date?: string | null;
	end_date?: string | null;
	ownership_percentage?: number | null;
	member_id?: HoaMember | string | null;
	unit_id?: HoaUnit | string | null;
}

export interface HoaNewsletterBlock {
	/** @primaryKey */
	id: string;
	sort?: number | null;
	/** @required */
	name: string;
	/** @required */
	slug: string;
	description?: string | null;
	category?: 'header' | 'hero' | 'content' | `two-column` | 'cta' | 'image' | 'stats' | 'quote' | 'list' | 'divider' | 'social' | 'footer' | null;
	/** @description MJML with {{{variable}}} slots. */
	mjml_source?: string | null;
	/** @description [{ key, label, type, default }] describing the block's slots. */
	variables_schema?: Record<string, any> | null;
	thumbnail?: DirectusFile | string | null;
	/** @description Platform block available to every org. */
	is_system?: boolean | null;
	/** @description Null = a platform/system row shared by all orgs. */
	organization?: HoaOrganization | string | null;
	date_created?: string | null;
	date_updated?: string | null;
}

export interface HoaOrganization {
	/** @primaryKey */
	id: string;
	status?: 'active' | 'inactive' | 'archived' | 'suspended';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	name?: string | null;
	billing_cycle?: 'monthly' | 'yearly' | null;
	city?: string | null;
	state?: string | null;
	zip?: string | null;
	street_address?: string | null;
	stripe_customer_id?: string | null;
	stripe_subscription_id?: string | null;
	subscription_status?: 'active' | 'trial' | 'canceled' | 'expired' | null;
	trial_ends_at?: string | null;
	member_count?: number | null;
	custom_domain?: string | null;
	domain_verified?: boolean | null;
	phone?: string | null;
	email?: string | null;
	settings?: BlockSetting | string | null;
	hero?: BlockHero | string | null;
	domain_type?: string | null;
	domain_config?: unknown[] | null;
	/** @required */
	slug: string;
	folder?: DirectusFolder | string | null;
	subscription_plan?: SubscriptionPlan | string | null;
	default_monthly_dues?: number | null;
	payment_grace_period_days?: number | null;
	late_fee_amount?: number | null;
	late_fee_enabled?: boolean | null;
	payment_instructions?: string | null;
	maintenance_mode?: boolean | null;
	show_board?: boolean | null;
	is_free_account?: boolean | null;
	legal_name?: string | null;
	type?: 'residential' | 'commercial' | null;
	/** @description Per-org optional module on/off toggles (managed from Settings → Modules). Missing keys are treated as enabled. */
	modules?: Record<string, any> | null;
	/** @description External marketing site URL (e.g. https://yourbuilding.com). When set, the built-in landing is disabled and HOA Connect serves the resident portal only. */
	external_url?: string | null;
	/** @description Inquiry → management-contact routing (managed from Settings → Property management). board_default notifies the board on every inquiry. */
	inquiry_routing?: Record<string, any> | null;
	/** @description Optional agency billing account. When set, the org's own subscription_* fields are advisory and entitlement resolves up to this account. Null = self-billed (default). */
	billing_account?: BillingAccount | string | null;
	/** @description Public landing insights counter ({ views, inquiries }). Maintained by the app. */
	landing_stats?: Record<string, any> | null;
	/** @description Stripe Connect (Express) account id — acct_... */
	stripe_connect_account_id?: string | null;
	/** @description Synced from Stripe via the account.updated webhook */
	connect_onboarding_status?: 'none' | 'pending' | 'restricted' | 'active' | null;
	/** @description Mirror of Stripe account.charges_enabled */
	connect_charges_enabled?: boolean | null;
	/** @description Mirror of Stripe account.payouts_enabled */
	connect_payouts_enabled?: boolean | null;
	/** @description AI assistant trust dial: 0 ask everything · 1 low-risk internal · 2 up to medium · 3 all non-outbound. Outbound always asks. */
	ai_autonomy_tier?: 0 | 1 | 2 | 3 | null;
	/** @description Public try-the-app demo org. Drives email/payment/AI guardrails. */
	is_demo?: boolean | null;
	/** @description Cached total file-storage usage (bytes). Maintained by the app; recomputed to self-heal. */
	storage_used_bytes?: number | null;
	/** @description Manual extra storage grant (bytes), stacked on top of the plan limit. For comps / one-off grants. */
	storage_extra_bytes?: number | null;
	/** @description Enabled paid add-ons keyed by id, e.g. { "extra_storage_100": true }. */
	active_addons?: Record<string, any> | null;
	amenities?: HoaAmenity[] | string[];
}

export interface HoaPet {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	member_id?: HoaMember | string | null;
	name?: string | null;
	type?: 'dog' | 'cat' | 'bird' | 'reptile' | 'other' | null;
	breed?: string | null;
	weight?: string | null;
	image?: DirectusFile | string | null;
	/** @description Tenancy (denormalized from member/unit) */
	organization?: HoaOrganization | string | null;
	/** @description The unit this record is tied to (persists across tenants) */
	unit_id?: HoaUnit | string | null;
	/** @description Registration / residency window start */
	start_date?: string | null;
	/** @description Set on move-out instead of deleting */
	end_date?: string | null;
}

export interface HoaPoll {
	/** @primaryKey */
	id: string;
	status?: 'draft' | 'open' | 'closed' | null;
	/** @required */
	title: string;
	description?: string | null;
	/** @description Array of { id, label } @required */
	options: Record<string, any>;
	allow_multiple?: boolean | null;
	/** @description Hide voter identity in the UI */
	is_anonymous?: boolean | null;
	closes_at?: string | null;
	target_audience?: 'all' | 'owners' | 'tenants' | 'board_members' | null;
	/** @required */
	organization: HoaOrganization | string;
	date_created?: string | null;
	user_created?: DirectusUser | string | null;
}

export interface HoaPollVote {
	/** @primaryKey */
	id: string;
	/** @required */
	poll: HoaPoll | string;
	/** @required */
	option_id: string;
	user?: DirectusUser | string | null;
	/** @required */
	organization: HoaOrganization | string;
	date_created?: string | null;
}

export interface HoaProjectEvent {
	/** @primaryKey */
	id: string;
	sort?: number | null;
	status?: 'draft' | 'scheduled' | 'active' | 'completed' | 'archived' | null;
	/** @required */
	project: HoaProject | string;
	/** @required */
	title: string;
	description?: string | null;
	type?: 'phase' | 'milestone' | 'meeting' | 'inspection' | 'payment' | 'other' | null;
	event_date?: string | null;
	/** @description Business days; end_date is computed app-side */
	duration_days?: number | null;
	end_date?: string | null;
	is_milestone?: boolean | null;
	/** @description Upstream event this one waits on */
	depends_on?: HoaProjectEvent | string | null;
	assigned_to?: DirectusUser | string | null;
	approval?: 'none_needed' | 'needs_approval' | 'approved' | null;
	approved_by?: DirectusUser | string | null;
	approved_at?: string | null;
	/** @description Single-purpose shareable approval link token */
	approval_token?: string | null;
	/** @description Optional per-phase cost (board-only) */
	cost_amount?: number | null;
	/** @required */
	organization: HoaOrganization | string;
	date_created?: string | null;
	date_updated?: string | null;
	user_created?: DirectusUser | string | null;
	/** @description Public approval link expiry */
	approval_token_expires?: string | null;
	/** @description Note left by the approver/rejecter */
	approval_note?: string | null;
	tasks?: HoaTask[] | string[];
	spawned_projects?: HoaProject[] | string[];
	files?: HoaProjectEventsFile[] | string[];
}

export interface HoaProjectEventsFile {
	/** @primaryKey */
	id: string;
	hoa_project_events_id?: HoaProjectEvent | string | null;
	directus_files_id?: DirectusFile | string | null;
}

export interface HoaProject {
	/** @primaryKey */
	id: string;
	sort?: number | null;
	status?: 'planning' | 'active' | 'on_hold' | 'completed' | 'archived' | null;
	/** @required */
	title: string;
	description?: string | null;
	/** @required */
	organization: HoaOrganization | string;
	/** @description Committee/team that owns this project */
	team?: HoaTeam | string | null;
	/** @description Parent project (sub-project nesting) */
	parent_project?: HoaProject | string | null;
	start_date?: string | null;
	due_date?: string | null;
	completion_date?: string | null;
	/** @description Timeline line color */
	color?: string | null;
	icon?: string | null;
	/** @description Residents can see this project (read-only) */
	member_visible?: boolean | null;
	/** @description Planned budget (board-only) */
	budget_amount?: number | null;
	/** @description Actual spend (manual; expense rollup comes later) */
	actual_spend?: number | null;
	date_created?: string | null;
	date_updated?: string | null;
	user_created?: DirectusUser | string | null;
	/** @description Milestone this project was spawned from */
	parent_event?: HoaProjectEvent | string | null;
	children?: HoaProject[] | string[];
	events?: HoaProjectEvent[] | string[];
	tasks?: HoaTask[] | string[];
	requests?: HoaRequest[] | string[];
	assigned_to?: HoaProjectsUser[] | string[];
	files?: HoaProjectsFile[] | string[];
	vendors?: HoaProjectsVendor[] | string[];
	expenses?: PaymentExpense[] | string[];
}

export interface HoaProjectsFile {
	/** @primaryKey */
	id: string;
	hoa_projects_id?: HoaProject | string | null;
	directus_files_id?: DirectusFile | string | null;
}

export interface HoaProjectsUser {
	/** @primaryKey */
	id: string;
	hoa_projects_id?: HoaProject | string | null;
	directus_users_id?: DirectusUser | string | null;
}

export interface HoaProjectsVendor {
	/** @primaryKey */
	id: string;
	hoa_projects_id?: HoaProject | string | null;
	hoa_vendors_id?: HoaVendor | string | null;
	/** @description What this vendor does on the project */
	role?: string | null;
}

export interface HoaReaction {
	/** @primaryKey */
	id: string;
	/** @description hoa_comments (react to a comment) or any entity @required */
	target_collection: string;
	/** @required */
	target_id: string;
	/** @description Unicode emoji or shortcode @required */
	emoji: string;
	/** @description Reacting user */
	user?: DirectusUser | string | null;
	/** @required */
	organization: HoaOrganization | string;
	date_created?: string | null;
}

export interface HoaRequest {
	/** @primaryKey */
	id: string;
	status?: 'open' | 'in_progress' | 'waiting' | 'resolved' | 'closed' | null;
	/** @required */
	type: 'maintenance' | 'arc' | 'violation' | 'complaint' | 'task';
	/** @required */
	title: string;
	description?: string | null;
	priority?: 'low' | 'normal' | 'high' | 'urgent' | null;
	/** @description Optional subcategory per type */
	category?: string | null;
	/** @description Reporter */
	submitted_by?: DirectusUser | string | null;
	/** @description Owner (board/manager/committee) */
	assigned_to?: DirectusUser | string | null;
	/** @description Unit/property the request concerns */
	unit?: HoaUnit | string | null;
	/** @description Subject member (violator, requester) */
	member?: HoaMember | string | null;
	due_date?: string | null;
	/** @description Array of file IDs (photos for maintenance/violations) */
	attachments?: Record<string, any> | null;
	/** @description Type-specific fields (Tier 2 — see requestWorkflows.ts) */
	metadata?: Record<string, any> | null;
	/** @required */
	organization: HoaOrganization | string;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	/** @description Parent ticket this request/task was spawned from. */
	parent_request?: HoaRequest | string | null;
	/** @description Project this request is attached to */
	project?: HoaProject | string | null;
	tasks?: HoaTask[] | string[];
}

export interface HoaTask {
	/** @primaryKey */
	id: string;
	sort?: number | null;
	status?: 'new' | 'approved' | 'in_progress' | 'completed' | null;
	/** @required */
	title: string;
	description?: string | null;
	priority?: 'low' | 'medium' | 'high' | 'urgent' | null;
	schedule?: 'today' | 'this_week' | 'later' | 'unscheduled' | null;
	due_date?: string | null;
	date_completed?: string | null;
	/** @description Parent task (subtask nesting) */
	parent_task?: HoaTask | string | null;
	/** @description Denormalized discriminator for where this task lives */
	category?: 'quick' | 'project' | 'event' | 'request' | 'team' | null;
	project?: HoaProject | string | null;
	project_event?: HoaProjectEvent | string | null;
	request?: HoaRequest | string | null;
	team?: HoaTeam | string | null;
	/** @required */
	organization: HoaOrganization | string;
	date_created?: string | null;
	date_updated?: string | null;
	user_created?: DirectusUser | string | null;
	subtasks?: HoaTask[] | string[];
	assigned_to?: HoaTasksUser[] | string[];
}

export interface HoaTasksUser {
	/** @primaryKey */
	id: string;
	hoa_tasks_id?: HoaTask | string | null;
	directus_users_id?: DirectusUser | string | null;
}

export interface HoaTeamMember {
	/** @primaryKey */
	id: string;
	/** @required */
	team: HoaTeam | string;
	/** @required */
	user: DirectusUser | string;
	member?: HoaMember | string | null;
	role?: 'member' | 'lead' | null;
	/** @required */
	organization: HoaOrganization | string;
	date_created?: string | null;
	user_created?: DirectusUser | string | null;
}

export interface HoaTeam {
	/** @primaryKey */
	id: string;
	sort?: number | null;
	status?: 'active' | 'archived' | null;
	/** @description Free-text team name @required */
	name: string;
	/** @description Optional — grants manager rights on the matching request type */
	domain?: 'none' | 'violations' | 'arc' | 'maintenance' | 'finance' | 'general' | null;
	color?: string | null;
	icon?: string | null;
	description?: string | null;
	/** @required */
	organization: HoaOrganization | string;
	date_created?: string | null;
	user_created?: DirectusUser | string | null;
	members?: HoaTeamMember[] | string[];
}

export interface HoaTemplateBlock {
	/** @primaryKey */
	id: string;
	sort?: number | null;
	/** @required */
	template_id: HoaEmailTemplate | string;
	/** @required */
	block_id: HoaNewsletterBlock | string;
	instance_variables?: Record<string, any> | null;
	date_created?: string | null;
}

export interface HoaUnit {
	/** @primaryKey */
	id: string;
	status?: 'active' | 'inactive' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	organization?: HoaOrganization | string | null;
	unit_number?: string | null;
	members?: HoaMemberUnit[] | string[];
	leases?: HoaLease[] | string[];
}

export interface HoaVehicle {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	make?: string | null;
	model?: string | null;
	year?: string | null;
	license_plate?: string | null;
	parking_spot?: string | null;
	image?: DirectusFile | string | null;
	member_id?: HoaMember | string | null;
	/** @description Tenancy (denormalized from member/unit) */
	organization?: HoaOrganization | string | null;
	/** @description The unit this record is tied to (persists across tenants) */
	unit_id?: HoaUnit | string | null;
	/** @description Registration / residency window start */
	start_date?: string | null;
	/** @description Set on move-out instead of deleting */
	end_date?: string | null;
}

export interface HoaVendor {
	/** @primaryKey */
	id: string;
	/** @description Vendor type @required */
	category: 'management' | 'attorney' | 'accountant' | 'insurance' | 'elevator' | 'landscaping' | 'plumbing' | 'electrical' | 'cleaning' | 'security' | 'pest_control' | 'hvac' | 'general_contractor' | 'other';
	/** @description Custom label when category is 'Other' */
	category_other?: string | null;
	status?: 'active' | 'inactive' | 'archived' | null;
	/** @description Visible in the member-facing vendor directory */
	show_to_members?: boolean | null;
	/** @description Company / firm name (primary label) */
	company?: string | null;
	/** @description Contact person (optional) */
	name?: string | null;
	email?: string | null;
	phone?: string | null;
	website?: string | null;
	address?: string | null;
	/** @description When this vendor started serving the community */
	active_since?: string | null;
	/** @description When the relationship ended (leave blank if current) */
	active_until?: string | null;
	notes?: string | null;
	sort?: number | null;
	/** @description MANAGEMENT vendors only: which inquiries route here */
	management_role?: 'rental_sales' | 'violations' | 'general' | null;
	/** @description MANAGEMENT vendors: email on a routed inquiry */
	notify_email?: boolean | null;
	/** @description MANAGEMENT vendors: in-app notify the linked login */
	notify_inapp?: boolean | null;
	/** @description Optional: linked login user (Property Manager) */
	user?: DirectusUser | string | null;
	/** @description Optional: linked member row */
	hoa_member?: HoaMember | string | null;
	/** @required */
	organization: HoaOrganization | string;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
}

export interface PaymentExpense {
	/** @primaryKey */
	id: string;
	status?: 'draft' | 'approved' | 'paid' | null;
	category?: 'maintenance' | 'utilities' | 'insurance' | 'landscaping' | 'admin' | 'other' | null;
	/** @required */
	title: string;
	/** @description Who was paid */
	vendor?: string | null;
	/** @description USD (decimal) @required */
	amount: number;
	expense_date?: string | null;
	paid_date?: string | null;
	description?: string | null;
	/** @description Internal notes */
	notes?: string | null;
	/** @description Receipt or invoice */
	receipt?: DirectusFile | string | null;
	/** @required */
	organization: HoaOrganization | string;
	sort?: number | null;
	date_created?: string | null;
	user_created?: DirectusUser | string | null;
	date_updated?: string | null;
	user_updated?: DirectusUser | string | null;
	/** @description Roll this expense up into a project's budget */
	project?: HoaProject | string | null;
}

export interface PaymentRequest {
	/** @primaryKey */
	id: string;
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	status?: 'draft' | 'active' | 'paid' | 'partially_paid' | 'overdue' | 'canceled' | null;
	/** @required */
	organization: HoaOrganization | string;
	/** @required */
	member: HoaMember | string;
	/** @required */
	request_type: 'monthly_dues' | 'assessment' | 'late_fee' | 'other';
	/** @required */
	title: string;
	description?: string | null;
	amount?: number | null;
	due_date?: string | null;
	amount_paid?: number | null;
	amount_remaining?: number | null;
	paid_at?: string | null;
	email_sent?: boolean | null;
	email_sent_at?: string | null;
	reminder_sent?: boolean | null;
	reminder_sent_at?: string | null;
	notes?: string | null;
	metadata?: 'json' | null;
	transactions?: PaymentTransaction[] | string[];
}

export interface PaymentSchedule {
	/** @primaryKey */
	id: string;
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	status?: 'active' | 'paused' | 'completed' | 'canceled' | null;
	organization?: HoaOrganization | string | null;
	member?: HoaMember | string | null;
	/** @required */
	title: string;
	description?: string | null;
	/** @required */
	amount: number;
	/** @required */
	frequency: 'monthly' | 'quarterly' | 'annually';
	/** @required */
	start_date: string;
	end_date?: string | null;
	/** @required */
	next_payment_date: string;
	total_payments_generated?: number | null;
	last_payment_gnerated_at?: string | null;
}

export interface PaymentTransaction {
	/** @primaryKey */
	id: string;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	status?: 'pending' | 'succeeded' | 'failed' | 'canceled' | 'refunded' | null;
	organization?: HoaOrganization | string | null;
	member?: HoaMember | string | null;
	amount?: number | null;
	currency?: string | null;
	description?: string | null;
	/** @required */
	stripe_payment_intent_id: string;
	stripe_charge_id?: string | null;
	stripe_customer_id?: string | null;
	stripe_payment_method_id?: string | null;
	stripe_payment_method?: 'card' | 'us_bank_account' | null;
	last4?: string | null;
	receipt_url?: string | null;
	receipt_email?: string | null;
	processing_fee?: number | null;
	net_amount?: number | null;
	notes?: string | null;
	metadata?: 'json' | null;
	payment_request?: PaymentRequest | string | null;
}

export interface SubscriptionPlan {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived';
	sort?: number | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	user_updated?: DirectusUser | string | null;
	date_updated?: string | null;
	name?: string | null;
	slug?: string | null;
	description?: string | null;
	price_monthly?: number | null;
	stripe_price_id_monthly?: string | null;
	stripe_price_id_yearly?: string | null;
	price_yearly?: number | null;
	features?: 'json' | null;
	max_members?: number | null;
	max_storage_gb?: number | null;
	max_documents?: number | null;
	is_active?: boolean | null;
	is_featured?: boolean | null;
	trial_days?: number | null;
	/** @description Monthly AI-credit allowance for this plan tier. */
	included_credits?: number;
	/** @description Band lower bound (units). */
	min_units?: number | null;
	/** @description Band upper bound (units). Null = no cap (Enterprise). */
	max_units?: number | null;
	/** @description Standard one-time setup fee (USD). */
	onboarding_fee?: number | null;
	/** @description Stripe one-time Price id for standard onboarding. */
	stripe_price_id_onboarding?: string | null;
	/** @description Display billing unit. Always 'building' — never 'unit'. */
	billing_unit?: string;
	/** @description Hide price, show 'Contact us' (Enterprise / Signature). */
	is_contact_only?: boolean;
}

export interface WaitlistSignup {
	/** @primaryKey */
	id: string;
	status?: 'new' | 'contacted' | 'qualified' | 'archived' | null;
	sort?: number | null;
	name?: string | null;
	/** @description Required. */
	email?: string | null;
	role?: 'board_member' | 'property_manager' | 'developer' | 'resident' | 'other' | null;
	association_name?: string | null;
	unit_count?: `0-30` | `31-60` | `61-100` | `101-200` | `200+` | null;
	city?: string | null;
	state?: string | null;
	/** @description Features the lead is most interested in. */
	interests?: string[] | null;
	/** @description What the lead wants to achieve. */
	goals?: string | null;
	/** @description Which marketing page the signup came from. */
	source_page?: string | null;
	user_agent?: string | null;
	date_created?: string | null;
}

export interface DirectusAccess {
	/** @primaryKey */
	id: string;
	role?: DirectusRole | string | null;
	user?: DirectusUser | string | null;
	policy?: DirectusPolicy | string;
	sort?: number | null;
}

export interface DirectusActivity {
	/** @primaryKey */
	id: number;
	action?: string;
	user?: DirectusUser | string | null;
	timestamp?: string;
	ip?: string | null;
	user_agent?: string | null;
	collection?: string;
	item?: string;
	origin?: string | null;
	revisions?: DirectusRevision[] | string[];
}

export interface DirectusCollection {
	/** @primaryKey */
	collection: string;
	icon?: string | null;
	note?: string | null;
	display_template?: string | null;
	hidden?: boolean;
	singleton?: boolean;
	translations?: Array<{ language: string; translation: string; singular: string; plural: string }> | null;
	archive_field?: string | null;
	archive_app_filter?: boolean;
	archive_value?: string | null;
	unarchive_value?: string | null;
	sort_field?: string | null;
	accountability?: 'all' | 'activity' | null | null;
	color?: string | null;
	item_duplication_fields?: 'json' | null;
	sort?: number | null;
	group?: DirectusCollection | string | null;
	collapse?: string;
	preview_url?: string | null;
	versioning?: boolean;
}

export interface DirectusComment {
	/** @primaryKey */
	id: string;
	collection?: DirectusCollection | string;
	item?: string;
	comment?: string;
	date_created?: string | null;
	date_updated?: string | null;
	user_created?: DirectusUser | string | null;
	user_updated?: DirectusUser | string | null;
}

export interface DirectusField {
	/** @primaryKey */
	id: number;
	collection?: DirectusCollection | string;
	field?: string;
	special?: string[] | null;
	interface?: string | null;
	options?: 'json' | null;
	display?: string | null;
	display_options?: 'json' | null;
	readonly?: boolean;
	hidden?: boolean;
	sort?: number | null;
	width?: string | null;
	translations?: 'json' | null;
	note?: string | null;
	conditions?: 'json' | null;
	required?: boolean | null;
	group?: DirectusField | string | null;
	validation?: 'json' | null;
	validation_message?: string | null;
	searchable?: boolean;
}

export interface DirectusFile {
	/** @primaryKey */
	id: string;
	storage?: string;
	filename_disk?: string | null;
	filename_download?: string;
	title?: string | null;
	type?: string | null;
	folder?: DirectusFolder | string | null;
	uploaded_by?: DirectusUser | string | null;
	created_on?: string;
	modified_by?: DirectusUser | string | null;
	modified_on?: string;
	charset?: string | null;
	filesize?: number | null;
	width?: number | null;
	height?: number | null;
	duration?: number | null;
	embed?: string | null;
	description?: string | null;
	location?: string | null;
	tags?: string[] | null;
	metadata?: 'json' | null;
	focal_point_x?: number | null;
	focal_point_y?: number | null;
	tus_id?: string | null;
	tus_data?: 'json' | null;
	uploaded_on?: string | null;
}

export interface DirectusFolder {
	/** @primaryKey */
	id: string;
	name?: string;
	parent?: DirectusFolder | string | null;
}

export interface DirectusMigration {
	/** @primaryKey */
	version: string;
	name?: string;
	timestamp?: string | null;
}

export interface DirectusPermission {
	/** @primaryKey */
	id: number;
	collection?: string;
	action?: string;
	permissions?: 'json' | null;
	validation?: 'json' | null;
	presets?: 'json' | null;
	fields?: string[] | null;
	policy?: DirectusPolicy | string;
}

export interface DirectusPolicy {
	/** @primaryKey */
	id: string;
	/** @required */
	name: string;
	icon?: string;
	description?: string | null;
	ip_access?: string[] | null;
	enforce_tfa?: boolean;
	admin_access?: boolean;
	app_access?: boolean;
	permissions?: DirectusPermission[] | string[];
	users?: DirectusAccess[] | string[];
	roles?: DirectusAccess[] | string[];
}

export interface DirectusPreset {
	/** @primaryKey */
	id: number;
	bookmark?: string | null;
	user?: DirectusUser | string | null;
	role?: DirectusRole | string | null;
	collection?: string | null;
	search?: string | null;
	layout?: string | null;
	layout_query?: 'json' | null;
	layout_options?: 'json' | null;
	refresh_interval?: number | null;
	filter?: 'json' | null;
	icon?: string | null;
	color?: string | null;
}

export interface DirectusRelation {
	/** @primaryKey */
	id: number;
	many_collection?: string;
	many_field?: string;
	one_collection?: string | null;
	one_field?: string | null;
	one_collection_field?: string | null;
	one_allowed_collections?: string[] | null;
	junction_field?: string | null;
	sort_field?: string | null;
	one_deselect_action?: string;
}

export interface DirectusRevision {
	/** @primaryKey */
	id: number;
	activity?: DirectusActivity | string;
	collection?: string;
	item?: string;
	data?: 'json' | null;
	delta?: 'json' | null;
	parent?: DirectusRevision | string | null;
	version?: DirectusVersion | string | null;
}

export interface DirectusRole {
	/** @primaryKey */
	id: string;
	/** @required */
	name: string;
	icon?: string;
	description?: string | null;
	parent?: DirectusRole | string | null;
	children?: DirectusRole[] | string[];
	policies?: DirectusAccess[] | string[];
	users?: DirectusUser[] | string[];
}

export interface DirectusSession {
	/** @primaryKey */
	token: string;
	user?: DirectusUser | string | null;
	expires?: string;
	ip?: string | null;
	user_agent?: string | null;
	share?: DirectusShare | string | null;
	origin?: string | null;
	next_token?: string | null;
}

export interface DirectusSettings {
	/** @primaryKey */
	id: number;
	project_name?: string;
	project_url?: string | null;
	project_color?: string;
	project_logo?: DirectusFile | string | null;
	public_foreground?: DirectusFile | string | null;
	public_background?: DirectusFile | string | null;
	public_note?: string | null;
	auth_login_attempts?: number | null;
	auth_password_policy?: null | `/^.{8,}$/` | `/(?=^.{8,}$)(?=.*\\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%^&*()_+}{';'?>.<,])(?!.*\\s).*$/` | null;
	storage_asset_transform?: 'all' | 'none' | 'presets' | null;
	storage_asset_presets?: Array<{ key: string; fit: 'contain' | 'cover' | 'inside' | 'outside'; width: number; height: number; quality: number; withoutEnlargement: boolean; format: 'auto' | 'jpeg' | 'png' | 'webp' | 'tiff' | 'avif'; transforms: 'json' }> | null;
	custom_css?: string | null;
	storage_default_folder?: DirectusFolder | string | null;
	basemaps?: Array<{ name: string; type: 'raster' | 'tile' | 'style'; url: string; tileSize: number; attribution: string }> | null;
	mapbox_key?: string | null;
	module_bar?: 'json' | null;
	project_descriptor?: string | null;
	default_language?: string;
	custom_aspect_ratios?: Array<{ text: string; value: number }> | null;
	public_favicon?: DirectusFile | string | null;
	default_appearance?: 'auto' | 'light' | 'dark';
	default_theme_light?: string | null;
	theme_light_overrides?: 'json' | null;
	default_theme_dark?: string | null;
	theme_dark_overrides?: 'json' | null;
	report_error_url?: string | null;
	report_bug_url?: string | null;
	report_feature_url?: string | null;
	public_registration?: boolean;
	public_registration_verify_email?: boolean;
	public_registration_role?: DirectusRole | string | null;
	public_registration_email_filter?: 'json' | null;
	visual_editor_urls?: Array<{ url: string }> | null;
	project_id?: string | null;
	mcp_enabled?: boolean;
	mcp_allow_deletes?: boolean;
	mcp_prompts_collection?: string | null;
	mcp_system_prompt_enabled?: boolean;
	mcp_system_prompt?: string | null;
	project_owner?: string | null;
	project_usage?: string | null;
	org_name?: string | null;
	product_updates?: boolean | null;
	project_status?: string | null;
}

export interface DirectusUser {
	/** @primaryKey */
	id: string;
	first_name?: string | null;
	last_name?: string | null;
	email?: string | null;
	password?: string | null;
	location?: string | null;
	title?: string | null;
	description?: string | null;
	tags?: string[] | null;
	avatar?: DirectusFile | string | null;
	language?: string | null;
	tfa_secret?: string | null;
	status?: 'draft' | 'invited' | 'unverified' | 'active' | 'suspended' | 'archived';
	role?: DirectusRole | string | null;
	token?: string | null;
	last_access?: string | null;
	last_page?: string | null;
	provider?: string;
	external_identifier?: string | null;
	auth_data?: 'json' | null;
	email_notifications?: boolean | null;
	appearance?: null | 'auto' | 'light' | 'dark' | null;
	theme_dark?: string | null;
	theme_light?: string | null;
	theme_light_overrides?: 'json' | null;
	theme_dark_overrides?: 'json' | null;
	text_direction?: 'auto' | 'ltr' | 'rtl';
	/** @description Per-category email/bell toggles + digest settings. Managed from the account preferences UI. */
	notification_preferences?: Record<string, any> | null;
	policies?: DirectusAccess[] | string[];
}

export interface DirectusWebhook {
	/** @primaryKey */
	id: number;
	name?: string;
	method?: null;
	url?: string;
	status?: 'active' | 'inactive';
	data?: boolean;
	actions?: 'create' | 'update' | 'delete';
	collections?: string[];
	headers?: Array<{ header: string; value: string }> | null;
	was_active_before_deprecation?: boolean;
	migrated_flow?: DirectusFlow | string | null;
}

export interface DirectusDashboard {
	/** @primaryKey */
	id: string;
	name?: string;
	icon?: string;
	note?: string | null;
	date_created?: string | null;
	user_created?: DirectusUser | string | null;
	color?: string | null;
	panels?: DirectusPanel[] | string[];
}

export interface DirectusPanel {
	/** @primaryKey */
	id: string;
	dashboard?: DirectusDashboard | string;
	name?: string | null;
	icon?: string | null;
	color?: string | null;
	show_header?: boolean;
	note?: string | null;
	type?: string;
	position_x?: number;
	position_y?: number;
	width?: number;
	height?: number;
	options?: 'json' | null;
	date_created?: string | null;
	user_created?: DirectusUser | string | null;
}

export interface DirectusNotification {
	/** @primaryKey */
	id: number;
	timestamp?: string | null;
	status?: string | null;
	recipient?: DirectusUser | string;
	sender?: DirectusUser | string | null;
	subject?: string;
	message?: string | null;
	collection?: string | null;
	item?: string | null;
}

export interface DirectusShare {
	/** @primaryKey */
	id: string;
	name?: string | null;
	collection?: DirectusCollection | string;
	item?: string;
	role?: DirectusRole | string | null;
	password?: string | null;
	user_created?: DirectusUser | string | null;
	date_created?: string | null;
	date_start?: string | null;
	date_end?: string | null;
	times_used?: number | null;
	max_uses?: number | null;
}

export interface DirectusFlow {
	/** @primaryKey */
	id: string;
	name?: string;
	icon?: string | null;
	color?: string | null;
	description?: string | null;
	status?: string;
	trigger?: string | null;
	accountability?: string | null;
	options?: 'json' | null;
	operation?: DirectusOperation | string | null;
	date_created?: string | null;
	user_created?: DirectusUser | string | null;
	operations?: DirectusOperation[] | string[];
}

export interface DirectusOperation {
	/** @primaryKey */
	id: string;
	name?: string | null;
	key?: string;
	type?: string;
	position_x?: number;
	position_y?: number;
	options?: 'json' | null;
	resolve?: DirectusOperation | string | null;
	reject?: DirectusOperation | string | null;
	flow?: DirectusFlow | string;
	date_created?: string | null;
	user_created?: DirectusUser | string | null;
}

export interface DirectusTranslation {
	/** @primaryKey */
	id: string;
	/** @required */
	language: string;
	/** @required */
	key: string;
	/** @required */
	value: string;
}

export interface DirectusVersion {
	/** @primaryKey */
	id: string;
	key?: string;
	name?: string | null;
	collection?: DirectusCollection | string;
	item?: string;
	hash?: string | null;
	date_created?: string | null;
	date_updated?: string | null;
	user_created?: DirectusUser | string | null;
	user_updated?: DirectusUser | string | null;
	delta?: 'json' | null;
}

export interface DirectusExtension {
	enabled?: boolean;
	/** @primaryKey */
	id: string;
	folder?: string;
	source?: string;
	bundle?: string | null;
}

export interface Schema {
	ai_actions: AiAction[];
	ai_context_snapshots: AiContextSnapshot[];
	ai_conversations: AiConversation[];
	ai_doc_chunks: AiDocChunk[];
	ai_messages: AiMessage[];
	ai_transactions: AiTransaction[];
	ai_wallets: AiWallet[];
	billing_account_members: BillingAccountMember[];
	billing_accounts: BillingAccount[];
	block_hero: BlockHero[];
	block_settings: BlockSetting[];
	coupons: Coupon[];
	coupons_subscription_plans: CouponsSubscriptionPlan[];
	coupon_usage: CouponUsage[];
	hoa_activity: HoaActivity[];
	hoa_amenities: HoaAmenity[];
	hoa_announcements: HoaAnnouncement[];
	hoa_board_members: HoaBoardMember[];
	hoa_channel_members: HoaChannelMember[];
	hoa_channel_mentions: HoaChannelMention[];
	hoa_channel_messages: HoaChannelMessage[];
	hoa_channel_moderation_log: HoaChannelModerationLog[];
	hoa_channels: HoaChannel[];
	hoa_comment_reports: HoaCommentReport[];
	hoa_comments: HoaComment[];
	hoa_document_categories: HoaDocumentCategory[];
	hoa_documents: HoaDocument[];
	hoa_email_activity: HoaEmailActivity[];
	hoa_email_partials: HoaEmailPartial[];
	hoa_email_recipients: HoaEmailRecipient[];
	hoa_emails: HoaEmail[];
	hoa_emails_files: HoaEmailsFile[];
	hoa_email_templates: HoaEmailTemplate[];
	hoa_governance: HoaGovernance[];
	hoa_invitations: HoaInvitation[];
	hoa_join_requests: HoaJoinRequest[];
	hoa_leases: HoaLease[];
	hoa_mailing_list_members: HoaMailingListMember[];
	hoa_mailing_lists: HoaMailingList[];
	hoa_meeting_attendees: HoaMeetingAttendee[];
	hoa_meetings: HoaMeeting[];
	hoa_meetings_files: HoaMeetingsFile[];
	hoa_member_change_requests: HoaMemberChangeRequest[];
	hoa_members: HoaMember[];
	hoa_member_units: HoaMemberUnit[];
	hoa_newsletter_blocks: HoaNewsletterBlock[];
	hoa_organizations: HoaOrganization[];
	hoa_pets: HoaPet[];
	hoa_polls: HoaPoll[];
	hoa_poll_votes: HoaPollVote[];
	hoa_project_events: HoaProjectEvent[];
	hoa_project_events_files: HoaProjectEventsFile[];
	hoa_projects: HoaProject[];
	hoa_projects_files: HoaProjectsFile[];
	hoa_projects_users: HoaProjectsUser[];
	hoa_projects_vendors: HoaProjectsVendor[];
	hoa_reactions: HoaReaction[];
	hoa_requests: HoaRequest[];
	hoa_tasks: HoaTask[];
	hoa_tasks_users: HoaTasksUser[];
	hoa_team_members: HoaTeamMember[];
	hoa_teams: HoaTeam[];
	hoa_template_blocks: HoaTemplateBlock[];
	hoa_units: HoaUnit[];
	hoa_vehicles: HoaVehicle[];
	hoa_vendors: HoaVendor[];
	payment_expenses: PaymentExpense[];
	payment_requests: PaymentRequest[];
	payment_schedules: PaymentSchedule[];
	payment_transactions: PaymentTransaction[];
	subscription_plans: SubscriptionPlan[];
	waitlist_signups: WaitlistSignup[];
	directus_access: DirectusAccess[];
	directus_activity: DirectusActivity[];
	directus_collections: DirectusCollection[];
	directus_comments: DirectusComment[];
	directus_fields: DirectusField[];
	directus_files: DirectusFile[];
	directus_folders: DirectusFolder[];
	directus_migrations: DirectusMigration[];
	directus_permissions: DirectusPermission[];
	directus_policies: DirectusPolicy[];
	directus_presets: DirectusPreset[];
	directus_relations: DirectusRelation[];
	directus_revisions: DirectusRevision[];
	directus_roles: DirectusRole[];
	directus_sessions: DirectusSession[];
	directus_settings: DirectusSettings;
	directus_users: DirectusUser[];
	directus_webhooks: DirectusWebhook[];
	directus_dashboards: DirectusDashboard[];
	directus_panels: DirectusPanel[];
	directus_notifications: DirectusNotification[];
	directus_shares: DirectusShare[];
	directus_flows: DirectusFlow[];
	directus_operations: DirectusOperation[];
	directus_translations: DirectusTranslation[];
	directus_versions: DirectusVersion[];
	directus_extensions: DirectusExtension[];
}

export enum CollectionNames {
	ai_actions = 'ai_actions',
	ai_context_snapshots = 'ai_context_snapshots',
	ai_conversations = 'ai_conversations',
	ai_doc_chunks = 'ai_doc_chunks',
	ai_messages = 'ai_messages',
	ai_transactions = 'ai_transactions',
	ai_wallets = 'ai_wallets',
	billing_account_members = 'billing_account_members',
	billing_accounts = 'billing_accounts',
	block_hero = 'block_hero',
	block_settings = 'block_settings',
	coupons = 'coupons',
	coupons_subscription_plans = 'coupons_subscription_plans',
	coupon_usage = 'coupon_usage',
	hoa_activity = 'hoa_activity',
	hoa_amenities = 'hoa_amenities',
	hoa_announcements = 'hoa_announcements',
	hoa_board_members = 'hoa_board_members',
	hoa_channel_members = 'hoa_channel_members',
	hoa_channel_mentions = 'hoa_channel_mentions',
	hoa_channel_messages = 'hoa_channel_messages',
	hoa_channel_moderation_log = 'hoa_channel_moderation_log',
	hoa_channels = 'hoa_channels',
	hoa_comment_reports = 'hoa_comment_reports',
	hoa_comments = 'hoa_comments',
	hoa_document_categories = 'hoa_document_categories',
	hoa_documents = 'hoa_documents',
	hoa_email_activity = 'hoa_email_activity',
	hoa_email_partials = 'hoa_email_partials',
	hoa_email_recipients = 'hoa_email_recipients',
	hoa_emails = 'hoa_emails',
	hoa_emails_files = 'hoa_emails_files',
	hoa_email_templates = 'hoa_email_templates',
	hoa_governance = 'hoa_governance',
	hoa_invitations = 'hoa_invitations',
	hoa_join_requests = 'hoa_join_requests',
	hoa_leases = 'hoa_leases',
	hoa_mailing_list_members = 'hoa_mailing_list_members',
	hoa_mailing_lists = 'hoa_mailing_lists',
	hoa_meeting_attendees = 'hoa_meeting_attendees',
	hoa_meetings = 'hoa_meetings',
	hoa_meetings_files = 'hoa_meetings_files',
	hoa_member_change_requests = 'hoa_member_change_requests',
	hoa_members = 'hoa_members',
	hoa_member_units = 'hoa_member_units',
	hoa_newsletter_blocks = 'hoa_newsletter_blocks',
	hoa_organizations = 'hoa_organizations',
	hoa_pets = 'hoa_pets',
	hoa_polls = 'hoa_polls',
	hoa_poll_votes = 'hoa_poll_votes',
	hoa_project_events = 'hoa_project_events',
	hoa_project_events_files = 'hoa_project_events_files',
	hoa_projects = 'hoa_projects',
	hoa_projects_files = 'hoa_projects_files',
	hoa_projects_users = 'hoa_projects_users',
	hoa_projects_vendors = 'hoa_projects_vendors',
	hoa_reactions = 'hoa_reactions',
	hoa_requests = 'hoa_requests',
	hoa_tasks = 'hoa_tasks',
	hoa_tasks_users = 'hoa_tasks_users',
	hoa_team_members = 'hoa_team_members',
	hoa_teams = 'hoa_teams',
	hoa_template_blocks = 'hoa_template_blocks',
	hoa_units = 'hoa_units',
	hoa_vehicles = 'hoa_vehicles',
	hoa_vendors = 'hoa_vendors',
	payment_expenses = 'payment_expenses',
	payment_requests = 'payment_requests',
	payment_schedules = 'payment_schedules',
	payment_transactions = 'payment_transactions',
	subscription_plans = 'subscription_plans',
	waitlist_signups = 'waitlist_signups',
	directus_access = 'directus_access',
	directus_activity = 'directus_activity',
	directus_collections = 'directus_collections',
	directus_comments = 'directus_comments',
	directus_fields = 'directus_fields',
	directus_files = 'directus_files',
	directus_folders = 'directus_folders',
	directus_migrations = 'directus_migrations',
	directus_permissions = 'directus_permissions',
	directus_policies = 'directus_policies',
	directus_presets = 'directus_presets',
	directus_relations = 'directus_relations',
	directus_revisions = 'directus_revisions',
	directus_roles = 'directus_roles',
	directus_sessions = 'directus_sessions',
	directus_settings = 'directus_settings',
	directus_users = 'directus_users',
	directus_webhooks = 'directus_webhooks',
	directus_dashboards = 'directus_dashboards',
	directus_panels = 'directus_panels',
	directus_notifications = 'directus_notifications',
	directus_shares = 'directus_shares',
	directus_flows = 'directus_flows',
	directus_operations = 'directus_operations',
	directus_translations = 'directus_translations',
	directus_versions = 'directus_versions',
	directus_extensions = 'directus_extensions'
}