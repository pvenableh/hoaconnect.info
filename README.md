# Property Flow - HOA/Property Management Platform

A modern property management platform built with Nuxt 4, Directus CMS, and shadcn-vue. This application provides comprehensive HOA/property management features including authentication, payment processing, member management, and document handling.

## Features

- **Authentication**: Complete auth flows with login, registration, password reset, and member invitations
- **Multi-Organization Support**: Users can belong to multiple HOAs/organizations
- **Payment Processing**: Integrated Stripe payments for dues and assessments
- **Member Management**: Invite and manage HOA members with role-based access
- **Document Management**: Upload and organize documents with Directus file handling
- **Real-time Updates**: WebSocket subscriptions for live data updates
- **Custom Domains**: Vercel integration for custom domain management

## Tech Stack

- **Framework**: [Nuxt 4](https://nuxt.com/) with Vue 3
- **CMS/Backend**: [Directus](https://directus.io/) SDK v20+
- **UI Components**: [shadcn-vue](https://www.shadcn-vue.com/) with Tailwind CSS v4
- **Authentication**: [nuxt-auth-utils](https://github.com/atinux/nuxt-auth-utils) for session management
- **Forms**: [vee-validate](https://vee-validate.logaretm.com/) with [zod](https://zod.dev/) schemas
- **Payments**: [Stripe](https://stripe.com/) for payment processing
- **Icons**: [Nuxt Icon](https://nuxt.com/modules/icon) with Heroicons and Lucide
- **Animations**: [GSAP](https://greensock.com/gsap/) for smooth animations
- **Notifications**: [vue-sonner](https://vue-sonner.vercel.app/) for toast notifications

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm
- A Directus instance with proper collections configured

### Installation

```bash
# Clone the repository
git clone https://github.com/pvenableh/605-Lincoln.git
cd 605-Lincoln

# Install dependencies
pnpm install

# Copy environment file
cp .env.example .env

# Configure your environment variables (see below)

# Start development server
pnpm dev
```

## Environment Configuration

Create a `.env` file with the following variables:

```bash
# ===========================================
# DIRECTUS CMS CONFIGURATION
# ===========================================
DIRECTUS_URL=https://your-directus-instance.com
DIRECTUS_WEBSOCKET_URL=wss://your-directus-instance.com/websocket
DIRECTUS_STATIC_TOKEN=your-static-admin-token

# ===========================================
# SESSION CONFIGURATION
# ===========================================
# Must be at least 32 characters
NUXT_SESSION_PASSWORD=your-session-password-min-32-chars

# ===========================================
# DIRECTUS ROLES (UUIDs from your Directus instance)
# ===========================================
NUXT_PUBLIC_DIRECTUS_ROLE_ADMIN=your-admin-role-uuid
NUXT_PUBLIC_DIRECTUS_ROLE_USER=your-default-user-role-uuid

# ===========================================
# APPLICATION CONFIGURATION
# ===========================================
APP_URL=http://localhost:3000
FROM_EMAIL=noreply@your-domain.com
NUXT_PUBLIC_MAIN_DOMAIN=your-domain.com

# ===========================================
# SENDGRID EMAIL SERVICE (Optional)
# ===========================================
SENDGRID_API_KEY=SG.xxxxx
SENDGRID_INVITATION_TEMPLATE_ID=d-xxxxx
SENDGRID_WELCOME_TEMPLATE_ID=d-xxxxx
SENDGRID_INVITATION_ACCEPTED_TEMPLATE_ID=d-xxxxx

# ===========================================
# STRIPE PAYMENT CONFIGURATION (Optional)
# ===========================================
STRIPE_PUBLIC_KEY_TEST=pk_test_xxxxx
STRIPE_SECRET_KEY_TEST=sk_test_xxxxx
STRIPE_PUBLIC_KEY_LIVE=pk_live_xxxxx
STRIPE_SECRET_KEY_LIVE=sk_live_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx

# ===========================================
# VERCEL CONFIGURATION (Optional - for custom domains)
# ===========================================
VERCEL_API_TOKEN=your-vercel-api-token
VERCEL_PROJECT_ID=your-vercel-project-id
VERCEL_TEAM_ID=your-vercel-team-id
```

## Project Structure

```
/
├── app/                          # Nuxt application code
│   ├── pages/                    # Route pages
│   ├── components/               # Vue components
│   │   ├── Auth/                 # Authentication forms
│   │   ├── Payment/              # Payment components
│   │   └── ui/                   # shadcn-vue components
│   ├── composables/              # Vue composables
│   ├── layouts/                  # Page layouts
│   ├── middleware/               # Route middleware
│   ├── plugins/                  # Nuxt plugins
│   ├── lib/                      # Client-side utilities
│   └── assets/                   # CSS and static assets
├── server/                       # Server-side code
│   ├── api/                      # API endpoints
│   │   ├── auth/                 # Authentication APIs
│   │   ├── directus/             # Directus proxy APIs
│   │   ├── hoa/                  # HOA management APIs
│   │   ├── stripe/               # Payment APIs
│   │   └── vercel/               # Domain management APIs
│   ├── middleware/               # Server middleware
│   └── utils/                    # Server utilities
├── types/                        # TypeScript definitions
├── providers/                    # Custom providers (Directus image)
└── nuxt.config.ts               # Nuxt configuration
```

## Authentication Components

The following authentication components are available in `app/components/Auth/`:

| Component | Description |
|-----------|-------------|
| `LoginForm.vue` | Email/password login with OAuth options |
| `RegisterForm.vue` | New user registration |
| `PasswordResetRequestForm.vue` | Request password reset email |
| `PasswordResetForm.vue` | Reset password with token |
| `AcceptInviteForm.vue` | Accept member invitation |

### Usage Example

```vue
<template>
  <LoginForm @success="handleLoginSuccess" />
</template>

<script setup>
const router = useRouter()

const handleLoginSuccess = (user) => {
  router.push('/dashboard')
}
</script>
```

## Composables

### Authentication

```typescript
// useDirectusAuth - Handle login, logout, register
const { login, logout, register, user, loggedIn } = useDirectusAuth()

// Login
await login({ email: 'user@example.com', password: 'password' })

// Check authentication
if (loggedIn.value) {
  console.log('User:', user.value)
}
```

### User Operations

```typescript
// useDirectusUser - User profile and management
const { me, updateProfile, inviteUser, acceptInvite, requestPasswordReset, resetPassword } = useDirectusUser()

// Get current user
const currentUser = await me()

// Update profile
await updateProfile({ first_name: 'John', last_name: 'Doe' })
```

### Generic CRUD Operations

```typescript
// useDirectusItems - Generic collection operations
const posts = useDirectusItems('posts')

// List items with filtering
const items = await posts.list({
  filter: { status: { _eq: 'published' } },
  sort: ['-date_created'],
  limit: 10
})

// Get single item
const item = await posts.get('item-id')

// Create item
const newItem = await posts.create({ title: 'Hello World' })

// Update item
await posts.update('item-id', { title: 'Updated Title' })

// Delete item
await posts.remove('item-id')
```

### Public Content Access

For publicly accessible content (no authentication required):

```typescript
const articles = useDirectusItems('articles', { requireAuth: false })
const publicContent = await articles.list()
```

### File Operations

```typescript
const { upload, getFile, deleteFile, getAssetUrl } = useDirectusFiles()

// Upload file
const file = await upload(fileBlob, { folder: 'documents' })

// Get asset URL
const url = getAssetUrl(fileId, { width: 800, quality: 80 })
```

### Real-time Subscriptions

```typescript
const { subscribe, unsubscribe } = useDirectusRealtime()

// Subscribe to collection changes
const unsubscribeFn = await subscribe('messages', {
  event: 'create',
  query: { filter: { room: { _eq: roomId } } }
}, (data) => {
  console.log('New message:', data)
})

// Cleanup
onUnmounted(() => unsubscribeFn())
```

## Server Utilities

Three Directus client types are available for server-side operations:

```typescript
// Admin access (static token)
const directus = getTypedDirectus()

// User-authenticated access (with auto token refresh)
const directus = await getUserDirectus(event)

// Public access (no authentication)
const directus = getPublicDirectus()
```

## API Endpoints

### Authentication (`/api/auth/`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/login` | POST | Authenticate user |
| `/api/auth/logout` | POST | End user session |
| `/api/auth/register` | POST | Create new account |
| `/api/auth/refresh` | POST | Refresh expired token |
| `/api/auth/me` | GET | Get current user data |

### Directus Operations (`/api/directus/`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/directus/items` | POST | Generic CRUD operations |
| `/api/directus/files` | POST | File operations |
| `/api/directus/files/upload` | POST | Upload files |
| `/api/directus/users/*` | Various | User management |

### HOA Management (`/api/hoa/`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/hoa/setup-organization` | POST | Create new organization |
| `/api/hoa/invite-member` | POST | Invite new member |
| `/api/hoa/accept-invitation` | POST | Accept member invite |
| `/api/hoa/by-slug` | GET | Get org by domain slug |

### Payments (`/api/stripe/`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/stripe/paymentintent` | POST | Create payment intent |
| `/api/stripe/webhook` | POST | Handle Stripe webhooks |

## Route Middleware

```typescript
// Protect routes requiring authentication
definePageMeta({
  middleware: 'auth'
})

// Redirect authenticated users (for login/register pages)
definePageMeta({
  middleware: 'guest'
})
```

## TypeScript Support

Generate TypeScript types from your Directus schema:

```bash
# Add to package.json scripts
"generate:types": "dotenv -e .env -- npx directus-sdk-typegen -u $DIRECTUS_URL -t $DIRECTUS_STATIC_TOKEN -o ./types/directus-schema.ts"

# Run generation
pnpm generate:types
```

## Deployment

### Vercel

1. Connect your repository to Vercel
2. Configure environment variables in Vercel dashboard
3. Deploy

```bash
# Optional: Include type generation in build
"build": "pnpm generate:types && nuxt build"
```

### Other Platforms

The application can be deployed to any platform supporting Node.js 18+. Ensure all environment variables are configured in your deployment environment.

## Development

```bash
# Start dev server
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview

# Type check
pnpm typecheck

# Generate Directus types
pnpm generate:types
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see LICENSE file for details.

## Credits

Based on the [Nuxt Directus Auth Starter Template](https://github.com/pvenableh/nuxt-directus-auth-starter-template).
