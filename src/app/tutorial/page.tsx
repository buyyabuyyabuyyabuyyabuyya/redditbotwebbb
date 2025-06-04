import React from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import Link from 'next/link';

export default async function TutorialPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect('/sign-in');
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="py-10">
        <header>
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <h1 className="text-3xl font-bold leading-tight tracking-tight text-white bg-clip-text text-transparent bg-gradient-to-r from-purple-500 to-red-500">
              Reddit Bot Tutorial
            </h1>
            <p className="mt-2 text-lg text-gray-300">
              Follow these steps to set up and use your Reddit outreach bot
            </p>
          </div>
        </header>

        <main>
          <div className="mx-auto max-w-7xl sm:px-6 lg:px-8">
            <div className="px-4 py-8 sm:px-0">
              <div className="rounded-lg bg-gray-800/70 p-6 shadow-lg border border-gray-700/50 backdrop-blur-sm overflow-hidden">
                
                {/* Disclaimer Alert */}
                <div className="mb-8 rounded-md bg-red-900/50 p-4 border border-red-700">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-red-300">Important Disclaimer</h3>
                      <div className="mt-2 text-sm text-red-200">
                        <p>
                          <strong>Always use a secondary Reddit account or bot account</strong> for automated messaging. There is a risk that accounts using bots may be flagged or banned by Reddit. We are not liable if your Reddit account is banned or restricted. Follow Reddit's terms of service and avoid spamming users.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Steps Section */}
                <div className="space-y-12">
                  {/* Step 1 */}
                  <div>
                    <div className="flex items-center">
                      <div className="flex-shrink-0 bg-purple-600 rounded-full p-2 mr-3">
                        <span className="text-white font-bold">1</span>
                      </div>
                      <h2 className="text-xl font-bold text-purple-300">Add Your Reddit Account</h2>
                    </div>
                    
                    <div className="mt-4 ml-12 space-y-4">
                      <p className="text-gray-300">
                        Navigate to the <Link href="/dashboard" className="text-purple-400 hover:text-purple-300 underline">Dashboard</Link> and click on the "Manage Accounts" button under the Reddit Accounts section.
                      </p>

                      <div className="bg-gray-700/50 rounded-md p-4 border border-purple-500/20">
                        <h3 className="font-medium text-white">Required Information:</h3>
                        <ul className="list-disc list-inside mt-2 space-y-2 text-gray-300">
                          <li><strong>Reddit Username</strong> - Your bot account username</li>
                          <li><strong>Reddit Password</strong> - Your bot account password</li>
                          <li><strong>Client ID</strong> - Get this from <a href="https://www.reddit.com/prefs/apps" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">Reddit's app preferences page</a></li>
                          <li><strong>Client Secret</strong> - Also found on the app preferences page</li>
                        </ul>
                        <div className="mt-3 text-gray-300">
                          <p><strong>How to get Client ID and Secret:</strong></p>
                          <ol className="list-decimal list-inside mt-1 space-y-1 ml-2">
                            <li>Go to <a href="https://www.reddit.com/prefs/apps" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">https://www.reddit.com/prefs/apps</a></li>
                            <li>Click "Create App" or "Create Another App" button</li>
                            <li>Fill in the name as "Reddit Outreach Bot" (or any name)</li>
                            <li>Select "script" as the application type</li>
                            <li>Use "http://localhost:3000/auth/callback" for the redirect URI</li>
                            <li>Click "Create app" button</li>
                            <li>Copy the Client ID (under your app name) and Client Secret</li>
                          </ol>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div>
                    <div className="flex items-center">
                      <div className="flex-shrink-0 bg-purple-600 rounded-full p-2 mr-3">
                        <span className="text-white font-bold">2</span>
                      </div>
                      <h2 className="text-xl font-bold text-purple-300">Create Message Templates</h2>
                    </div>
                    
                    <div className="mt-4 ml-12 space-y-4">
                      <p className="text-gray-300">
                        Go to the <Link href="/dashboard" className="text-purple-400 hover:text-purple-300 underline">Dashboard</Link> and create a message template by clicking on the "Create Template" button.
                      </p>

                      <div className="bg-gray-700/50 rounded-md p-4 border border-purple-500/20">
                        <h3 className="font-medium text-white">Template Components:</h3>
                        <ul className="list-disc list-inside mt-2 space-y-2 text-gray-300">
                          <li>
                            <strong>Template Name</strong> - A descriptive name for your message template
                          </li>
                          <li>
                            <strong>Message Content</strong> - The message that will be sent to Reddit users
                            <div className="mt-2 mb-3">
                              <p className="text-sm text-gray-400">Available variables:</p>
                              <code className="block bg-black/30 p-2 rounded mt-1 text-green-400">
                                {'{username}'} - The recipient's Reddit username<br/>
                                {'{subreddit}'} - The subreddit where the post was found<br/>
                                {'{post_title}'} - The title of the post
                              </code>
                              <p className="mt-2 text-sm text-gray-400">Example:</p>
                              <code className="block bg-black/30 p-2 rounded mt-1 text-gray-300">
                                Hi {'{username}'},<br/>
                                <br/>
                                I noticed your post "{'{post_title}'} in r/{'{subreddit}'} and wanted to reach out. I offer services that might help with what you're working on.<br/>
                                <br/>
                                Would you be interested in discussing this further?<br/>
                                <br/>
                                Best regards,<br/>
                                YourName
                              </code>
                            </div>
                          </li>
                          <li>
                            <strong>AI Prompt for Post Relevance Check</strong> - The prompt given to the AI to analyze Reddit posts for relevance
                            <div className="mt-2">
                              <p className="text-sm text-gray-400">Example:</p>
                              <code className="block bg-black/30 p-2 rounded mt-1 text-gray-300">
                                Analyze this Reddit post and determine if it's related to app development or website development. The user seems to be looking for a developer. Only return true if they are specifically looking for development services.
                              </code>
                            </div>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* Step 3 */}
                  <div>
                    <div className="flex items-center">
                      <div className="flex-shrink-0 bg-purple-600 rounded-full p-2 mr-3">
                        <span className="text-white font-bold">3</span>
                      </div>
                      <h2 className="text-xl font-bold text-purple-300">Configure Your Subreddit Scanner</h2>
                    </div>
                    
                    <div className="mt-4 ml-12 space-y-4">
                      <p className="text-gray-300">
                        Go to the <Link href="/dashboard" className="text-purple-400 hover:text-purple-300 underline">Dashboard</Link> and set up your subreddit scanner by completing the form.
                      </p>

                      <div className="bg-gray-700/50 rounded-md p-4 border border-purple-500/20">
                        <h3 className="font-medium text-white">Scanner Configuration:</h3>
                        <ul className="list-disc list-inside mt-2 space-y-2 text-gray-300">
                          <li>
                            <strong>Subreddit</strong> - The subreddit you want to scan (without the "r/" prefix)
                            <p className="text-sm text-gray-400 ml-5 mt-1">Example: webdev, forhire, slavelabour</p>
                          </li>
                          <li>
                            <strong>Keywords</strong> - Words or phrases to look for in posts (add as many as needed)
                            <p className="text-sm text-gray-400 ml-5 mt-1">Examples: website, app, developer, looking for, hiring</p>
                            <p className="text-sm text-gray-400 ml-5">Add multiple keywords at once by separating them with commas</p>
                          </li>
                          <li>
                            <strong>Reddit Account</strong> - Select the account you added in Step 1
                          </li>
                          <li>
                            <strong>Message Template</strong> - Select the template you created in Step 2
                          </li>
                          <li>
                            <strong>Scan Interval</strong> - How often the bot should check for new posts (in minutes)
                          </li>
                          <li>
                            <strong>Use AI to check post relevance</strong> - <span className="text-green-400">Recommended</span> - Uses AI to analyze if posts are truly relevant before sending messages
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* Step 4 */}
                  <div>
                    <div className="flex items-center">
                      <div className="flex-shrink-0 bg-purple-600 rounded-full p-2 mr-3">
                        <span className="text-white font-bold">4</span>
                      </div>
                      <h2 className="text-xl font-bold text-purple-300">Start Your Bot</h2>
                    </div>
                    
                    <div className="mt-4 ml-12 space-y-4">
                      <p className="text-gray-300">
                        After configuring your scanner, click the "Start Bot" button to begin scanning and messaging.
                      </p>

                      <div className="bg-gray-700/50 rounded-md p-4 border border-purple-500/20">
                        <h3 className="font-medium text-white">Monitoring Your Bot:</h3>
                        <ul className="list-disc list-inside mt-2 space-y-2 text-gray-300">
                          <li>View logs by clicking "View Logs" next to your active configuration</li>
                          <li>Check the dashboard for message counts and bot status</li>
                          <li>Check the "Private Messages" section to see all messages sent</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Final Tips */}
                <div className="mt-12 p-4 bg-blue-900/30 rounded-md border border-blue-700/50">
                  <h3 className="text-lg font-medium text-blue-300">💡 Pro Tips</h3>
                  <ul className="mt-2 space-y-2 text-gray-300 list-disc list-inside">
                    <li>Start with longer scan intervals (30+ minutes) to avoid Reddit's rate limits</li>
                    <li>Create specific, targeted keywords to avoid messaging irrelevant posts</li>
                    <li>Always use the AI relevance check to prevent spam and improve targeting</li>
                    <li>Personalize your messages with the available variables</li>
                    <li>Regularly check your bot logs to ensure everything is running smoothly</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
