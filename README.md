# Reddit Bot Outreach Platform

A SaaS platform for automating Reddit outreach using customizable bots. Built with Next.js, Supabase, Clerk, and Stripe.

## Features

- 🔐 Secure authentication with Clerk
- 💳 Pro subscription with Stripe ($7.99/month)
- 🤖 Customizable Reddit bots
- 📊 Message tracking and analytics
- 🔄 Multiple bot accounts support
- ⏱️ Configurable delays between messages
- 📝 Custom message templates
- 📈 Free tier with 15 messages
- 🔍 Subreddit targeting

## Tech Stack

- **Frontend**: Next.js 14 with TypeScript and Tailwind CSS
- **Authentication**: Clerk
- **Database**: Supabase
- **Payments**: Stripe
- **Browser Automation**: Playwright
- **UI Components**: Headless UI and Heroicons

## Prerequisites

- Node.js 18+ and npm
- Supabase account
- Clerk account
- Stripe account
- Reddit API credentials

## Environment Variables

Create a `.env.local` file in the root directory with the following variables:

```env
# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
CLERK_SECRET_KEY=your_clerk_secret_key

# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret

# App Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Setup

1. Clone the repository:

   ```bash
   git clone <repository-url>
   cd reddit-bot-saas
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Set up Supabase:

   - Create a new Supabase project
   - Run the SQL schema from `supabase/schema.sql`
   - Copy the Supabase URL and anon key to your `.env.local` file

4. Set up Clerk:

   - Create a new Clerk project
   - Configure the authentication settings
   - Copy the Clerk keys to your `.env.local` file

5. Set up Stripe:

   - Create a new Stripe account
   - Set up the subscription product
   - Copy the Stripe keys to your `.env.local` file
   - Configure the webhook endpoint

6. Run the development server:
   ```bash
   npm run dev
   ```

## Database Schema

The application uses the following tables in Supabase:

- `users`: Stores user information and subscription status
- `reddit_accounts`: Stores Reddit account credentials
- `sent_messages`: Tracks sent messages
- `message_templates`: Stores custom message templates

## Security Considerations

- Reddit account credentials are stored securely in Supabase
- Row Level Security (RLS) policies protect user data
- API routes are protected with authentication middleware
- Stripe webhooks are secured with signatures

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
