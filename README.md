# Merkle Tree File Sync System



## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    ARCHITECTURE                  │
├─────────────────────────────────────────────────────────────────┤
│  Multi-Device File Sync with Merkle Tree State Management      │
│  Permanent S3 URLs + JWT Authentication + Real-time Sync       │
└─────────────────────────────────────────────────────────────────┘

┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   CLIENT A   │    │   CLIENT B   │    │   CLIENT C   │
│   (Device 1) │    │   (Device 2) │    │   (Device 3) │
│              │    │              │    │              │
│ ┌──────────┐ │    │ ┌──────────┐ │    │ ┌──────────┐ │
│ │File      │ │    │ │File      │ │    │ │File      │ │
│ │Watcher   │ │    │ │Watcher   │ │    │ │Watcher   │ │
│ └──────────┘ │    │ └──────────┘ │    │ └──────────┘ │
│ ┌──────────┐ │    │ ┌──────────┐ │    │ ┌──────────┐ │
│ │Merkle    │ │    │ │Merkle    │ │    │ │Merkle    │ │
│ │Tree      │ │    │ │Tree      │ │    │ │Tree      │ │
│ └──────────┘ │    │ └──────────┘ │    │ └──────────┘ │
└──────┬───────┘    └──────┬───────┘    └──────┬───────┘
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │
                  ┌────────▼────────┐
                  │   SERVER API    │
                  │  (Node.js +     │
                  │   Express +     │
                  │   PostgreSQL)   │
                  └────────┬────────┘
                           │
              ┌────────────┴────────────┐
              │                         │
    ┌─────────▼─────────┐    ┌─────────▼─────────┐
    │   PostgreSQL DB   │    │   MinIO Storage   │
    │  • User accounts  │    │  • File objects   │
    │  • File metadata  │    │  • S3 compatible  │
    │  • Merkle trees   │    │  • Presigned URLs │
    │  • Device states  │    │  • Object storage │
    └───────────────────┘    └───────────────────┘
```

### 🔧 Technology Stack
- **Backend**: Node.js, Express.js, PostgreSQL, MinIO
- **Client**: Node.js, Chokidar (file watching), Custom Merkle Tree
- **Storage**: MinIO (S3-compatible object storage)
- **Database**: PostgreSQL for metadata and tree states
- **Authentication**: JWT tokens with bcrypt password hashing
- **File Monitoring**: Real-time file system event detection

---

## 🌳 Merkle Tree Structure & Functionality

### Tree Architecture
```
                    ROOT HASH
                 (All files state)
                        │
               ┌────────┴────────┐
               │                 │
          INTERNAL           INTERNAL
           NODE 1             NODE 2
               │                 │
       ┌───────┴───────┐ ┌───────┴───────┐
       │               │ │               │
   LEAF NODE       LEAF NODE LEAF NODE LEAF NODE
  (file1.txt)     (file2.txt) (dir/a.txt) (dir/b.txt)
```

### 📄 Leaf Node Structure
Each file is represented as a leaf node with comprehensive metadata:

```json
{
  "file_path": "documents/notes.txt",
  "filename": "notes.txt",
  "local_url": "/home/user/sync-folder/documents/notes.txt",
  "s3_url": "presigned-url-here", 
  "hash": "sha256:a1b2c3d4...",
  "size": 2048,
  "timestamp": "2025-07-27T12:00:00.000Z",
  "mime_type": "text/plain"
}
```

### 🔄 Tree Operations
- **`addOrUpdateFile()`**: Add/update file metadata in tree
- **`updateS3Url()`**: Update S3 URL after successful upload  
- **`removeFile()`**: Remove file from tree (for deletions)
- **`getFile()`**: Get file information from tree
- **`getRootHash()`**: Get current tree state hash
- **`getDifferences()`**: Compare trees to identify changes
- **`toJSON()`** / **`fromJSON()`**: Serialize/deserialize tree state

---

## 🔄 Complete File Workflow

### 1. File Upload Process
```
USER CREATES/MODIFIES FILE
        │
        ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  FILE WATCHER   │───▶│  MERKLE TREE    │───▶│  UPLOAD QUEUE   │
│                 │    │                 │    │                 │
│ • Detects change│    │ • Add file node │    │ • Queue upload  │
│ • Calc file hash│    │ • s3_url: null  │    │ • Batch process │
│ • Get metadata  │    │ • Save to disk  │    │ • Error handling│
└─────────────────┘    └─────────────────┘    └─────────────────┘
        │                        │                        │
        │                        │                        ▼
        │                        │               ┌─────────────────┐
        │                        │               │  SERVER UPLOAD  │
        │                        │               │                 │
        │                        │               │ • Upload to S3  │
        │                        │               │ • Store metadata│
        │                        │               │ • Generate URL  │
        │                        │               └─────────────────┘
        │                        │                        │
        │                        ◀────────────────────────┘
        │                        │
        │                        ▼
        │               ┌─────────────────┐
        │               │ UPDATE S3 URL   │
        │               │                 │
        └──────────────▶│ • Update tree   │
                        │ • Recalc hashes │
                        │ • Sync to server│
                        └─────────────────┘
```

## 🔐 Permanent S3 URL System

Traditional presigned URLs expire and cause access failures. Our system uses **permanent MinIO keys** with **on-demand URL generation**.

### Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                    PERMANENT URL SYSTEM                     │
└─────────────────────────────────────────────────────────────┘

DATABASE STORAGE:
┌─────────────────┐
│ files table     │
│ ├── minio_key   │ ◄─── PERMANENT (never expires)
│ ├── file_hash   │
│ ├── metadata... │
│ └── NO s3_url   │ ◄─── NOT STORED (generated on-demand)
└─────────────────┘

ON-DEMAND GENERATION:
Request → Database lookup → Generate fresh presigned URL → Return

BENEFITS:
✅ No TTL expiry issues
✅ Each URL is unique and secure  
✅ Configurable expiry times
✅ Always accessible files
```

---

## 🗄️ Database Schema

### Users Table
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Files Table  
```sql
CREATE TABLE files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  filename VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_hash VARCHAR(64) NOT NULL,
  mime_type VARCHAR(100),
  minio_key TEXT NOT NULL,        -- Permanent storage key
  local_url TEXT,                 -- Local file path
  upload_status VARCHAR(50) DEFAULT 'completed',
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Merkle Trees Table
```sql
CREATE TABLE merkle_trees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  device_id VARCHAR(255) NOT NULL,
  root_hash VARCHAR(64),
  tree_data JSONB NOT NULL,       -- Complete tree structure
  version INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 🔌 API Endpoints

### 🔐 Authentication
```
POST /api/auth/register    - Create user account
POST /api/auth/login       - Get JWT token  
GET  /api/auth/me          - Get user info
```

### 📁 File Operations
```
POST   /api/files/upload            - Upload file with metadata
GET    /api/files                   - List user files
GET    /api/files/:id/download      - Get presigned download URL
GET    /api/files/:id/url           - Get fresh presigned URL
DELETE /api/files/:id               - Delete file by ID
DELETE /api/files/hash/:hash        - Delete file by hash (for sync)
```

### 🌳 Merkle Tree Management
```
POST /api/merkle/update    - Update device tree state
POST /api/merkle/diff      - Get sync differences  
GET  /api/merkle/tree      - Get device tree
GET  /api/merkle/devices   - List user devices
```

### 🏥 System Health
```
GET /health                - Server health check
```

---

## 🧪 API Testing

### Prerequisites
- Server running on `http://localhost:3000`
- Valid JWT token (get from login)
- Test files in Client directory

### Authentication Testing

#### 1. Register User
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com", 
    "password": "password123"
  }'
```

#### 2. Login User
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

Save the returned JWT token for subsequent requests.

#### 3. Get User Info
```bash
curl -X GET http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### File Operations Testing

#### 1. Upload File
```bash
curl -X POST http://localhost:3000/api/files/upload \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@./test-file.txt" \
  -F "file_path=documents/test-file.txt" \
  -F "local_url=/home/user/sync-folder/documents/test-file.txt"
```

#### 2. List Files
```bash
curl -X GET http://localhost:3000/api/files \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### 3. Get Presigned Download URL
```bash
curl -X GET http://localhost:3000/api/files/{FILE_ID}/download \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### 4. Get Fresh Presigned URL
```bash
curl -X GET http://localhost:3000/api/files/{FILE_ID}/url \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### 5. Delete File by ID
```bash
curl -X DELETE http://localhost:3000/api/files/{FILE_ID} \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### 6. Delete File by Hash (for sync)
```bash
curl -X DELETE http://localhost:3000/api/files/hash/{FILE_HASH} \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Merkle Tree Testing

#### 1. Update Tree State
```bash
curl -X POST http://localhost:3000/api/merkle/update \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "laptop-001",
    "tree_data": {"root": "abc123", "files": {}},
    "root_hash": "abc123"
  }'
```

#### 2. Get Tree Differences
```bash
curl -X POST http://localhost:3000/api/merkle/diff \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "laptop-001",
    "local_tree": {"root": "def456", "files": {}}
  }'
```

#### 3. Get Device Tree
```bash
curl -X GET "http://localhost:3000/api/merkle/tree?device_id=laptop-001" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### 4. List User Devices
```bash
curl -X GET http://localhost:3000/api/merkle/devices \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### System Health Check
```bash
curl -X GET http://localhost:3000/health
```

### Using Individual Test Scripts

The project includes individual test scripts for each API endpoint:

```bash
cd Client/examples
node auth-test.js        # Test authentication
node upload-test.js      # Test file upload
node list-files-test.js  # Test file listing
node download-test.js    # Test file download
node url-test.js         # Test URL generation
node delete-test.js      # Test file deletion
node merkle-test.js      # Test Merkle operations
```

Each script can be run independently to test specific functionality.

---

## 🚀 Setup & Installation

### Prerequisites
- Node.js (v16+)
- Docker & Docker Compose
- Git

### 1. Clone Repository
```bash
git clone https://github.com/your-repo/Simple_DropBox.git
cd Simple_DropBox
```

### 2. Start Infrastructure
```bash
cd file-sync-system
docker-compose up -d
```

This starts:
- **PostgreSQL** on port 5432
- **MinIO** on port 9000 (console on 9001)

### 3. Configure Environment Variables

#### Server (.env in Server/)
```bash
NODE_ENV=development
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=filesync
DB_USER=postgres
DB_PASSWORD=password
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=filesync-bucket
JWT_SECRET=your-secret-key-here
```

#### Client (.env in Client/)
```bash
API_BASE_URL=http://localhost:3000/api
USER_EMAIL=test@example.com
USER_PASSWORD=password123
WATCH_DIRECTORY=./sync-folder
DEVICE_ID=laptop-001
SYNC_INTERVAL=30000
```

### 4. Setup Server 
```bash
cd Server
npm install
npm run migrate    # Create database tables
npm start         # Start server on port 3000
```

### 5. Setup Client
```bash
cd Client
npm install
npm start         # Start file watcher and sync
```

---

## 🔍 Key Features

### ✅ Merkle Tree-based Change Detection
- SHA-256 file hashing for integrity
- Efficient tree comparison algorithms
- Minimal data transfer during sync

### ✅ Permanent S3 URL System  
- No TTL expiration issues
- On-demand presigned URL generation
- Secure temporary access links

### ✅ Bidirectional Deletion Sync
- Local deletions propagate to server
- Server deletions sync to all devices
- Consistent state across all clients

### ✅ Real-time File Monitoring
- Chokidar-based file system watching
- Automatic upload queue management
- Error handling and retry logic

### ✅ JWT Authentication
- Secure API access control
- User-based file isolation
- Device identification system

### ✅ Multi-Device Support
- Device-specific tree states
- Conflict-free synchronization
- Independent client operations

---

## 🛠️ Development

### Project Structure
```
file-sync-system/
├── Server/                 # Backend API server
│   ├── routes/            # API endpoints
│   ├── config/            # Database & MinIO config
│   ├── middleware/        # Auth & error handling
│   └── scripts/           # Migration scripts
├── Client/                # Sync client
│   ├── lib/               # Core sync logic
│   ├── examples/          # API test scripts
│   └── sync-folder/       # Watched directory
└── docker-compose.yml     # Infrastructure setup
```

### Key Components

- **`Client/lib/merkle-tree.js`**: Core Merkle Tree implementation
- **`Client/lib/file-watcher.js`**: File system monitoring
- **`Client/lib/sync.js`**: Synchronization logic
- **`Client/lib/api.js`**: API communication client
- **`Server/routes/files.js`**: File operations API
- **`Server/routes/merkle.js`**: Tree management API

---

## 🐛 Troubleshooting

### Common Issues

**JWT Token Errors**
- Ensure valid token from `/api/auth/login`
- Check token expiration (default 24h)
- Verify `Authorization: Bearer TOKEN` header format

**File Upload Failures**
- Check MinIO connection and credentials
- Verify bucket exists and is accessible
- Ensure sufficient disk space

**Sync Not Working**
- Verify file watcher is running
- Check sync interval configuration
- Review API endpoint accessibility

**Database Connection Issues**
- Ensure PostgreSQL is running via Docker
- Verify connection credentials in `.env`
- Run migrations: `npm run migrate`

This Simple File sync system provides a robust, scalable solution for file synchronization with modern architectural patterns and reliable data consistency across multiple devices.
