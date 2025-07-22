// client/lib/sync.js
const api = require('./api');
const config = require('../config');
const path = require('path');
const fs = require('fs-extra');

let lastSyncAt = null;

async function performSync() {
  try {
    console.log('🔄 Starting sync...');
    
    // Initialize sync session
    const syncData = await api.initSync(config.DEVICE_ID, lastSyncAt);
    
    if (syncData.changedFiles.length > 0) {
      console.log(`📥 Found ${syncData.changedFiles.length} changed files on server`);
      
      // Download changed files
      for (const file of syncData.changedFiles) {
        await downloadFileFromServer(file);
      }
    } else {
      console.log('✅ No changes found on server');
    }
    
    // Complete sync
    await api.completeSync(syncData.session.id);
    
    // Update last sync time
    lastSyncAt = syncData.serverTime;
    
    console.log('✅ Sync completed');
    
  } catch (error) {
    console.error('❌ Sync failed:', error.message);
  }
}

async function downloadFileFromServer(fileMetadata) {
  try {
    const localPath = path.join(config.WATCH_DIRECTORY, fileMetadata.file_path);
    
    // Check if file already exists and is the same size
    if (await fs.pathExists(localPath)) {
      const stats = await fs.stat(localPath);
      if (stats.size === fileMetadata.file_size) {
        console.log(`⏭️ File unchanged: ${fileMetadata.filename}`);
        return;
      }
    }
    
    // Download the file
    console.log(`📥 Downloading: ${fileMetadata.filename}`);
    await api.downloadFile(fileMetadata.id, localPath);
    
  } catch (error) {
    console.error(`❌ Failed to download ${fileMetadata.filename}:`, error.message);
  }
}

function startPeriodicSync() {
  // Initial sync
  performSync();
  
  // Set up periodic sync
  setInterval(performSync, config.SYNC_INTERVAL);
  
  console.log(`⏰ Periodic sync every ${config.SYNC_INTERVAL / 1000} seconds`);
}

module.exports = {
  performSync,
  startPeriodicSync
};