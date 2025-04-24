# Supabase Integration for ChatGPT Clone

This document provides instructions for setting up and using the Supabase integration for the ChatGPT Clone application. This integration adds user authentication and cloud storage for API keys, chat history, custom GPTs, and settings.

## Benefits

- **User Authentication**: Users can create accounts, log in, and securely access their data from any device.
- **Cloud Storage**: All user data is stored in Supabase, overcoming the limitations of localStorage.
- **Secure API Key Storage**: API keys are stored in Supabase instead of localStorage for better security.
- **Cross-Device Access**: Users can access their chats, custom GPTs, and settings from any device.

## Setup Instructions

### 1. Supabase Project Setup

1. Create a Supabase account at [https://supabase.com](https://supabase.com) if you don't have one already.
2. Create a new project in Supabase.
3. Note your Supabase URL and anon key (found in Project Settings > API).

### 2. Database Setup

1. In your Supabase project, navigate to the SQL Editor.
2. Copy the contents of the `supabase_setup.sql` file in this repository.
3. Paste the SQL into the SQL Editor and run it.
4. This will create all the necessary tables and set up Row Level Security (RLS) policies.

### 3. Authentication Setup

1. In your Supabase project, navigate to Authentication > Providers.
2. Ensure Email provider is enabled.
3. Configure any additional authentication providers you want to support (Google, GitHub, etc.).
4. Customize email templates if desired.

### 4. Application Configuration

1. Open `js/supabaseClient.js` and update the Supabase URL and anon key with your project's values:

```javascript
const supabaseUrl = 'YOUR_SUPABASE_URL';
const supabaseAnonKey = 'YOUR_SUPABASE_ANON_KEY';
```

2. Make sure the Supabase JavaScript client is included in your HTML:

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
```

## Using the Authentication Features

### Sign Up

1. Click the "Log out" button in the sidebar (which now functions as a login/signup button when not logged in).
2. In the authentication modal, click "Create account".
3. Enter your email and password, then click "Sign Up".
4. Check your email for a verification link.

### Sign In

1. Click the "Log out" button in the sidebar when not logged in.
2. Enter your email and password, then click "Sign In".

### Reset Password

1. Click the "Log out" button in the sidebar when not logged in.
2. Click "Forgot password?".
3. Enter your email and click "Send Reset Email".
4. Check your email for a password reset link.

### Sign Out

1. Click the "Log out" button in the sidebar when logged in.

## How It Works

### Data Storage

When a user is logged in:
- API keys are stored in the `api_keys` table in Supabase.
- Settings are stored in the `settings` table in Supabase.
- Chat history is stored in the `chats` and `messages` tables in Supabase.
- Custom GPTs are stored in the `custom_gpts` and `knowledge_files` tables in Supabase.

When a user is not logged in:
- All data is stored in localStorage as before.

### Security

- Row Level Security (RLS) policies ensure that users can only access their own data.
- API keys are stored in Supabase, which is more secure than localStorage.
- Authentication is handled by Supabase, which uses industry-standard security practices.

## Troubleshooting

### Authentication Issues

- If you can't sign in, make sure your email is verified.
- If you forgot your password, use the "Forgot password?" link.
- If you're still having issues, check the browser console for error messages.

### Data Synchronization Issues

- If your data isn't syncing between devices, make sure you're logged in on both devices.
- If you're still having issues, try logging out and back in.

## Future Improvements

- Add support for social login providers (Google, GitHub, etc.).
- Implement data encryption for API keys.
- Add support for sharing custom GPTs between users.
- Add support for collaborative chat sessions.
