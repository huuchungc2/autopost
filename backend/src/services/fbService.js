import axios from 'axios';
import fs from 'fs';
import FormData from 'form-data';
import { resolveImageForPublish, resolveLocalImagePath } from './mediaStorage.js';

const apiBase = process.env.FB_GRAPH_API || 'https://graph.facebook.com/v19.0';

export async function verifyFacebookToken(pageId, pageToken) {
  try {
    const response = await axios.get(`${apiBase}/${pageId}`, {
      params: { access_token: pageToken, fields: 'id,name,picture' },
    });
    return response.data;
  } catch (error) {
    throw new Error(error?.response?.data?.error?.message || 'Facebook token verification failed');
  }
}

export async function postToFacebook({
  pageId,
  pageToken,
  message,
  imageUrl,
  videoUrl,
  scheduledPublishTime,
  published = true,
}) {
  const scheduledUnix = scheduledPublishTime
    ? Math.floor(new Date(scheduledPublishTime).getTime() / 1000)
    : undefined;

  try {
    if (videoUrl) {
      return await publishVideo({ pageId, pageToken, message, videoUrl, scheduledUnix, published });
    }
    if (imageUrl) {
      return await publishPhoto({ pageId, pageToken, message, imageUrl, scheduledUnix, published });
    }
    return await publishFeed({ pageId, pageToken, message, scheduledUnix, published });
  } catch (error) {
    throw new Error(error?.response?.data?.error?.message || error.message || 'Facebook publish failed');
  }
}

async function publishFeed({ pageId, pageToken, message, scheduledUnix, published }) {
  const response = await axios.post(`${apiBase}/${pageId}/feed`, null, {
    params: {
      message,
      access_token: pageToken,
      published: scheduledUnix ? false : published,
      scheduled_publish_time: scheduledUnix,
    },
  });
  return response.data;
}

async function publishPhoto({ pageId, pageToken, message, imageUrl, scheduledUnix, published }) {
  const resolved = await resolveImageForPublish(imageUrl);

  if (resolved?.buffer) {
    const form = new FormData();
    form.append('source', resolved.buffer, {
      filename: resolved.filename,
      contentType: resolved.mimeType,
    });
    form.append('message', message || '');
    form.append('access_token', pageToken);
    if (scheduledUnix) {
      form.append('published', 'false');
      form.append('scheduled_publish_time', String(scheduledUnix));
    } else {
      form.append('published', published ? 'true' : 'false');
    }
    const response = await axios.post(`${apiBase}/${pageId}/photos`, form, {
      headers: form.getHeaders(),
    });
    return response.data;
  }

  const localPath = resolved?.localPath || resolveLocalImagePath(imageUrl);
  if (localPath) {
    const form = new FormData();
    form.append('source', fs.createReadStream(localPath));
    form.append('message', message || '');
    form.append('access_token', pageToken);
    if (scheduledUnix) {
      form.append('published', 'false');
      form.append('scheduled_publish_time', String(scheduledUnix));
    } else {
      form.append('published', published ? 'true' : 'false');
    }
    const response = await axios.post(`${apiBase}/${pageId}/photos`, form, {
      headers: form.getHeaders(),
    });
    return response.data;
  }

  const remoteUrl = resolved?.remoteUrl
    || (imageUrl?.startsWith('http') ? imageUrl : `${process.env.PUBLIC_BASE_URL || 'http://localhost:3001'}${imageUrl}`);

  const response = await axios.post(`${apiBase}/${pageId}/photos`, null, {
    params: {
      url: remoteUrl,
      message,
      access_token: pageToken,
      published: scheduledUnix ? false : published,
      scheduled_publish_time: scheduledUnix,
    },
  });
  return response.data;
}

async function publishVideo({ pageId, pageToken, message, videoUrl, scheduledUnix, published }) {
  const localPath = resolveLocalImagePath(videoUrl);
  if (localPath) {
    const form = new FormData();
    form.append('source', fs.createReadStream(localPath));
    form.append('description', message || '');
    form.append('access_token', pageToken);
    if (scheduledUnix) {
      form.append('published', 'false');
      form.append('scheduled_publish_time', String(scheduledUnix));
    } else {
      form.append('published', published ? 'true' : 'false');
    }
    const response = await axios.post(`${apiBase}/${pageId}/videos`, form, {
      headers: form.getHeaders(),
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
    return response.data;
  }

  const response = await axios.post(`${apiBase}/${pageId}/videos`, null, {
    params: {
      file_url: videoUrl.startsWith('http') ? videoUrl : `${process.env.PUBLIC_BASE_URL || 'http://localhost:3001'}${videoUrl}`,
      description: message,
      access_token: pageToken,
      published: scheduledUnix ? false : published,
      scheduled_publish_time: scheduledUnix,
    },
  });
  return response.data;
}
