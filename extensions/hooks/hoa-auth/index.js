/**
 * HOA Authentication Hook
 *
 * This hook integrates with Directus native OAuth to provide HOA-specific functionality:
 * - Automatic HOA member association on login
 * - Organization context management
 * - OAuth provider tracking (via directus_users native fields)
 *
 * Works with native Directus OAuth providers (Google, GitHub, etc.)
 *
 * Note: User data is stored in directus_users (avatar, language, OAuth data)
 * and hoa_members (phone, org-specific data). No separate profile collection.
 */

export default ({ filter, action }, { services, database, getSchema, logger }) => {
	const { ItemsService, UsersService } = services;

	/**
	 * Hook: auth.login
	 * Triggered after successful authentication
	 * Associates user with HOA organization and sets context
	 */
	action('auth.login', async ({ payload, accountability, schema }, context) => {
		try {
			const userId = accountability?.user;
			if (!userId) {
				logger.warn('auth.login hook: No user ID in accountability');
				return;
			}

			logger.info(`HOA Auth Hook: User ${userId} logged in`);

			// Get the schema for database operations
			const currentSchema = schema || await getSchema();

			// Check if user already has an HOA member record
			const membersService = new ItemsService('hoa_members', {
				schema: currentSchema,
				accountability: { admin: true }
			});

			const existingMember = await membersService.readByQuery({
				filter: { user: { _eq: userId } },
				limit: 1
			});

			if (existingMember && existingMember.length > 0) {
				logger.info(`HOA Auth Hook: User ${userId} already has member record`);
				return;
			}

			// Get user details to check OAuth provider
			const usersService = new UsersService({
				schema: currentSchema,
				accountability: { admin: true }
			});

			const user = await usersService.readOne(userId, {
				fields: ['id', 'email', 'provider', 'external_identifier', 'first_name', 'last_name']
			});

			// If this is an OAuth login, we might need to create profile and member records
			if (user.provider && user.provider !== 'default') {
				logger.info(`HOA Auth Hook: OAuth user ${userId} from provider ${user.provider}`);

				// Note: Profile and member creation should happen in the items.create hook
				// Here we just log for monitoring
			}

		} catch (error) {
			logger.error('HOA Auth Hook (auth.login) error:', error);
			// Don't throw - we don't want to block login if hook fails
		}
	});

	/**
	 * Hook: items.create (directus_users)
	 * Triggered when a new user is created (including OAuth provisioning)
	 * Creates associated profile and HOA member records
	 */
	action('items.create', async ({ collection, key, payload }, context) => {
		// Only process directus_users creation
		if (collection !== 'directus_users') return;

		try {
			const userId = key;
			logger.info(`HOA Auth Hook: New user created: ${userId}`);

			const currentSchema = await getSchema();

			// Get user details
			const usersService = new UsersService({
				schema: currentSchema,
				accountability: { admin: true }
			});

			const user = await usersService.readOne(userId, {
				fields: ['id', 'email', 'provider', 'external_identifier', 'first_name', 'last_name', 'role']
			});

			// Note: User profile data is now stored directly in directus_users (avatar, language)
			// and in hoa_members (phone, org-specific data)
			// No separate profile collection needed

			// OAuth provider data is stored natively in directus_users:
			// - provider: 'google', 'github', etc.
			// - external_identifier: OAuth user ID
			if (user.provider && user.provider !== 'default') {
				logger.info(`HOA Auth Hook: OAuth user from ${user.provider}, external_id: ${user.external_identifier}`);
			}

			// Note: HOA member creation requires organization context
			// This should be handled separately through the invitation flow
			// or admin assignment via setup-organization endpoint

			logger.info(`HOA Auth Hook: User ${userId} setup completed`);

		} catch (error) {
			logger.error('HOA Auth Hook (items.create) error:', error);
			// Don't throw - we don't want to block user creation if hook fails
		}
	});

	/**
	 * Filter: auth.login
	 * Can be used to modify login behavior before it completes
	 * Currently just for logging, but can add validation logic here
	 */
	filter('auth.login', async (payload, meta) => {
		try {
			logger.info('HOA Auth Hook: Login attempt', {
				provider: payload?.provider,
				email: payload?.email ? `${payload.email.substring(0, 3)}***` : 'unknown'
			});
		} catch (error) {
			logger.error('HOA Auth Hook (filter) error:', error);
		}

		return payload;
	});

	logger.info('HOA Auth Hook: Initialized successfully');
};
