/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import { createClient } from '@supabase/supabase-js';

interface Env {
  SUPABASE_URL: string;
  SUPABASE_KEY: string;
  BROWSERLESS_API_KEY: string;
}

interface RedditCredentials {
  username: string;
  password: string;
  twoFactorCode?: string;
}

interface ScanParams {
  subreddit: string;
  keywords: string[];
  message: string;
  maxMessages: number;
  credentials: RedditCredentials;
  delayTime?: number;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    try {
      const params: ScanParams = await request.json();
      const {
        subreddit,
        keywords,
        message: messageTemplate,
        maxMessages,
        credentials,
        delayTime = 5
      } = params;

      const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
      let messagesSent = 0;
	  let sessionId: string | null = null;
	  
      try {
        // Create a new browser session
        const browserResponse = await fetch(
          `https://chrome.browserless.io/webdriver/session?token=${env.BROWSERLESS_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              capabilities: {
                alwaysMatch: {
                  browserName: 'chrome',
                  'browserless:options': {
                    args: [
                      '--no-sandbox',
                      '--disable-setuid-sandbox',
                      '--disable-dev-shm-usage'
                    ]
                  }
                }
              }
            })
          }
        );

        if (!browserResponse.ok) {
          throw new Error('Failed to create browser session');
        }

        const sessionData = await browserResponse.json() as { value: { sessionId: string } };
        sessionId = sessionData.value.sessionId;
        const sessionUrl = `https://chrome.browserless.io/webdriver/session/${sessionId}`;

        // Navigate to Reddit login
        await fetch(`${sessionUrl}/url`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: 'https://www.reddit.com/login' })
        });

        // Wait for page to load
        await sleep(2000);

        // Login to Reddit
        await fetch(`${sessionUrl}/element`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            using: 'css selector',
            value: '#login-username' 
          })
        }).then(res => 	res.json() as Promise<{ value: { ELEMENT: string } }>)
        .then(({ value: { ELEMENT: usernameField } }) => 
          fetch(`${sessionUrl}/element/${usernameField}/value`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              text: credentials.username,
              value: [credentials.username]
            })
          })
        );

        // Fill password and submit
        await fetch(`${sessionUrl}/element`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            using: 'css selector',
            value: '#login-password' 
          })
        }).then(res => res.json() as Promise<{ value: { ELEMENT: string } }>)
        .then(({ value: { ELEMENT: passwordField } }) => 
          fetch(`${sessionUrl}/element/${passwordField}/value`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              text: credentials.password,
              value: [credentials.password]
            })
          })
        );

        // Click login button
        await fetch(`${sessionUrl}/element`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            using: 'css selector',
            value: 'button[type="submit"]' 
          })
        }).then(res => res.json() as Promise<{ value: { ELEMENT: string } }>)
        .then(({ value: { ELEMENT: loginButton } }) => 
          fetch(`${sessionUrl}/element/${loginButton}/click`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          })
        );

        // Wait for login to complete
        await sleep(5000);

        // Navigate to subreddit
        await fetch(`${sessionUrl}/url`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: `https://www.reddit.com/r/${subreddit}/new/` })
        });

        // Wait for page to load
        await sleep(3000);

        // Find all post links
        const postsResponse = await fetch(`${sessionUrl}/elements`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            using: 'css selector',
            value: 'a[data-click-id="body"]' 
          })
        });

        const posts = (await postsResponse.json()) as { value: { ELEMENT: string }[] };
        const postUrls = await Promise.all(
          posts.value.slice(0, maxMessages).map(async (post: any) => {
            const urlResponse = await fetch(`${sessionUrl}/element/${post.ELEMENT}/attribute/href`);
            const urlData = (await urlResponse.json()) as { value: string };
            return urlData.value;
          })
        );

        // Process each post
        for (const postUrl of postUrls) {
          await fetch(`${sessionUrl}/url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: postUrl })
          });

          await sleep(2000);

          // Check if post matches keywords
          const pageTextResponse = await fetch(`${sessionUrl}/element/active/text`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
          });
          const pageText = ((await pageTextResponse.json()) as { value: string }).value.toLowerCase();

          const matchesKeyword = keywords.some(keyword => 
            pageText.includes(keyword.toLowerCase())
          );

          if (matchesKeyword) {
            // Find and click the "more options" button
            await fetch(`${sessionUrl}/element`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                using: 'css selector',
                value: 'button[aria-label="more options"]' 
              })
            }).then(res => res.json() as Promise<{ value: { ELEMENT: string } }>)
            .then(({ value: { ELEMENT: moreOptions } }) => 
              fetch(`${sessionUrl}/element/${moreOptions}/click`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
              })
            );

            await sleep(1000);

            // Click "Send a private message" option
            await fetch(`${sessionUrl}/element`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                using: 'xpath',
                value: '//span[contains(text(), "Send a private message")]' 
              })
            }).then(res => res.json() as Promise<{ value: { ELEMENT: string } }>)
            .then(({ value: { ELEMENT: messageOption } }) => 
              fetch(`${sessionUrl}/element/${messageOption}/click`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
              })
            );

            await sleep(2000);

            // Fill in the message
            await fetch(`${sessionUrl}/element`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                using: 'css selector',
                value: 'textarea[placeholder="Message"]' 
              })
            }).then(res => res.json() as Promise<{ value: { ELEMENT: string } }>)
            .then(({ value: { ELEMENT: messageField } }) => 
              fetch(`${sessionUrl}/element/${messageField}/value`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                  text: messageTemplate,
                  value: [messageTemplate]
                })
              })
            );

            // Click send button
            await fetch(`${sessionUrl}/element`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                using: 'xpath',
                value: '//button[contains(text(), "Send")]' 
              })
            }).then(res => res.json() as Promise<{ value: { ELEMENT: string } }>)
            .then(({ value: { ELEMENT: sendButton } }) => 
              fetch(`${sessionUrl}/element/${sendButton}/click`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
              })
            );

            // Log to Supabase
            await supabase.from('sent_messages').insert([{
              recipient: postUrl.split('/user/')[1]?.split('/')[0] || 'unknown',
              subreddit,
              message_template: messageTemplate,
              sent_at: new Date().toISOString(),
            }]);

            messagesSent++;
            await sleep(delayTime * 1000);
          }
        }

        return new Response(JSON.stringify({ 
          success: true, 
          messagesSent 
        }), {
          headers: { 'Content-Type': 'application/json' },
        });

      } catch (error: any) {
        console.error('Error during browser automation:', error);
        return new Response(JSON.stringify({ 
          success: false, 
          error: error.message 
        }), { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      } finally {
        // Clean up session
        if (sessionId 	) {
          try {
            await fetch(`https://chrome.browserless.io/webdriver/session/${sessionId}`, {
              method: 'DELETE'
            });
          } catch (e) {
            console.error('Error cleaning up session:', e);
          }
        }
      }

    } catch (error: any) {
      console.error('Error in worker:', error);
      return new Response(JSON.stringify({ 
        success: false, 
        error: error.message 
      }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};