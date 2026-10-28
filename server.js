const crypto = require("node:crypto");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { promisify } = require("node:util");
const express = require("express");
const multer = require("multer");
const ffmpeg = require("ffmpeg-static");
const ffprobe = require("ffprobe-static");

const app = express();
const port = Number(process.env.PORT) || 3002;
const publicDirectory = path.join(__dirname, "public");
const uploadDirectory = path.join(__dirname, "uploads");
const metadataFile = path.join(uploadDirectory, "videos.json");
const relationshipsFile = path.join(__dirname, "relationships.json");
const accountsFile = path.join(__dirname, "accounts.json");
const feedbackFile = path.join(__dirname, "feedback.json");
const execFileAsync = promisify(execFile);
const scryptAsync = promisify(crypto.scrypt);
const MAX_VIDEO_SECONDS = 120;
const MAX_VIDEO_DIMENSION = 1920;
const MAX_UPLOAD_SIZE_BYTES = readPositiveIntegerEnv("MAX_UPLOAD_SIZE_BYTES", 2 * 1024 ** 3);
const MAX_PROFILE_IMAGE_SIZE_BYTES = 5 * 1024 ** 2;
const UPLOAD_TIMEOUT_MS = readPositiveIntegerEnv("UPLOAD_TIMEOUT_MS", 2 * 60 * 60 * 1000);

fs.mkdirSync(uploadDirectory, { recursive: true });

const sessions = new Map();
const accounts = fs.existsSync(accountsFile) ? JSON.parse(fs.readFileSync(accountsFile, "utf8")) : [];
const videos = fs.existsSync(metadataFile) ? JSON.parse(fs.readFileSync(metadataFile, "utf8")) : [];
const relationships = fs.existsSync(relationshipsFile)
  ? JSON.parse(fs.readFileSync(relationshipsFile, "utf8"))
  : [];
const storage = multer.diskStorage({
  destination: uploadDirectory,
  filename: (_request, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, "");
    callback(null, `${crypto.randomUUID()}${extension}`);
  },
});
const receiveProfileImage = multer({
  storage: multer.diskStorage({
    destination: uploadDirectory,
    filename: (_request, file, callback) => {
      const extensions = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
      };
      callback(null, `${crypto.randomUUID()}${extensions[file.mimetype] || ""}`);
    },
  }),
  limits: { fileSize: MAX_PROFILE_IMAGE_SIZE_BYTES, files: 1, fields: 4, parts: 5 },
  fileFilter: (_request, file, callback) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      callback(new Error("Choose a JPEG, PNG, or WebP profile picture."));
      return;
    }
    callback(null, true);
  },
});
const receiveUpload = multer({
  storage,
  limits: {
    fileSize: MAX_UPLOAD_SIZE_BYTES,
    files: 2,
    fields: 10,
    parts: 12,
    fieldSize: 64 * 1024,
  },
  fileFilter: (_request, file, callback) => {
    const expectedType = file.fieldname === "video" ? "video/" : "audio/";
    if (!file.mimetype.startsWith(expectedType)) {
      callback(new Error(file.fieldname === "soundtrack"
        ? "Choose an audio file for the soundtrack."
        : "Choose a video file to continue."));
      return;
    }
    callback(null, true);
  },
});

app.use(express.json({ limit: "32kb" }));
app.use((request, response, next) => {
  const origin = request.get("Origin");
  if (origin) {
    let previewOrigin;
    try {
      previewOrigin = new URL(origin);
    } catch {
      next();
      return;
    }
    const isLocalPreview = ["http:", "https:"].includes(previewOrigin.protocol)
      && ["localhost", "127.0.0.1", "[::1]"].includes(previewOrigin.hostname)
      && previewOrigin.port === "3000";
    if (isLocalPreview) {
      response.vary("Origin");
      response.setHeader("Access-Control-Allow-Origin", origin);
      response.setHeader("Access-Control-Allow-Credentials", "true");
      response.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
      response.setHeader("Access-Control-Allow-Headers", "Content-Type");
      if (request.method === "OPTIONS") {
        response.sendStatus(204);
        return;
      }
    }
  }
  next();
});
app.use(express.static(publicDirectory));
app.use("/uploads", express.static(uploadDirectory, { fallthrough: false }));

function getSession(request) {
  const cookie = request.headers.cookie || "";
  const match = cookie.match(/(?:^|;\s*)sid=([^;]+)/);
  return match ? sessions.get(decodeURIComponent(match[1])) : undefined;
}

function accountSettings(account) {
  return {
    isPrivate: Boolean(account.isPrivate),
    notifications: {
      likes: account.notifications?.likes ?? true,
      comments: account.notifications?.comments ?? true,
      follows: account.notifications?.follows ?? true,
    },
    blockedUsers: Array.isArray(account.blockedUsers) ? account.blockedUsers : [],
  };
}

function canViewAccount(account, viewer) {
  if (!account) return true;
  if (viewer && sameUser(account.username, viewer.username)) return true;
  if (viewer && account.blockedUsers?.some((blocked) => sameUser(blocked, viewer.username))) return false;
  const viewerAccount = viewer ? findAccountByUsername(viewer.username) : undefined;
  if (viewerAccount?.blockedUsers?.some((blocked) => sameUser(blocked, account.username))) return false;
  if (!account.isPrivate) return true;
  return Boolean(viewer && relationships.some((relationship) =>
    sameUser(relationship.follower, viewer.username)
    && sameUser(relationship.following, account.username)));
}

function getUploadPathFromUrl(mediaUrl) {
  if (typeof mediaUrl !== "string" || !mediaUrl.startsWith("/uploads/")) {
    throw new Error("The video has an invalid media URL.");
  }
  let filename;
  try {
    filename = decodeURIComponent(mediaUrl.slice("/uploads/".length));
  } catch {
    throw new Error("The video has an invalid media URL.");
  }
  if (!filename || path.basename(filename) !== filename || filename.includes("/") || filename.includes("\\")) {
    throw new Error("The video has an invalid media URL.");
  }
  const mediaPath = path.resolve(uploadDirectory, filename);
  if (path.dirname(mediaPath) !== path.resolve(uploadDirectory)) {
    throw new Error("The video has an invalid media URL.");
  }
  return mediaPath;
}

function requireSession(request, response, next) {
  const user = getSession(request);
  if (!user) {
    response.status(401).json({ error: "Please sign in to continue." });
    return;
  }
  request.user = user;
  next();
}

function removeUploadFiles(files, reason) {
  files.filter(Boolean).forEach((file) => {
    try {
      fs.unlinkSync(file.path);
    } catch (cleanupError) {
      console.error(`Could not remove ${reason}:`, cleanupError);
    }
  });
}

function validUsername(value) {
  return typeof value === "string" && /^[a-zA-Z0-9._-]{1,32}$/.test(value);
}

function findAccountByUsername(username) {
  if (!validUsername(username)) return undefined;
  return accounts.find((account) => sameUser(account.username, username));
}

function profileDetailsForAccount(account) {
  return {
    username: account.username,
    name: account.name || account.username,
    profession: account.profession || "",
    bio: account.bio || "",
    interests: Array.isArray(account.interests) ? account.interests : [],
    avatarUrl: account.avatarUrl || null,
  };
}

function isSupportedProfileImage(filePath, mimeType) {
  const fileDescriptor = fs.openSync(filePath, "r");
  try {
    const header = Buffer.alloc(12);
    const bytesRead = fs.readSync(fileDescriptor, header, 0, header.length, 0);
    if (mimeType === "image/jpeg") {
      return bytesRead >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
    }
    if (mimeType === "image/png") {
      return bytesRead >= 8 && header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    }
    return mimeType === "image/webp"
      && bytesRead >= 12
      && header.toString("ascii", 0, 4) === "RIFF"
      && header.toString("ascii", 8, 12) === "WEBP";
  } finally {
    fs.closeSync(fileDescriptor);
  }
}

function saveAccounts(nextAccounts) {
  const temporaryFile = `${accountsFile}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(nextAccounts, null, 2), { mode: 0o600 });
  fs.renameSync(temporaryFile, accountsFile);
  accounts.splice(0, accounts.length, ...nextAccounts);
}

function startSession(request, response, user, statusCode = 200) {
  const previousSession = (request.headers.cookie || "").match(/(?:^|;\s*)sid=([^;]+)/);
  if (previousSession) sessions.delete(decodeURIComponent(previousSession[1]));
  const sessionId = crypto.randomBytes(32).toString("hex");
  sessions.set(sessionId, user);
  response.setHeader("Set-Cookie", `sid=${sessionId}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`);
  response.status(statusCode).json({ user });
}

function sameUser(first, second) {
  return first.toLowerCase() === second.toLowerCase();
}

function findRelationshipUsers(username, type) {
  const field = type === "followers" ? "follower" : "following";
  const counterpart = type === "followers" ? "following" : "follower";
  return relationships
    .filter((relationship) => sameUser(relationship[field], username))
    .map((relationship) => relationship[counterpart]);
}

function saveRelationships() {
  fs.writeFileSync(relationshipsFile, JSON.stringify(relationships, null, 2));
}

async function getVideoMetadata(filePath) {
  const { stdout } = await execFileAsync(ffprobe.path, [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height,duration:format=duration",
    "-of", "json",
    filePath,
  ], { windowsHide: true, maxBuffer: 1024 * 1024, timeout: UPLOAD_TIMEOUT_MS });
  const metadata = JSON.parse(stdout);
  const stream = metadata.streams && metadata.streams[0];
  return {
    width: Number(stream && stream.width),
    height: Number(stream && stream.height),
    duration: Number(metadata.format && metadata.format.duration || stream && stream.duration),
  };
}

async function trimVideo(inputPath, outputPath, start, duration) {
  await execFileAsync(ffmpeg, [
    "-hide_banner",
    "-loglevel", "error",
    "-y",
    "-ss", String(start),
    "-i", inputPath,
    "-t", String(duration),
    "-map", "0:v:0",
    "-map", "0:a?",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "23",
    "-c:a", "aac",
    "-b:a", "128k",
    "-movflags", "+faststart",
    outputPath,
  ], { windowsHide: true, maxBuffer: 1024 * 1024, timeout: UPLOAD_TIMEOUT_MS });
}

app.post("/api/signup", async (request, response, next) => {
  const body = request.body && typeof request.body === "object" ? request.body : {};
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!validUsername(username) || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || password.length < 8 || password.length > 128) {
    response.status(400).json({ error: "Enter a valid username and email, and a password from 8 to 128 characters." });
    return;
  }

  try {
    const salt = crypto.randomBytes(16);
    const passwordHash = await scryptAsync(password, salt, 64);
    if (accounts.some((account) =>
      sameUser(account.username, username) || sameUser(account.email, email))) {
      response.status(409).json({ error: "That username or email is already registered." });
      return;
    }
    const account = {
      username,
      name: username,
      email,
      passwordSalt: salt.toString("hex"),
      passwordHash: passwordHash.toString("base64"),
    };
    const nextAccounts = [...accounts, account];
    saveAccounts(nextAccounts);
    const user = {
      username: account.username,
      name: account.name,
      email: account.email,
    };
    startSession(request, response, user, 201);
  } catch (error) {
    next(error);
  }
});

app.post("/api/login", async (request, response, next) => {
  const body = request.body && typeof request.body === "object" ? request.body : {};
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || password.length < 8 || password.length > 128) {
    response.status(400).json({ error: "Enter a valid email address and password." });
    return;
  }
  try {
    const account = accounts.find((item) => sameUser(item.email, email));
    if (!account) {
      response.status(401).json({ error: "Email address or password is incorrect." });
      return;
    }
    const submittedHash = await scryptAsync(password, Buffer.from(account.passwordSalt, "hex"), 64);
    const savedHash = Buffer.from(account.passwordHash, "base64");
    if (savedHash.length !== submittedHash.length
      || !crypto.timingSafeEqual(savedHash, submittedHash)) {
      response.status(401).json({ error: "Email address or password is incorrect." });
      return;
    }
    startSession(request, response, {
      username: account.username,
      name: account.name,
      email: account.email,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/me", (request, response) => {
  const user = getSession(request);
  const accountExists = user && accounts.some((account) =>
    sameUser(account.username, user.username) && sameUser(account.email, user.email));
  if (!accountExists) {
    response.status(401).json({ error: "Not signed in." });
    return;
  }
  const account = accounts.find((item) =>
    sameUser(item.username, user.username) && sameUser(item.email, user.email));
  response.json({
    user: { ...user, avatarUrl: account.avatarUrl || null },
    profile: profileDetailsForAccount(account),
  });
});

app.post("/api/me/profile", requireSession, (request, response, next) => {
  receiveProfileImage.single("avatar")(request, response, (uploadError) => {
    if (uploadError) {
      const status = uploadError instanceof multer.MulterError && uploadError.code === "LIMIT_FILE_SIZE"
        ? 413
        : 400;
      response.status(status).json({
        error: status === 413
          ? `Profile pictures must be ${formatFileSize(MAX_PROFILE_IMAGE_SIZE_BYTES)} or smaller.`
          : uploadError.message,
      });
      return;
    }

    if (request.file) {
      try {
        if (!isSupportedProfileImage(request.file.path, request.file.mimetype)) {
          removeUploadFiles([request.file], "an invalid profile image");
          response.status(400).json({ error: "The uploaded file is not a valid JPEG, PNG, or WebP image." });
          return;
        }
      } catch (imageReadError) {
        removeUploadFiles([request.file], "an unreadable profile image");
        next(imageReadError);
        return;
      }
    }

    const accountIndex = accounts.findIndex((item) =>
      sameUser(item.username, request.user.username) && sameUser(item.email, request.user.email));
    if (accountIndex < 0) {
      removeUploadFiles([request.file], "an unowned profile image");
      response.status(401).json({ error: "Please sign in to continue." });
      return;
    }

    const body = request.body && typeof request.body === "object" ? request.body : {};
    const name = typeof body.name === "string" && body.name.trim()
      ? body.name.trim().slice(0, 80)
      : accounts[accountIndex].name;
    const profession = typeof body.profession === "string" ? body.profession.trim().slice(0, 80) : "";
    const bio = typeof body.bio === "string" ? body.bio.trim().slice(0, 300) : "";
    const interests = typeof body.interests === "string"
      ? body.interests.split(",").map((interest) => interest.trim()).filter(Boolean).slice(0, 12)
      : [];
    const account = {
      ...accounts[accountIndex],
      name,
      profession,
      bio,
      interests,
      ...(request.file && { avatarUrl: `/uploads/${encodeURIComponent(request.file.filename)}` }),
    };
    const nextAccounts = [...accounts];
    nextAccounts[accountIndex] = account;
    try {
      saveAccounts(nextAccounts);
    } catch (writeError) {
      removeUploadFiles([request.file], "an unrecorded profile image");
      next(writeError);
      return;
    }
    request.user.name = name;
    response.json({ profile: profileDetailsForAccount(account) });
  });
});

app.get("/api/me/settings", requireSession, (request, response) => {
  const account = findAccountByUsername(request.user.username);
  if (!account) {
    response.status(401).json({ error: "Please sign in to continue." });
    return;
  }
  response.json({ settings: accountSettings(account) });
});

app.post("/api/me/settings", requireSession, (request, response, next) => {
  const accountIndex = accounts.findIndex((account) =>
    sameUser(account.username, request.user.username) && sameUser(account.email, request.user.email));
  if (accountIndex < 0) {
    response.status(401).json({ error: "Please sign in to continue." });
    return;
  }
  const body = request.body && typeof request.body === "object" ? request.body : {};
  const account = { ...accounts[accountIndex] };
  if (typeof body.isPrivate === "boolean") account.isPrivate = body.isPrivate;
  if (body.notifications && typeof body.notifications === "object"
    && ["likes", "comments", "follows"].every((key) => typeof body.notifications[key] === "boolean")) {
    account.notifications = {
      likes: body.notifications.likes,
      comments: body.notifications.comments,
      follows: body.notifications.follows,
    };
  } else if (body.notifications !== undefined) {
    response.status(400).json({ error: "Choose valid notification preferences." });
    return;
  }
  const nextAccounts = [...accounts];
  nextAccounts[accountIndex] = account;
  try {
    saveAccounts(nextAccounts);
  } catch (writeError) {
    next(writeError);
    return;
  }
  response.json({ settings: accountSettings(account) });
});

app.post("/api/me/password", requireSession, async (request, response, next) => {
  const account = accounts.find((item) =>
    sameUser(item.username, request.user.username) && sameUser(item.email, request.user.email));
  if (!account) {
    response.status(401).json({ error: "Please sign in to continue." });
    return;
  }
  const body = request.body && typeof request.body === "object" ? request.body : {};
  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  if (currentPassword.length < 8 || currentPassword.length > 128
    || newPassword.length < 8 || newPassword.length > 128) {
    response.status(400).json({ error: "Passwords must be between 8 and 128 characters." });
    return;
  }
  try {
    const submittedHash = await scryptAsync(currentPassword, Buffer.from(account.passwordSalt, "hex"), 64);
    const savedHash = Buffer.from(account.passwordHash, "base64");
    if (savedHash.length !== submittedHash.length || !crypto.timingSafeEqual(savedHash, submittedHash)) {
      response.status(400).json({ error: "Your current password is incorrect." });
      return;
    }
    const salt = crypto.randomBytes(16);
    const passwordHash = await scryptAsync(newPassword, salt, 64);
    const accountIndex = accounts.indexOf(account);
    const updatedAccount = {
      ...account,
      passwordSalt: salt.toString("hex"),
      passwordHash: passwordHash.toString("base64"),
    };
    const nextAccounts = [...accounts];
    nextAccounts[accountIndex] = updatedAccount;
    saveAccounts(nextAccounts);
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/me/blocked", requireSession, (request, response, next) => {
  const body = request.body && typeof request.body === "object" ? request.body : {};
  const username = typeof body.username === "string" ? body.username.trim() : "";
  if (!validUsername(username) || sameUser(username, request.user.username)) {
    response.status(400).json({ error: "Enter a valid username other than your own." });
    return;
  }
  const accountIndex = accounts.findIndex((account) =>
    sameUser(account.username, request.user.username) && sameUser(account.email, request.user.email));
  const targetExists = accounts.some((account) => sameUser(account.username, username));
  if (accountIndex < 0) {
    response.status(401).json({ error: "Please sign in to continue." });
    return;
  }
  if (!targetExists) {
    response.status(404).json({ error: "That account could not be found." });
    return;
  }
  const account = { ...accounts[accountIndex] };
  const blockedUsers = Array.isArray(account.blockedUsers) ? account.blockedUsers : [];
  account.blockedUsers = blockedUsers.some((blocked) => sameUser(blocked, username))
    ? blockedUsers
    : [...blockedUsers, username];
  const nextAccounts = [...accounts];
  nextAccounts[accountIndex] = account;
  try {
    saveAccounts(nextAccounts);
  } catch (writeError) {
    next(writeError);
    return;
  }
  response.json({ blockedUsers: account.blockedUsers });
});

app.delete("/api/me/blocked/:username", requireSession, (request, response, next) => {
  const accountIndex = accounts.findIndex((account) =>
    sameUser(account.username, request.user.username) && sameUser(account.email, request.user.email));
  if (accountIndex < 0) {
    response.status(401).json({ error: "Please sign in to continue." });
    return;
  }
  const account = { ...accounts[accountIndex] };
  const blockedUsers = Array.isArray(account.blockedUsers) ? account.blockedUsers : [];
  account.blockedUsers = blockedUsers.filter((username) => !sameUser(username, request.params.username));
  const nextAccounts = [...accounts];
  nextAccounts[accountIndex] = account;
  try {
    saveAccounts(nextAccounts);
  } catch (writeError) {
    next(writeError);
    return;
  }
  response.json({ blockedUsers: account.blockedUsers });
});

app.post("/api/me/feedback", requireSession, (request, response, next) => {
  const body = request.body && typeof request.body === "object" ? request.body : {};
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message || message.length > 2000) {
    response.status(400).json({ error: "Feedback must contain 1 to 2000 characters." });
    return;
  }
  const feedback = fs.existsSync(feedbackFile)
    ? JSON.parse(fs.readFileSync(feedbackFile, "utf8"))
    : [];
  feedback.push({
    username: request.user.username,
    message,
    createdAt: new Date().toISOString(),
  });
  try {
    const temporaryFile = `${feedbackFile}.tmp`;
    fs.writeFileSync(temporaryFile, JSON.stringify(feedback, null, 2), { mode: 0o600 });
    fs.renameSync(temporaryFile, feedbackFile);
  } catch (writeError) {
    next(writeError);
    return;
  }
  response.status(201).json({ ok: true });
});

app.post("/api/logout", (request, response) => {
  const cookie = request.headers.cookie || "";
  const match = cookie.match(/(?:^|;\s*)sid=([^;]+)/);
  if (match) sessions.delete(decodeURIComponent(match[1]));
  response.setHeader("Set-Cookie", "sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
  response.json({ ok: true });
});

app.get("/api/videos", (_request, response) => {
  const viewer = getSession(_request);
  const viewerAccount = viewer ? findAccountByUsername(viewer.username) : undefined;
  response.json({
    videos: videos
      .filter((video) => {
        if (video.visibility === "Private") return false;
        const owner = findAccountByUsername(video.ownerUsername || video.author);
        if (viewerAccount?.blockedUsers?.some((blocked) => sameUser(blocked, video.author))) return false;
        if (owner?.blockedUsers?.some((blocked) => viewer && sameUser(blocked, viewer.username))) return false;
        return canViewAccount(owner, viewer);
      })
      .map((video) => {
        const publicVideo = { ...video };
        delete publicVideo.ownerUsername;
        return {
          ...publicVideo,
          authorAvatarUrl: findAccountByUsername(video.author)?.avatarUrl || null,
          commentCount: Array.isArray(video.comments) ? video.comments.length : 0,
        };
      }),
  });
});

app.get("/api/videos/:videoId/comments", (request, response) => {
  const video = videos.find((item) =>
    item.id === request.params.videoId && item.visibility !== "Private");
  if (!video || !canViewAccount(findAccountByUsername(video.ownerUsername || video.author), getSession(request))) {
    response.status(404).json({ error: "Video not found." });
    return;
  }
  const comments = Array.isArray(video.comments) ? video.comments : [];
  response.json({ comments, count: comments.length });
});

app.post("/api/videos/:videoId/comments", (request, response, next) => {
  const video = videos.find((item) =>
    item.id === request.params.videoId && item.visibility !== "Private");
  if (!video || !canViewAccount(findAccountByUsername(video.ownerUsername || video.author), getSession(request))) {
    response.status(404).json({ error: "Video not found." });
    return;
  }
  const body = request.body && typeof request.body === "object" ? request.body : {};
  const requestedAuthor = typeof body.author === "string" ? body.author.trim() : "";
  const author = /^[a-zA-Z0-9._-]{1,32}$/.test(requestedAuthor) ? requestedAuthor : "Guest";
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text || text.length > 1000) {
    response.status(400).json({ error: "Comments must contain 1 to 1000 characters." });
    return;
  }
  const comment = {
    id: crypto.randomUUID(),
    author,
    text,
    createdAt: new Date().toISOString(),
  };
  const previousComments = video.comments;
  video.comments = [...(Array.isArray(previousComments) ? previousComments : []), comment];
  try {
    fs.writeFileSync(metadataFile, JSON.stringify(videos, null, 2));
  } catch (writeError) {
    if (previousComments === undefined) delete video.comments;
    else video.comments = previousComments;
    next(writeError);
    return;
  }
  response.status(201).json({ comment, count: video.comments.length });
});

app.delete("/api/videos/:videoId", requireSession, (request, response, next) => {
  const videoIndex = videos.findIndex((item) => item.id === request.params.videoId);
  if (videoIndex < 0) {
    response.status(404).json({ error: "Video not found." });
    return;
  }
  const video = videos[videoIndex];
  if (!video.ownerUsername || !sameUser(video.ownerUsername, request.user.username)) {
    response.status(403).json({ error: "You can only delete videos uploaded to your account." });
    return;
  }

  let mediaPaths;
  try {
    mediaPaths = [video.url, video.audioUrl]
      .filter(Boolean)
      .map(getUploadPathFromUrl);
  } catch (pathError) {
    next(pathError);
    return;
  }

  const nextVideos = videos.slice();
  nextVideos.splice(videoIndex, 1);
  const temporaryMetadataFile = `${metadataFile}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporaryMetadataFile, JSON.stringify(nextVideos, null, 2));
    fs.renameSync(temporaryMetadataFile, metadataFile);
  } catch (writeError) {
    try {
      if (fs.existsSync(temporaryMetadataFile)) fs.unlinkSync(temporaryMetadataFile);
    } catch (cleanupError) {
      console.error("Could not remove temporary video metadata:", cleanupError);
    }
    next(writeError);
    return;
  }
  videos.splice(videoIndex, 1);

  try {
    mediaPaths.forEach((mediaPath) => {
      try {
        fs.unlinkSync(mediaPath);
      } catch (unlinkError) {
        if (unlinkError.code !== "ENOENT") throw unlinkError;
      }
    });
  } catch (cleanupError) {
    console.error("Video was removed from metadata, but its media cleanup failed:", cleanupError);
    response.status(500).json({ error: "The video was removed from your profile, but its media file could not be fully deleted." });
    return;
  }
  response.json({ ok: true });
});

app.get("/api/videos/:videoId/download", (request, response, next) => {
  const video = videos.find((item) =>
    item.id === request.params.videoId && item.visibility !== "Private");
  if (!video || typeof video.url !== "string"
    || !canViewAccount(findAccountByUsername(video.ownerUsername || video.author), getSession(request))) {
    response.status(404).json({ error: "Video not found." });
    return;
  }
  let filename;
  try {
    filename = path.basename(decodeURIComponent(new URL(video.url, "http://localhost").pathname));
  } catch (error) {
    response.status(404).json({ error: "Video not found." });
    return;
  }
  if (!filename || filename === "." || filename === "..") {
    response.status(404).json({ error: "Video not found." });
    return;
  }
  const videoPath = path.join(uploadDirectory, filename);
  if (!fs.existsSync(videoPath)) {
    response.status(404).json({ error: "Video file not found." });
    return;
  }
  const safeTitle = (video.title || "loop-video")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .trim() || "loop-video";
  response.download(videoPath, `${safeTitle}${path.extname(filename) || ".mp4"}`, (error) => {
    if (error && !response.headersSent) {
      if (error.code === "ENOENT") response.status(404).json({ error: "Video file not found." });
      else next(error);
    }
  });
});

app.get("/api/profiles/:username", (request, response) => {
  const requestedUsername = request.params.username;
  const viewer = getSession(request);
  const creatorVideos = videos
    .filter((video) =>
      video.visibility !== "Private"
      && typeof video.author === "string"
      && video.author.toLowerCase() === requestedUsername.toLowerCase())
    .map((video) => {
      const publicVideo = { ...video };
      delete publicVideo.ownerUsername;
      return {
        ...publicVideo,
        authorAvatarUrl: findAccountByUsername(video.author)?.avatarUrl || null,
        canDelete: Boolean(viewer
          && video.ownerUsername
          && sameUser(video.ownerUsername, viewer.username)),
        commentCount: Array.isArray(video.comments) ? video.comments.length : 0,
      };
    });
  const username = creatorVideos[0]?.author || requestedUsername;
  const account = findAccountByUsername(username);
  const viewerAccount = viewer ? findAccountByUsername(viewer.username) : undefined;
  const blockedByViewer = viewerAccount?.blockedUsers?.some((blocked) => sameUser(blocked, username));
  const blockedByProfileOwner = account?.blockedUsers?.some((blocked) =>
    viewer && sameUser(blocked, viewer.username));
  if (blockedByViewer || blockedByProfileOwner) {
    response.status(404).json({ error: "Profile not found." });
    return;
  }
  const canViewProfile = canViewAccount(account, viewer);
  const visibleVideos = canViewProfile ? creatorVideos : [];
  const followers = findRelationshipUsers(username, "followers");
  const following = findRelationshipUsers(username, "following");
  const viewerUsername = validUsername(request.query.viewer) ? request.query.viewer : "";
  response.json({
    profile: {
      username,
      bio: canViewProfile ? account?.bio || "Sharing videos on Loop." : "",
      profession: canViewProfile ? account?.profession || "" : "",
      interests: canViewProfile && Array.isArray(account?.interests) ? account.interests : [],
      avatarUrl: canViewProfile ? account?.avatarUrl || null : null,
      posts: visibleVideos.length,
      followers: followers.length,
      following: following.length,
      isFollowing: Boolean(viewerUsername && followers.some((name) => sameUser(name, viewerUsername))),
      isPrivate: Boolean(account?.isPrivate),
      requiresFollow: !canViewProfile,
    },
    videos: visibleVideos,
  });
});

app.get("/api/profiles/:username/relationships", (request, response) => {
  const { username } = request.params;
  const type = request.query.type;
  const viewer = request.query.viewer;
  if (!validUsername(username) || !validUsername(viewer)
    || !["followers", "following"].includes(type)) {
    response.status(400).json({ error: "Choose a valid user and relationship list." });
    return;
  }
  const users = findRelationshipUsers(username, type);
  response.json({
    users: users.map((name) => {
      const isFollowing = relationships.some((relationship) =>
        sameUser(relationship.follower, viewer) && sameUser(relationship.following, name));
      const followsYou = relationships.some((relationship) =>
        sameUser(relationship.follower, name) && sameUser(relationship.following, viewer));
      return { username: name, isFollowing, followsYou };
    }),
  });
});

app.post("/api/profiles/:username/follow", (request, response, next) => {
  const target = request.params.username;
  const body = request.body && typeof request.body === "object" ? request.body : {};
  const follower = body.follower;
  if (!validUsername(target) || !validUsername(follower) || typeof body.follow !== "boolean") {
    response.status(400).json({ error: "Choose valid users and a follow action." });
    return;
  }
  if (sameUser(target, follower)) {
    response.status(400).json({ error: "You cannot follow your own profile." });
    return;
  }
  const existingIndex = relationships.findIndex((relationship) =>
    sameUser(relationship.follower, follower) && sameUser(relationship.following, target));
  const previous = existingIndex >= 0 ? relationships[existingIndex] : null;
  if (body.follow && existingIndex < 0) relationships.push({ follower, following: target });
  if (!body.follow && existingIndex >= 0) relationships.splice(existingIndex, 1);
  try {
    saveRelationships();
  } catch (writeError) {
    if (body.follow && existingIndex < 0) relationships.pop();
    else if (!body.follow && previous) relationships.splice(existingIndex, 0, previous);
    next(writeError);
    return;
  }
  response.json({
    following: body.follow,
    followers: findRelationshipUsers(target, "followers").length,
  });
});

app.post("/api/videos", (request, response, next) => {
  receiveUpload.fields([{ name: "video", maxCount: 1 }, { name: "soundtrack", maxCount: 1 }])(request, response, async (error) => {
    if (error) {
      const status = error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
      response.status(status).json({
        error: status === 413
          ? `Video and soundtrack files must be ${formatFileSize(MAX_UPLOAD_SIZE_BYTES)} or smaller.`
          : error.message,
      });
      return;
    }
    const uploadedFiles = request.files || {};
    const videoFile = uploadedFiles.video && uploadedFiles.video[0];
    const soundtrackFile = uploadedFiles.soundtrack && uploadedFiles.soundtrack[0];
    if (!videoFile) {
      response.status(400).json({ error: "Choose a video file to upload." });
      return;
    }

    let videoMetadata;
    try {
      videoMetadata = await getVideoMetadata(videoFile.path);
    } catch (metadataError) {
      removeUploadFiles([videoFile, soundtrackFile], "an unreadable upload");
      if (metadataError.code === "ENOENT") {
        next(metadataError);
        return;
      }
      if (metadataError.code === "ETIMEDOUT") {
        response.status(504).json({ error: "Reading the uploaded video timed out. Try again." });
        return;
      }
      response.status(400).json({ error: "Could not read the uploaded video. Choose a supported video file." });
      return;
    }

    if (!videoMetadata.width || !videoMetadata.height || !Number.isFinite(videoMetadata.duration)) {
      removeUploadFiles([videoFile, soundtrackFile], "an upload with invalid video metadata");
      response.status(400).json({ error: "Could not read the video's duration or resolution." });
      return;
    }
    if (Math.max(videoMetadata.width, videoMetadata.height) > MAX_VIDEO_DIMENSION
      || Math.min(videoMetadata.width, videoMetadata.height) > 1080) {
      removeUploadFiles([videoFile, soundtrackFile], "a video above 1080p");
      response.status(400).json({ error: "Choose a video at 1080p or lower. 4K video is not supported." });
      return;
    }

    const body = request.body && typeof request.body === "object" ? request.body : {};
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 500) : "";
    const description = typeof body.description === "string"
      ? body.description.trim().slice(0, 500)
      : typeof body.caption === "string" ? body.caption.trim().slice(0, 500) : "";
    const visibility = body.visibility === undefined || body.visibility === ""
      ? "Public"
      : body.visibility === "Private" || body.visibility === "Public" ? body.visibility : null;
    if (!title || !visibility) {
      removeUploadFiles([videoFile, soundtrackFile], "an invalid upload");
      if (!title) {
        response.status(400).json({ error: "Add a caption for your video." });
        return;
      }
      response.status(400).json({ error: "Choose Public or Private visibility." });
      return;
    }
    const trimStart = body.trimStart === undefined ? 0 : Number(body.trimStart);
    const requestedTrimEnd = body.trimEnd === undefined ? videoMetadata.duration : Number(body.trimEnd);
    const trimEnd = Math.min(requestedTrimEnd, videoMetadata.duration);
    const selectedDuration = trimEnd - trimStart;
    if (!Number.isFinite(trimStart) || !Number.isFinite(requestedTrimEnd)
      || trimStart < 0 || requestedTrimEnd > videoMetadata.duration + 0.1
      || selectedDuration <= 0 || selectedDuration > MAX_VIDEO_SECONDS) {
      removeUploadFiles([videoFile, soundtrackFile], "an upload with invalid trim settings");
      response.status(400).json({ error: "Choose a video section no longer than 2 minutes." });
      return;
    }
    if (soundtrackFile && !soundtrackFile.mimetype.startsWith("audio/")) {
      removeUploadFiles([videoFile, soundtrackFile], "an upload with an invalid soundtrack");
      response.status(400).json({ error: "Choose an audio file for the soundtrack." });
      return;
    }
    let finalVideoFile = videoFile;
    const needsTrim = trimStart > 0.001 || trimEnd < videoMetadata.duration - 0.001;
    if (needsTrim) {
      const trimmedPath = path.join(uploadDirectory, `${crypto.randomUUID()}-trimmed.mp4`);
      const encodedDuration = Math.min(selectedDuration, MAX_VIDEO_SECONDS - 0.05);
      try {
        await trimVideo(videoFile.path, trimmedPath, trimStart, encodedDuration);
        const trimmedMetadata = await getVideoMetadata(trimmedPath);
        if (!trimmedMetadata.width || !trimmedMetadata.height
          || !Number.isFinite(trimmedMetadata.duration)
          || trimmedMetadata.duration > MAX_VIDEO_SECONDS
          || Math.max(trimmedMetadata.width, trimmedMetadata.height) > MAX_VIDEO_DIMENSION
          || Math.min(trimmedMetadata.width, trimmedMetadata.height) > 1080) {
          throw new Error("The edited video did not meet the duration or resolution limits.");
        }
        finalVideoFile = { ...videoFile, filename: path.basename(trimmedPath), path: trimmedPath };
      } catch (trimError) {
        removeUploadFiles([videoFile, soundtrackFile, { path: trimmedPath }], "a failed video edit");
        if (trimError.code === "ENOENT") {
          next(trimError);
          return;
        }
        if (trimError.code === "ETIMEDOUT") {
          response.status(504).json({ error: "Video processing timed out. Try a shorter video or try again." });
          return;
        }
        response.status(400).json({ error: "The video could not be trimmed. Try another video or trim range." });
        return;
      }
    }
    const requestedAuthor = typeof body.author === "string" ? body.author.trim().slice(0, 32) : "";
    const owner = getSession(request);
    const author = owner
      ? owner.username
      : /^[a-zA-Z0-9._-]{1,32}$/.test(requestedAuthor) ? requestedAuthor : "Guest";
    const video = {
      id: crypto.randomUUID(),
      title,
      description,
      caption: description,
      visibility,
      url: `/uploads/${encodeURIComponent(finalVideoFile.filename)}`,
      ...(soundtrackFile && { audioUrl: `/uploads/${encodeURIComponent(soundtrackFile.filename)}` }),
      author,
      ...(owner && { ownerUsername: owner.username }),
      createdAt: new Date().toISOString(),
    };
    videos.unshift(video);
    try {
      fs.writeFileSync(metadataFile, JSON.stringify(videos, null, 2));
    } catch (writeError) {
      videos.shift();
      removeUploadFiles([videoFile, finalVideoFile, soundtrackFile], "an unlisted uploaded file");
      next(writeError);
      return;
    }
    if (finalVideoFile !== videoFile) {
      removeUploadFiles([videoFile], "the original before trimming");
    }
    response.status(201).json({ video });
  });
});

app.use((error, _request, response, _next) => {
  console.error(error);
  if (response.headersSent) return;
  const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 600
    ? error.status
    : 500;
  const message = status === 404
    ? "File not found."
    : status < 500 ? error.message : "Something went wrong on the server.";
  response.status(status).json({ error: message });
});

function readPositiveIntegerEnv(name, defaultValue) {
  const configuredValue = process.env[name];
  if (configuredValue === undefined || configuredValue === "") return defaultValue;
  const value = Number(configuredValue);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive safe integer.`);
  }
  return value;
}

function formatFileSize(bytes) {
  const gibibytes = bytes / 1024 ** 3;
  if (gibibytes >= 1) return `${Number(gibibytes.toFixed(2))} GiB`;
  const mebibytes = bytes / 1024 ** 2;
  if (mebibytes >= 1) return `${Number(mebibytes.toFixed(1))} MiB`;
  const kibibytes = bytes / 1024;
  if (kibibytes >= 1) return `${Number(kibibytes.toFixed(1))} KiB`;
  return `${bytes} bytes`;
}

const server = app.listen(port, () => {
  console.log(`Short video studio is running at http://localhost:${port}`);
});
server.requestTimeout = UPLOAD_TIMEOUT_MS;
server.timeout = UPLOAD_TIMEOUT_MS;
server.headersTimeout = Math.min(60_000, UPLOAD_TIMEOUT_MS);
