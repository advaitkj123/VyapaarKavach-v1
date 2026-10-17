# SmurfPakad API Endpoints Documentation

Base URL: `https://api.smurfpakad.com/api/v1`

## Authentication

### Login (OAuth Callback)
```http
POST /auth/login
Content-Type: application/json

Request Body:
{
  "code": "string",           // OAuth authorization code
  "provider": "google|github" // OAuth provider
}

Response: 200 OK
{
  "token": "string",           // JWT token
  "user": {
    "id": "string",
    "name": "string",
    "email": "string",
    "avatar": "string"
  }
}
```

### Logout
```http
POST /auth/logout
Authorization: Bearer {token}

Response: 200 OK
{
  "message": "Logged out successfully"
}
```

### Get Current User
```http
GET /auth/user
Authorization: Bearer {token}

Response: 200 OK
{
  "id": "string",
  "name": "string",
  "email": "string",
  "avatar": "string",
  "createdAt": "string"
}
```

---

## Dashboard

### Get Dashboard Statistics
```http
GET /dashboard/stats
Authorization: Bearer {token}

Response: 200 OK
{
  "totalTransactions": "number",
  "suspiciousActivity": "number",
  "activeCases": "number",
  "riskScore": "number",
  "changes": {
    "transactions": "+15.3%",
    "suspicious": "+5.2%",
    "cases": "-2.1%",
    "risk": "+8.7%"
  }
}
```

### Get Recent Uploads
```http
GET /dashboard/recent-uploads
Authorization: Bearer {token}
Query Parameters:
  - limit: number (default: 5)

Response: 200 OK
[
  {
    "id": "string",
    "name": "string",
    "date": "string",
    "status": "completed|processing|failed",
    "records": "number"
  }
]
```

---

## Upload

### Upload Transaction File
```http
POST /upload/file
Authorization: Bearer {token}
Content-Type: multipart/form-data

Request Body:
{
  "file": File,              // CSV, Excel, or JSON file
  "description": "string"    // Optional description
}

Response: 200 OK
{
  "id": "string",
  "name": "string",
  "status": "processing",
  "uploadedAt": "string"
}
```

### Get Upload History
```http
GET /upload/history
Authorization: Bearer {token}
Query Parameters:
  - page: number (default: 1)
  - limit: number (default: 10)
  - status: "completed|processing|failed" (optional)

Response: 200 OK
{
  "uploads": [
    {
      "id": "string",
      "name": "string",
      "date": "string",
      "status": "completed|processing|failed",
      "records": "number",
      "size": "number" // bytes
    }
  ],
  "pagination": {
    "page": "number",
    "limit": "number",
    "total": "number",
    "totalPages": "number"
  }
}
```

### Get Upload Details
```http
GET /upload/{uploadId}
Authorization: Bearer {token}

Response: 200 OK
{
  "id": "string",
  "name": "string",
  "uploadedAt": "string",
  "status": "string",
  "records": "number",
  "size": "number",
  "fileType": "string",
  "processingTime": "number" // seconds
}
```

### Delete Upload
```http
DELETE /upload/{uploadId}
Authorization: Bearer {token}

Response: 200 OK
{
  "message": "Upload deleted successfully"
}
```

---

## Analysis

### Get Analysis Results
```http
GET /analysis/{uploadId}
Authorization: Bearer {token}

Response: 200 OK
{
  "uploadId": "string",
  "summary": {
    "totalTransactions": "number",
    "suspiciousTransactions": "number",
    "riskScore": "number",
    "patternsDetected": "number"
  },
  "patterns": [
    {
      "id": "string",
      "type": "Smurfing|Layering|Integration|Structuring",
      "severity": "high|medium|low",
      "confidence": "number", // 0-100
      "transactions": "number",
      "description": "string",
      "addresses": ["string"]
    }
  ],
  "suspiciousAddresses": [
    {
      "address": "string",
      "riskLevel": "critical|high|medium|low",
      "totalAmount": "number",
      "transactionCount": "number",
      "firstSeen": "string",
      "lastSeen": "string",
      "flags": ["string"]
    }
  ]
}
```

### Get All Patterns
```http
GET /analysis/patterns
Authorization: Bearer {token}
Query Parameters:
  - uploadId: string (optional)
  - type: string (optional)
  - severity: string (optional)

Response: 200 OK
[
  {
    "id": "string",
    "type": "string",
    "severity": "string",
    "confidence": "number",
    "transactions": "number",
    "description": "string",
    "detectedAt": "string"
  }
]
```

### Get Suspicious Addresses
```http
GET /analysis/suspicious-addresses
Authorization: Bearer {token}
Query Parameters:
  - uploadId: string (optional)
  - riskLevel: string (optional)
  - page: number
  - limit: number

Response: 200 OK
{
  "addresses": [
    {
      "address": "string",
      "riskLevel": "string",
      "totalAmount": "number",
      "transactionCount": "number",
      "firstSeen": "string",
      "lastSeen": "string",
      "flags": ["string"]
    }
  ],
  "pagination": {
    "page": "number",
    "limit": "number",
    "total": "number"
  }
}
```

---

## Transaction Graph

### Get Transaction Graph Data
```http
GET /graph/{uploadId}
Authorization: Bearer {token}
Query Parameters:
  - depth: number (default: 2) // Connection depth
  - minAmount: number (optional) // Minimum transaction amount

Response: 200 OK
{
  "nodes": [
    {
      "id": "string",
      "address": "string",
      "type": "sender|receiver|exchange",
      "riskLevel": "critical|high|medium|low",
      "transactionCount": "number",
      "totalAmount": "number"
    }
  ],
  "edges": [
    {
      "source": "string",
      "target": "string",
      "amount": "number",
      "timestamp": "string",
      "suspicious": "boolean"
    }
  ]
}
```

### Get Network Statistics
```http
GET /graph/statistics/{uploadId}
Authorization: Bearer {token}

Response: 200 OK
{
  "totalNodes": "number",
  "totalEdges": "number",
  "clusters": "number",
  "avgDegree": "number",
  "density": "number",
  "suspiciousClusters": [
    {
      "id": "string",
      "size": "number",
      "riskScore": "number",
      "addresses": ["string"]
    }
  ]
}
```

---

## Reports

### Generate Report
```http
POST /reports/generate
Authorization: Bearer {token}
Content-Type: application/json

Request Body:
{
  "uploadId": "string",
  "type": "compliance|investigation|summary",
  "format": "pdf|excel|json",
  "filters": {
    "dateRange": {
      "start": "string",
      "end": "string"
    },
    "riskLevel": ["critical", "high"],
    "includeGraph": "boolean",
    "includePatterns": "boolean"
  }
}

Response: 200 OK
{
  "reportId": "string",
  "status": "generating",
  "estimatedTime": "number" // seconds
}
```

### Get All Reports
```http
GET /reports
Authorization: Bearer {token}
Query Parameters:
  - page: number
  - limit: number
  - type: string (optional)
  - status: "completed|generating|failed" (optional)

Response: 200 OK
{
  "reports": [
    {
      "id": "string",
      "name": "string",
      "type": "string",
      "format": "string",
      "status": "string",
      "createdAt": "string",
      "size": "number"
    }
  ],
  "pagination": {
    "page": "number",
    "limit": "number",
    "total": "number"
  }
}
```

### Get Report Details
```http
GET /reports/{reportId}
Authorization: Bearer {token}

Response: 200 OK
{
  "id": "string",
  "name": "string",
  "type": "string",
  "format": "string",
  "status": "string",
  "createdAt": "string",
  "completedAt": "string",
  "size": "number",
  "uploadId": "string",
  "filters": {}
}
```

### Download Report
```http
GET /reports/download/{reportId}
Authorization: Bearer {token}

Response: 200 OK
Content-Type: application/pdf | application/vnd.openxmlformats-officedocument.spreadsheetml.sheet | application/json
Content-Disposition: attachment; filename="report.pdf"

[Binary file data]
```

### Delete Report
```http
DELETE /reports/{reportId}
Authorization: Bearer {token}

Response: 200 OK
{
  "message": "Report deleted successfully"
}
```

---

## Settings

### Get User Profile
```http
GET /settings/profile
Authorization: Bearer {token}

Response: 200 OK
{
  "name": "string",
  "email": "string",
  "avatar": "string",
  "company": "string",
  "phone": "string",
  "timezone": "string"
}
```

### Update User Profile
```http
PUT /settings/profile
Authorization: Bearer {token}
Content-Type: application/json

Request Body:
{
  "name": "string",
  "company": "string",
  "phone": "string",
  "timezone": "string"
}

Response: 200 OK
{
  "message": "Profile updated successfully",
  "profile": {}
}
```

### Get Notification Settings
```http
GET /settings/notifications
Authorization: Bearer {token}

Response: 200 OK
{
  "email": {
    "alerts": "boolean",
    "reports": "boolean",
    "updates": "boolean"
  },
  "push": {
    "enabled": "boolean"
  }
}
```

### Update Notification Settings
```http
PUT /settings/notifications
Authorization: Bearer {token}
Content-Type: application/json

Request Body:
{
  "email": {
    "alerts": "boolean",
    "reports": "boolean",
    "updates": "boolean"
  },
  "push": {
    "enabled": "boolean"
  }
}

Response: 200 OK
{
  "message": "Notification settings updated"
}
```

### Update Security Settings
```http
PUT /settings/security
Authorization: Bearer {token}
Content-Type: application/json

Request Body:
{
  "currentPassword": "string",
  "newPassword": "string",
  "twoFactorEnabled": "boolean"
}

Response: 200 OK
{
  "message": "Security settings updated"
}
```

### Get API Keys
```http
GET /settings/api-keys
Authorization: Bearer {token}

Response: 200 OK
{
  "keys": [
    {
      "id": "string",
      "name": "string",
      "key": "string", // Masked: "sk-****...****1234"
      "createdAt": "string",
      "lastUsed": "string",
      "permissions": ["read", "write"]
    }
  ]
}
```

### Create API Key
```http
POST /settings/api-keys
Authorization: Bearer {token}
Content-Type: application/json

Request Body:
{
  "name": "string",
  "permissions": ["read", "write"]
}

Response: 200 OK
{
  "id": "string",
  "name": "string",
  "key": "string", // Full key shown only once
  "createdAt": "string"
}
```

### Delete API Key
```http
DELETE /settings/api-keys/{keyId}
Authorization: Bearer {token}

Response: 200 OK
{
  "message": "API key deleted successfully"
}
```

---

## Webhooks (Optional)

### Register Webhook
```http
POST /webhooks
Authorization: Bearer {token}
Content-Type: application/json

Request Body:
{
  "url": "string",
  "events": ["upload.completed", "analysis.completed", "report.ready"],
  "secret": "string" // Optional webhook signing secret
}

Response: 200 OK
{
  "id": "string",
  "url": "string",
  "events": ["string"],
  "active": "boolean"
}
```

---

## Error Responses

All endpoints may return the following error responses:

### 400 Bad Request
```json
{
  "error": "Bad Request",
  "message": "Invalid request parameters",
  "details": {
    "field": "error description"
  }
}
```

### 401 Unauthorized
```json
{
  "error": "Unauthorized",
  "message": "Invalid or expired token"
}
```

### 403 Forbidden
```json
{
  "error": "Forbidden",
  "message": "Insufficient permissions"
}
```

### 404 Not Found
```json
{
  "error": "Not Found",
  "message": "Resource not found"
}
```

### 429 Too Many Requests
```json
{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded",
  "retryAfter": "number" // seconds
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal Server Error",
  "message": "An unexpected error occurred",
  "requestId": "string"
}
```

---

## Rate Limits

- **Authentication endpoints**: 10 requests per minute
- **Upload endpoints**: 20 uploads per hour
- **Analysis endpoints**: 100 requests per minute
- **Report generation**: 10 reports per hour
- **Other endpoints**: 1000 requests per hour

---

## WebSocket (Real-time Updates)

```javascript
// Connection
const ws = new WebSocket('wss://api.smurfpakad.com/ws?token={jwt_token}');

// Subscribe to updates
ws.send(JSON.stringify({
  action: 'subscribe',
  channels: ['upload-progress', 'analysis-updates', 'report-status']
}));

// Receive updates
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  /*
  {
    "channel": "upload-progress",
    "data": {
      "uploadId": "string",
      "progress": "number", // 0-100
      "status": "string"
    }
  }
  */
};
```

---

## Notes for Backend Implementation

1. **Authentication**: Implement JWT-based authentication with refresh tokens
2. **File Upload**: Support CSV, Excel (XLSX), and JSON formats with max size 100MB
3. **Analysis**: Background job processing with real-time progress updates via WebSocket
4. **Graph Data**: Implement pagination for large graphs (>10k nodes)
5. **Reports**: Async generation with notification on completion
6. **Rate Limiting**: Implement per-user and per-endpoint rate limits
7. **CORS**: Configure for frontend domain `https://smurfpakad.com`
8. **File Storage**: Use cloud storage (S3/Azure Blob) for uploaded files and reports
9. **Database**: Use PostgreSQL for relational data, Redis for caching
10. **Security**: Implement input validation, SQL injection prevention, XSS protection
