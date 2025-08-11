require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const { execSync } = require('child_process');
const fetch = require('node-fetch');

const app = express();

// Configuration constants
const CONFIG = {
  PORT: process.env.PORT || 8889,
  CACHE_DURATION_MONTHS: 3,
  MAX_FILE_SIZE: '50mb',
  CACHE_CLEANUP_INTERVAL_HOURS: process.env.CACHE_CLEANUP_INTERVAL_HOURS || 24,
  MAX_CACHE_SIZE_MB: process.env.MAX_CACHE_SIZE_MB || 1024
};

console.log(`[${new Date().toISOString()}] Initializing server...`);

// Validate required environment variables
const requiredEnvVars = ['GITHUB_TOKEN', 'GITHUB_REPO', 'SITE_PREFIX', 'TOKEN'];
const missing = requiredEnvVars.filter(v => !process.env[v]);
if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

// Ensure tmp and cache directories exist
const tmpDir = path.join(__dirname, 'tmp');
const cacheDir = path.join(__dirname, 'cache');
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir);
  console.log(`[${new Date().toISOString()}] Created tmp directory`);
}
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir);
  console.log(`[${new Date().toISOString()}] Created cache directory`);
}

// Startup cache cleanup
(async () => {
  try {
    console.log(`[${new Date().toISOString()}] Running startup cache cleanup...`);
    const stats = await getCacheStats();
    console.log(`[${new Date().toISOString()}] Current cache: ${stats.totalFiles} files, ${stats.totalSizeMB.toFixed(2)}MB`);
    
    const cleanup = await cleanupExpiredCacheFiles();
    if (cleanup.deletedCount > 0) {
      const newStats = await getCacheStats();
      console.log(`[${new Date().toISOString()}] Cache after cleanup: ${newStats.totalFiles} files, ${newStats.totalSizeMB.toFixed(2)}MB`);
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Startup cache cleanup failed:`, error.message);
  }
})();

// GitHub upload function
async function uploadToGitHub(filePath, filename) {
  const { GITHUB_TOKEN, GITHUB_REPO, SITE_PREFIX } = process.env;
  
  if (!GITHUB_TOKEN || !GITHUB_REPO || !SITE_PREFIX) {
    throw new Error('Missing GitHub environment variables');
  }
  
  // Parse repo info (format: owner/repo/branch)
  const [owner, repo, branch] = GITHUB_REPO.split('/');
  
  const fileContent = fs.readFileSync(filePath).toString('base64');
  const githubPath = filename;
  
  const githubUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${githubPath}`;
  
  console.log(`[${new Date().toISOString()}] Uploading to GitHub: ${githubPath}`);
  
  const response = await fetch(githubUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'upic-upload-service'
    },
    body: JSON.stringify({
      message: `Upload ${filename}`,
      content: fileContent,
      branch: branch
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub upload failed: ${response.status} ${errorText}`);
  }
  
  await response.json();
  const cdnUrl = `${SITE_PREFIX}${filename}`;
  
  console.log(`[${new Date().toISOString()}] GitHub upload successful: ${cdnUrl}`);
  
  return cdnUrl;
}

// Cache management functions
function getCacheFilePath(filename) {
  return path.join(cacheDir, filename);
}

function isCacheValid(filePath) {
  if (!fs.existsSync(filePath)) return false;
  
  const stats = fs.statSync(filePath);
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - CONFIG.CACHE_DURATION_MONTHS);
  
  return stats.mtime > threeMonthsAgo;
}

// Async cache cleanup functions
async function getExpiredCacheFiles() {
  try {
    const files = await fsPromises.readdir(cacheDir);
    const expiredFiles = [];
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - CONFIG.CACHE_DURATION_MONTHS);
    
    for (const file of files) {
      const filePath = path.join(cacheDir, file);
      try {
        const stats = await fsPromises.stat(filePath);
        if (stats.mtime <= threeMonthsAgo) {
          expiredFiles.push({
            name: file,
            path: filePath,
            size: stats.size,
            age: Date.now() - stats.mtime.getTime()
          });
        }
      } catch (statError) {
        console.warn(`[${new Date().toISOString()}] Could not stat cache file ${file}:`, statError.message);
      }
    }
    
    return expiredFiles;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error reading cache directory:`, error.message);
    return [];
  }
}

async function cleanupExpiredCacheFiles() {
  console.log(`[${new Date().toISOString()}] Starting cache cleanup...`);
  
  try {
    const expiredFiles = await getExpiredCacheFiles();
    
    if (expiredFiles.length === 0) {
      console.log(`[${new Date().toISOString()}] Cache cleanup: No expired files found`);
      return { deletedCount: 0, freedSpace: 0 };
    }
    
    let deletedCount = 0;
    let freedSpace = 0;
    
    for (const file of expiredFiles) {
      try {
        await fsPromises.unlink(file.path);
        deletedCount++;
        freedSpace += file.size;
        console.log(`[${new Date().toISOString()}] Deleted expired cache file: ${file.name} (${(file.size / 1024).toFixed(1)}KB, ${Math.round(file.age / (1000 * 60 * 60 * 24))} days old)`);
      } catch (unlinkError) {
        console.error(`[${new Date().toISOString()}] Failed to delete cache file ${file.name}:`, unlinkError.message);
      }
    }
    
    console.log(`[${new Date().toISOString()}] Cache cleanup completed: ${deletedCount} files deleted, ${(freedSpace / 1024 / 1024).toFixed(2)}MB freed`);
    return { deletedCount, freedSpace };
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Cache cleanup failed:`, error.message);
    return { deletedCount: 0, freedSpace: 0 };
  }
}

async function getCacheStats() {
  try {
    const files = await fsPromises.readdir(cacheDir);
    let totalSize = 0;
    let totalFiles = 0;
    
    for (const file of files) {
      try {
        const stats = await fsPromises.stat(path.join(cacheDir, file));
        totalSize += stats.size;
        totalFiles++;
      } catch (statError) {
        console.warn(`[${new Date().toISOString()}] Could not stat cache file ${file}:`, statError.message);
      }
    }
    
    return {
      totalFiles,
      totalSize,
      totalSizeMB: totalSize / 1024 / 1024
    };
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error getting cache stats:`, error.message);
    return { totalFiles: 0, totalSize: 0, totalSizeMB: 0 };
  }
}

// GitHub raw proxy function
async function fetchFromGitHubRaw(filename) {
  const { GITHUB_REPO } = process.env;
  
  if (!GITHUB_REPO) {
    throw new Error('GITHUB_REPO environment variable not set');
  }
  
  // Parse repo info (format: owner/repo/branch)
  const [owner, repo, branch] = GITHUB_REPO.split('/');
  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/refs/heads/${branch}/${filename}`;
  
  console.log(`[${new Date().toISOString()}] Fetching from GitHub raw: ${rawUrl}`);
  
  const response = await fetch(rawUrl);
  if (!response.ok) {
    throw new Error(`GitHub raw fetch failed: ${response.status} ${response.statusText}`);
  }
  
  return response.buffer();
}

// Authentication middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
  
  if (!token) {
    console.log(`[${new Date().toISOString()}] Authentication failed: No token provided`);
    return res.status(401).json({ error: 'Access token required' });
  }
  
  if (token !== process.env.TOKEN) {
    console.log(`[${new Date().toISOString()}] Authentication failed: Invalid token`);
    return res.status(403).json({ error: 'Invalid access token' });
  }
  
  console.log(`[${new Date().toISOString()}] Authentication successful`);
  next();
}

// Body parser middleware for JSON and base64 data
app.use(
  require('body-parser').json({
    limit: CONFIG.MAX_FILE_SIZE,
    type: 'application/json'
  }),
);

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - ${req.ip}`);
  console.log(`[${new Date().toISOString()}] Content-Type: ${req.get('Content-Type')}`);
  next();
});

// Base64 JSON upload endpoint
app.post('/api/upload', authenticateToken, async (req, res) => {
  console.log(`[${new Date().toISOString()}] Upload request received`);
  console.log(`[${new Date().toISOString()}] Request body exists:`, !!req.body);
  console.log(`[${new Date().toISOString()}] Has file:`, !!req.body?.file);
  console.log(`[${new Date().toISOString()}] Has fileName:`, !!req.body?.fileName);
  
  if (!req.body || !req.body.file || !req.body.fileName) {
    console.log(`[${new Date().toISOString()}] Missing file or fileName in request body`);
    return res.status(400).json({ error: 'Missing file or fileName' });
  }
  
  console.log(`[${new Date().toISOString()}] Processing base64 upload: ${req.body.fileName}`);
  
  try {
    const data = req.body.file;
    
    // Validate base64 before processing
    if (!/^[A-Za-z0-9+/]*(=|==)?$/.test(data)) {
      throw new Error('Invalid base64 data');
    }
    
    const buf = Buffer.from(data, 'base64');
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(req.body.fileName) || '.jpg';
    
    // Sanitize filename to prevent path traversal
    const sanitizedBasename = path.basename(req.body.fileName).replace(/[^a-zA-Z0-9.-]/g, '');
    const filename = uniqueSuffix + ext;
    const filePath = path.join(__dirname, 'tmp', filename);
    
    fs.writeFileSync(filePath, buf, 'binary');
    
    // PNG 压缩处理
    if (ext.toLowerCase() === '.png') {
      console.log(`[${new Date().toISOString()}] Compressing PNG with pngquant...`);
      try {
        const compressedPath = path.join(__dirname, 'tmp', `compressed-${filename}`);
        execSync(`pngquant --quality=65-80 --output "${compressedPath}" "${filePath}"`, { stdio: 'inherit' });
        
        // 使用压缩后的文件替换原文件
        if (fs.existsSync(compressedPath)) {
          fs.renameSync(compressedPath, filePath);
          console.log(`[${new Date().toISOString()}] PNG compression completed`);
        }
      } catch (compressError) {
        console.warn(`[${new Date().toISOString()}] PNG compression failed, using original file:`, compressError.message);
      }
    }
    
    const finalSize = fs.statSync(filePath).size;
    console.log(`[${new Date().toISOString()}] Base64 file saved successfully:`);
    console.log(`  - Original name: ${req.body.fileName}`);
    console.log(`  - Saved as: ${filename}`);
    console.log(`  - Original size: ${buf.length} bytes`);
    console.log(`  - Final size: ${finalSize} bytes`);
    if (ext.toLowerCase() === '.png' && finalSize < buf.length) {
      console.log(`  - Compression ratio: ${((1 - finalSize/buf.length) * 100).toFixed(1)}%`);
    }
    
    // Upload to GitHub
    try {
      const githubUrl = await uploadToGitHub(filePath, filename);
      console.log(`[${new Date().toISOString()}] Returning GitHub URL: ${githubUrl}`);
      
      // Clean up local file after successful upload
      fs.unlinkSync(filePath);
      console.log(`[${new Date().toISOString()}] Local file cleaned up`);
      
      res.json({ data: githubUrl });
    } catch (githubError) {
      console.error(`[${new Date().toISOString()}] GitHub upload failed:`, githubError.message);
      
      // Fallback to local URL if GitHub upload fails
      const localUrl = `http://localhost:${CONFIG.PORT}/tmp/${filename}`;
      console.log(`[${new Date().toISOString()}] Fallback to local URL: ${localUrl}`);
      res.json({ data: localUrl });
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error processing base64 upload:`, error);
    res.status(500).json({ error: 'Failed to process base64 upload' });
  }
});

// Proxy route for GitHub raw content with caching
app.get('/proxy/:filename', async (req, res) => {
  const { filename } = req.params;
  const cacheFilePath = getCacheFilePath(filename);
  
  console.log(`[${new Date().toISOString()}] Proxy request for: ${filename}`);
  
  try {
    // Check if file is cached and valid
    if (isCacheValid(cacheFilePath)) {
      try {
        const stats = await fsPromises.stat(cacheFilePath);
        console.log(`[${new Date().toISOString()}] Serving from cache: ${filename} (${(stats.size / 1024).toFixed(1)}KB, ${Math.round((Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24))} days old)`);
      } catch (statError) {
        console.log(`[${new Date().toISOString()}] Serving from cache: ${filename}`);
      }
      return res.sendFile(cacheFilePath);
    }
    
    // Fetch from GitHub raw and cache
    console.log(`[${new Date().toISOString()}] Cache miss or expired, fetching: ${filename}`);
    const fileBuffer = await fetchFromGitHubRaw(filename);
    
    // Save to cache
    fs.writeFileSync(cacheFilePath, fileBuffer);
    console.log(`[${new Date().toISOString()}] Cached file: ${filename} (${(fileBuffer.length / 1024).toFixed(1)}KB)`);
    
    // Check cache size and cleanup if needed
    const stats = await getCacheStats();
    if (stats.totalSizeMB > CONFIG.MAX_CACHE_SIZE_MB) {
      console.log(`[${new Date().toISOString()}] Cache size (${stats.totalSizeMB.toFixed(2)}MB) exceeds limit (${CONFIG.MAX_CACHE_SIZE_MB}MB), running cleanup...`);
      await cleanupExpiredCacheFiles();
    }
    
    // Determine content type based on file extension
    const ext = path.extname(filename).toLowerCase();
    let contentType = 'application/octet-stream';
    
    if (ext === '.png') contentType = 'image/png';
    else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
    else if (ext === '.gif') contentType = 'image/gif';
    else if (ext === '.webp') contentType = 'image/webp';
    else if (ext === '.svg') contentType = 'image/svg+xml';
    
    res.set('Content-Type', contentType);
    res.send(fileBuffer);
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Proxy error for ${filename}:`, error.message);
    res.status(404).json({ error: 'File not found or fetch failed' });
  }
});

app.use('/tmp', express.static('tmp'));

app.use((err, _req, res, _next) => {
  console.error(`[${new Date().toISOString()}] Error:`, err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(CONFIG.PORT, () => {
  console.log(`[${new Date().toISOString()}] Server running on http://localhost:${CONFIG.PORT}`);
  console.log(`[${new Date().toISOString()}] Upload endpoint: POST /api/upload`);
  console.log(`[${new Date().toISOString()}] Proxy endpoint: GET /proxy/:filename`);
  console.log(`[${new Date().toISOString()}] Static files: GET /tmp/*`);
  
  // Setup periodic cache cleanup
  const cleanupIntervalMs = CONFIG.CACHE_CLEANUP_INTERVAL_HOURS * 60 * 60 * 1000;
  console.log(`[${new Date().toISOString()}] Cache cleanup scheduled every ${CONFIG.CACHE_CLEANUP_INTERVAL_HOURS} hours`);
  
  setInterval(async () => {
    try {
      console.log(`[${new Date().toISOString()}] Running periodic cache cleanup...`);
      await cleanupExpiredCacheFiles();
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Periodic cache cleanup failed:`, error.message);
    }
  }, cleanupIntervalMs);
});