require('dotenv').config();
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

async function testBase64Upload(filePath) {
  try {
    // Get file path, prioritize command line arguments, otherwise use default value
    const imagePath = filePath || path.join(__dirname, 'upic.png');
    
    // Check if file exists
    if (!fs.existsSync(imagePath)) {
      throw new Error(`File not found: ${imagePath}`);
    }
    
    console.log(`Uploading file: ${imagePath}`);
    const testImageData = fs.readFileSync(imagePath).toString('base64');
    
    const response = await fetch('http://localhost:8889/api/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.TOKEN}`
      },
      body: JSON.stringify({
        file: testImageData,
        fileName: path.basename(imagePath)
      })
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('Base64 upload successful:', result);
    } else {
      console.error('Base64 upload failed:', response.status, await response.text());
    }
    
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

// Get command line arguments
const args = process.argv.slice(2);
const filePath = args[0];

console.log('Testing new base64 upload API...');
if (filePath) {
  console.log(`Using file from command line: ${filePath}`);
} else {
  console.log('No file specified, using default: upic.png');
}

testBase64Upload(filePath);