import Link from 'next/link';

export default function PrivacyPolicy() {
  return (
    <div className="dark-policy min-h-screen bg-zinc-950 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-white/10 bg-zinc-900 p-8 shadow-lg">
          <h1 className="text-3xl font-bold text-zinc-50 mb-8">
            Privacy Policy
          </h1>

          <div className="prose prose-lg max-w-none">
            <p className="text-zinc-300 mb-6">
              <strong>Last updated:</strong> {new Date().toLocaleDateString()}
            </p>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-zinc-100 mb-4">
                1. Information We Collect
              </h2>
              <p className="text-zinc-300 mb-4">
                We collect information you provide directly to us, such as when
                you create an account, use our Reddit bot services, or contact
                us for support.
              </p>
              <ul className="list-disc pl-6 text-zinc-300 space-y-2">
                <li>
                  <strong>Account Information:</strong> Email address, username,
                  and authentication data via Clerk
                </li>
                <li>
                  <strong>Reddit Account Data:</strong> Reddit usernames and
                  credentials you provide for bot operations
                </li>
                <li>
                  <strong>Bot Configuration:</strong> Website configs, targeting
                  keywords, comment templates, and auto-poster settings
                </li>
                <li>
                  <strong>Usage Data:</strong> Bot activity logs, message
                  counts, and service usage statistics
                </li>
                <li>
                  <strong>Payment Information:</strong> Billing details
                  processed securely through Stripe
                </li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-zinc-100 mb-4">
                2. How We Use Your Information
              </h2>
              <ul className="list-disc pl-6 text-zinc-300 space-y-2">
                <li>Provide and maintain our Reddit bot services</li>
                <li>Process your transactions and manage your subscription</li>
                <li>Send you technical notices and support messages</li>
                <li>
                  Monitor and analyze usage patterns to improve our service
                </li>
                <li>Detect and prevent fraud or abuse</li>
                <li>Comply with legal obligations</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-zinc-100 mb-4">
                3. Information Sharing
              </h2>
              <p className="text-zinc-300 mb-4">
                We do not sell, trade, or otherwise transfer your personal
                information to third parties, except:
              </p>
              <ul className="list-disc pl-6 text-zinc-300 space-y-2">
                <li>
                  <strong>Service Providers:</strong> Clerk (authentication),
                  Stripe (payments), Supabase (database), Vercel (hosting)
                </li>
                <li>
                  <strong>Legal Requirements:</strong> When required by law or
                  to protect our rights
                </li>
                <li>
                  <strong>Business Transfers:</strong> In connection with a
                  merger, acquisition, or sale of assets
                </li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-zinc-100 mb-4">
                4. Data Security
              </h2>
              <p className="text-zinc-300 mb-4">
                We implement appropriate security measures to protect your
                personal information:
              </p>
              <ul className="list-disc pl-6 text-zinc-300 space-y-2">
                <li>Encryption of data in transit and at rest</li>
                <li>Regular security audits and updates</li>
                <li>Access controls and authentication requirements</li>
                <li>Secure third-party service providers</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-zinc-100 mb-4">
                5. Reddit API Compliance
              </h2>
              <p className="text-zinc-300 mb-4">
                Our service interacts with Reddit&apos;s API and we comply with
                Reddit&apos;s terms of service:
              </p>
              <ul className="list-disc pl-6 text-zinc-300 space-y-2">
                <li>We respect Reddit&apos;s rate limits and API guidelines</li>
                <li>
                  Bot activities are performed within Reddit&apos;s acceptable use
                  policies
                </li>
                <li>We do not engage in spam or manipulative behavior</li>
                <li>
                  Users are responsible for ensuring their bot usage complies
                  with Reddit&apos;s rules
                </li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-zinc-100 mb-4">
                6. Your Rights
              </h2>
              <p className="text-zinc-300 mb-4">You have the right to:</p>
              <ul className="list-disc pl-6 text-zinc-300 space-y-2">
                <li>Access and update your personal information</li>
                <li>Delete your account and associated data</li>
                <li>Export your data in a portable format</li>
                <li>Opt out of non-essential communications</li>
                <li>Request information about how your data is processed</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-zinc-100 mb-4">
                7. Data Retention
              </h2>
              <p className="text-zinc-300 mb-4">
                We retain your information for as long as your account is active
                or as needed to provide services. We may retain certain
                information for legitimate business purposes or legal
                requirements.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-zinc-100 mb-4">
                8. Children&apos;s Privacy
              </h2>
              <p className="text-zinc-300 mb-4">
                Our service is not intended for children under 13. We do not
                knowingly collect personal information from children under 13.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-zinc-100 mb-4">
                9. Changes to This Policy
              </h2>
              <p className="text-zinc-300 mb-4">
                We may update this privacy policy from time to time. We will
                notify you of any changes by posting the new policy on this page
                and updating the &quot;Last updated&quot; date.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-zinc-100 mb-4">
                10. Contact Us
              </h2>
              <p className="text-zinc-300 mb-4">
                If you have any questions about this Privacy Policy, please
                contact us at:
              </p>
              <div className="bg-zinc-900 p-4 rounded-lg">
                <p className="text-zinc-300">
                  <strong>Support:</strong> buyyav20@gmail.com
                </p>
              </div>
            </section>
          </div>

          <div className="mt-12 pt-8 border-t border-white/10">
            <Link
              href="/"
              className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-[#7c6cff] hover:bg-[#6b5af0] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#7c6cff] transition-colors"
            >
              ← Back to Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
