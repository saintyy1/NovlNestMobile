const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

const GOOGLE_CLIENT_ID = '171117861268-msg103kefn7trmdmsmj586t754h8fjh8.apps.googleusercontent.com';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || 'https://novlnest-mobile.vercel.app/auth/google/callback';

// Google OAuth callback - handles the redirect from Google
app.get('/auth/google/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      return res.status(400).send(`Error: ${error}`);
    }

    if (!code) {
      return res.status(400).send('Error: No authorization code received from Google');
    }

    // Exchange authorization code for ID token
    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
      grant_type: 'authorization_code',
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
    });

    const { id_token, access_token } = tokenResponse.data;

    // Redirect back to app with tokens in URL
    res.redirect(`novlnest://oauth/callback?id_token=${id_token}&access_token=${access_token}`);
  } catch (error) {
    console.error('OAuth callback error:', error.response?.data || error.message);
    res.status(500).send(`Error: Failed to exchange authorization code for token. ${error.message}`);
  }
});

// OAuth token exchange endpoint
app.post('/auth/google/token', async (req, res) => {
  try {
    const { code, redirectUri } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }

    // Use the redirect URI from request, fall back to env var
    const usedRedirectUri = redirectUri || REDIRECT_URI;

    // Exchange authorization code for ID token
    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
      grant_type: 'authorization_code',
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: usedRedirectUri,
    });

    const { id_token, access_token } = tokenResponse.data;

    // Return tokens to client
    res.json({
      id_token,
      access_token,
      success: true,
    });
  } catch (error) {
    console.error('OAuth token exchange error:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Failed to exchange authorization code for token',
      details: error.response?.data || error.message,
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`OAuth backend server running on port ${PORT}`);
});
