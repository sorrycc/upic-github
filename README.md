# UPic GitHub Image Upload Service

A Node.js service for uploading images to GitHub repositories with automatic compression, caching, and CDN-like proxy functionality.

## Features

- 🚀 Upload images to GitHub repositories via REST API
- 🗜️ Automatic PNG compression using pngquant
- 📦 Smart caching system with automatic cleanup
- 🔒 Token-based authentication
- 🌐 CDN-like proxy for GitHub raw content
- 📊 Comprehensive logging and monitoring

## Prerequisites

- Node.js (version 14 or higher)
- `pngquant` installed for PNG compression
  ```bash
  # macOS
  brew install pngquant
  
  # Ubuntu/Debian
  apt-get install pngquant
  
  # CentOS/RHEL
  yum install pngquant
  ```

## Installation

1. Clone the repository:
   ```bash
   git clone <your-repo-url>
   cd upic-github
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file with the required configuration:
   ```env
   # Required environment variables
   GITHUB_TOKEN=your_github_personal_access_token
   GITHUB_REPO=username/repository/branch
   SITE_PREFIX=https://cdn.example.com/
   TOKEN=your_api_access_token
   
   # Optional configuration
   PORT=8889
   CACHE_CLEANUP_INTERVAL_HOURS=24
   MAX_CACHE_SIZE_MB=1024
   ```

## Configuration

### Environment Variables

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `GITHUB_TOKEN` | ✅ | GitHub personal access token with repo permissions | - |
| `GITHUB_REPO` | ✅ | Repository path in format `owner/repo/branch` | - |
| `SITE_PREFIX` | ✅ | CDN URL prefix for uploaded images | - |
| `TOKEN` | ✅ | API access token for authentication | - |
| `PORT` | ❌ | Server port | `8889` |
| `CACHE_CLEANUP_INTERVAL_HOURS` | ❌ | Cache cleanup frequency | `24` |
| `MAX_CACHE_SIZE_MB` | ❌ | Maximum cache size in MB | `1024` |

### GitHub Setup

1. Create a GitHub personal access token:
   - Go to GitHub Settings → Developer settings → Personal access tokens
   - Generate a new token with `repo` permissions
   - Copy the token to your `.env` file

2. Set up your repository:
   - Create or use an existing repository for storing images
   - Ensure the specified branch exists
   - Format: `username/repository/branch`

## Usage

### Starting the Server

```bash
# Development mode
npm run dev

# Production mode
node index.js
```

### API Endpoints

#### Upload Image
Upload an image via base64-encoded JSON:

```bash
POST /api/upload
Authorization: Bearer your_api_access_token
Content-Type: application/json

{
  "file": "base64_encoded_image_data",
  "fileName": "image.png"
}
```

**Response:**
```json
{
  "data": "https://cdn.example.com/1234567890-123456789.png"
}
```

#### Proxy GitHub Content
Access GitHub raw content with caching:

```bash
GET /proxy/filename.png
```

### Testing

Use the included test script to verify the upload functionality:

```bash
# Test with default image
node test-upload.js

# Test with specific image
node test-upload.js /path/to/your/image.png
```

### Example Usage with curl

```bash
# Convert image to base64 and upload
IMAGE_BASE64=$(base64 -i image.png)
curl -X POST http://localhost:8889/api/upload \
  -H "Authorization: Bearer your_api_access_token" \
  -H "Content-Type: application/json" \
  -d "{\"file\":\"$IMAGE_BASE64\",\"fileName\":\"image.png\"}"
```

## How It Works

### Upload Process
1. Client sends base64-encoded image with filename
2. Server validates authentication token
3. Image is decoded and saved to temporary directory
4. PNG images are automatically compressed using pngquant
5. Image is uploaded to specified GitHub repository
6. CDN URL is returned to client
7. Temporary files are cleaned up

### Caching System
- Downloaded images are cached locally for 3 months
- Automatic cleanup runs every 24 hours (configurable)
- Cache size monitoring with automatic cleanup when limits exceeded
- Serves cached content for faster response times

### Compression
- PNG files are automatically compressed using pngquant
- Compression quality: 65-80%
- Fallback to original file if compression fails
- Compression statistics logged for monitoring

## Directory Structure

```
upic-github/
├── cache/          # Cached files from GitHub
├── tmp/            # Temporary upload files
├── node_modules/   # Dependencies
├── index.js        # Main server file
├── test-upload.js  # Test script
├── package.json    # Project configuration
└── .env           # Environment variables
```

## Security Considerations

- Always use HTTPS in production
- Rotate API tokens regularly
- Monitor file upload sizes to prevent abuse
- Consider implementing rate limiting
- Validate file types and content
- Use secure GitHub repository access

## Monitoring

The service provides comprehensive logging including:
- Upload success/failure events
- Cache hit/miss statistics
- Compression ratios and performance
- Authentication attempts
- Error tracking and debugging information

## Troubleshooting

### Common Issues

1. **GitHub upload fails**: Check token permissions and repository access
2. **PNG compression not working**: Ensure pngquant is installed
3. **Cache not clearing**: Check file permissions and disk space
4. **Authentication errors**: Verify token configuration and format

### Logs

Monitor the console output for detailed information about:
- Server startup and configuration
- Upload processing and results
- Cache operations and cleanup
- Error messages and stack traces

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see package.json for details