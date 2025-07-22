// client/examples/upload-example.js
const api = require('../lib/api');
const config = require('../config');
const fs = require('fs');
const path = require('path');

async function uploadExample() {
  try {
    console.log('🔐 Authenticating...');
    await api.authenticate();
    
    // Create a test file
    const testFile = path.join(config.WATCH_DIRECTORY, 'test-upload.txt');
    const testContent = `Test file created at ${new Date().toISOString()}\nThis is a test upload!`;
    
    // Ensure directory exists
    fs.mkdirSync(config.WATCH_DIRECTORY, { recursive: true });
    fs.writeFileSync(testFile, testContent);
    
    console.log('📝 Created test file:', testFile);
    
    // Upload the file
    console.log('📤 Uploading file...');
    const result = await api.uploadFile(testFile);
    
    console.log('✅ Upload successful!');
    console.log('📄 File info:', {
      id: result.file.id,
      name: result.file.filename,
      size: result.file.fileSize,
      path: result.file.filePath
    });
    
    // List all files
    console.log('\n📋 All files:');
    const files = await api.listFiles();
    files.forEach(file => {
      console.log(`  - ${file.filename} (${file.file_size} bytes)`);
    });
    
  } catch (error) {
    console.error('❌ Example failed:', error.message);
  }
}

uploadExample();