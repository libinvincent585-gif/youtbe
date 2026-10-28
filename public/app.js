const feedList = document.querySelector("#feed-list");
const profileFeedBackButton = document.createElement("button");
const fileInput = document.querySelector("#video-file-input");
const detailsPage = document.querySelector("#details-page");
const feedPage = document.querySelector("#feed-page");
const profilePage = document.querySelector("#profile-page");
const loginPage = document.querySelector("#login-page");
const bottomNav = document.querySelector(".bottom-nav");
const profileContent = document.querySelector("#profile-content");
const profileTopbarName = document.querySelector("#profile-topbar-name");
const profileSettingsButton = document.querySelector("#profile-settings-button");
const profileTopbarLogout = document.querySelector("#profile-topbar-logout");
const uploadForm = document.querySelector("#upload-form");
const uploadError = document.querySelector("#upload-error");
const uploadButton = document.querySelector("#upload-button");
const preview = document.querySelector("#video-preview");
const soundtrackInput = document.querySelector("#soundtrack-file-input");
const soundtrackPreview = document.querySelector("#soundtrack-preview");
const title = document.querySelector("#title");
const toast = document.querySelector("#toast");
const trimStart = document.querySelector("#trim-start");
const trimEnd = document.querySelector("#trim-end");
const trimStartValue = document.querySelector("#trim-start-value");
const trimEndValue = document.querySelector("#trim-end-value");
const trimDuration = document.querySelector("#trim-duration");
const videoMetadata = document.querySelector("#video-metadata");
const nextToCaption = document.querySelector("#next-to-caption");
const loginForm = document.querySelector("#login-form");
const signupUsernameField = document.querySelector("#signup-username-field");
const loginUsername = document.querySelector("#login-username");
const signupConfirmField = document.querySelector("#signup-confirm-field");
const loginEmail = document.querySelector("#login-email");
const loginPassword = document.querySelector("#login-password");
const loginConfirmPassword = document.querySelector("#login-confirm-password");
const loginError = document.querySelector("#login-error");
const loginSubmit = document.querySelector("#login-submit");
const loginBack = document.querySelector("#login-back");
const authTitle = document.querySelector("#auth-title");
const authDescription = document.querySelector("#auth-description");
const authLoginMode = document.querySelector("#auth-login-mode");
const authSignupMode = document.querySelector("#auth-signup-mode");
const maxVideoSeconds = 120;
const maxVideoDimension = 1920;
let selectedFile = null;
let soundtrackFile = null;
let videoDuration = 0;
let trimStartSeconds = 0;
let trimEndSeconds = 0;
const storedUsername = localStorage.getItem("loop-username") || "";
let currentUsername = /^[a-zA-Z0-9._-]{1,32}$/.test(storedUsername) ? storedUsername : "Guest";
let currentDisplayName = localStorage.getItem("loop-name") || currentUsername;
let following = [];
let likedVideoIds = readLikedVideoIds();
let toastTimeout;
let activeCommentsPanel = null;
let activeRelationshipDialog = null;
let profileFeedContext = null;
let returnToTabAfterLogin = null;
let authMode = "login";
const apiBaseUrl = location.pathname.startsWith("/public/")
  ? `${location.protocol}//${location.hostname}:3002`
  : "";

function getAssetUrl(url) {
  return url ? new URL(url, apiBaseUrl || window.location.href).href : "";
}

async function api(url, options = {}) {
  let response;
  try {
    response = await fetch(`${apiBaseUrl}${url}`, { credentials: "include", ...options });
  } catch (networkError) {
    throw new Error("Could not reach the server. Check your connection and try again.", { cause: networkError });
  }
  const responseText = await response.text();
  let data = {};
  if (responseText) {
    try {
      data = JSON.parse(responseText);
    } catch {
      if (response.ok) {
        throw new Error("The server returned an invalid response.");
      }
    }
  }
  if (!response.ok) {
    const error = new Error(data.error || `The request failed (HTTP ${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("visible"), 2600);
}

function renderFeed(videos, autoplayVideoId = null) {
  feedList.replaceChildren();
  videos.forEach((video) => {
    const card = document.createElement("article");
    card.className = "video-card";
    const stage = document.createElement("div");
    stage.className = "video-stage";
    const creator = video.author || "Guest";
    const creatorHeader = document.createElement("div");
    creatorHeader.className = "creator-header";
    const avatarWrap = document.createElement("span");
    avatarWrap.className = "creator-avatar-wrap";
    const avatarButton = document.createElement("button");
    avatarButton.className = "creator-avatar-button";
    avatarButton.type = "button";
    avatarButton.setAttribute("aria-label", `View @${creator}'s profile`);
    const avatar = document.createElement("span");
    avatar.className = "creator-avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = creator.slice(0, 1).toUpperCase();
    if (video.authorAvatarUrl) {
      const avatarImage = document.createElement("img");
      avatarImage.src = getAssetUrl(video.authorAvatarUrl);
      avatarImage.alt = "";
      avatarImage.addEventListener("error", () => avatarImage.remove(), { once: true });
      avatar.append(avatarImage);
    }
    avatarButton.append(avatar);
    avatarButton.addEventListener("click", () => openProfile(creator));
    const followButton = document.createElement("button");
    followButton.className = "creator-follow-button";
    followButton.type = "button";
    followButton.setAttribute("aria-label", `Follow @${creator}`);
    const updateFollowButton = () => {
      const isFollowed = isFollowing(creator);
      followButton.textContent = isFollowed ? "✓" : "+";
      followButton.setAttribute("aria-pressed", String(isFollowed));
      followButton.setAttribute("aria-label", `${isFollowed ? "Unfollow" : "Follow"} @${creator}`);
      followButton.classList.toggle("is-following", isFollowed);
    };
    updateFollowButton();
    followButton.addEventListener("click", async () => {
      followButton.disabled = true;
      try {
        await setFollowing(creator, !isFollowing(creator));
      } catch (error) {
        showToast(error.message);
      } finally {
        followButton.disabled = false;
      }
      updateFollowButton();
    });
    avatarWrap.append(avatarButton);
    if (creator.toLowerCase() !== currentUsername.toLowerCase()) {
      avatarWrap.append(followButton);
    }
    creatorHeader.append(avatarWrap);
    creatorHeader.classList.add("video-creator-overlay");
    const player = document.createElement("video");
    player.src = video.url;
    player.controls = true;
    player.playsInline = true;
    player.preload = "metadata";
    if (autoplayVideoId !== null && String(video.id) === String(autoplayVideoId)) {
      player.muted = true;
    }
    player.setAttribute("aria-label", video.title || video.caption || "Shared video");
    const playIndicator = document.createElement("span");
    playIndicator.className = "video-play-indicator";
    playIndicator.setAttribute("aria-hidden", "true");
    playIndicator.innerHTML = '<svg viewBox="0 0 24 24"><path d="m9 6 10 6-10 6z"/></svg>';
    const updatePlayIndicator = () => {
      playIndicator.hidden = !player.paused && !player.ended;
    };
    player.addEventListener("click", (event) => {
      event.preventDefault();
      if (player.paused || player.ended) {
        player.play().catch((error) => {
          if (error.name !== "AbortError") showToast("Video could not be played. Try again.");
        });
      } else {
        player.pause();
      }
    });
    player.addEventListener("play", updatePlayIndicator);
    player.addEventListener("pause", updatePlayIndicator);
    player.addEventListener("ended", updatePlayIndicator);
    updatePlayIndicator();
    const audio = document.createElement("audio");
    audio.hidden = true;
    audio.preload = "metadata";
    if (video.audioUrl) {
      audio.src = video.audioUrl;
      player.muted = true;
      syncSoundtrack(player, audio);
    }
    const info = document.createElement("div");
    info.className = "video-info video-info-overlay";
    const heading = document.createElement("h2");
    heading.className = "video-title";
    heading.textContent = video.title || video.caption || "A new moment";
    const text = document.createElement("p");
    text.className = "video-caption";
    text.textContent = video.description || video.caption || "";
    const actions = document.createElement("div");
    actions.className = "video-actions";
    const likeButton = document.createElement("button");
    likeButton.className = "video-action-button video-like-button";
    likeButton.type = "button";
    const updateLikeButton = () => {
      const liked = likedVideoIds.includes(String(video.id || video.url));
      likeButton.classList.toggle("is-liked", liked);
      likeButton.setAttribute("aria-pressed", String(liked));
      likeButton.setAttribute("aria-label", `${liked ? "Unlike" : "Like"} video`);
      likeButton.replaceChildren();
      const icon = document.createElement("span");
      icon.className = "video-action-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.innerHTML = '<svg viewBox="0 0 24 24"><path d="M20.8 8.7c0 5.2-8.8 11-8.8 11s-8.8-5.8-8.8-11A4.7 4.7 0 0 1 12 6.3a4.7 4.7 0 0 1 8.8 2.4Z"/></svg>';
      const count = document.createElement("span");
      count.className = "video-action-count";
      count.textContent = formatCount((Number(video.likeCount) || 0) + Number(liked));
      likeButton.append(icon, count);
    };
    updateLikeButton();
    likeButton.addEventListener("click", () => {
      const videoId = String(video.id || video.url);
      const liked = likedVideoIds.includes(videoId);
      likedVideoIds = liked
        ? likedVideoIds.filter((id) => id !== videoId)
        : [...likedVideoIds, videoId];
      localStorage.setItem("loop-liked-videos", JSON.stringify(likedVideoIds));
      updateLikeButton();
    });
    const shareButton = document.createElement("button");
    shareButton.className = "video-action-button video-share-button";
    shareButton.type = "button";
    shareButton.innerHTML = '<span class="video-action-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5"/><path d="M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6"/></svg></span><span class="video-action-label">Share</span>';
    shareButton.setAttribute("aria-label", "Share video on WhatsApp");
    shareButton.addEventListener("click", () => {
      const videoUrl = new URL(video.url, window.location.href).href;
      const shareText = `${video.title || video.caption || "Watch this video"}\n${videoUrl}`;
      window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank", "noopener,noreferrer");
    });
    const downloadLink = document.createElement("a");
    downloadLink.className = "video-action-button video-download-button";
    downloadLink.innerHTML = '<span class="video-action-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 4.8A1.8 1.8 0 0 1 7.8 3h8.4A1.8 1.8 0 0 1 18 4.8V21l-6-4-6 4V4.8Z"/></svg></span><span class="video-action-label">Save</span>';
    downloadLink.setAttribute("aria-label", "Download video");
    if (video.id) {
      downloadLink.href = `/api/videos/${encodeURIComponent(video.id)}/download`;
      downloadLink.setAttribute("download", "");
    } else {
      downloadLink.setAttribute("aria-disabled", "true");
      downloadLink.title = "This video cannot be downloaded.";
    }
    const commentsButton = document.createElement("button");
    commentsButton.className = "video-action-button video-comments-button";
    commentsButton.type = "button";
    commentsButton.innerHTML = `<span class="video-action-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5 8 8 0 0 1-3.1-.6L4 20l1.6-4.1a7.4 7.4 0 0 1-1.1-3.9 7.5 7.5 0 1 1 15.5-.5Z"/></svg></span><span class="video-action-count">${formatCount(video.commentCount || 0)}</span>`;
    commentsButton.setAttribute("aria-label", `View comments · ${formatCount(video.commentCount || 0)}`);
    commentsButton.setAttribute("aria-expanded", "false");
    commentsButton.addEventListener("click", () => openCommentsPanel(video, commentsButton));
    actions.append(likeButton, commentsButton, shareButton, downloadLink);
    info.append(heading);
    if (text.textContent) info.append(text);
    stage.append(player, playIndicator, creatorHeader, info, actions);
    card.append(stage, audio);
    feedList.append(card);
    if (autoplayVideoId !== null && String(video.id) === String(autoplayVideoId)) {
      player.play().catch((error) => {
        if (error.name !== "AbortError") {
          console.warn("Could not autoplay the new upload; use the video controls to play it.", error);
        }
      });
    }
  });
}

async function loadFeed(feedMode = "home", newlyUploadedVideo = null) {
  clearProfileFeedContext();
  try {
    const response = await api("/api/videos");
    let { videos } = response;
    if (!Array.isArray(videos)) {
      throw new Error("The video feed returned an invalid response.");
    }
    if (newlyUploadedVideo && newlyUploadedVideo.visibility !== "Private"
      && !videos.some((video) => video.id === newlyUploadedVideo.id)) {
      videos = [newlyUploadedVideo, ...videos];
    }
    try {
      await refreshFollowing();
    } catch (error) {
      following = readFollowing();
      console.error("Could not load followed profiles:", error);
    }
    const visibleVideos = feedMode === "subscriptions"
      ? videos.filter((video) => typeof video.author === "string"
        && isFollowing(video.author))
      : videos;
    renderFeed(visibleVideos, newlyUploadedVideo && newlyUploadedVideo.visibility !== "Private"
      ? newlyUploadedVideo.id
      : null);
    if (feedMode === "subscriptions" && !visibleVideos.length) {
      const empty = document.createElement("section");
      empty.className = "empty-state subscription-empty";
      const icon = document.createElement("span");
      icon.className = "empty-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = "▶";
      const heading = document.createElement("h2");
      heading.textContent = "Your subscriptions";
      const description = document.createElement("p");
      description.textContent = following.length
        ? "New videos from creators you follow will appear here."
        : "Follow creators to see their videos here.";
      empty.append(icon, heading, description);
      feedList.append(empty);
    }
    return true;
  } catch (error) {
    console.error("Could not load the video feed:", error);
    if (newlyUploadedVideo && newlyUploadedVideo.visibility !== "Private"
      && typeof newlyUploadedVideo.id === "string" && typeof newlyUploadedVideo.url === "string") {
      renderFeed([newlyUploadedVideo], newlyUploadedVideo.id);
      return false;
    }
    feedList.replaceChildren();
    return false;
  }
}

function readFollowing() {
  try {
    const stored = JSON.parse(localStorage.getItem("loop-following") || "[]");
    return Array.isArray(stored) ? stored.filter((name) => typeof name === "string") : [];
  } catch (error) {
    console.error("Could not read the followed creator list:", error);
    return [];
  }
}

function readLikedVideoIds() {
  try {
    const stored = JSON.parse(localStorage.getItem("loop-liked-videos") || "[]");
    return Array.isArray(stored) ? stored.filter((id) => typeof id === "string") : [];
  } catch (error) {
    console.error("Could not read liked video list:", error);
    return [];
  }
}

function readSavedProfiles() {
  try {
    const saved = JSON.parse(localStorage.getItem("loop-profiles") || "[]");
    return Array.isArray(saved)
      ? saved.filter((profile) => profile
        && /^[a-zA-Z0-9._-]{1,32}$/.test(profile.username)
        && typeof profile.name === "string"
        && typeof profile.email === "string")
      : [];
  } catch (error) {
    console.error("Could not read saved profiles:", error);
    return [];
  }
}

function saveProfile(profile) {
  const existing = getSavedProfile(profile.username);
  const updatedProfile = existing ? { ...existing, ...profile } : profile;
  const saved = readSavedProfiles().filter((item) => item.username.toLowerCase() !== profile.username.toLowerCase());
  saved.unshift(updatedProfile);
  localStorage.setItem("loop-profiles", JSON.stringify(saved));
}

function getSavedProfile(username) {
  return readSavedProfiles().find((profile) => profile.username.toLowerCase() === username.toLowerCase()) || null;
}

function isFollowing(username) {
  return following.some((name) => name.toLowerCase() === username.toLowerCase());
}

function useSavedFollowing(reason) {
  following = readFollowing().filter((username) => /^[a-zA-Z0-9._-]{1,32}$/.test(username));
  localStorage.setItem("loop-following", JSON.stringify(following));
  console.warn("Could not refresh the followed-user list; using saved follows.", reason);
}

async function refreshFollowing() {
  const followingUrl = `/api/profiles/${encodeURIComponent(currentUsername)}/relationships?type=following&viewer=${encodeURIComponent(currentUsername)}`;
  const followingResponse = await api(followingUrl);
  if (!Array.isArray(followingResponse.users)) {
    useSavedFollowing(new Error("The response did not contain a users array."));
    return;
  }
  let { users } = followingResponse;
  const legacyFollowing = users.length
    ? []
    : readFollowing().filter((username) => /^[a-zA-Z0-9._-]{1,32}$/.test(username));
  for (const username of legacyFollowing) {
    if (username.toLowerCase() === currentUsername.toLowerCase()) continue;
    await api(`/api/profiles/${encodeURIComponent(username)}/follow`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ follower: currentUsername, follow: true }),
    });
  }
  if (legacyFollowing.length) {
    const updatedResponse = await api(followingUrl);
    if (!Array.isArray(updatedResponse.users)) {
      useSavedFollowing(new Error("The refreshed response did not contain a users array."));
      return;
    }
    users = updatedResponse.users;
  }
  following = [...new Set(users
    .map((user) => user && user.username)
    .filter((username) => typeof username === "string" && /^[a-zA-Z0-9._-]{1,32}$/.test(username)))];
  localStorage.setItem("loop-following", JSON.stringify(following));
}

async function setFollowing(username, shouldFollow) {
  const previous = following.slice();
  following = following.filter((name) => name.toLowerCase() !== username.toLowerCase());
  if (shouldFollow) following.push(username);
  localStorage.setItem("loop-following", JSON.stringify(following));
  try {
    await api(`/api/profiles/${encodeURIComponent(username)}/follow`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ follower: currentUsername, follow: shouldFollow }),
    });
    await refreshFollowing();
  } catch (error) {
    following = previous;
    localStorage.setItem("loop-following", JSON.stringify(following));
    throw error;
  }
}

function closeCommentsPanel() {
  if (!activeCommentsPanel) return;
  activeCommentsPanel.trigger.setAttribute("aria-expanded", "false");
  activeCommentsPanel.panel.remove();
  activeCommentsPanel = null;
}

function appendComments(comments, list) {
  list.replaceChildren();
  if (!comments.length) {
    const empty = document.createElement("p");
    empty.className = "comments-empty";
    empty.textContent = "No comments yet. Be the first to comment.";
    list.append(empty);
    return;
  }
  comments.forEach((comment) => {
    const item = document.createElement("article");
    item.className = "comment-item";
    const author = document.createElement("strong");
    author.textContent = comment.author || "Guest";
    const text = document.createElement("p");
    text.textContent = comment.text;
    item.append(author, text);
    list.append(item);
  });
}

function updateCommentsButton(button, count) {
  const countElement = button.querySelector(".video-action-count");
  if (countElement) countElement.textContent = formatCount(count);
  button.setAttribute("aria-label", `View comments · ${formatCount(count)}`);
}

function openCommentsPanel(video, trigger) {
  if (activeCommentsPanel && activeCommentsPanel.trigger === trigger) {
    closeCommentsPanel();
    return;
  }
  closeCommentsPanel();
  const panel = document.createElement("section");
  panel.className = "comments-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Video comments");
  const header = document.createElement("header");
  header.className = "comments-header";
  const heading = document.createElement("h2");
  heading.textContent = "Comments";
  const count = document.createElement("span");
  count.className = "comments-count";
  count.textContent = formatCount(video.commentCount || 0);
  const closeButton = document.createElement("button");
  closeButton.className = "comments-close";
  closeButton.type = "button";
  closeButton.textContent = "×";
  closeButton.setAttribute("aria-label", "Close comments");
  closeButton.addEventListener("click", closeCommentsPanel);
  header.append(heading, count, closeButton);

  const list = document.createElement("div");
  list.className = "comments-list";
  list.setAttribute("aria-live", "polite");
  const status = document.createElement("p");
  status.className = "comments-status";
  status.setAttribute("role", "status");
  status.textContent = "Loading comments…";
  list.append(status);

  const form = document.createElement("form");
  form.className = "comment-form";
  const input = document.createElement("textarea");
  input.name = "comment";
  input.maxLength = 1000;
  input.rows = 1;
  input.placeholder = "Add a comment…";
  input.setAttribute("aria-label", "Write a comment");
  input.required = true;
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.textContent = "Post";
  submit.disabled = true;
  form.append(input, submit);
  panel.append(header, list, form);
  document.body.append(panel);
  trigger.setAttribute("aria-expanded", "true");
  activeCommentsPanel = { panel, trigger };
  closeButton.focus();

  let comments = [];
  api(`/api/videos/${encodeURIComponent(video.id)}/comments`)
    .then((result) => {
      comments = result.comments;
      video.commentCount = result.count;
      count.textContent = formatCount(result.count);
      updateCommentsButton(trigger, result.count);
      appendComments(comments, list);
      submit.disabled = false;
    })
    .catch((error) => {
      status.textContent = error.message || "Comments could not be loaded.";
      submit.disabled = false;
    });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!input.value.trim()) {
      input.focus();
      return;
    }
    submit.disabled = true;
    status.textContent = "";
    try {
      const result = await api(`/api/videos/${encodeURIComponent(video.id)}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author: currentUsername, text: input.value.trim() }),
      });
      comments.push(result.comment);
      video.commentCount = result.count;
      count.textContent = formatCount(result.count);
      updateCommentsButton(trigger, result.count);
      appendComments(comments, list);
      input.value = "";
      list.scrollTop = list.scrollHeight;
    } catch (error) {
      status.textContent = error.message || "Your comment could not be posted.";
    } finally {
      submit.disabled = false;
    }
  });
}

function initials(username) {
  return username.trim().slice(0, 1).toUpperCase() || "G";
}

function formatCount(count) {
  return new Intl.NumberFormat("en", { notation: count >= 10000 ? "compact" : "standard" }).format(count);
}

function formatExactCount(count) {
  return new Intl.NumberFormat("en").format(count);
}

function renderProfileGrid(videos, username, ownProfile) {
  const grid = document.createElement("div");
  grid.className = "profile-video-grid";
  videos.forEach((video) => {
    const item = document.createElement("article");
    item.className = "profile-video-item";
    const playButton = document.createElement("button");
    playButton.className = "profile-video-open";
    playButton.type = "button";
    playButton.setAttribute("aria-label", `Play ${video.title || "video"}`);
    const player = document.createElement("video");
    player.src = video.url;
    player.muted = true;
    player.playsInline = true;
    player.preload = "metadata";
    const caption = document.createElement("span");
    caption.textContent = video.title || video.caption || "Video";
    playButton.append(player, caption);
    playButton.addEventListener("click", () => openProfileVideoFeed(videos, video.id, username));
    item.append(playButton);
    if (ownProfile && video.canDelete) {
      const deleteButton = document.createElement("button");
      deleteButton.className = "profile-video-delete";
      deleteButton.type = "button";
      deleteButton.setAttribute("aria-label", `Delete ${video.title || "video"}`);
      deleteButton.title = "Delete video";
      deleteButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3"/></svg>';
      deleteButton.addEventListener("click", async () => {
        if (!window.confirm(`Delete "${video.title || video.caption || "this video"}"? This cannot be undone.`)) return;
        deleteButton.disabled = true;
        try {
          await api(`/api/videos/${encodeURIComponent(video.id)}`, { method: "DELETE" });
          showToast("Video deleted.");
          await openProfile(username);
        } catch (error) {
          showToast(error.message || "The video could not be deleted.");
          deleteButton.disabled = false;
        }
      });
      item.append(deleteButton);
    }
    grid.append(item);
  });
  return grid;
}

function openProfileVideoFeed(videos, selectedVideoId, username) {
  const selectedIndex = videos.findIndex((video) => String(video.id) === String(selectedVideoId));
  if (selectedIndex < 0) {
    showToast("This video is no longer available.");
    return;
  }
  profileFeedContext = { username };
  profileFeedBackButton.textContent = `‹  @${username || "profile"}`;
  profileFeedBackButton.setAttribute("aria-label", `Back to @${username || "profile"}'s profile`);
  profileFeedBackButton.classList.remove("hidden");
  showPage("feed");
  renderFeed(videos, selectedVideoId);
  requestAnimationFrame(() => {
    const selectedCard = feedList.children[selectedIndex];
    if (!selectedCard) return;
    const feedBounds = feedPage.getBoundingClientRect();
    const cardBounds = selectedCard.getBoundingClientRect();
    feedPage.scrollTop += cardBounds.top - feedBounds.top;
  });
}

function clearProfileFeedContext() {
  profileFeedContext = null;
  profileFeedBackButton.classList.add("hidden");
}

async function returnToProfileFromFeed() {
  if (!profileFeedContext) return;
  const { username } = profileFeedContext;
  clearProfileFeedContext();
  await openProfile(username);
}

function closeRelationshipDialog() {
  if (!activeRelationshipDialog) return;
  const { overlay, trigger } = activeRelationshipDialog;
  document.removeEventListener("keydown", handleRelationshipEscape);
  overlay.remove();
  activeRelationshipDialog = null;
  trigger.focus();
}

async function loadRelationshipRows(username, type, list, status) {
  status.textContent = "Loading users…";
  list.replaceChildren();
  try {
    const query = new URLSearchParams({ type, viewer: currentUsername });
    const { users } = await api(`/api/profiles/${encodeURIComponent(username)}/relationships?${query}`);
    status.textContent = "";
    if (!users.length) {
      status.textContent = type === "followers" ? "No followers yet." : "Not following anyone yet.";
      return;
    }
    users.forEach((user) => {
      const row = document.createElement("article");
      row.className = "relationship-user";
      const avatar = document.createElement("span");
      avatar.className = "relationship-avatar";
      avatar.textContent = initials(user.username);
      const identity = document.createElement("div");
      identity.className = "relationship-identity";
      const name = document.createElement("strong");
      name.textContent = user.username;
      const detail = document.createElement("span");
      detail.textContent = user.followsYou ? "Follows you" : "Loop creator";
      identity.append(name, detail);

      const action = document.createElement("button");
      action.type = "button";
      action.className = "relationship-action";
      const isSelf = user.username.toLowerCase() === currentUsername.toLowerCase();
      const updateAction = () => {
        const mutual = isFollowing(user.username) && user.followsYou;
        action.textContent = mutual
          ? "Friends"
          : isFollowing(user.username) ? "Following" : user.followsYou ? "Follow back" : "Follow";
        action.classList.toggle("is-following", isFollowing(user.username));
        action.disabled = isSelf;
      };
      updateAction();
      action.addEventListener("click", async () => {
        if (isSelf) return;
        const shouldFollow = !isFollowing(user.username);
        action.disabled = true;
        try {
          await setFollowing(user.username, shouldFollow);
          updateAction();
          await loadRelationshipRows(username, type, list, status);
          await refreshProfileStats(username);
        } catch (error) {
          showToast(error.message);
          action.disabled = false;
        }
      });
      row.append(avatar, identity, action);
      list.append(row);
    });
  } catch (error) {
    status.textContent = error.message || "The user list could not be loaded.";
  }
}

async function refreshProfileStats(username) {
  const query = new URLSearchParams({ viewer: currentUsername });
  const response = await api(`/api/profiles/${encodeURIComponent(username)}?${query}`);
  const profile = response && response.profile && typeof response.profile === "object"
    ? response.profile
    : {};
  const counts = {
    posts: profile.posts ?? 0,
    followers: profile.followers ?? 0,
    following: profile.following ?? 0,
  };
  Object.entries(counts).forEach(([key, count]) => {
    const value = profileContent.querySelector(`[data-stat="${key}"] strong`);
    if (value) value.textContent = formatExactCount(Number(count) || 0);
  });
  const followButton = profileContent.querySelector(".profile-actions .profile-action-button:not(.secondary)");
  if (followButton && username.toLowerCase() !== currentUsername.toLowerCase()) {
    const isFollowingProfile = Boolean(profile.isFollowing);
    followButton.textContent = isFollowingProfile ? "Following" : "Follow";
    followButton.classList.toggle("is-following", isFollowingProfile);
  }
}

function openRelationshipDialog(username, type, trigger) {
  if (activeRelationshipDialog) closeRelationshipDialog();
  const overlay = document.createElement("div");
  overlay.className = "relationship-overlay";
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeRelationshipDialog();
  });
  const dialog = document.createElement("section");
  dialog.className = "relationship-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "relationship-title");
  const header = document.createElement("header");
  header.className = "relationship-header";
  const heading = document.createElement("h2");
  heading.id = "relationship-title";
  heading.textContent = type === "followers" ? "Followers" : "Following";
  const closeButton = document.createElement("button");
  closeButton.className = "relationship-close";
  closeButton.type = "button";
  closeButton.textContent = "×";
  closeButton.setAttribute("aria-label", "Close user list");
  closeButton.addEventListener("click", closeRelationshipDialog);
  header.append(heading, closeButton);
  const status = document.createElement("p");
  status.className = "relationship-status";
  status.setAttribute("role", "status");
  const list = document.createElement("div");
  list.className = "relationship-list";
  dialog.append(header, status, list);
  overlay.append(dialog);
  document.body.append(overlay);
  activeRelationshipDialog = { overlay, trigger };
  closeButton.focus();
  document.addEventListener("keydown", handleRelationshipEscape);
  loadRelationshipRows(username, type, list, status);
}

function handleRelationshipEscape(event) {
  if (event.key === "Escape" && activeRelationshipDialog) {
    document.removeEventListener("keydown", handleRelationshipEscape);
    closeRelationshipDialog();
  }
}

function renderProfile(profile, videos, username) {
  profile = profile && typeof profile === "object" ? profile : {};
  videos = Array.isArray(videos) ? videos : [];
  const ownProfile = currentUsername !== "Guest"
    && username.toLowerCase() === currentUsername.toLowerCase();
  const savedProfile = ownProfile ? getSavedProfile(username) : null;
  const profileDetails = savedProfile
    ? {
      ...profile,
      ...savedProfile,
      bio: savedProfile.bio ?? profile.bio,
      avatarUrl: profile.avatarUrl ?? savedProfile.avatarUrl,
    }
    : profile;
  profileTopbarName.textContent = username;
  profileSettingsButton.classList.toggle("hidden", !ownProfile);
  profileSettingsButton.onclick = () => openSettingsModal(profileDetails, videos, username, profileSettingsButton);
  profileContent.replaceChildren();

  const summary = document.createElement("section");
  summary.className = "profile-summary";
  const avatarWrap = document.createElement("div");
  avatarWrap.className = "profile-avatar-wrap";
  const avatar = document.createElement("div");
  avatar.className = "profile-avatar";
  avatar.textContent = initials(username);
  if (profileDetails.avatarUrl) {
    const avatarImage = document.createElement("img");
    avatarImage.src = getAssetUrl(profileDetails.avatarUrl);
    avatarImage.alt = `${username}'s profile picture`;
    avatarImage.addEventListener("error", () => avatarImage.remove(), { once: true });
    avatar.append(avatarImage);
  }
  avatarWrap.append(avatar);
  if (ownProfile) {
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "profile-edit-button";
    editButton.setAttribute("aria-label", "Edit profile");
    editButton.title = "Edit profile";
    editButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5 4 4M4 20l4.2-.8L19 8.4a2.1 2.1 0 0 0-3-3L5.2 16.2 4 20Z"></path></svg>';
    editButton.addEventListener("click", () => openProfileEditor(profileDetails, videos, username, editButton));
    avatarWrap.append(editButton);
  }

  const stats = document.createElement("div");
  stats.className = "profile-stats";
  [
    ["Posts", profile.posts ?? videos.length, "posts"],
    ["Followers", profile.followers ?? 0, "followers"],
    ["Following", profile.following ?? 0, "following"],
  ].forEach(([label, count, key]) => {
    const stat = document.createElement("button");
    stat.type = "button";
    stat.className = "profile-stat";
    stat.dataset.stat = key;
    if (key !== "posts") {
      stat.setAttribute("aria-label", `View ${label.toLowerCase()}`);
      stat.addEventListener("click", () => openRelationshipDialog(username, key, stat));
    } else {
      stat.disabled = true;
    }
    const value = document.createElement("strong");
    value.textContent = formatExactCount(Number(count) || 0);
    const name = document.createElement("span");
    name.textContent = label;
    stat.append(value, name);
    stats.append(stat);
  });
  summary.append(avatarWrap, stats);

  const bio = document.createElement("p");
  bio.className = "profile-bio";
  const profileLines = [];
  if (ownProfile && currentDisplayName !== username) profileLines.push(currentDisplayName);
  if (profileDetails.profession) profileLines.push(profileDetails.profession);
  profileLines.push(profileDetails.bio || "Sharing videos on Loop.");
  bio.textContent = profileLines.join("\n");

  const interests = document.createElement("p");
  interests.className = "profile-interests";
  interests.textContent = Array.isArray(profileDetails.interests)
    ? profileDetails.interests.join(" · ")
    : "";
  interests.classList.toggle("hidden", !interests.textContent);

  const actions = document.createElement("div");
  actions.className = "profile-actions";
  if (!ownProfile) {
    const follow = document.createElement("button");
    follow.type = "button";
    follow.className = "profile-action-button";
    const updateFollowLabel = () => {
      follow.textContent = profile.isFollowing ? "Following" : "Follow";
      follow.classList.toggle("is-following", profile.isFollowing);
    };
    updateFollowLabel();
    follow.addEventListener("click", async () => {
      follow.disabled = true;
      const shouldFollow = !profile.isFollowing;
      profile.isFollowing = shouldFollow;
      updateFollowLabel();
      try {
        await setFollowing(username, shouldFollow);
        await openProfile(username);
      } catch (error) {
        profile.isFollowing = !shouldFollow;
        updateFollowLabel();
        showToast(error.message);
      } finally {
        follow.disabled = false;
      }
    });
    const message = document.createElement("button");
    message.type = "button";
    message.className = "profile-action-button secondary";
    message.textContent = "Message";
    message.addEventListener("click", () => showToast("Messaging is not available yet."));
    actions.append(follow, message);
  }

  const tabs = document.createElement("div");
  tabs.className = "profile-tabs";
  tabs.setAttribute("role", "tablist");
  const videosTab = document.createElement("button");
  videosTab.type = "button";
  videosTab.className = "profile-tab active";
  videosTab.setAttribute("role", "tab");
  videosTab.setAttribute("aria-label", "Videos");
  videosTab.setAttribute("aria-selected", "true");
  videosTab.title = "Videos";
  videosTab.append(createProfileTabIcon("videos"));
  const postsTab = document.createElement("button");
  postsTab.type = "button";
  postsTab.className = "profile-tab";
  postsTab.setAttribute("role", "tab");
  postsTab.setAttribute("aria-label", "Tagged posts");
  postsTab.setAttribute("aria-selected", "false");
  postsTab.title = "Tagged posts";
  postsTab.append(createProfileTabIcon("tagged"));
  tabs.append(videosTab, postsTab);

  const tabContent = document.createElement("div");
  tabContent.className = "profile-tab-content";
  const showVideos = () => {
    videosTab.classList.add("active");
    videosTab.setAttribute("aria-selected", "true");
    postsTab.classList.remove("active");
    postsTab.setAttribute("aria-selected", "false");
    tabContent.replaceChildren();
    if (videos.length) {
      tabContent.append(renderProfileGrid(videos, username, ownProfile));
    } else {
      const empty = document.createElement("p");
      empty.className = "profile-empty";
      empty.textContent = ownProfile ? "Your videos will appear here." : "No videos yet.";
      tabContent.append(empty);
    }
  };
  videosTab.addEventListener("click", showVideos);
  postsTab.addEventListener("click", () => {
    postsTab.classList.add("active");
    postsTab.setAttribute("aria-selected", "true");
    videosTab.classList.remove("active");
    videosTab.setAttribute("aria-selected", "false");
    const empty = document.createElement("p");
    empty.className = "profile-empty";
    empty.textContent = "No posts yet.";
    tabContent.replaceChildren(empty);
  });
  showVideos();

  profileTopbarLogout.classList.toggle("hidden", !ownProfile || currentUsername === "Guest");
  profileContent.append(summary, bio, interests);
  if (actions.childElementCount) profileContent.append(actions);
  profileContent.append(tabs, tabContent);
}

function createProfileTabIcon(type) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", type === "videos"
    ? "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"
    : "M4 4h16v16H4zM9 10a3 3 0 1 0 6 0 3 3 0 0 0-6 0ZM7 18c.8-2.2 2.5-3.3 5-3.3s4.2 1.1 5 3.3");
  svg.append(path);
  return svg;
}

function openProfileEditor(profileDetails, videos, username, trigger) {
  let previewObjectUrl = "";
  const closeEditor = (restoreFocus = true) => {
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = "";
    closeProfileEditor(overlay, trigger, restoreFocus);
  };
  const overlay = document.createElement("div");
  overlay.className = "profile-edit-overlay";
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeEditor();
  });
  const dialog = document.createElement("section");
  dialog.className = "profile-edit-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "profile-edit-title");
  const header = document.createElement("header");
  header.className = "profile-edit-header";
  const heading = document.createElement("h2");
  heading.id = "profile-edit-title";
  heading.textContent = "Edit profile";
  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "relationship-close";
  closeButton.setAttribute("aria-label", "Close profile editor");
  closeButton.textContent = "×";
  closeButton.addEventListener("click", () => closeEditor());
  header.append(heading, closeButton);

  const form = document.createElement("form");
  form.className = "profile-setup-form";
  const avatarPreview = document.createElement("div");
  avatarPreview.className = "profile-avatar-preview";
  avatarPreview.setAttribute("aria-label", "Profile picture preview");
  const avatarFallback = document.createElement("span");
  avatarFallback.textContent = initials(username);
  const avatarImage = document.createElement("img");
  avatarImage.alt = "";
  avatarImage.classList.add("hidden");
  avatarImage.addEventListener("error", () => {
    avatarImage.classList.add("hidden");
    avatarFallback.classList.remove("hidden");
  });
  if (profileDetails.avatarUrl) {
    avatarImage.src = getAssetUrl(profileDetails.avatarUrl);
    avatarImage.classList.remove("hidden");
    avatarFallback.classList.add("hidden");
  }
  avatarPreview.append(avatarFallback, avatarImage);
  const avatarInput = document.createElement("input");
  avatarInput.id = "profile-avatar-input";
  avatarInput.name = "avatar";
  avatarInput.className = "profile-avatar-input";
  avatarInput.type = "file";
  avatarInput.accept = "image/jpeg,image/png,image/webp";
  const avatarLabel = document.createElement("label");
  avatarLabel.htmlFor = avatarInput.id;
  avatarLabel.textContent = "Profile picture (JPEG, PNG, or WebP; up to 5 MB)";
  const avatarError = document.createElement("p");
  avatarError.className = "profile-avatar-error hidden";
  avatarError.setAttribute("role", "alert");
  avatarInput.addEventListener("change", () => {
    const imageFile = avatarInput.files[0];
    avatarError.classList.add("hidden");
    avatarError.textContent = "";
    if (!imageFile) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(imageFile.type)) {
      avatarInput.value = "";
      avatarError.textContent = "Choose a JPEG, PNG, or WebP image.";
      avatarError.classList.remove("hidden");
      return;
    }
    if (imageFile.size > 5 * 1024 * 1024) {
      avatarInput.value = "";
      avatarError.textContent = "Choose an image that is 5 MB or smaller.";
      avatarError.classList.remove("hidden");
      return;
    }
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = URL.createObjectURL(imageFile);
    avatarImage.src = previewObjectUrl;
    avatarImage.classList.remove("hidden");
    avatarFallback.classList.add("hidden");
  });
  form.append(avatarPreview, avatarLabel, avatarInput, avatarError);
  const profession = document.createElement("input");
  const displayName = document.createElement("input");
  displayName.id = "profile-display-name";
  displayName.name = "name";
  displayName.type = "text";
  displayName.maxLength = 80;
  displayName.placeholder = username;
  displayName.value = profileDetails.name || currentDisplayName;
  const displayNameLabel = document.createElement("label");
  displayNameLabel.htmlFor = displayName.id;
  displayNameLabel.textContent = "Name";
  form.append(displayNameLabel, displayName);
  profession.id = "profile-profession";
  profession.name = "profession";
  profession.type = "text";
  profession.maxLength = 80;
  profession.placeholder = "e.g. Filmmaker";
  profession.value = profileDetails.profession || "";
  const bio = document.createElement("textarea");
  bio.id = "profile-bio-input";
  bio.name = "bio";
  bio.maxLength = 300;
  bio.rows = 3;
  bio.placeholder = "Tell viewers a little about yourself";
  bio.value = profileDetails.bio || "";
  const interests = document.createElement("input");
  interests.id = "profile-interests-input";
  interests.name = "interests";
  interests.type = "text";
  interests.maxLength = 200;
  interests.placeholder = "Travel, cooking, music";
  interests.value = Array.isArray(profileDetails.interests)
    ? profileDetails.interests.join(", ")
    : "";
  [
    ["Profession", profession],
    ["Bio", bio],
    ["Video categories / interests", interests],
  ].forEach(([labelText, control]) => {
    const label = document.createElement("label");
    label.htmlFor = control.id;
    label.textContent = labelText;
    form.append(label, control);
  });
  const saveButton = document.createElement("button");
  saveButton.type = "submit";
  saveButton.className = "profile-management-button";
  saveButton.textContent = "Save profile details";
  form.append(saveButton);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    saveButton.disabled = true;
    saveButton.textContent = "Saving…";
    avatarError.classList.add("hidden");
    const currentProfile = getSavedProfile(currentUsername) || {
      username: currentUsername,
      name: currentDisplayName,
      email: localStorage.getItem("loop-email") || "",
    };
    currentProfile.profession = profession.value.trim();
    currentProfile.bio = bio.value.trim();
    currentProfile.name = displayName.value.trim() || username;
    currentProfile.interests = interests.value
      .split(",")
      .map((interest) => interest.trim())
      .filter(Boolean)
      .slice(0, 12);
    const formData = new FormData();
    formData.append("profession", currentProfile.profession);
    formData.append("bio", currentProfile.bio);
    formData.append("interests", currentProfile.interests.join(","));
    if (avatarInput.files[0]) formData.append("avatar", avatarInput.files[0]);
    try {
      const result = await api("/api/me/profile", { method: "POST", body: formData });
      if (!result.profile || result.profile.username.toLowerCase() !== currentUsername.toLowerCase()) {
        throw new Error("The server returned an invalid profile response.");
      }
      Object.assign(currentProfile, result.profile);
      saveProfile(currentProfile);
      currentDisplayName = result.profile.name || username;
      localStorage.setItem("loop-name", currentDisplayName);
      closeEditor(false);
      renderProfile({ ...profileDetails, ...result.profile }, videos, username);
          profileContent.querySelector(".profile-edit-button")?.focus();
      showToast("Profile details saved.");
    } catch (error) {
      avatarError.textContent = error.message || "Could not save your profile. Please try again.";
      avatarError.classList.remove("hidden");
    } finally {
      if (overlay.isConnected) {
        saveButton.disabled = false;
        saveButton.textContent = "Save profile details";
      }
    }
  });

  dialog.append(header, form);
  overlay.append(dialog);
  document.body.append(overlay);
  closeButton.focus();
  overlay.onkeydown = (event) => {
    if (event.key === "Escape") closeEditor();
  };
}

function closeProfileEditor(overlay, trigger, restoreFocus = true) {
  overlay.remove();
  if (restoreFocus && trigger.isConnected) trigger.focus();
}

async function openSettingsModal(profileDetails, videos, username, trigger) {
  const overlay = document.createElement("div");
  overlay.className = "settings-overlay";
  const dialog = document.createElement("section");
  dialog.className = "settings-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "settings-title");

  const header = document.createElement("header");
  header.className = "settings-header";
  const heading = document.createElement("h2");
  heading.id = "settings-title";
  heading.textContent = "Settings";
  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "relationship-close";
  closeButton.setAttribute("aria-label", "Close settings");
  closeButton.textContent = "×";
  header.append(heading, closeButton);

  const layout = document.createElement("div");
  layout.className = "settings-layout";
  const navigation = document.createElement("nav");
  navigation.className = "settings-navigation";
  navigation.setAttribute("aria-label", "Settings sections");
  const content = document.createElement("div");
  content.className = "settings-content";
  const sections = [
    ["edit", "Edit profile"],
    ["privacy", "Account privacy"],
    ["notifications", "Notifications"],
    ["posts", "Manage posts"],
    ["security", "Privacy & security"],
    ["help", "Help & support"],
  ];
  let settings = null;
  let activeSection = "edit";
  let blockedUsers = [];

  const close = () => {
    document.removeEventListener("keydown", handleEscape);
    overlay.remove();
    if (trigger.isConnected) trigger.focus();
  };
  const handleEscape = (event) => {
    if (event.key === "Escape") close();
  };
  closeButton.addEventListener("click", close);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });
  sections.forEach(([key, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "settings-nav-item";
    button.textContent = label;
    button.dataset.section = key;
    button.classList.toggle("active", key === activeSection);
    if (key === activeSection) button.setAttribute("aria-current", "page");
    button.addEventListener("click", () => {
      activeSection = key;
      navigation.querySelectorAll(".settings-nav-item").forEach((item) => {
        item.classList.toggle("active", item.dataset.section === key);
        if (item.dataset.section === key) item.setAttribute("aria-current", "page");
        else item.removeAttribute("aria-current");
      });
      renderSection();
    });
    navigation.append(button);
  });
  layout.append(navigation, content);
  dialog.append(header, layout);
  overlay.append(dialog);
  document.body.append(overlay);
  document.addEventListener("keydown", handleEscape);
  closeButton.focus();

  function showMessage(message, isError = false) {
    let status = content.querySelector(".settings-status");
    if (!status) {
      status = document.createElement("p");
      status.className = "settings-status";
      status.setAttribute("role", "status");
      content.prepend(status);
    }
    status.textContent = message;
    status.classList.toggle("is-error", isError);
  }

  function addSwitch(parent, labelText, checked, onChange, description) {
    const row = document.createElement("label");
    row.className = "settings-switch-row";
    const copy = document.createElement("span");
    copy.className = "settings-switch-copy";
    const label = document.createElement("strong");
    label.textContent = labelText;
    const helpText = document.createElement("small");
    helpText.textContent = description;
    copy.append(label, helpText);
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = checked;
    input.addEventListener("change", async () => {
      input.disabled = true;
      try {
        settings = await onChange(input.checked);
        showMessage("Settings saved.");
      } catch (error) {
        input.checked = !input.checked;
        showMessage(error.message, true);
      } finally {
        input.disabled = false;
      }
    });
    const track = document.createElement("span");
    track.className = "settings-switch";
    row.append(copy, input, track);
    parent.append(row);
  }

  async function saveSettings(change) {
    const result = await api("/api/me/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(change),
    });
    if (!result.settings) throw new Error("The server returned invalid settings.");
    return result.settings;
  }

  function renderSection() {
    content.replaceChildren();
    if (!settings) {
      const loading = document.createElement("p");
      loading.className = "settings-description";
      loading.textContent = "Loading settings…";
      content.append(loading);
      return;
    }
    if (activeSection === "edit") {
      const panel = createSettingsPanel(content, "Edit profile", "Update the details people see on your profile.");
      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "settings-primary-button";
      editButton.textContent = "Edit profile details";
      editButton.addEventListener("click", () => {
        close();
        openProfileEditor(profileDetails, videos, username, trigger);
      });
      panel.append(editButton);
    } else if (activeSection === "privacy") {
      const panel = createSettingsPanel(content, "Account privacy", "Control who can find your profile and videos in Loop.");
      addSwitch(panel, "Private account", settings.isPrivate, (isPrivate) => saveSettings({ isPrivate }),
        "Only you and approved followers can view your profile feed. Direct media links are not access-controlled in this prototype.");
    } else if (activeSection === "notifications") {
      const panel = createSettingsPanel(content, "Notifications", "Choose which activity you want to be notified about.");
      const note = document.createElement("p");
      note.className = "settings-note";
      note.textContent = "These preferences are saved to your account. Push notification delivery is not configured in this prototype.";
      panel.append(note);
      [
        ["likes", "Likes", "When someone likes your videos."],
        ["comments", "Comments", "When someone comments on your videos."],
        ["follows", "New followers", "When someone follows your profile."],
      ].forEach(([key, label, description]) => {
        addSwitch(panel, label, settings.notifications[key], (enabled) => saveSettings({
          notifications: { ...settings.notifications, [key]: enabled },
        }), description);
      });
    } else if (activeSection === "posts") {
      const panel = createSettingsPanel(content, "Manage posts", "Review or remove videos you have uploaded.");
      const count = document.createElement("p");
      count.className = "settings-description";
      count.textContent = `${videos.length} ${videos.length === 1 ? "video" : "videos"} on your profile`;
      const manageButton = document.createElement("button");
      manageButton.type = "button";
      manageButton.className = "settings-primary-button";
      manageButton.textContent = "View and manage videos";
      manageButton.addEventListener("click", () => {
        close();
        profileContent.querySelector(".profile-video-grid")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      panel.append(count, manageButton);
    } else if (activeSection === "security") {
      const panel = createSettingsPanel(content, "Privacy & security", "Change your password or manage blocked accounts.");
      const passwordForm = document.createElement("form");
      passwordForm.className = "settings-password-form";
      passwordForm.innerHTML = '<label>Current password<input name="currentPassword" type="password" minlength="8" maxlength="128" autocomplete="current-password" required></label><label>New password<input name="newPassword" type="password" minlength="8" maxlength="128" autocomplete="new-password" required></label><label>Confirm new password<input name="confirmPassword" type="password" minlength="8" maxlength="128" autocomplete="new-password" required></label>';
      const changePassword = document.createElement("button");
      changePassword.type = "submit";
      changePassword.className = "settings-primary-button";
      changePassword.textContent = "Update password";
      passwordForm.append(changePassword);
      passwordForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const formData = new FormData(passwordForm);
        const newPassword = formData.get("newPassword");
        if (newPassword !== formData.get("confirmPassword")) {
          showMessage("The new passwords do not match.", true);
          return;
        }
        changePassword.disabled = true;
        try {
          await api("/api/me/password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              currentPassword: formData.get("currentPassword"),
              newPassword,
            }),
          });
          passwordForm.reset();
          showMessage("Password updated successfully.");
        } catch (error) {
          showMessage(error.message, true);
        } finally {
          changePassword.disabled = false;
        }
      });
      const blockedHeading = document.createElement("h3");
      blockedHeading.className = "settings-subheading";
      blockedHeading.textContent = "Blocked accounts";
      const blockForm = document.createElement("form");
      blockForm.className = "settings-block-form";
      const blockInput = document.createElement("input");
      blockInput.name = "username";
      blockInput.type = "text";
      blockInput.maxLength = 32;
      blockInput.pattern = "[A-Za-z0-9._-]{1,32}";
      blockInput.placeholder = "Username";
      blockInput.setAttribute("aria-label", "Username to block");
      const blockButton = document.createElement("button");
      blockButton.type = "submit";
      blockButton.className = "settings-secondary-button";
      blockButton.textContent = "Block";
      blockForm.append(blockInput, blockButton);
      const blockedList = document.createElement("ul");
      blockedList.className = "settings-blocked-list";
      const renderBlocked = () => {
        blockedList.replaceChildren();
        if (!blockedUsers.length) {
          const empty = document.createElement("li");
          empty.className = "settings-description";
          empty.textContent = "No blocked accounts.";
          blockedList.append(empty);
        }
        blockedUsers.forEach((blockedUsername) => {
          const row = document.createElement("li");
          const name = document.createElement("span");
          name.textContent = `@${blockedUsername}`;
          const unblock = document.createElement("button");
          unblock.type = "button";
          unblock.className = "settings-secondary-button";
          unblock.textContent = "Unblock";
          unblock.addEventListener("click", async () => {
            unblock.disabled = true;
            try {
              const result = await api(`/api/me/blocked/${encodeURIComponent(blockedUsername)}`, { method: "DELETE" });
              blockedUsers = result.blockedUsers;
              renderBlocked();
              showMessage(`@${blockedUsername} unblocked.`);
            } catch (error) {
              showMessage(error.message, true);
              unblock.disabled = false;
            }
          });
          row.append(name, unblock);
          blockedList.append(row);
        });
      };
      blockForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!blockInput.value.trim()) return;
        blockButton.disabled = true;
        try {
          const result = await api("/api/me/blocked", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: blockInput.value.trim() }),
          });
          blockedUsers = result.blockedUsers;
          blockInput.value = "";
          renderBlocked();
          showMessage("Blocked account added.");
        } catch (error) {
          showMessage(error.message, true);
        } finally {
          blockButton.disabled = false;
        }
      });
      renderBlocked();
      panel.append(passwordForm, blockedHeading, blockForm, blockedList);
    } else {
      const panel = createSettingsPanel(content, "Help & support", "Find answers and review the terms for using Loop.");
      const faq = document.createElement("details");
      faq.className = "settings-disclosure";
      faq.innerHTML = "<summary>How do I upload a video?</summary><p>Use the plus button in the bottom navigation, select a video, review it, then add a caption and choose its visibility.</p>";
      const privacyFaq = document.createElement("details");
      privacyFaq.className = "settings-disclosure";
      privacyFaq.innerHTML = "<summary>Can I make my account private?</summary><p>Yes. Enable Private account in Account privacy. Private profiles and their videos are hidden from viewers who do not follow the account.</p>";
      const terms = document.createElement("details");
      terms.className = "settings-disclosure";
      terms.innerHTML = "<summary>Terms of service</summary><p>Loop is a local demonstration. Only upload content you have permission to share. Do not use the prototype to store sensitive information. Uploaded media may be accessible to anyone with its direct URL.</p>";
      const feedbackHeading = document.createElement("h3");
      feedbackHeading.className = "settings-subheading";
      feedbackHeading.textContent = "Send feedback";
      const feedbackForm = document.createElement("form");
      feedbackForm.className = "settings-feedback-form";
      const feedbackInput = document.createElement("textarea");
      feedbackInput.name = "feedback";
      feedbackInput.maxLength = 2000;
      feedbackInput.rows = 4;
      feedbackInput.placeholder = "Tell us what we could improve…";
      feedbackInput.setAttribute("aria-label", "Feedback");
      const feedbackButton = document.createElement("button");
      feedbackButton.type = "submit";
      feedbackButton.className = "settings-primary-button";
      feedbackButton.textContent = "Send feedback";
      feedbackForm.append(feedbackInput, feedbackButton);
      feedbackForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        feedbackButton.disabled = true;
        try {
          await api("/api/me/feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: feedbackInput.value }),
          });
          feedbackInput.value = "";
          showMessage("Thanks for your feedback.");
        } catch (error) {
          showMessage(error.message, true);
        } finally {
          feedbackButton.disabled = false;
        }
      });
      panel.append(faq, privacyFaq, terms, feedbackHeading, feedbackForm);
    }
    const logout = document.createElement("button");
    logout.type = "button";
    logout.className = "settings-logout-button";
    logout.textContent = "Log out";
    logout.addEventListener("click", async () => {
      if (!window.confirm("Log out of your account?")) return;
      document.removeEventListener("keydown", handleEscape);
      overlay.remove();
      await logoutUser(logout);
    });
    content.append(logout);
  }

  content.replaceChildren();
  const loading = document.createElement("p");
  loading.className = "settings-description";
  loading.textContent = "Loading settings…";
  content.append(loading);
  try {
    const result = await api("/api/me/settings");
    settings = result.settings;
    blockedUsers = settings.blockedUsers;
    renderSection();
  } catch (error) {
    content.replaceChildren();
    const message = document.createElement("p");
    message.className = "settings-status is-error";
    message.textContent = error.message || "Settings could not be loaded.";
    content.append(message);
  }
}

function createSettingsPanel(parent, title, description) {
  const panel = document.createElement("section");
  panel.className = "settings-panel";
  const heading = document.createElement("h3");
  heading.textContent = title;
  const summary = document.createElement("p");
  summary.className = "settings-description";
  summary.textContent = description;
  panel.append(heading, summary);
  parent.append(panel);
  return panel;
}

function setAuthMode(mode) {
  authMode = mode;
  const signingUp = mode === "signup";
  authTitle.textContent = signingUp ? "Create your account" : "Log in to continue";
  authDescription.textContent = signingUp
    ? "Choose a username, enter your email address, and create a password."
    : "Enter your email address and password.";
  loginSubmit.textContent = signingUp ? "Sign up" : "Log in";
  signupUsernameField.classList.toggle("hidden", !signingUp);
  signupConfirmField.classList.toggle("hidden", !signingUp);
  loginUsername.required = signingUp;
  loginConfirmPassword.required = signingUp;
  loginUsername.disabled = !signingUp;
  loginConfirmPassword.disabled = !signingUp;
  loginPassword.autocomplete = signingUp ? "new-password" : "current-password";
  authLoginMode.classList.toggle("active", !signingUp);
  authSignupMode.classList.toggle("active", signingUp);
  authLoginMode.setAttribute("aria-selected", String(!signingUp));
  authSignupMode.setAttribute("aria-selected", String(signingUp));
  loginError.textContent = "";
}

function showAuthPage(mode = "login", returnToTab = null, profile = null) {
  returnToTabAfterLogin = returnToTab;
  loginForm.reset();
  loginBack.classList.toggle("hidden", !returnToTab);
  loginBack.textContent = currentUsername === "Guest" ? "Back to Home" : "Back to profile";
  if (profile) {
    loginUsername.value = profile.username;
    loginEmail.value = profile.email;
  }
  setAuthMode(mode);
  showPage("login");
  (mode === "signup" ? loginUsername : loginEmail).focus();
}

profileTopbarLogout.addEventListener("click", (event) => logoutUser(event.currentTarget));

loginBack.addEventListener("click", () => {
  returnToTabAfterLogin = null;
  showPage("feed");
  profileFeedBackButton.type = "button";
  profileFeedBackButton.className = "profile-feed-back hidden";
  profileFeedBackButton.addEventListener("click", returnToProfileFromFeed);
  feedPage.prepend(profileFeedBackButton);

  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.tab === "home");
  });
});

async function openProfile(username = currentUsername) {
  clearProfileFeedContext();
  if (activeRelationshipDialog) {
    document.removeEventListener("keydown", handleRelationshipEscape);
    activeRelationshipDialog.overlay.remove();
    activeRelationshipDialog = null;
  }
  showPage("profile");
  profileTopbarName.textContent = username;
  profileContent.replaceChildren();
  const loading = document.createElement("p");
  loading.className = "profile-empty";
  loading.textContent = "Loading profile…";
  profileContent.append(loading);
  try {
    const query = new URLSearchParams({ viewer: currentUsername });
    const relationshipsRequest = refreshFollowing().catch((error) => {
      useSavedFollowing(error);
    });
    const response = await api(`/api/profiles/${encodeURIComponent(username)}?${query}`);
    await relationshipsRequest;
    const profile = response && response.profile && typeof response.profile === "object"
      ? response.profile
      : {};
    const videos = response && Array.isArray(response.videos) ? response.videos : [];
    renderProfile(profile, videos, username);
  } catch (error) {
    profileContent.replaceChildren();
    const message = document.createElement("p");
    message.className = "profile-empty";
    message.textContent = error.message;
    profileContent.append(message);
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = loginEmail.value.trim().toLowerCase();
  const password = loginPassword.value;
  const username = loginUsername.value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || password.length < 8 || password.length > 128
    || (authMode === "signup" && !/^[a-zA-Z0-9._-]{1,32}$/.test(username))) {
    loginError.textContent = authMode === "signup"
      ? "Enter a valid username and email, and a password from 8 to 128 characters."
      : "Enter a valid email address and a password from 8 to 128 characters.";
    return;
  }
  if (authMode === "signup" && password !== loginConfirmPassword.value) {
    loginError.textContent = "Passwords do not match.";
    return;
  }
  loginSubmit.disabled = true;
  loginSubmit.textContent = authMode === "signup" ? "Creating account…" : "Logging in…";
  loginError.textContent = "";
  try {
    const signingUp = authMode === "signup";
    const responseData = await api(signingUp ? "/api/signup" : "/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(signingUp ? { username, email, password } : { email, password }),
    });
    const returnedAccount = responseData && typeof responseData === "object"
      ? responseData.user || responseData.account
      : null;
    const user = signingUp
      ? {
        username: returnedAccount?.username || username,
        name: returnedAccount?.name || returnedAccount?.username || username,
        email: returnedAccount?.email || email,
      }
      : returnedAccount;
    if (!user || typeof user.username !== "string"
      || !/^[a-zA-Z0-9._-]{1,32}$/.test(user.username)
      || typeof user.email !== "string") {
      throw new Error("The server did not return valid account details.");
    }
    await completeAuthentication(user, signingUp);
  } catch (error) {
    loginError.textContent = error.message || "Sign-in could not be completed.";
  } finally {
    loginSubmit.disabled = false;
    loginSubmit.textContent = authMode === "signup" ? "Sign up" : "Log in";
  }
});

async function completeAuthentication(user, signingUp) {
  currentUsername = user.username;
  currentDisplayName = user.name || user.username;
  localStorage.setItem("loop-username", user.username);
  localStorage.setItem("loop-name", currentDisplayName);
  localStorage.setItem("loop-email", user.email);
  saveProfile({ username: user.username, name: currentDisplayName, email: user.email });
  loginBack.classList.add("hidden");
  loginForm.reset();
  following = readFollowing();
  if (returnToTabAfterLogin) {
    const destinationTab = returnToTabAfterLogin;
    returnToTabAfterLogin = null;
    await openProfile(user.username);
    document.querySelectorAll(".nav-item").forEach((item) => {
      item.classList.toggle("active", item.dataset.tab === destinationTab);
    });
  } else if (!signingUp) {
    await openProfile(user.username);
    document.querySelectorAll(".nav-item").forEach((item) => {
      item.classList.toggle("active", item.dataset.tab === "profile");
    });
  } else {
    showPage("feed");
    document.querySelectorAll(".nav-item").forEach((item) => {
      item.classList.toggle("active", item.dataset.tab === "home");
    });
    await loadFeed();
  }
  showToast(`Welcome, ${currentDisplayName}.`);
}

authLoginMode.addEventListener("click", () => setAuthMode("login"));
authSignupMode.addEventListener("click", () => setAuthMode("signup"));

async function logoutUser(button) {
  button.disabled = true;
  button.textContent = "Signing out…";
  try {
    await api("/api/logout", { method: "POST" });
    button.disabled = false;
    button.textContent = "Log out";
    localStorage.removeItem("loop-username");
    localStorage.removeItem("loop-name");
    localStorage.removeItem("loop-email");
    localStorage.removeItem("loop-following");
    currentUsername = "Guest";
    currentDisplayName = "Guest";
    following = [];
    returnToTabAfterLogin = null;
    showPage("feed");
    document.querySelectorAll(".nav-item").forEach((item) => {
      item.classList.toggle("active", item.dataset.tab === "home");
    });
    await loadFeed();
    showToast("You’re logged out.");
  } catch (error) {
    showToast(error.message || "Sign-out could not be completed.");
    button.disabled = false;
    button.textContent = "Log out";
  }
}

async function initializeApp(feedMode = "home") {
  if (currentUsername !== "Guest") {
    try {
      const { user } = await api("/api/me");
      if (!user || !/^[a-zA-Z0-9._-]{1,32}$/.test(user.username)) {
        throw new Error("The saved session returned an invalid user.");
      }
      currentUsername = user.username;
      currentDisplayName = user.name || user.username;
      localStorage.setItem("loop-username", user.username);
      localStorage.setItem("loop-name", currentDisplayName);
      localStorage.setItem("loop-email", user.email || "");
    } catch (error) {
      if (error.status === 401) {
        localStorage.removeItem("loop-username");
        localStorage.removeItem("loop-name");
        localStorage.removeItem("loop-email");
        localStorage.removeItem("loop-following");
        currentUsername = "Guest";
        currentDisplayName = "Guest";
        following = [];
      } else {
        console.error("Could not verify the saved session:", error);
      }
    }
  }
  await loadFeed(feedMode);
}

function openFilePicker() {
  fileInput.click();
}

function syncSoundtrack(video, audio) {
  const alignAudio = () => {
    if (Number.isFinite(video.currentTime) && Math.abs(audio.currentTime - video.currentTime) > 0.25) {
      audio.currentTime = video.currentTime;
    }
  };
  video.addEventListener("play", () => {
    if (!audio.src) return;
    alignAudio();
    audio.play().catch((error) => {
      console.warn("Could not play the selected soundtrack:", error);
    });
  });
  video.addEventListener("pause", () => audio.pause());
  video.addEventListener("seeking", alignAudio);
  video.addEventListener("ended", () => {
    audio.pause();
    audio.currentTime = 0;
  });
}

function showUploadStep(step) {
  document.querySelectorAll(".upload-step").forEach((section) => {
    section.classList.toggle("hidden", Number(section.dataset.uploadStep) !== step);
  });
  uploadError.textContent = "";
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function updateTrimControls(changedControl) {
  const duration = videoDuration;
  const minimumClipSeconds = Math.min(1, duration);
  let start = Number(trimStart.value);
  let end = Number(trimEnd.value);

  if (changedControl === trimStart && end - start > maxVideoSeconds) {
    end = start + maxVideoSeconds;
  } else if (changedControl === trimEnd && end - start > maxVideoSeconds) {
    start = end - maxVideoSeconds;
  }

  start = Math.max(0, Math.min(start, duration - minimumClipSeconds));
  end = Math.max(start + minimumClipSeconds, Math.min(end, duration, start + maxVideoSeconds));
  trimStart.max = String(Math.max(0, Math.min(duration - minimumClipSeconds, end - minimumClipSeconds)));
  trimEnd.min = String(start + minimumClipSeconds);
  trimEnd.max = String(Math.min(duration, start + maxVideoSeconds));
  trimStart.value = String(start);
  trimEnd.value = String(end);
  trimStartValue.textContent = formatTime(start);
  trimEndValue.textContent = formatTime(end);
  trimDuration.textContent = `Selected length: ${Math.round(end - start)}s (maximum 2:00)`;
}

function readVideoMetadata(file) {
  return new Promise((resolve, reject) => {
    const handleLoaded = () => {
      preview.removeEventListener("error", handleError);
      const { videoWidth, videoHeight, duration } = preview;
      if (!videoWidth || !videoHeight || !Number.isFinite(duration) || duration <= 0) {
        reject(new Error("Could not read the video's duration or resolution."));
        return;
      }

      const longestDimension = Math.max(videoWidth, videoHeight);
      if (longestDimension > maxVideoDimension || Math.min(videoWidth, videoHeight) > 1080) {
        reject(new Error("Choose a video at 1080p or lower. 4K video is not supported."));
        return;
      }

      videoDuration = duration;
      const end = Math.min(duration, maxVideoSeconds);
      trimStart.min = "0";
      trimStart.max = String(Math.max(0, duration - 1));
      trimStart.value = "0";
      trimEnd.min = "1";
      trimEnd.max = String(duration);
      trimEnd.value = String(end);
      trimStart.disabled = false;
      trimEnd.disabled = false;
      updateTrimControls();
      videoMetadata.textContent = `${videoWidth} × ${videoHeight} · ${formatTime(duration)}${duration > maxVideoSeconds ? " · Trim to 2:00 or less" : ""}`;
      nextToCaption.disabled = false;
      resolve();
    };
    const handleError = () => {
      preview.removeEventListener("loadedmetadata", handleLoaded);
      reject(new Error("This video could not be opened. Choose a different file."));
    };
    preview.addEventListener("loadedmetadata", handleLoaded, { once: true });
    preview.addEventListener("error", handleError, { once: true });
    preview.src = URL.createObjectURL(file);
  });
}

function clearUploadMedia() {
  if (preview.src.startsWith("blob:")) URL.revokeObjectURL(preview.src);
  if (soundtrackPreview.src.startsWith("blob:")) URL.revokeObjectURL(soundtrackPreview.src);
  preview.pause();
  soundtrackPreview.pause();
  preview.removeAttribute("src");
  soundtrackPreview.removeAttribute("src");
  preview.load();
  soundtrackPreview.load();
  preview.muted = false;
  selectedFile = null;
  soundtrackFile = null;
  fileInput.value = "";
  soundtrackInput.value = "";
  trimStart.disabled = true;
  trimEnd.disabled = true;
  nextToCaption.disabled = true;
  videoMetadata.textContent = "Loading video details…";
  videoDuration = 0;
  trimStartSeconds = 0;
  trimEndSeconds = 0;
  soundtrackPreview.hidden = true;
  document.querySelector("#soundtrack-label").textContent = "Add sound or music";
}

function showPage(page) {
  loginPage.classList.toggle("hidden", page !== "login");
  feedPage.classList.toggle("hidden", page !== "feed");
  detailsPage.classList.toggle("hidden", page !== "details");
  profilePage.classList.toggle("hidden", page !== "profile");
  bottomNav.classList.toggle("hidden", page === "login");
}

document.querySelector("#pick-video-button").addEventListener("click", openFilePicker);
document.querySelector("#back-to-feed").addEventListener("click", () => {
  clearUploadMedia();
  showPage("feed");
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0] || null;
  if (!file) return;
  if (!file.type.startsWith("video/")) {
    showToast("Choose a video file to continue.");
    fileInput.value = "";
    return;
  }
  clearUploadMedia();
  selectedFile = file;
  title.value = "";
  uploadError.textContent = "";
  uploadForm.reset();
  nextToCaption.disabled = true;
  showUploadStep(1);
  syncSoundtrack(preview, soundtrackPreview);
  showPage("details");
  readVideoMetadata(selectedFile).catch((error) => {
    videoMetadata.textContent = error.message;
    uploadError.textContent = error.message;
    nextToCaption.disabled = true;
  });
});

trimStart.addEventListener("input", () => updateTrimControls(trimStart));
trimEnd.addEventListener("input", () => updateTrimControls(trimEnd));
trimStart.addEventListener("change", () => {
  preview.currentTime = Number(trimStart.value);
});
trimEnd.addEventListener("change", () => {
  if (preview.currentTime > Number(trimEnd.value)) preview.currentTime = Number(trimStart.value);
});

soundtrackInput.addEventListener("change", () => {
  soundtrackFile = soundtrackInput.files[0] || null;
  if (!soundtrackFile) return;
  if (!soundtrackFile.type.startsWith("audio/")) {
    showToast("Choose an audio file to continue.");
    soundtrackInput.value = "";
    soundtrackFile = null;
    return;
  }
  if (soundtrackPreview.src.startsWith("blob:")) URL.revokeObjectURL(soundtrackPreview.src);
  soundtrackPreview.src = URL.createObjectURL(soundtrackFile);
  soundtrackPreview.hidden = false;
  preview.muted = true;
  document.querySelector("#soundtrack-label").textContent = soundtrackFile.name;
});

nextToCaption.addEventListener("click", () => {
  if (!selectedFile || !videoDuration) return;
  trimStartSeconds = Number(trimStart.value);
  trimEndSeconds = Number(trimEnd.value);
  showUploadStep(2);
});
preview.addEventListener("play", () => {
  if (preview.currentTime < Number(trimStart.value) || preview.currentTime >= Number(trimEnd.value)) {
    preview.currentTime = Number(trimStart.value);
  }
});
preview.addEventListener("timeupdate", () => {
  if (!preview.paused && Number(trimEnd.value) > Number(trimStart.value)
    && preview.currentTime >= Number(trimEnd.value)) {
    preview.pause();
  }
});
document.querySelector("#next-to-visibility").addEventListener("click", () => {
  if (!title.value.trim()) {
    title.focus();
    title.reportValidity();
    return;
  }
  showUploadStep(3);
});
document.querySelectorAll(".back-to-step").forEach((button) => {
  button.addEventListener("click", () => showUploadStep(Number(button.dataset.step)));
});

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selectedFile) {
    uploadError.textContent = "Choose a video before uploading.";
    return;
  }
  const formData = new FormData();
  formData.append("video", selectedFile);
  formData.append("title", title.value.trim());
  formData.append("visibility", document.querySelector("#visibility").value);
  formData.append("author", currentUsername);
  formData.append("trimStart", String(trimStartSeconds));
  formData.append("trimEnd", String(trimEndSeconds));
  if (soundtrackFile) formData.append("soundtrack", soundtrackFile);
  uploadButton.disabled = true;
  uploadButton.textContent = "Uploading…";
  uploadError.textContent = "";
  try {
    const uploadResult = await api("/api/videos", { method: "POST", body: formData });
    if (!uploadResult || !uploadResult.video || !uploadResult.video.id || !uploadResult.video.url) {
      throw new Error("The server returned an invalid upload response. Please try again.");
    }
    const visibility = document.querySelector("#visibility").value;
    const uploadedVideo = uploadResult.video;
    clearUploadMedia();
    uploadForm.reset();
    showPage("feed");
    showUploadStep(1);
    document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.tab === "home"));
    const feedLoaded = await loadFeed("home", visibility === "Public" ? uploadedVideo : null);
    if (visibility === "Private") {
      showToast("Your video was uploaded privately.");
    } else if (feedLoaded) {
      showToast("Your video is live!");
    } else {
      showToast("Your video is live and shown here, but the feed could not be refreshed.");
    }
  } catch (error) {
    uploadError.textContent = error.message;
  } finally {
    uploadButton.disabled = false;
    uploadButton.textContent = "Upload";
  }
});

document.querySelectorAll(".nav-item").forEach((item) => {
  item.addEventListener("click", () => {
    clearProfileFeedContext();
    document.querySelectorAll(".nav-item").forEach((navItem) => navItem.classList.toggle("active", navItem === item));
    if ((item.dataset.tab === "subscriptions" || item.dataset.tab === "profile")
      && currentUsername === "Guest") {
      showAuthPage("login", item.dataset.tab);
    } else if (item.dataset.tab === "subscriptions" || item.dataset.tab === "profile") {
      openProfile(currentUsername);
    } else {
      showPage("feed");
      initializeApp(item.dataset.tab === "shorts" ? "shorts" : "home");
    }
  });
});

document.querySelector("#profile-back").addEventListener("click", () => {
  showPage("feed");
  initializeApp("home");
});

loadFeed("home");
