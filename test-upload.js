require('dotenv').config();
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

async function testBase64Upload(filePath) {
  try {
    // 获取文件路径，优先使用命令行参数，否则使用默认值
    const imagePath = filePath || path.join(__dirname, 'upic.png');
    
    // 检查文件是否存在
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

// 获取命令行参数
const args = process.argv.slice(2);
const filePath = args[0];

console.log('Testing new base64 upload API...');
if (filePath) {
  console.log(`Using file from command line: ${filePath}`);
} else {
  console.log('No file specified, using default: upic.png');
}

testBase64Upload(filePath);