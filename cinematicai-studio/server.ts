import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Default API key from sarancha
const DEFAULT_API_KEY = "sk-proj-9f2c7a41d8b3e6f5c0a1b2d3e4f5a6b7";

interface ApiKeyRecord {
  key: string;
  name: string;
  createdAt: string;
  requestsCount: number;
}

interface VideoRecord {
  id: string;
  prompt: string;
  model: 'fast' | 'mini';
  duration: number;
  ratio: string;
  videoUrl?: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  error?: string;
  createdAt: string;
}

const apiKeys: Map<string, ApiKeyRecord> = new Map([
  [DEFAULT_API_KEY, { key: DEFAULT_API_KEY, name: 'Default System Key', createdAt: new Date().toISOString(), requestsCount: 0 }]
]);

const videoHistory: VideoRecord[] = [];

const SARANCHA_BASE = "https://sarancha.onrender.com";

// 1. Proxy file upload to /proxy/uguu/
app.post('/proxy/uguu/', async (req, res) => {
  try {
    const contentType = req.headers['content-type'] || '';
    const response = await fetch(`${SARANCHA_BASE}/proxy/uguu/`, {
      method: 'POST',
      headers: {
        'content-type': contentType,
      },
      body: req.body,
    });
    
    const data = await response.text();
    res.status(response.status).send(data);
  } catch (err: any) {
    console.error("Proxy uguu error:", err);
    res.status(500).json({ error: err.message || "Upload proxy error" });
  }
});

// 2. Proxy API run
app.post('/api/run', async (req, res) => {
  try {
    let { key, prompt, duration, ratio, fast, refs } = req.body;
    if (!key) key = DEFAULT_API_KEY;

    if (!apiKeys.has(key) && key !== DEFAULT_API_KEY) {
      apiKeys.set(key, { key, name: 'Auto Key', createdAt: new Date().toISOString(), requestsCount: 0 });
    }

    const record = apiKeys.get(key);
    if (record) record.requestsCount++;

    const response = await fetch(`${SARANCHA_BASE}/api/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ key, prompt, duration, ratio, fast, refs })
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err: any) {
    console.error("API run error:", err);
    res.status(500).json({ error: err.message || "Failed to initiate generation" });
  }
});

// 3. Proxy API status
app.get('/api/status', async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) {
      return res.status(400).json({ error: "Missing job id" });
    }
    const response = await fetch(`${SARANCHA_BASE}/api/status?id=${id}`);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err: any) {
    console.error("API status error:", err);
    res.status(500).json({ error: err.message || "Failed to check status" });
  }
});

// 4. API Keys Management Routes
app.get('/api/v1/keys', (req, res) => {
  res.json({ keys: Array.from(apiKeys.values()) });
});

app.post('/api/v1/keys', (req, res) => {
  const { name } = req.body;
  const randomHex = Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  const newKey = `sk-cinematic-${randomHex}`;
  const record: ApiKeyRecord = {
    key: newKey,
    name: name || 'My API Key',
    createdAt: new Date().toISOString(),
    requestsCount: 0
  };
  apiKeys.set(newKey, record);
  res.json(record);
});

app.delete('/api/v1/keys/:key', (req, res) => {
  const { key } = req.params;
  if (key === DEFAULT_API_KEY) {
    return res.status(400).json({ error: "Cannot delete default system key" });
  }
  const deleted = apiKeys.delete(key);
  res.json({ success: deleted });
});

// 5. Developer REST API for programmatic video generation (/api/v1/generate)
app.post('/api/v1/generate', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    let apiKey = DEFAULT_API_KEY;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      apiKey = authHeader.substring(7);
    } else if (req.body.api_key) {
      apiKey = req.body.api_key;
    }

    if (!apiKeys.has(apiKey) && apiKey !== DEFAULT_API_KEY) {
      return res.status(401).json({ error: "Invalid API key" });
    }

    const { prompt, model = 'fast', duration = 4, ratio = '16:9', refs = [] } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    const isFast = model === 'fast' || model === 'Fast';

    const runRes = await fetch(`${SARANCHA_BASE}/api/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: apiKey,
        prompt,
        duration: Math.max(4, Math.min(15, Number(duration) || 4)),
        ratio: ratio || '16:9',
        fast: isFast,
        refs
      })
    });

    const runData = await runRes.json();
    if (!runRes.ok || !runData.job) {
      return res.status(500).json({ error: runData.error || "Failed to start generation job" });
    }

    const jobId = runData.job;
    
    const videoRec: VideoRecord = {
      id: jobId,
      prompt,
      model: isFast ? 'fast' : 'mini',
      duration: Number(duration) || 4,
      ratio: ratio || '16:9',
      status: 'processing',
      createdAt: new Date().toISOString()
    };
    videoHistory.unshift(videoRec);

    res.json({
      success: true,
      job_id: jobId,
      status: 'processing',
      message: 'Video generation started successfully. Poll /api/v1/videos/:id for status.'
    });
  } catch (err: any) {
    console.error("Developer API generate error:", err);
    res.status(500).json({ error: err.message || "Internal server error" });
  }
});

app.get('/api/v1/videos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const response = await fetch(`${SARANCHA_BASE}/api/status?id=${id}`);
    const data = await response.json();
    
    const found = videoHistory.find(v => v.id === id);
    if (found) {
      if (data.state === 'done') {
        found.status = 'done';
        found.videoUrl = data.url;
      } else if (data.state === 'error') {
        found.status = 'error';
        found.error = data.message;
      }
    }

    res.json({
      job_id: id,
      state: data.state,
      url: data.url || null,
      message: data.message || null
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to get video status" });
  }
});

app.get('/api/v1/videos', (req, res) => {
  res.json({ videos: videoHistory });
});

// 6. Gemini AI Prompt Enhancement Route
app.post('/api/enhance-prompt', async (req, res) => {
  try {
    const { prompt, style } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(400).json({ error: "Gemini API key not configured" });
    }

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `You are an expert prompt engineer for cinematic AI video generation.
Enhance the following user prompt to be extremely vivid, cinematic, detailed, and visually stunning, optimized for high-end video generation models.
Style/Mood: ${style || 'Cinematic, Photorealistic'}
User prompt: "${prompt}"

Provide ONLY the enhanced prompt text, without any introductory text or quotes.`
    });

    const enhanced = response.text ? response.text.trim() : prompt;
    res.json({ enhanced });
  } catch (err: any) {
    console.error("Gemini enhance prompt error:", err);
    res.status(500).json({ error: err.message || "Failed to enhance prompt" });
  }
});

// Setup Vite middleware in development or static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
} else {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa'
  });
  app.use(vite.middlewares);
}

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
