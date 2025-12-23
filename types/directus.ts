
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
	/** @required */
	title: string;
	/** @description Announcement content (HTML supported) */
	content?: string | null;
	/** @description Type of announcement for display styling */
	announcement_type?: 'general' | 'urgent' | 'maintenance' | 'event' | 'reminder' | null;
	/** @description When to start showing this announcement */
	publish_date?: string | null;
	/** @description When to stop showing this announcement (leave empty for no expiration) */
	expiry_date?: string | null;
	/** @description Whether to pin this announcement to the top */
	is_pinned?: boolean | null;
	/** @description Target audience for the announcement */
	target_audience?: 'all' | 'owners' | 'tenants' | 'board_members' | null;
	/** @required */
	organization: HoaOrganization | string;
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
	title?: `borad member` | 'president' | `Vice President` | 'secretary' | 'treasurer' | null;
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

export interface HoaChannel {
	/** @primaryKey */
	id: string;
	status?: 'published' | 'draft' | 'archived' | null;
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
	email_type: 'basic' | 'newsletter' | 'announcement' | 'reminder' | 'notice';
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
	/** @description Email recipients and their delivery status */
	recipients?: HoaEmailRecipient[] | string[];
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
	units?: HoaMemberUnit[] | string[];
	pets?: HoaPet[] | string[];
	vehicles?: HoaVehicle[] | string[];
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
	type?: 'dog' | 'cat' | null;
	breed?: string | null;
	weight?: string | null;
	image?: DirectusFile | string | null;
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
	block_hero: BlockHero[];
	block_settings: BlockSetting[];
	coupons: Coupon[];
	coupons_subscription_plans: CouponsSubscriptionPlan[];
	coupon_usage: CouponUsage[];
	hoa_amenities: HoaAmenity[];
	hoa_announcements: HoaAnnouncement[];
	hoa_board_members: HoaBoardMember[];
	hoa_channel_members: HoaChannelMember[];
	hoa_channel_mentions: HoaChannelMention[];
	hoa_channel_messages: HoaChannelMessage[];
	hoa_channels: HoaChannel[];
	hoa_document_categories: HoaDocumentCategory[];
	hoa_documents: HoaDocument[];
	hoa_email_activity: HoaEmailActivity[];
	hoa_email_recipients: HoaEmailRecipient[];
	hoa_emails: HoaEmail[];
	hoa_invitations: HoaInvitation[];
	hoa_mailing_list_members: HoaMailingListMember[];
	hoa_mailing_lists: HoaMailingList[];
	hoa_members: HoaMember[];
	hoa_member_units: HoaMemberUnit[];
	hoa_organizations: HoaOrganization[];
	hoa_pets: HoaPet[];
	hoa_units: HoaUnit[];
	hoa_vehicles: HoaVehicle[];
	payment_requests: PaymentRequest[];
	payment_schedules: PaymentSchedule[];
	payment_transactions: PaymentTransaction[];
	subscription_plans: SubscriptionPlan[];
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
	block_hero = 'block_hero',
	block_settings = 'block_settings',
	coupons = 'coupons',
	coupons_subscription_plans = 'coupons_subscription_plans',
	coupon_usage = 'coupon_usage',
	hoa_amenities = 'hoa_amenities',
	hoa_announcements = 'hoa_announcements',
	hoa_board_members = 'hoa_board_members',
	hoa_channel_members = 'hoa_channel_members',
	hoa_channel_mentions = 'hoa_channel_mentions',
	hoa_channel_messages = 'hoa_channel_messages',
	hoa_channels = 'hoa_channels',
	hoa_document_categories = 'hoa_document_categories',
	hoa_documents = 'hoa_documents',
	hoa_email_activity = 'hoa_email_activity',
	hoa_email_recipients = 'hoa_email_recipients',
	hoa_emails = 'hoa_emails',
	hoa_invitations = 'hoa_invitations',
	hoa_mailing_list_members = 'hoa_mailing_list_members',
	hoa_mailing_lists = 'hoa_mailing_lists',
	hoa_members = 'hoa_members',
	hoa_member_units = 'hoa_member_units',
	hoa_organizations = 'hoa_organizations',
	hoa_pets = 'hoa_pets',
	hoa_units = 'hoa_units',
	hoa_vehicles = 'hoa_vehicles',
	payment_requests = 'payment_requests',
	payment_schedules = 'payment_schedules',
	payment_transactions = 'payment_transactions',
	subscription_plans = 'subscription_plans',
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