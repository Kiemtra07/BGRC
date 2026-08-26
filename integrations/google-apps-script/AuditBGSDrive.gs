/**
 * AuditBGS Google Drive gateway.
 * Script Properties bắt buộc:
 * - AUDIT_BGS_HMAC_SECRET
 * - AUDIT_BGS_ROOT_FOLDER_ID
 */
var ALLOWED_ACTIONS = {
  PING: true,
  PROVISION_CAMPAIGN: true,
  ENSURE_CUSTOMER_FOLDER: true,
  ENSURE_ERROR_FOLDER: true,
  SYNC_CAMPAIGN_ACL: true,
  REVOKE_CAMPAIGN_ACCESS: true
};
var MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

function doPost(event) {
  var requestId = Utilities.getUuid();
  try {
    var request = JSON.parse((event && event.postData && event.postData.contents) || '{}');
    verifyRequest_(request);
    var result = dispatch_(request.action, request.payload || {});
    return json_({ ok: true, requestId: requestId, data: result });
  } catch (error) {
    return json_({
      ok: false,
      requestId: requestId,
      data: {},
      error: { code: error.code || 'DRIVE_SCRIPT_FAILED', message: safeMessage_(error) }
    });
  }
}

function dispatch_(action, payload) {
  if (action === 'PING') return { status: 'READY', owner: Session.getEffectiveUser().getEmail() };
  if (action === 'PROVISION_CAMPAIGN') return provisionCampaign_(payload);
  if (action === 'ENSURE_CUSTOMER_FOLDER') return ensureCustomerFolder_(payload);
  if (action === 'ENSURE_ERROR_FOLDER') return ensureErrorFolder_(payload);
  if (action === 'SYNC_CAMPAIGN_ACL') return syncCampaignAcl_(payload);
  if (action === 'REVOKE_CAMPAIGN_ACCESS') return revokeCampaignAccess_(payload);
  fail_('ACTION_NOT_ALLOWED', 'Lệnh không được hỗ trợ.');
}

function verifyRequest_(request) {
  var secret = PropertiesService.getScriptProperties().getProperty('AUDIT_BGS_HMAC_SECRET');
  if (!secret) fail_('SCRIPT_NOT_CONFIGURED', 'Apps Script chưa có khóa bí mật.');
  if (!ALLOWED_ACTIONS[request.action]) fail_('ACTION_NOT_ALLOWED', 'Lệnh không được hỗ trợ.');
  if (!request.timestamp || Math.abs(Date.now() - Number(request.timestamp)) > MAX_CLOCK_SKEW_MS) {
    fail_('REQUEST_EXPIRED', 'Yêu cầu đã hết hạn.');
  }
  if (!request.nonce || !/^[A-Za-z0-9_-]{8,128}$/.test(String(request.nonce))) {
    fail_('INVALID_NONCE', 'Mã chống phát lại không hợp lệ.');
  }
  var cache = CacheService.getScriptCache();
  var replayKey = 'nonce:' + request.nonce;
  if (cache.get(replayKey)) fail_('REPLAY_REJECTED', 'Yêu cầu đã được xử lý.');

  var message = [request.timestamp, request.nonce, request.action, canonicalJson_(request.payload || {})].join('.');
  var expected = bytesToHex_(Utilities.computeHmacSha256Signature(message, secret));
  if (!constantTimeEqual_(expected, String(request.signature || '').toLowerCase())) {
    fail_('INVALID_SIGNATURE', 'Chữ ký yêu cầu không hợp lệ.');
  }
  cache.put(replayKey, '1', 600);
}

function provisionCampaign_(payload) {
  requireFields_(payload, ['campaignCode', 'campaignName']);
  var root = getRootFolder_();
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var folder = getOrCreateChild_(root, safeName_(payload.campaignCode + '_' + payload.campaignName));
    getOrCreateChild_(folder, 'QUYET_DINH');
    getOrCreateChild_(folder, 'KHACH_HANG');
    getOrCreateChild_(folder, 'BAO_CAO');
    removePublicPermissions_(folder.getId());
    disableWriterSharing_(folder.getId());
    return folderInfo_(folder);
  } finally {
    lock.releaseLock();
  }
}

function ensureCustomerFolder_(payload) {
  requireFields_(payload, ['campaignFolderId', 'cif', 'customerName']);
  var campaign = DriveApp.getFolderById(payload.campaignFolderId);
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var customerRoot = getOrCreateChild_(campaign, 'KHACH_HANG');
    var customer = getOrCreateChild_(customerRoot, safeName_(payload.cif + '_' + payload.customerName));
    return folderInfo_(customer);
  } finally {
    lock.releaseLock();
  }
}

function ensureErrorFolder_(payload) {
  requireFields_(payload, ['campaignFolderId', 'cif', 'customerName', 'errorCode']);
  var customerResult = ensureCustomerFolder_(payload);
  var customer = DriveApp.getFolderById(customerResult.folderId);
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var errorFolder = getOrCreateChild_(customer, safeName_('LOI_' + payload.errorCode));
    return folderInfo_(errorFolder);
  } finally {
    lock.releaseLock();
  }
}

function syncCampaignAcl_(payload) {
  requireFields_(payload, ['campaignFolderId']);
  var folderId = payload.campaignFolderId;
  var requested = payload.members || [];
  var desired = {};
  requested.forEach(function (member) {
    var email = normalizeEmail_(member.email);
    if (email) desired[email] = member.access === 'WRITER' ? 'writer' : 'reader';
  });

  removePublicPermissions_(folderId);
  var permissions = Drive.Permissions.list(folderId, { supportsAllDrives: true }).items || [];
  permissions.forEach(function (permission) {
    var email = normalizeEmail_(permission.emailAddress || permission.value);
    if (permission.role === 'owner' || permission.type === 'owner') return;
    if (permission.type === 'anyone' || permission.type === 'domain') {
      Drive.Permissions.remove(folderId, permission.id, { supportsAllDrives: true });
      return;
    }
    if ((permission.type === 'user' || permission.type === 'group') && email && !desired[email]) {
      Drive.Permissions.remove(folderId, permission.id, { supportsAllDrives: true });
    }
  });

  var refreshed = Drive.Permissions.list(folderId, { supportsAllDrives: true }).items || [];
  var existing = {};
  refreshed.forEach(function (permission) {
    var email = normalizeEmail_(permission.emailAddress || permission.value);
    if (email) existing[email] = permission;
  });
  Object.keys(desired).forEach(function (email) {
    var current = existing[email];
    if (current && current.role === desired[email]) return;
    if (current) Drive.Permissions.remove(folderId, current.id, { supportsAllDrives: true });
    Drive.Permissions.insert(
      { type: 'user', role: desired[email], value: email },
      folderId,
      { sendNotificationEmails: false, supportsAllDrives: true }
    );
  });
  disableWriterSharing_(folderId);
  return { folderId: folderId, grantedEmails: Object.keys(desired), publicAccess: false };
}

function revokeCampaignAccess_(payload) {
  requireFields_(payload, ['campaignFolderId', 'emails']);
  var emails = {};
  payload.emails.forEach(function (email) { emails[normalizeEmail_(email)] = true; });
  var permissions = Drive.Permissions.list(payload.campaignFolderId, { supportsAllDrives: true }).items || [];
  permissions.forEach(function (permission) {
    var email = normalizeEmail_(permission.emailAddress || permission.value);
    if (permission.role !== 'owner' && emails[email]) {
      Drive.Permissions.remove(payload.campaignFolderId, permission.id, { supportsAllDrives: true });
    }
  });
  return { folderId: payload.campaignFolderId, revokedEmails: Object.keys(emails) };
}

function removePublicPermissions_(folderId) {
  var permissions = Drive.Permissions.list(folderId, { supportsAllDrives: true }).items || [];
  permissions.forEach(function (permission) {
    if (permission.type === 'anyone' || permission.type === 'domain') {
      Drive.Permissions.remove(folderId, permission.id, { supportsAllDrives: true });
    }
  });
}

function disableWriterSharing_(folderId) {
  try {
    Drive.Files.update({ writersCanShare: false, copyRequiresWriterPermission: true }, folderId, null, { supportsAllDrives: true });
  } catch (error) {
    // Một số loại Shared Drive quản lý quyền chia sẻ ở cấp Drive; ACL vẫn được đồng bộ phía trên.
  }
}

function getRootFolder_() {
  var id = PropertiesService.getScriptProperties().getProperty('AUDIT_BGS_ROOT_FOLDER_ID');
  if (!id) fail_('SCRIPT_NOT_CONFIGURED', 'Apps Script chưa có ID thư mục gốc.');
  return DriveApp.getFolderById(id);
}

function getOrCreateChild_(parent, name) {
  var matches = parent.getFoldersByName(name);
  return matches.hasNext() ? matches.next() : parent.createFolder(name);
}

function folderInfo_(folder) {
  return { folderId: folder.getId(), folderUrl: folder.getUrl(), folderName: folder.getName() };
}

function safeName_(value) {
  var normalized = String(value || '').normalize ? String(value || '').normalize('NFC') : String(value || '');
  var result = normalized.replace(/[\\/:*?"<>|#%{}~]/g, '_').replace(/\s+/g, ' ').trim().substring(0, 180);
  if (!result) fail_('INVALID_FOLDER_NAME', 'Tên thư mục không hợp lệ.');
  return result;
}

function canonicalJson_(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson_).join(',') + ']';
  if (value && Object.prototype.toString.call(value) === '[object Object]') {
    return '{' + Object.keys(value).sort().filter(function (key) { return value[key] !== undefined; }).map(function (key) {
      return JSON.stringify(key) + ':' + canonicalJson_(value[key]);
    }).join(',') + '}';
  }
  return JSON.stringify(value);
}

function bytesToHex_(bytes) {
  return bytes.map(function (byte) { var value = byte < 0 ? byte + 256 : byte; return ('0' + value.toString(16)).slice(-2); }).join('');
}

function constantTimeEqual_(left, right) {
  if (left.length !== right.length) return false;
  var mismatch = 0;
  for (var index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

function requireFields_(payload, fields) {
  fields.forEach(function (field) { if (payload[field] === undefined || payload[field] === null || payload[field] === '') fail_('INVALID_PAYLOAD', 'Thiếu trường ' + field + '.'); });
}

function normalizeEmail_(email) { return String(email || '').trim().toLowerCase(); }
function safeMessage_(error) { return error && error.message ? String(error.message).substring(0, 300) : 'Không thể xử lý yêu cầu Drive.'; }
function fail_(code, message) { var error = new Error(message); error.code = code; throw error; }
function json_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }

