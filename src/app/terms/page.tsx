import Link from 'next/link';

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow-lg rounded-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Terms of Service</h1>
          
          <div className="prose prose-lg max-w-none">
            <p className="text-gray-600 mb-6">
              <strong>Last updated:</strong> {new Date().toLocaleDateString()}
            </p>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">1. Acceptance of Terms</h2>
              <p className="text-gray-600 mb-4">
                By accessing and using our Reddit Bot SaaS service, you accept and agree to be bound by the 
                terms and provision of this agreement. If you do not agree to abide by the above, please do 
                not use this service.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">2. Service Description</h2>
              <p className="text-gray-600 mb-4">
                Our service provides automated Reddit bot functionality, including:
              </p>
              <ul className="list-disc pl-6 text-gray-600 space-y-2">
                <li>Automated Reddit post scanning and monitoring</li>
                <li>Keyword-based content filtering</li>
                <li>Automated direct messaging to Reddit users</li>
                <li>AI-powered content analysis using Gemini API</li>
                <li>Bot activity logging and analytics</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">3. User Responsibilities</h2>
              <p className="text-gray-600 mb-4">You agree to:</p>
              <ul className="list-disc pl-6 text-gray-600 space-y-2">
                <li><strong>Comply with Reddit's Terms:</strong> Follow all Reddit terms of service and community guidelines</li>
                <li><strong>Responsible Bot Usage:</strong> Use bots ethically and avoid spam or harassment</li>
                <li><strong>Account Security:</strong> Maintain the security of your Reddit and service accounts</li>
                <li><strong>Accurate Information:</strong> Provide truthful and accurate information</li>
                <li><strong>Legal Compliance:</strong> Comply with all applicable laws and regulations</li>
                <li><strong>Respect Rate Limits:</strong> Not attempt to circumvent API rate limits or abuse the service</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">4. Prohibited Activities</h2>
              <p className="text-gray-600 mb-4">You may not use our service to:</p>
              <ul className="list-disc pl-6 text-gray-600 space-y-2">
                <li>Send spam, unsolicited messages, or engage in harassment</li>
                <li>Violate Reddit's terms of service or community guidelines</li>
                <li>Engage in illegal activities or promote illegal content</li>
                <li>Impersonate others or create fake accounts</li>
                <li>Attempt to hack, reverse engineer, or compromise our systems</li>
                <li>Use the service for commercial purposes without proper authorization</li>
                <li>Share or resell your account access to third parties</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">5. Subscription and Billing</h2>
              <ul className="list-disc pl-6 text-gray-600 space-y-2">
                <li><strong>Payment:</strong> Subscription fees are processed through Stripe and billed monthly</li>
                <li><strong>Plan Changes:</strong> You may upgrade or downgrade your plan at any time</li>
                <li><strong>Cancellation:</strong> You may cancel your subscription at any time</li>
                <li><strong>Usage Limits:</strong> Each plan has specific limits on bot accounts, messages, and features</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">6. Service Availability</h2>
              <p className="text-gray-600 mb-4">
                We strive to maintain high service availability, but we do not guarantee uninterrupted service. 
                We may experience downtime for maintenance, updates, or due to factors beyond our control.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">7. Reddit API Compliance</h2>
              <p className="text-gray-600 mb-4">
                Our service relies on Reddit's API and is subject to Reddit's terms and limitations:
              </p>
              <ul className="list-disc pl-6 text-gray-600 space-y-2">
                <li>We comply with Reddit's API rate limits and usage policies</li>
                <li>Reddit may change their API or terms at any time</li>
                <li>Users are responsible for ensuring their bot activities comply with Reddit's rules</li>
                <li>We may suspend service if Reddit access is restricted</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">8. Intellectual Property</h2>
              <p className="text-gray-600 mb-4">
                The service, including its original content, features, and functionality, is owned by us and 
                protected by international copyright, trademark, and other intellectual property laws.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">9. Limitation of Liability</h2>
              <p className="text-gray-600 mb-4">
                In no event shall we be liable for any indirect, incidental, special, consequential, or punitive 
                damages, including without limitation, loss of profits, data, use, goodwill, or other intangible 
                losses, resulting from your use of the service.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">10. Account Termination</h2>
              <p className="text-gray-600 mb-4">
                We reserve the right to terminate or suspend your account and access to the service at our 
                sole discretion, without notice, for conduct that we believe violates these Terms of Service 
                or is harmful to other users, us, or third parties.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">11. Data and Privacy</h2>
              <p className="text-gray-600 mb-4">
                Your privacy is important to us. Please review our Privacy Policy, which also governs your 
                use of the service, to understand our practices.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">12. Changes to Terms</h2>
              <p className="text-gray-600 mb-4">
                We reserve the right to modify these terms at any time. We will notify users of any material 
                changes via email or through the service. Your continued use of the service after such 
                modifications constitutes acceptance of the updated terms.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">13. Governing Law</h2>
              <p className="text-gray-600 mb-4">
                These Terms shall be interpreted and governed by the laws of the jurisdiction in which our 
                company is registered, without regard to its conflict of law provisions.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">14. Contact Information</h2>
              <p className="text-gray-600 mb-4">
                If you have any questions about these Terms of Service, please contact us:
              </p>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-gray-600">
                  <strong>Support:</strong> buyyav20@gmail.com
                </p>
              </div>
            </section>
          </div>

          <div className="mt-12 pt-8 border-t border-gray-200">
            <Link 
              href="/"
              className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
            >
              ← Back to Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
