const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

const GOOGLE_CLIENT_ID = '171117861268-msg103kefn7trmdmsmj586t754h8fjh8.apps.googleusercontent.com';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET; // Set this in .env
const REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost:3000/auth/google/callback';

// OAuth token exchange endpoint
app.post('/auth/google/token', async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Authorization code is required' });
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
