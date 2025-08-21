# RedditOutreach - AI-Powered Reddit Discussion Engagement Platform

## Environment Variables

### Gemini AI API Keys (Multiple for Fallback)
```bash
# Primary API key
GEMINI_KEY=your_primary_gemini_api_key

# Fallback API keys (optional, will try in order if primary fails)
GEMINI_KEY_2=your_second_gemini_api_key
GEMINI_KEY_3=your_third_gemini_api_key
GEMINI_KEY_4=your_fourth_gemini_api_key
GEMINI_KEY_5=your_fifth_gemini_api_key
```

### Other Required Variables
```bash
NEXT_PUBLIC_GEMINI_API_URL=/api/gemini/analyze
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Features

- **AI-Powered Website Analysis**: Automatically scrapes and analyzes websites
- **Multiple API Key Fallback**: If one Gemini API key fails, automatically tries others
- **Comprehensive Data Extraction**: Extracts titles, content, technologies, social media, and structured data
- **Automatic AI Description Generation**: Generates product descriptions using AI
- **Discussion Engagement**: Monitors Reddit for relevant discussions
- **Reddit Account Management**: Manage multiple Reddit accounts safely

## How It Works

1. **Website Input**: Enter your website URL
2. **Automatic Scraping**: System automatically scrapes the website
3. **AI Analysis**: AI generates product description and customer segments
4. **Discussion Monitoring**: Monitors Reddit for relevant discussions
5. **Engagement**: Posts helpful replies to relevant discussions
